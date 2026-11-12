import { z } from 'zod';
import { checkOutput, checkStrict } from '../safeguards.js';
import type { AiKind, AiOutput } from '../types.js';
import { PLACEHOLDER_TOKEN } from '../types.js';
import { HEADINGS } from './prompts.js';
import type { Payload } from './payload.js';

export interface Check { name: string; ok: boolean; detail?: string }
export interface Validation { passed: boolean; checks: Check[]; flags: string[]; note: string }
export const VALIDATION_NOTE = 'Automated checks cover format, source references, numbers and unsafe-language patterns only. Passing them does not mean the text is clinically correct. A clinician must review it.';

const stmt = z.object({ kind: z.enum(['fact', 'uncertainty', 'question']), text: z.string().min(3).max(400), refs: z.array(z.string().max(24)).max(8).default([]) });
const schema = z.object({ sections: z.array(z.object({ heading: z.string().max(100), statements: z.array(stmt).max(8) })).min(1).max(6) });

const KW: Array<[RegExp, string]> = [[/heart rate|pulse|\bbpm\b/i, 'heart_rate'], [/respiratory|breathing|breaths/i, 'respiratory_rate'], [/oxygen|spo2|spo₂|saturation/i, 'spo2'], [/temperature|°c/i, 'temperature']];
const TITLE: Record<AiKind, string> = { summary: 'Alert summary (AI-generated from stored data)', draft_assessment: 'Draft assessment for clinician review (AI-generated)', documentation_help: 'Documentation checklist (AI-generated)' };

function numbersIn(text: string): number[] {
  const t = text.replace(/\bDOC-[A-Z]+-\d+\b/g, ' ').replace(/\b[A-Z]{1,2}\d{1,2}\b/g, ' ').replace(/spo2|spo₂/gi, 'oxygen saturation').replace(/\b\d+(st|nd|rd|th)\b/gi, ' ');
  return (t.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}
const matches = (n: number, allowed: number[]) => allowed.some((a) => Math.abs(a - n) <= (Number.isInteger(n) ? 0.51 : 0.051));

export type Validated = { ok: true; output: AiOutput; validation: Validation } | { ok: false; validation: Validation };

export function validateModelOutput(raw: string, kind: AiKind, payload: Payload, alertHeader: string): Validated {
  const checks: Check[] = []; const flags = new Set<string>();
  const fail = (name: string, detail?: string): Validated => { checks.push({ name, ok: false, detail }); return { ok: false, validation: { passed: false, checks, flags: [...flags], note: VALIDATION_NOTE } }; };

  let json: unknown;
  try { json = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); checks.push({ name: 'json_parse', ok: true }); } catch { return fail('json_parse'); }
  const parsed = schema.safeParse(json); if (!parsed.success) return fail('schema', parsed.error.issues[0]?.path.join('.'));
  checks.push({ name: 'schema', ok: true });

  const allowed = HEADINGS[kind]; const canon = new Map(allowed.map((h) => [h.toLowerCase(), h]));
  type Info = { numbers: number[]; measurementType?: string; label: string };
  const byId = new Map<string, Info>();
  for (const r of payload.records) byId.set(r.id, { numbers: r.numbers, measurementType: r.measurementType, label: r.label });
  for (const d of payload.docs) byId.set(d.id, { numbers: [], label: d.title });
  const used = new Set<string>(); const sections: AiOutput['sections'] = []; let n = 0;
  const problems: Record<string, string> = {};
  const bad = (k: string, d: string) => { problems[k] ??= d; };

  for (const sec of parsed.data.sections) {
    const heading = canon.get(sec.heading.trim().toLowerCase());
    if (!heading) { bad('allowed_headings', sec.heading.slice(0, 40)); continue; }
    for (const s of sec.statements) {
      n++;
      const cited = s.refs.map((r) => byId.get(r));
      if (cited.some((c) => !c)) bad('sources_exist', s.refs.join(','));
      if (s.kind === 'fact' && !s.refs.length) bad('facts_have_sources', s.text.slice(0, 40));
      if (kind === 'documentation_help' && s.kind === 'fact') bad('documentation_items_not_facts', s.text.slice(0, 40));
      const known = cited.filter((c): c is NonNullable<typeof c> => !!c); s.refs.forEach((r) => byId.has(r) && used.add(r));
      const pool = known.flatMap((c) => c.numbers);
      for (const x of numbersIn(s.text)) if (!matches(x, pool)) bad('numbers_grounded', `${x}`);
      if (s.kind === 'fact') for (const [re, type] of KW) if (re.test(s.text) && !known.some((c) => c.measurementType === type)) bad('measurements_grounded', type);
      // Phase 7 base filter AND the stricter model-output patterns. Neither is proof of clinical correctness.
      for (const f of [...checkOutput({ title: '', sections: [{ heading: '', text: s.text }], sources: [], limitations: [] }), ...checkStrict(s.text)]) flags.add(f);
    }
    sections.push({ heading, text: '', statements: sec.statements.map((s) => ({ kind: s.kind, text: s.text.trim(), refs: s.refs })) });
  }
  const order = ['allowed_headings', 'sources_exist', 'facts_have_sources', 'documentation_items_not_facts', 'numbers_grounded', 'measurements_grounded'];
  for (const k of order) checks.push({ name: k, ok: !(k in problems), detail: problems[k] });
  checks.push({ name: 'safety_patterns', ok: flags.size === 0, detail: [...flags].join(',') || undefined });
  checks.push({ name: 'not_empty', ok: n > 0 && sections.length > 0 });
  const passed = checks.every((c) => c.ok);
  const validation: Validation = { passed, checks, flags: [...flags], note: VALIDATION_NOTE };
  if (!passed) return { ok: false, validation };

  const line = (s: { text: string; refs: string[] }) => (s.refs.length ? `${s.text} [${s.refs.join(', ')}]` : s.text);
  for (const s of sections) s.text = s.statements!.map(line).join('\n');
  const DRAFT_FACTS = ['Measurements recorded by the system', 'Signal quality', 'Responses recorded so far'];
  const factLines = sections.filter((s) => DRAFT_FACTS.includes(s.heading)).flatMap((s) => s.statements!.filter((x) => x.kind === 'fact').map((x) => `- ${line(x)}`));
  const draftText = kind === 'draft_assessment' ? [
    'DRAFT FOR CLINICIAN REVIEW. Prepared by an AI model from stored system data. It is not a clinical finding.', '', alertHeader, 'Recorded by the system:', ...factLines, '',
    // The clinical fields are added by the server, never by the model.
    `Bedside assessment: ${PLACEHOLDER_TOKEN}: findings on examination]`, `Interpretation: ${PLACEHOLDER_TOKEN}: your clinical interpretation]`, `Actions taken or planned: ${PLACEHOLDER_TOKEN}: response and follow-up]`,
  ].join('\n') : undefined;

  return { ok: true, validation, output: {
    title: TITLE[kind], sections, draftText,
    sourceRecords: [...used].map((id) => ({ id, label: byId.get(id)!.label })),
    missingInformation: payload.missing,
    sources: [{ id: 'ALERT-EVIDENCE', title: 'Stored alert evidence (anonymised)', kind: 'system-data' as const }, ...payload.docs.map((d) => ({ id: d.id, title: d.title, kind: 'system-documentation' as const }))],
    limitations: ['Written by an AI model from anonymised stored alert data only. Verify every statement against the source records.', 'Not a diagnosis, assessment, recommendation or decision.', 'Automated checks cannot confirm clinical correctness.', 'The alert rule is illustrative and not clinically approved.'],
  } };
}
