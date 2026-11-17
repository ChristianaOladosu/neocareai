import type pg from 'pg';
import { DEFAULT_RULES, evaluateRules, type AlertCategory, type MeasurementType, type Reading, type RuleConfig, type Finding } from '../../../../intelligence/src/index.js';
import { pool, type Db } from '../../database/db.js';
import { publish } from '../../events/bus.js';
import { audit } from '../audit/audit.service.js';
import { notify } from '../notifications/notify.js';

export async function ensureDefaultRules() {
  for (const r of DEFAULT_RULES) {
    await pool.query(
      `INSERT INTO alert_rules(rule_key,name,description,rule_version,configuration,enabled) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (rule_key,rule_version) DO UPDATE SET configuration=EXCLUDED.configuration, name=EXCLUDED.name, description=EXCLUDED.description`,
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
  const rules = await loadRules(c); const readings = await recentReadings(c, newbornId);
  const findings = evaluateRules(rules.map((r) => r.cfg), readings); const created: string[] = [];
  for (const f of findings) {
    const rule = rules.find((r) => r.cfg.ruleKey === f.ruleKey)!;
    // Duplicate handling: one open alert per newborn+rule; further occurrences are counted, not re-raised.
    const open = await c.query(`UPDATE clinical_alerts SET occurrence_count=occurrence_count+1, last_occurrence_at=now() WHERE newborn_id=$1 AND rule_id=$2 AND status NOT IN ('resolved','closed') RETURNING id`, [newbornId, rule.id]);
    if (open.rowCount) continue;
    created.push(await createAlert(c, hospitalId, newbornId, { ruleId: rule.id, category: f.category, priority: f.priority, title: f.title, explanation: f.explanation, evidence: { ...f.evidence, ruleKey: f.ruleKey, ruleVersion: f.ruleVersion } }));
  }
  await recordAssessment(c, newbornId, findings, readings);
  return created;
}

export interface NewAlert { ruleId?: string | null; category: AlertCategory; priority: 'low' | 'medium' | 'high'; title: string; explanation: string; evidence: Record<string, unknown>; deviceId?: string | null }
export async function createAlert(c: Db, hospitalId: string, newbornId: string, a: NewAlert) {
  const ins = await c.query(`INSERT INTO clinical_alerts(hospital_id,newborn_id,rule_id,priority,title,explanation,evidence,category,device_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [hospitalId, newbornId, a.ruleId ?? null, a.priority, a.title, a.explanation, JSON.stringify(a.evidence), a.category, a.deviceId ?? null]);
  const id = ins.rows[0].id as string;
  await c.query(`INSERT INTO response_events(alert_id,user_id,event_type,previous_status,new_status,event_details) VALUES ($1,NULL,'generated',NULL,'awaiting_acknowledgement',$2)`, [id, JSON.stringify({ ruleKey: a.evidence.ruleKey, ruleVersion: a.evidence.ruleVersion, category: a.category, system: true })]);
  await audit({ hospitalId, action: 'alert.generated', resourceType: 'alert', resourceId: id, metadata: { ruleKey: a.evidence.ruleKey ?? null, category: a.category, newbornId } }, c);
  const ident = (await c.query('SELECT newborn_identifier FROM newborns WHERE id=$1', [newbornId])).rows[0]?.newborn_identifier ?? '';
  await notify(hospitalId, { type: a.priority === 'high' ? 'high_priority_alert' : 'new_alert', priority: a.priority, title: `${a.priority === 'high' ? 'High-priority alert' : 'New alert'}: ${ident}`, body: a.title, link: `/alerts/${id}`, alertId: id, newbornId, dedupeKey: `alert:${id}:new` }, c);
  publish({ type: 'alert.generated', hospitalId, payload: { alertId: id, newbornId, priority: a.priority, title: a.title, category: a.category } });
  return id;
}

/** Categorical assessment history. It records only WHEN the status changed. It is not a risk score and not a clinical prediction. */
async function recordAssessment(c: pg.PoolClient, newbornId: string, findings: Finding[], readings: Record<MeasurementType, Reading[]>) {
  const clinical = findings.filter((f) => f.category === 'measurement' || f.category === 'trend'); const all = Object.values(readings).flat();
  const recent = (Object.keys(readings) as MeasurementType[]).map((m) => readings[m].slice(-3));
  const badData = recent.some((t) => t.length === 3 && t.every((r) => r.quality === 'poor' || r.quality === 'unavailable' || r.quality === 'questionable'));
  const good = all.filter((r) => r.quality === 'good' || r.quality === 'unknown').length;
  const status = clinical.length ? 'criteria_met' : badData ? 'data_quality_concern' : good < 3 ? 'insufficient_reliable_data' : 'no_criteria_met';
  const last = (await c.query('SELECT status FROM intelligence_assessments WHERE newborn_id=$1 ORDER BY evaluated_at DESC, id LIMIT 1', [newbornId])).rows[0]?.status;
  if (last !== status) await c.query('INSERT INTO intelligence_assessments(newborn_id,status,details) VALUES ($1,$2,$3)', [newbornId, status, JSON.stringify({ criteriaMet: clinical.map((f) => f.ruleKey), reliableReadings: good, illustrativeRules: true })]);
}
