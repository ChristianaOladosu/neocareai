import type { AuthUser } from '../../middleware/auth.js';
import { pool } from '../../database/db.js';
import { scopeSql } from '../newborns/scope.js';
import { STALE_AFTER_SECONDS } from '../observations/observations.service.js';

export type SignalCategory = 'reliable' | 'reduced_quality' | 'poor_quality' | 'missing_data' | 'device_disconnected' | 'insufficient_information';
export type NewbornState = 'normal' | 'concerning' | 'insufficient_signal' | 'disconnected' | 'not_monitored';
export const SIGNAL_LABEL: Record<SignalCategory, string> = { reliable: 'Reliable', reduced_quality: 'Reduced quality', poor_quality: 'Poor quality', missing_data: 'Missing data', device_disconnected: 'Device disconnected', insufficient_information: 'Insufficient information' };
const SEVERITY: SignalCategory[] = ['reliable', 'insufficient_information', 'reduced_quality', 'poor_quality', 'missing_data', 'device_disconnected'];
const TYPES = ['heart_rate', 'respiratory_rate', 'spo2', 'temperature'] as const;
const NAME: Record<string, string> = { heart_rate: 'Heart rate', respiratory_rate: 'Respiratory rate', spo2: 'Oxygen saturation', temperature: 'Temperature' };

/** Classification of ONE reading's reliability. A missing or stale reading is a data concern, never evidence of a physiological change. */
export function signalCategory(quality: string | undefined, stale: boolean, disconnected: boolean): SignalCategory {
  if (disconnected) return 'device_disconnected';
  if (quality === undefined || stale) return 'missing_data';
  return ({ good: 'reliable', questionable: 'reduced_quality', poor: 'poor_quality', unavailable: 'missing_data', unknown: 'insufficient_information' } as Record<string, SignalCategory>)[quality] ?? 'insufficient_information';
}
const worst = (cs: SignalCategory[]) => cs.reduce((w, c) => (SEVERITY.indexOf(c) > SEVERITY.indexOf(w) ? c : w), 'reliable' as SignalCategory);

export interface NewbornStatus {
  id: string; identifier: string; unitName: string | null; monitoringStatus: string; state: NewbornState;
  device: { id: string; identifier: string; connection: string; simulated: boolean; lastSeenAt: string | null } | null;
  signal: { category: SignalCategory; label: string; explanation: string };
  measurements: Array<{ type: string; value: number | null; unit: string | null; observedAt: string | null; quality: string | null; category: SignalCategory; ageSeconds: number | null }>;
  alerts: { open: number; high: number; unacknowledged: number; clinical: number };
}

export async function newbornStatuses(user: AuthUser, only?: string[]): Promise<NewbornStatus[]> {
  const params: unknown[] = [user.hospitalId]; const scope = scopeSql('n.id', params, user);
  const nb = await pool.query(
    `SELECT n.id, n.newborn_identifier, n.monitoring_status, un.name AS unit_name, d.id AS device_id, d.device_identifier, d.connection_status, d.is_simulated, d.last_seen_at
     FROM newborns n LEFT JOIN units un ON un.id=n.unit_id LEFT JOIN device_assignments da ON da.newborn_id=n.id AND da.unassigned_at IS NULL LEFT JOIN devices d ON d.id=da.device_id
     WHERE n.hospital_id=$1 AND ${scope} ORDER BY n.newborn_identifier`, params);
  const rows = only ? nb.rows.filter((r) => only.includes(r.id)) : nb.rows; const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const lat = await pool.query(
    `SELECT DISTINCT ON (o.newborn_id, o.measurement_type) o.newborn_id, o.measurement_type, o.value, o.unit, o.observed_at, o.quality_status FROM observations o
     WHERE o.newborn_id = ANY($1::uuid[]) ORDER BY o.newborn_id, o.measurement_type, o.observed_at DESC`, [ids]);
  const al = await pool.query(`SELECT newborn_id, priority, category, status FROM clinical_alerts WHERE hospital_id=$1 AND status NOT IN ('resolved','closed') AND newborn_id = ANY($2::uuid[])`, [user.hospitalId, ids]);
  const now = Date.now();
  return rows.map((r): NewbornStatus => {
    const disconnected = r.device_id ? r.connection_status === 'disconnected' : false; const monitored = r.monitoring_status === 'monitoring';
    const ms = TYPES.map((t) => {
      const x = lat.rows.find((l) => l.newborn_id === r.id && l.measurement_type === t); const age = x ? Math.round((now - x.observed_at.getTime()) / 1000) : null;
      return { type: t, value: x?.value ?? null, unit: x?.unit ?? null, observedAt: x ? x.observed_at.toISOString() : null, quality: x?.quality_status ?? null, ageSeconds: age, category: signalCategory(x?.quality_status, age === null || age > STALE_AFTER_SECONDS, disconnected) };
    });
    const mine = al.rows.filter((a) => a.newborn_id === r.id);
    const alerts = { open: mine.length, high: mine.filter((a) => a.priority === 'high').length, unacknowledged: mine.filter((a) => a.status === 'awaiting_acknowledgement').length, clinical: mine.filter((a) => a.category === 'measurement' || a.category === 'trend').length };
    let category: SignalCategory; let explanation: string;
    if (!r.device_id) { category = 'missing_data'; explanation = 'No monitoring device is assigned, so no measurements are being received.'; }
    else if (disconnected) { category = 'device_disconnected'; explanation = `Device ${r.device_identifier} is disconnected. The values shown are the last received and are not current.`; }
    else { category = worst(ms.map((m) => m.category)); const bad = ms.filter((m) => m.category !== 'reliable');
      explanation = bad.length ? bad.map((m) => `${NAME[m.type]}: ${SIGNAL_LABEL[m.category].toLowerCase()}${m.category === 'missing_data' ? (m.ageSeconds === null ? ' (never received)' : ` (last received ${Math.round(m.ageSeconds / 60)} min ago)`) : ''}`).join('; ') + '.' : 'All four measurements are current and were received with a good signal.'; }
    let state: NewbornState = 'normal';
    if (!monitored) state = 'not_monitored'; else if (alerts.clinical > 0) state = 'concerning'; else if (!r.device_id || disconnected) state = 'disconnected'; else if (category !== 'reliable') state = 'insufficient_signal';
    return { id: r.id, identifier: r.newborn_identifier, unitName: r.unit_name, monitoringStatus: r.monitoring_status, state, signal: { category, label: SIGNAL_LABEL[category], explanation }, alerts, measurements: ms,
      device: r.device_id ? { id: r.device_id, identifier: r.device_identifier, connection: r.connection_status, simulated: r.is_simulated, lastSeenAt: r.last_seen_at ? r.last_seen_at.toISOString() : null } : null };
  });
}
