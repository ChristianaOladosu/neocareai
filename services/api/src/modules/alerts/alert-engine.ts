import type pg from 'pg';
import { DEFAULT_RULES, evaluateRules, type MeasurementType, type Reading, type RuleConfig, type Finding } from '../../../../intelligence/src/index.js';
import { pool } from '../../database/db.js';
import { publish } from '../../events/bus.js';
import { audit } from '../audit/audit.service.js';

export async function ensureDefaultRules() {
  for (const r of DEFAULT_RULES) {
    await pool.query(
      `INSERT INTO alert_rules(rule_key,name,description,rule_version,configuration,enabled) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (rule_key,rule_version) DO NOTHING`,
      [r.ruleKey, r.name, r.description, r.version, JSON.stringify(r), r.enabled]);
  }
}

async function loadRules(c: pg.PoolClient): Promise<Array<{ id: string; cfg: RuleConfig }>> {
  const r = await c.query('SELECT id, configuration, enabled FROM alert_rules');
  return r.rows.map((x) => ({ id: x.id, cfg: { ...(x.configuration as RuleConfig), enabled: x.enabled } }));
}

async function recentReadings(c: pg.PoolClient, newbornId: string): Promise<Record<MeasurementType, Reading[]>> {
  const out = { heart_rate: [], respiratory_rate: [], spo2: [], temperature: [] } as Record<MeasurementType, Reading[]>;
  const r = await c.query(
    `SELECT * FROM (SELECT id, measurement_type, value, unit, observed_at, quality_status, row_number() OVER (PARTITION BY measurement_type ORDER BY observed_at DESC) rn
       FROM observations WHERE newborn_id=$1) t WHERE rn <= 20 ORDER BY observed_at ASC`, [newbornId]);
  for (const x of r.rows) out[x.measurement_type as MeasurementType].push({ id: x.id, measurementType: x.measurement_type, value: x.value, unit: x.unit, observedAt: x.observed_at, quality: x.quality_status });
  return out;
}

/** Evaluate rules for a newborn and create explainable alerts. Never auto-resolves. Runs inside the caller's transaction. */
export async function evaluateNewborn(c: pg.PoolClient, hospitalId: string, newbornId: string) {
  const rules = await loadRules(c);
  const findings = evaluateRules(rules.map((r) => r.cfg), await recentReadings(c, newbornId));
  const created: string[] = [];
  for (const f of findings) {
    const rule = rules.find((r) => r.cfg.ruleKey === f.ruleKey)!;
    // De-duplicate: one open alert per newborn+rule until a clinician resolves it.
    const open = await c.query(`SELECT 1 FROM clinical_alerts WHERE newborn_id=$1 AND rule_id=$2 AND status <> 'resolved' LIMIT 1`, [newbornId, rule.id]);
    if (open.rowCount) continue;
    created.push(await createAlert(c, hospitalId, newbornId, rule.id, f));
  }
  return created;
}

async function createAlert(c: pg.PoolClient, hospitalId: string, newbornId: string, ruleId: string, f: Finding) {
  const evidence = { ...f.evidence, ruleKey: f.ruleKey, ruleVersion: f.ruleVersion };
  const a = await c.query(
    `INSERT INTO clinical_alerts(hospital_id,newborn_id,rule_id,priority,title,explanation,evidence) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [hospitalId, newbornId, ruleId, f.priority, f.title, f.explanation, JSON.stringify(evidence)]);
  const id = a.rows[0].id as string;
  await c.query(`INSERT INTO response_events(alert_id,user_id,event_type,previous_status,new_status,event_details) VALUES ($1,NULL,'generated',NULL,'awaiting_acknowledgement',$2)`,
    [id, JSON.stringify({ ruleKey: f.ruleKey, ruleVersion: f.ruleVersion, system: true })]);
  await audit({ hospitalId, action: 'alert.generated', resourceType: 'alert', resourceId: id, metadata: { ruleKey: f.ruleKey, newbornId } }, c);
  publish({ type: 'alert.generated', hospitalId, payload: { alertId: id, newbornId, priority: f.priority, title: f.title } });
  return id;
}
