import { pool } from '../../database/db.js';
import type { AuthUser } from '../../middleware/auth.js';
import { HttpError } from '../../utils/errors.js';
import { audit } from '../audit/audit.service.js';
import { retrieve } from './guidance.js';
import type { Bundle, ToolCallRecord } from './types.js';

/**
 * The ONLY tools the assistant can use. All are read-only, scoped to the requesting user's hospital, and gated by that
 * user's own permissions. There is no tool that writes, acknowledges, escalates, resolves or dismisses anything.
 * The set of tools called is fixed by the service (a controlled workflow), not chosen freely by a model.
 */
const NEEDS: Record<string, string> = { get_alert: 'alert:read', get_related_observations: 'observation:read', get_response_history: 'response:read', get_guidance: 'alert:read' };

export class ToolBox {
  calls: ToolCallRecord[] = [];
  unavailable: string[] = [];
  constructor(private user: AuthUser, private alertId: string) {}

  private async gate(tool: string): Promise<boolean> {
    const ok = this.user.permissions.has(NEEDS[tool]);
    if (!ok) {
      this.calls.push({ tool, allowed: false, reason: `missing permission ${NEEDS[tool]}` });
      this.unavailable.push(tool === 'get_related_observations' ? 'recent observations' : tool === 'get_response_history' ? 'response history' : tool);
      await audit({ hospitalId: this.user.hospitalId, userId: this.user.id, action: 'ai.tool_denied', resourceType: 'alert', resourceId: this.alertId, metadata: { tool, needs: NEEDS[tool] } });
    }
    return ok;
  }

  async getAlert() {
    if (!(await this.gate('get_alert'))) throw new HttpError(403, 'Insufficient permissions', 'forbidden');
    const r = await pool.query(
      `SELECT a.id, a.newborn_id, a.priority, a.title, a.explanation, a.status, a.created_at, a.evidence, r.name AS rule_name, r.rule_version FROM clinical_alerts a LEFT JOIN alert_rules r ON r.id=a.rule_id WHERE a.id=$1 AND a.hospital_id=$2`, [this.alertId, this.user.hospitalId]);
    if (!r.rows[0]) { this.calls.push({ tool: 'get_alert', allowed: true, resultCount: 0 }); throw new HttpError(404, 'Alert not found', 'not_found'); }
    this.calls.push({ tool: 'get_alert', allowed: true, resultCount: 1 });
    return r.rows[0] as { newborn_id: string; priority: string; title: string; explanation: string; status: string; created_at: Date; evidence: any; rule_name: string | null; rule_version: number | null };
  }

  async getRecentObservations(newbornId: string): Promise<Bundle['recent'] | undefined> {
    if (!(await this.gate('get_related_observations'))) return undefined;
    const r = await pool.query(
      `SELECT DISTINCT ON (o.measurement_type) o.measurement_type, o.value, o.unit, o.observed_at, o.quality_status FROM observations o JOIN newborns n ON n.id=o.newborn_id
       WHERE o.newborn_id=$1 AND n.hospital_id=$2 ORDER BY o.measurement_type, o.observed_at DESC`, [newbornId, this.user.hospitalId]);
    this.calls.push({ tool: 'get_related_observations', allowed: true, resultCount: r.rowCount ?? 0 });
    return r.rows.map((x) => ({ measurementType: x.measurement_type, value: x.value, unit: x.unit, observedAt: x.observed_at.toISOString(), quality: x.quality_status }));
  }

  async getResponseHistory(): Promise<Bundle['history'] | undefined> {
    if (!(await this.gate('get_response_history'))) return undefined;
    const r = await pool.query(
      `SELECT e.event_type, e.created_at, COALESCE((SELECT string_agg(DISTINCT ro.name, ', ') FROM user_roles ur JOIN roles ro ON ro.id=ur.role_id WHERE ur.user_id=e.user_id), 'System') AS role
       FROM response_events e JOIN clinical_alerts a ON a.id=e.alert_id WHERE e.alert_id=$1 AND a.hospital_id=$2 ORDER BY e.seq`, [this.alertId, this.user.hospitalId]);
    this.calls.push({ tool: 'get_response_history', allowed: true, resultCount: r.rowCount ?? 0 });
    return r.rows.map((x) => ({ eventType: x.event_type, at: x.created_at.toISOString(), byRole: x.role }));
  }

  async getGuidance(query: string): Promise<Bundle['guidance']> {
    if (!(await this.gate('get_guidance'))) return [];
    const g = retrieve(query); this.calls.push({ tool: 'get_guidance', allowed: true, resultCount: g.length }); return g;
  }
}
