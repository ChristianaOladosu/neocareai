import { describe, it, expect } from 'vitest';
import { checkOutput } from '../../services/api/src/modules/ai/safeguards.js';
import { demoProvider } from '../../services/api/src/modules/ai/providers/demo.provider.js';
import { retrieve } from '../../services/api/src/modules/ai/guidance.js';
import type { Bundle, AiOutput } from '../../services/api/src/modules/ai/types.js';

const iso = (m: number) => new Date(Date.UTC(2026, 10, 9, 8, 0, 0) + m * 60000).toISOString();
const r = (t: any, v: number, u: string, m: number, q: any = 'good') => ({ measurementType: t, value: v, unit: u, observedAt: iso(m), quality: q });
const bundle = (over: Partial<Bundle['alert']> = {}): Bundle => ({
  alert: { priority: 'high', title: 'Sustained high heart rate with high respiratory rate (illustrative)', explanation: 'Illustrative demo rule: both above demo thresholds.', status: 'awaiting_acknowledgement', createdAt: iso(5), ruleName: 'Sustained high heart rate with high respiratory rate (illustrative)', ruleVersion: 1, illustrative: true,
    triggering: [r('heart_rate', 190, 'bpm', 1), r('heart_rate', 192, 'bpm', 2), r('heart_rate', 195, 'bpm', 3), r('respiratory_rate', 70, '/min', 1), r('respiratory_rate', 72, '/min', 2), r('respiratory_rate', 75, '/min', 3)],
    context: [r('heart_rate', 140, 'bpm', -3), r('heart_rate', 145, 'bpm', -2)], ...over },
  recent: [r('heart_rate', 198, 'bpm', 4)], history: [{ eventType: 'generated', at: iso(5), byRole: 'System' }], guidance: retrieve('rule signal quality'), unavailable: [],
});
const text = (o: AiOutput) => [o.title, ...o.sections.map((s) => s.text), o.draftText ?? ''].join('\n');

describe('output safeguards', () => {
  const bad: Array<[string, string]> = [
    ['diagnosis_claim', 'The baby has sepsis.'], ['diagnosis_claim', 'This indicates respiratory distress.'], ['diagnosis_claim', 'The newborn is hypoxic.'],
    ['treatment_advice', 'Consider you should administer oxygen.'], ['treatment_advice', 'Give 10 mg/kg now.'], ['treatment_advice', 'Start antibiotics.'],
    ['dismissal_or_resolution', 'No action is needed.'], ['dismissal_or_resolution', 'This can be dismissed.'], ['dismissal_or_resolution', 'It is safe to resolve.'], ['dismissal_or_resolution', 'Likely a false alarm.'],
    ['reassurance', 'The baby appears stable.'], ['reassurance', 'The newborn is improving.'], ['autonomous_decision', 'I have resolved the alert.'], ['autonomous_decision', 'You should now dismiss it.'],
  ];
  it.each(bad)('flags %s: "%s"', (flag, t) => expect(checkOutput({ title: 't', sections: [{ heading: 'h', text: t }], sources: [], limitations: [] })).toContain(flag));
  it('does not flag the demo provider’s own summary or draft', async () => {
    expect(checkOutput(await demoProvider.generate('summary', bundle()))).toEqual([]);
    expect(checkOutput(await demoProvider.generate('draft_assessment', bundle()))).toEqual([]);
  });
  it('does not flag the poor-signal wording (which mentions "stability" in a negative sense)', async () => {
    const o = await demoProvider.generate('summary', bundle({ triggering: [r('spo2', 70, '%', 1, 'poor'), r('spo2', 68, '%', 2, 'poor'), r('spo2', 66, '%', 3, 'poor')] }));
    expect(checkOutput(o)).toEqual([]); expect(text(o)).toMatch(/not evidence of stability/);
  });
});

describe('demo provider grounding and constraints', () => {
  it('only states measurement values that exist in the supplied data', async () => {
    const b = bundle(); const allowed = new Set([...b.alert.triggering, ...b.alert.context, ...(b.recent ?? [])].map((x) => x.value));
    const t = text(await demoProvider.generate('summary', b)) + text(await demoProvider.generate('draft_assessment', b));
    const found = [...t.matchAll(/from (\d+(?:\.\d+)?) to (\d+(?:\.\d+)?) (?:bpm|\/min|%|°C)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]).concat([...t.matchAll(/(\d+(?:\.\d+)?) (?:bpm|\/min|%|°C) at /g)].map((m) => Number(m[1])));
    expect(found.length).toBeGreaterThan(8);
    for (const v of found) expect(allowed.has(v), `unsupported value ${v}`).toBe(true);
  });
  it('includes the rule, a source list and limitations, and never an identifier', async () => {
    const o = await demoProvider.generate('summary', bundle());
    expect(text(o)).toMatch(/version 1, illustrative/); expect(o.sources.map((s) => s.id)).toContain('ALERT-EVIDENCE'); expect(o.sources.every((s) => ['system-data', 'system-documentation'].includes(s.kind))).toBe(true);
    expect(o.limitations.join(' ')).toMatch(/not a diagnosis/i); expect(JSON.stringify(o)).not.toMatch(/NB-\d/);
  });
  it('the draft leaves exactly three clinician-only fields', async () => {
    const o = await demoProvider.generate('draft_assessment', bundle());
    expect(o.draftText!.split('[Clinician to complete').length - 1).toBe(3); expect(o.draftText).toMatch(/DRAFT FOR CLINICIAN REVIEW/);
  });
  it('guidance corpus contains documentation only, with identifiable ids', () => {
    for (const g of retrieve('alert rule signal quality lifecycle ai summary')) expect(g.id).toMatch(/^DOC-/);
    expect(retrieve('antibiotic dose sepsis')).toEqual([]);
  });
});
