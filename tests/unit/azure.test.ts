import { describe, it, expect } from 'vitest';
import { assertAnonymised, buildPayload, PrivacyError } from '../../services/api/src/modules/ai/azure/payload.js';
import { validateModelOutput } from '../../services/api/src/modules/ai/azure/validate.js';
import { classify, AzureError } from '../../services/api/src/modules/ai/azure/client.js';
import { azureConfigProblem, defaultMode } from '../../services/api/src/modules/ai/azure/config.js';
import { syntheticBundle } from '../../services/api/src/modules/ai/synthetic.js';
import { checkStrict } from '../../services/api/src/modules/ai/safeguards.js';

const payload = () => buildPayload(syntheticBundle());
const ok = (sections: any[], kind: any = 'summary') => validateModelOutput(JSON.stringify({ sections }), kind, payload(), 'Alert: test');
const S = (heading: string, statements: any[]) => ({ heading, statements });
const fact = (text: string, refs: string[]) => ({ kind: 'fact', text, refs });

describe('anonymised, minimum-necessary payload', () => {
  const p = payload(); const json = JSON.stringify(buildPayload(syntheticBundle()));
  it('uses relative times and stable record ids, with no absolute timestamps', () => {
    expect(json).not.toMatch(/20\d\d-\d\d-\d\dT/); expect(json).toContain('minutesBeforeAlert');
    expect(p.records.map((r) => r.id)).toEqual(expect.arrayContaining(['A1', 'T1', 'T2', 'T3', 'C1', 'F1', 'E1']));
  });
  it('computes trend facts on the server rather than asking the model to calculate', () => {
    const f = p.records.find((r) => r.id === 'F1')!; expect(f.data).toMatchObject({ readings: 3, firstValue: 190, lastValue: 195, spanMinutes: 2 });
  });
  it('privacy guard refuses to send identifiers, emails, UUIDs, device ids or absolute timestamps', () => {
    const bad = ['{"x":"NB-0001"}', '{"x":"SIM-MON-01"}', '{"x":"a@b.org"}', '{"x":"123e4567-e89b-12d3-a456-426614174000"}', '{"x":"2026-11-09T10:00:00Z"}'];
    for (const b of bad) expect(() => assertAnonymised(b, [])).toThrow(PrivacyError);
    expect(() => assertAnonymised('{"note":"Demo Hospital"}', ['Demo Hospital'])).toThrow(PrivacyError);
    expect(() => assertAnonymised(json, ['Demo Hospital', 'NB-0001'])).not.toThrow();
  });
});

describe('output validation against stored records', () => {
  const good = [S('Measurement trends', [fact('Heart rate had 3 readings from 190 to 195 bpm over 2 minutes.', ['F1'])]), S('Questions for the clinical team', [{ kind: 'question', text: 'Do the bedside findings match these measurements?', refs: [] }])];
  it('accepts grounded, sourced output and attaches the cited source records', () => {
    const r = ok(good); expect(r.ok).toBe(true); if (r.ok) { expect(r.output.sourceRecords!.map((x) => x.id)).toEqual(['F1']); expect(r.output.missingInformation!.length).toBeGreaterThan(2); expect(r.validation.note).toMatch(/does not mean the text is clinically correct/); }
  });
  const rejects: Array<[string, string, any[]]> = [
    ['unsupported number', 'numbers_grounded', [S('Measurement trends', [fact('Heart rate reached 250 bpm.', ['F1'])])]],
    ['number not in the cited record', 'numbers_grounded', [S('Measurement trends', [fact('Heart rate was 140 bpm.', ['T1'])])]],
    ['fact without a source', 'facts_have_sources', [S('Measurement trends', [fact('Heart rate was high.', [])])]],
    ['invented source id', 'sources_exist', [S('Measurement trends', [fact('Heart rate was recorded.', ['T99'])])]],
    ['measurement without a matching source', 'measurements_grounded', [S('Measurement trends', [fact('Temperature was recorded.', ['F1'])])]],
    ['unknown heading', 'allowed_headings', [S('Recommended management', [{ kind: 'question', text: 'What next?', refs: [] }])]],
    ['number inside a question', 'numbers_grounded', [S('Questions for the clinical team', [{ kind: 'question', text: 'Is 250 bpm expected?', refs: [] }])]],
    ['diagnosis', 'safety_patterns', [S('Measurement trends', [fact('The baby has sepsis.', ['F1'])])]],
    ['treatment', 'safety_patterns', [S('Measurement trends', [fact('Start antibiotics.', ['F1'])])]],
    ['dismissal', 'safety_patterns', [S('Measurement trends', [fact('No action is needed.', ['F1'])])]],
    ['reassurance', 'safety_patterns', [S('Measurement trends', [fact('The baby appears stable.', ['F1'])])]],
    ['inference', 'safety_patterns', [S('Measurement trends', [fact('This is likely due to infection.', ['F1'])])]],
    ['severity judgement', 'safety_patterns', [S('Measurement trends', [fact('This is a critical change.', ['F1'])])]],
    ['instruction', 'safety_patterns', [S('Measurement trends', [fact('Staff should check the sensor.', ['F1'])])]],
    ['markup and links', 'safety_patterns', [S('Measurement trends', [fact('See <b>this</b> http://x.org', ['F1'])])]],
  ];
  it.each(rejects)('rejects %s', (_n, check, secs) => { const r = ok(secs); expect(r.ok).toBe(false); expect(r.validation.checks.find((c) => c.name === check)!.ok).toBe(false); });
  it('rejects malformed JSON and wrong shapes', () => {
    for (const raw of ['not json', '{}', '{"sections":[]}', '{"sections":[{"heading":"x","statements":[{"kind":"fact"}]}]}', '[]'])
      expect(validateModelOutput(raw, 'summary', payload(), 'h').ok).toBe(false);
  });
  it('accepts JSON wrapped in a code fence but ignores unknown fields', () => {
    const r = validateModelOutput('```json\n' + JSON.stringify({ sections: good, diagnosis: 'x' }) + '\n```', 'summary', payload(), 'h'); expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.stringify(r.output)).not.toMatch(/"diagnosis"/);
  });
  it('documentation checklist may not contain factual claims', () => {
    expect(ok([S('Documentation checklist', [fact('Heart rate was 190 bpm.', ['T1'])])], 'documentation_help').ok).toBe(false);
    expect(ok([S('Documentation checklist', [{ kind: 'question', text: 'Is the acknowledgement recorded?', refs: [] }])], 'documentation_help').ok).toBe(true);
  });
  it('the server, not the model, writes the clinician-only fields of a draft', () => {
    const r = ok([S('Measurements recorded by the system', [fact('Heart rate had 3 readings from 190 to 195 bpm over 2 minutes.', ['F1'])])], 'draft_assessment');
    expect(r.ok).toBe(true); if (r.ok) { expect(r.output.draftText!.split('[Clinician to complete').length - 1).toBe(3); expect(r.output.draftText).toMatch(/\[F1\]/); }
    // A model that tries to write the clinical fields itself is rejected by the pattern checks or simply ignored: it can never fill the placeholders.
    const sneaky = ok([S('Responses recorded so far', [fact('Bedside assessment: Interpretation: normal.', ['F1'])])], 'draft_assessment'); expect(sneaky.ok).toBe(false);
  });
  it('strict patterns do not fire on plain neutral wording', () => {
    for (const t of ['Heart rate had 3 readings from 190 to 195 bpm over 2 minutes.', 'Do the bedside findings match these recorded measurements?', 'No bedside findings are available to this summary.', 'The record shows acknowledged by Nurse.']) expect(checkStrict(t)).toEqual([]);
  });
});

describe('error classification and configuration', () => {
  it.each([[401, 'credentials'], [403, 'credentials'], [404, 'misconfigured'], [429, 'rate_limited'], [500, 'unavailable'], [503, 'unavailable'], [400, 'misconfigured']])('HTTP %s -> %s', (status, cat) => expect(classify({ status }).category).toBe(cat));
  it('detects timeouts, content filtering and connection failures; keeps no raw message', () => {
    // Shape taken from the installed SDK: class APIConnectionTimeoutError, name 'Error', message 'Request timed out.', cause AbortError.
    class APIConnectionTimeoutError extends Error { cause = Object.assign(new Error('aborted'), { name: 'AbortError' }); constructor() { super('Request timed out.'); } }
    expect(classify(new APIConnectionTimeoutError()).category).toBe('timeout'); expect(classify({ name: 'AbortError' }).category).toBe('timeout'); expect(classify({ status: 400, code: 'content_filter' }).category).toBe('content_filtered');
    expect(classify(new Error('ECONNREFUSED https://secret-endpoint key=abc')).category).toBe('unavailable'); expect(JSON.stringify(classify(new Error('key=abc')))).not.toMatch(/abc/);
    expect(classify({ status: 429, headers: { 'retry-after': '7' } }).retryAfterSeconds).toBe(7); expect(classify(new AzureError('timeout')).category).toBe('timeout');
  });
  it('reports configuration problems without needing a network call', () => {
    const keep = { ...process.env }; for (const k of Object.keys(process.env)) if (k.startsWith('AZURE_') || k === 'AI_PROVIDER') delete process.env[k];
    try {
      expect(azureConfigProblem()).toMatch(/ENDPOINT/); expect(defaultMode()).toBe('demo');
      Object.assign(process.env, { AZURE_OPENAI_ENDPOINT: 'http://example.com', AZURE_OPENAI_DEPLOYMENT: 'd', AZURE_OPENAI_API_KEY: 'k' }); expect(azureConfigProblem()).toMatch(/https/);
      process.env.AZURE_OPENAI_ENDPOINT = 'https://x.openai.azure.com'; expect(azureConfigProblem()).toBeNull(); expect(defaultMode()).toBe('demo'); // configured is not the same as selected
      process.env.AI_PROVIDER = 'azure'; expect(defaultMode()).toBe('azure');
    } finally { for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k]; Object.assign(process.env, keep); }
  });
});
