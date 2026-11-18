import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/db.js';
import { asyncHandler, HttpError } from '../../utils/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { canAccessNewborn } from '../newborns/scope.js';
import { evaluateRules, slopePerMinute, type Condition, type MeasurementType, type Reading, type RuleConfig } from '../../../../intelligence/src/index.js';
import { newbornStatuses } from './status.js';

/**
 * Clinical intelligence: transparent trend analysis and explained evaluation of configured (illustrative) rules.
 * It produces trend descriptions and criteria status. It does NOT produce risk scores, predictions or diagnoses.
 */
export const intelligenceRouter = Router();
const TYPES: MeasurementType[] = ['heart_rate', 'respiratory_rate', 'spo2', 'temperature'];
const NAME: Record<MeasurementType, string> = { heart_rate: 'Heart rate', respiratory_rate: 'Respiratory rate', spo2: 'Oxygen saturation', temperature: 'Temperature' };
const r1 = (n: number) => Math.round(n * 10) / 10;

async function readings(newbornId: string, minutes: number) {
  const r = await pool.query(`SELECT id, measurement_type, value, unit, observed_at, quality_status FROM observations WHERE newborn_id=$1 AND observed_at > now() - ($2 || ' minutes')::interval ORDER BY observed_at ASC`, [newbornId, String(minutes * 2)]);
  const all = r.rows.map((x): Reading => ({ id: x.id, measurementType: x.measurement_type, value: x.value, unit: x.unit, observedAt: x.observed_at, quality: x.quality_status }));
  const cut = Date.now() - minutes * 60_000;
  return { current: all.filter((x) => x.observedAt.getTime() >= cut), previous: all.filter((x) => x.observedAt.getTime() < cut) };
}
const by = (rs: Reading[]) => { const o = {} as Record<MeasurementType, Reading[]>; for (const t of TYPES) o[t] = rs.filter((x) => x.measurementType === t); return o; };
const reliable = (r: Reading) => r.quality === 'good' || r.quality === 'unknown';

function describeTrend(rs: Reading[], prev: Reading[]) {
  const good = rs.filter(reliable); const share = rs.length ? Math.round((good.length / rs.length) * 100) : null;
  if (good.length < 4) return { classification: 'insufficient_data' as const, readings: rs.length, reliableReadings: good.length, reliableShare: share, note: 'Fewer than 4 reliable readings in this window, so no trend is described.' };
  const span = (good[good.length - 1].observedAt.getTime() - good[0].observedAt.getTime()) / 60000; const sl = slopePerMinute(good) ?? 0; const net = sl * span;
  const mean = good.reduce((a, x) => a + x.value, 0) / good.length; const pg = prev.filter(reliable); const pm = pg.length >= 4 ? pg.reduce((a, x) => a + x.value, 0) / pg.length : null;
  const small = Math.max(Math.abs(mean) * 0.02, 0.2);   // within 2% of the mean = no meaningful change (descriptive only, illustrative)
  return { classification: (Math.abs(net) < small ? 'stable' : net > 0 ? 'rising' : 'falling') as 'stable' | 'rising' | 'falling', readings: rs.length, reliableReadings: good.length, reliableShare: share,
    first: good[0].value, last: good[good.length - 1].value, min: Math.min(...good.map((x) => x.value)), max: Math.max(...good.map((x) => x.value)), spanMinutes: r1(span), changePerMinute: r1(sl), netChange: r1(net), mean: r1(mean),
    comparison: pm === null ? null : { previousMean: r1(pm), currentMean: r1(mean), delta: r1(mean - pm) }, unit: good[0].unit };
}

/** Plain-language explanation of ONE condition against the data: what is required, what was observed, and whether it is met. */
function explain(c: Condition, rs: Record<MeasurementType, Reading[]>, rule: RuleConfig) {
  if (c.kind === 'consecutive_threshold') {
    const all = rs[c.measurement]; const tail = all.slice(-c.count); const need = `${NAME[c.measurement]} ${c.op === 'gt' ? 'above' : 'below'} ${c.value} on ${c.count} consecutive reliable readings within ${c.maxSpanMinutes} min`;
    if (tail.length < c.count) return { met: null as boolean | null, requirement: need, observed: `Only ${tail.length} reading(s) available.` };
    const unreliable = tail.filter((x) => !rule.requiredQuality.includes(x.quality)).length; const hits = tail.filter((x) => (c.op === 'gt' ? x.value > c.value : x.value < c.value)).length;
    if (unreliable) return { met: null, requirement: need, observed: `Latest ${c.count} readings: ${tail.map((x) => x.value).join(', ')}. ${unreliable} had questionable, poor or missing signal, so the condition cannot be judged.` };
    return { met: hits === c.count && (tail[tail.length - 1].observedAt.getTime() - tail[0].observedAt.getTime()) / 60000 <= c.maxSpanMinutes, requirement: need, observed: `Latest ${c.count} readings: ${tail.map((x) => x.value).join(', ')} (${hits} of ${c.count} beyond the threshold).` };
  }
  if (c.kind === 'rate_of_change') {
    const tail = rs[c.measurement].slice(-c.minReadings); const need = `${NAME[c.measurement]} ${c.op === 'lt' ? 'falling' : 'rising'} faster than ${Math.abs(c.perMinute)} per minute, by at least ${c.minChange}, across ${c.minReadings} consecutive reliable readings within ${c.maxSpanMinutes} min`;
    if (tail.length < c.minReadings) return { met: null, requirement: need, observed: `Only ${tail.length} reading(s) available.` };
    if (tail.some((x) => !rule.requiredQuality.includes(x.quality))) return { met: null, requirement: need, observed: 'Some readings have questionable, poor or missing signal, so the trend cannot be judged.' };
    const span = (tail[tail.length - 1].observedAt.getTime() - tail[0].observedAt.getTime()) / 60000; const sl = slopePerMinute(tail) ?? 0; const net = sl * span;
    return { met: span <= c.maxSpanMinutes && (c.op === 'lt' ? sl < c.perMinute && net <= -c.minChange : sl > c.perMinute && net >= c.minChange), requirement: need, observed: `Fitted change ${r1(net)} over ${r1(span)} min (${r1(sl)} per minute).` };
  }
  const all = Object.values(rs); const bad = TYPES.filter((t) => rs[t].slice(-c.count).length === c.count && rs[t].slice(-c.count).every((x) => c.quality.includes(x.quality)));
  return { met: bad.length > 0, requirement: `${c.count} consecutive ${c.quality.join(' or ')} readings of one measurement`, observed: bad.length ? `${bad.map((t) => NAME[t]).join(', ')}: last ${c.count} readings are unreliable.` : `No measurement has ${c.count} consecutive unreliable readings (${all.flat().length} readings checked).` };
}

async function rulesOf(): Promise<RuleConfig[]> { return (await pool.query('SELECT configuration, enabled FROM alert_rules ORDER BY name')).rows.map((x) => ({ ...(x.configuration as RuleConfig), enabled: x.enabled })); }

async function analyse(newbornId: string, minutes: number, rules: RuleConfig[]) {
  const { current, previous } = await readings(newbornId, minutes); const rs = by(current); const found = new Set(evaluateRules(rules, rs).map((f) => f.ruleKey));
  const trends = Object.fromEntries(TYPES.map((t) => [t, describeTrend(rs[t], previous.filter((x) => x.measurementType === t))]));
  const evaluation = rules.filter((r) => r.enabled).map((r) => {
    const conds = r.conditions.map((c) => explain(c, rs, r)); const status = found.has(r.ruleKey) ? 'met' : conds.some((c) => c.met === null) ? 'insufficient_data' : 'not_met';
    return { ruleKey: r.ruleKey, name: r.name, version: r.version, category: r.category, priority: r.priority, illustrative: true, status, conditions: conds };
  });
  return { trends, evaluation };
}

intelligenceRouter.get('/intelligence/overview', requireAuth, requirePermission('observation:read'), asyncHandler(async (req, res) => {
  const { minutes } = z.object({ minutes: z.coerce.number().int().min(5).max(720).default(30) }).parse(req.query); const rules = await rulesOf();
  const sts = (await newbornStatuses(req.user!)).filter((x) => x.monitoringStatus === 'monitoring'); const out = [];
  for (const s of sts) {
    const a = await analyse(s.id, minutes, rules); const last = (await pool.query('SELECT status, evaluated_at FROM intelligence_assessments WHERE newborn_id=$1 ORDER BY evaluated_at DESC LIMIT 1', [s.id])).rows[0] ?? null;
    out.push({ id: s.id, identifier: s.identifier, state: s.state, signal: s.signal, trends: a.trends, rulesMet: a.evaluation.filter((e) => e.status === 'met').length, rulesInsufficient: a.evaluation.filter((e) => e.status === 'insufficient_data').length, assessment: last });
  }
  res.json({ windowMinutes: minutes, illustrative: true, items: out });
}));

intelligenceRouter.get('/intelligence/newborns/:id', requireAuth, requirePermission('observation:read'), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id); const { minutes } = z.object({ minutes: z.coerce.number().int().min(5).max(720).default(60) }).parse(req.query);
  if (!(await canAccessNewborn(req.user!, id))) throw new HttpError(404, 'Newborn not found', 'not_found');
  const a = await analyse(id, minutes, await rulesOf()); const st = (await newbornStatuses(req.user!, [id]))[0];
  const hist = (await pool.query('SELECT status, evaluated_at, details FROM intelligence_assessments WHERE newborn_id=$1 ORDER BY evaluated_at DESC LIMIT 25', [id])).rows;
  const missing = ['No bedside findings or clinical context are available to this analysis.', 'Rules and thresholds are illustrative and not clinically approved.', ...(st.signal.category !== 'reliable' ? [`Signal: ${st.signal.explanation}`] : [])];
  res.json({ windowMinutes: minutes, state: st.state, signal: st.signal, ...a, assessmentHistory: hist, missingInformation: missing, disclaimer: 'Trend descriptions and criteria status support clinical review. They are not diagnoses, predictions or risk scores.' });
}));
