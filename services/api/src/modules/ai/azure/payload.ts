import { slopePerMinute, type MeasurementType, type Reading } from '../../../../../intelligence/src/index.js';
import type { Bundle } from '../types.js';

/**
 * Builds the ONLY data sent to the external model: anonymised, minimum-necessary, with a stable id on every record
 * so each statement in the model's answer can be traced back to a stored record.
 * Sent: measurement values, units, signal quality, times RELATIVE to the alert, trend facts computed here, event types and ROLES.
 * Never sent: newborn identifier, hospital, unit, user names, device identifiers, absolute timestamps, gestational age, free-text clinician notes.
 */
export interface RefRecord { id: string; type: 'alert' | 'trigger' | 'context' | 'latest' | 'trend' | 'event'; measurementType?: MeasurementType; label: string; data: Record<string, unknown>; numbers: number[] }
export interface Payload { records: RefRecord[]; docs: Array<{ id: string; title: string; text: string }>; unavailable: string[]; missing: string[] }

const r1 = (n: number) => Math.round(n * 10) / 10;
const NAME: Record<MeasurementType, string> = { heart_rate: 'Heart rate', respiratory_rate: 'Respiratory rate', spo2: 'Oxygen saturation', temperature: 'Temperature' };
const num = (...xs: Array<number | null | undefined>) => xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

export function buildPayload(b: Bundle): Payload {
  const base = Date.parse(b.alert.createdAt); const rec: RefRecord[] = [];
  rec.push({ id: 'A1', type: 'alert', label: `Alert: ${b.alert.priority} priority, rule version ${b.alert.ruleVersion ?? 'n/a'}`,
    data: { priority: b.alert.priority, status: b.alert.status, ruleName: b.alert.ruleName, ruleVersion: b.alert.ruleVersion, ruleIsIllustrative: b.alert.illustrative, ruleExplanation: b.alert.explanation }, numbers: num(b.alert.ruleVersion) });

  const add = (prefix: string, type: 'trigger' | 'context' | 'latest', list: NonNullable<Bundle['recent']>, rel: 'before' | 'after') =>
    [...list].sort((x, y) => x.observedAt.localeCompare(y.observedAt)).forEach((r, i) => {
      const mins = r1(rel === 'before' ? (base - Date.parse(r.observedAt)) / 60000 : (Date.parse(r.observedAt) - base) / 60000);
      rec.push({ id: `${prefix}${i + 1}`, type, measurementType: r.measurementType,
        label: `${NAME[r.measurementType]} ${r.value} ${r.unit}, ${Math.abs(mins)} min ${mins < 0 && rel === 'before' ? 'after' : rel} the alert (${r.quality} signal)`,
        data: { measurement: r.measurementType, value: r.value, unit: r.unit, [rel === 'before' ? 'minutesBeforeAlert' : 'minutesAfterAlert']: mins, signalQuality: r.quality }, numbers: num(r.value, mins) });
    });
  add('T', 'trigger', b.alert.triggering, 'before'); add('C', 'context', b.alert.context, 'before'); if (b.recent) add('L', 'latest', b.recent, 'after');

  const types = [...new Set(b.alert.triggering.map((r) => r.measurementType))];
  types.forEach((m, i) => {
    const rs = b.alert.triggering.filter((r) => r.measurementType === m).sort((x, y) => x.observedAt.localeCompare(y.observedAt));
    const first = rs[0], last = rs[rs.length - 1]; const span = r1((Date.parse(last.observedAt) - Date.parse(first.observedAt)) / 60000);
    const sl = slopePerMinute(rs.map((r) => ({ id: '', measurementType: r.measurementType, value: r.value, unit: r.unit, observedAt: new Date(r.observedAt), quality: r.quality }) as Reading));
    const change = sl === null ? null : r1(sl);
    rec.push({ id: `F${i + 1}`, type: 'trend', measurementType: m, label: `${NAME[m]} trend: ${rs.length} readings, ${first.value} to ${last.value} ${first.unit} over ${span} min`,
      data: { measurement: m, readings: rs.length, firstValue: first.value, lastValue: last.value, unit: first.unit, spanMinutes: span, changePerMinute: change, signalQualities: [...new Set(rs.map((r) => r.quality))] },
      numbers: num(rs.length, first.value, last.value, span, change, change === null ? null : Math.abs(change)) });
  });

  (b.history ?? []).forEach((h, i) => {
    const mins = r1((Date.parse(h.at) - base) / 60000);
    rec.push({ id: `E${i + 1}`, type: 'event', label: `${h.eventType.replace(/_/g, ' ')} by ${h.byRole}, ${Math.abs(mins)} min after the alert`, data: { event: h.eventType, minutesAfterAlert: mins, byRole: h.byRole }, numbers: num(mins) });
  });

  const missing = [
    'No bedside findings, history or clinical context for this newborn are available to the AI.',
    'The alert rule is an illustrative demonstration rule, not clinically approved.',
    ...(b.alert.triggering.some((r) => r.quality !== 'good' && r.quality !== 'unknown') ? ['Some triggering readings have questionable, poor or unavailable signal quality.'] : []),
    ...(b.alert.triggering.some((r) => r.quality === 'unknown') ? ['Some readings carry no device signal-quality indicator.'] : []),
    ...(b.recent === undefined ? [] : b.recent.length ? [] : ['No later readings are stored.']),
    ...b.unavailable.map((u) => `Not available to your role: ${u}.`),
    'Free-text clinician notes are never sent to the AI, so they are not reflected here.',
  ];
  return { records: rec, docs: b.guidance, unavailable: b.unavailable, missing };
}

/** Last line of defence before data leaves the server: refuses to send if anything identifying slipped into the payload. */
export class PrivacyError extends Error { constructor(public what: string) { super('privacy_guard'); } }
export function assertAnonymised(serialised: string, forbidden: string[]) {
  const low = serialised.toLowerCase();
  for (const f of forbidden) if (f && f.length >= 3 && low.includes(f.toLowerCase())) throw new PrivacyError('known identifier');
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialised)) throw new PrivacyError('uuid');
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(serialised)) throw new PrivacyError('email');
  if (/\bNB-\d+/i.test(serialised) || /\bSIM-MON/i.test(serialised)) throw new PrivacyError('identifier pattern');
  if (/\b20\d\d-\d\d-\d\dT\d\d:/.test(serialised)) throw new PrivacyError('absolute timestamp');
}
