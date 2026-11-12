import { pool } from '../../database/db.js';
import type { AuthUser } from '../../middleware/auth.js';
import { HttpError } from '../../utils/errors.js';
import { audit } from '../audit/audit.service.js';
import { demoProvider } from './providers/demo.provider.js';
import { azureGenerate, OutputRejected } from './providers/azure.provider.js';
import { azureConfig, azureConfigProblem, azureConfigured, defaultMode } from './azure/config.js';
import { AzureError, type AzureErrorCategory } from './azure/client.js';
import { PrivacyError } from './azure/payload.js';
import { VALIDATION_NOTE, type Validation } from './azure/validate.js';
import { checkOutput, withheld } from './safeguards.js';
import { syntheticBundle } from './synthetic.js';
import { ToolBox } from './tools.js';
import { DEMO_LABEL, PLACEHOLDER_TOKEN, type AiKind, type AiOutput, type Bundle } from './types.js';

export type AiMode = 'demo' | 'azure';
export const aiEnabled = () => process.env.AI_ENABLED !== 'false';
const NOTICE = 'AI-prepared. Not part of the clinical record. A clinician must review everything.';

const FAIL: Record<AzureErrorCategory, { status: number; code: string; message: string }> = {
  credentials: { status: 502, code: 'ai_credentials_invalid', message: 'The AI service rejected the configured credentials. An administrator needs to check the AI configuration.' },
  rate_limited: { status: 429, code: 'ai_rate_limited', message: 'The AI service is busy (rate limit reached). Please try again shortly.' },
  timeout: { status: 504, code: 'ai_timeout', message: 'The AI service did not respond in time.' },
  unavailable: { status: 503, code: 'ai_unavailable', message: 'The AI service is currently unavailable.' },
  content_filtered: { status: 422, code: 'ai_content_filtered', message: 'The AI service declined to produce a response for this request.' },
  malformed: { status: 502, code: 'ai_malformed', message: 'The AI service returned a response that could not be used.' },
  misconfigured: { status: 502, code: 'ai_misconfigured', message: 'The AI service is not configured correctly. An administrator needs to check the endpoint, deployment name and API version.' },
};
const SAFE = { demoAvailable: true, workflowUnaffected: true };

export async function aiStatus(user: AuthUser) {
  const mode = defaultMode(); const cfg = azureConfig(); const admin = user.permissions.has('ai:manage');
  const last = await pool.query(`SELECT metadata, created_at FROM audit_logs WHERE hospital_id=$1 AND action='ai.connection_test' ORDER BY created_at DESC LIMIT 1`, [user.hospitalId]);
  return {
    enabled: aiEnabled(), defaultMode: mode, mode, label: mode === 'demo' ? DEMO_LABEL : 'Azure OpenAI', provider: mode === 'demo' ? 'local-template' : 'azure-openai',
    azure: { configured: azureConfigured(), requested: process.env.AI_PROVIDER === 'azure', ...(admin ? { deployment: cfg?.deployment, apiVersion: cfg?.apiVersion, auth: cfg?.auth, configurationProblem: azureConfigProblem() } : {}),
      lastConnectionTest: last.rows[0] ? { ok: last.rows[0].metadata.ok, category: last.rows[0].metadata.category ?? null, model: last.rows[0].metadata.model ?? null, at: last.rows[0].created_at } : null },
    capabilities: ['Summarise an existing alert and explain stored measurement trends', 'Organise earlier observations and recorded responses', 'Prepare a structured draft with fields only the clinician can complete', 'Suggest neutral questions and a documentation checklist'],
    cannot: ['Diagnose', 'Recommend or describe treatment or medication', 'Acknowledge, escalate, dismiss or resolve alerts', 'Create or change any clinical record or observation', 'Make clinical decisions'],
    tools: [{ name: 'get_alert', needs: 'alert:read' }, { name: 'get_related_observations', needs: 'observation:read' }, { name: 'get_response_history', needs: 'response:read' }, { name: 'get_guidance', needs: 'alert:read' }],
  };
}

function ensurePlaceholders(o: AiOutput): AiOutput {
  if (o.draftText === undefined || o.draftText.split(PLACEHOLDER_TOKEN).length - 1 >= 3) return o;
  return { ...o, draftText: `${o.draftText}\n\nBedside assessment: ${PLACEHOLDER_TOKEN}: findings on examination]\nInterpretation: ${PLACEHOLDER_TOKEN}: your clinical interpretation]\nActions taken or planned: ${PLACEHOLDER_TOKEN}: response and follow-up]` };
}

/** Everything that identifies this newborn, hospital, unit, device or staff member: used to prove none of it is sent externally. */
async function forbiddenStrings(user: AuthUser, alertId: string): Promise<string[]> {
  const r = await pool.query(
    `SELECT n.newborn_identifier, h.name AS hospital, un.name AS unit, (SELECT COALESCE(array_agg(d.device_identifier), '{}') FROM devices d WHERE d.hospital_id=h.id) AS devices,
            (SELECT COALESCE(array_agg(u.full_name), '{}') FROM users u WHERE u.hospital_id=h.id) AS names, (SELECT COALESCE(array_agg(u.email), '{}') FROM users u WHERE u.hospital_id=h.id) AS emails
     FROM clinical_alerts a JOIN newborns n ON n.id=a.newborn_id JOIN hospitals h ON h.id=a.hospital_id LEFT JOIN units un ON un.id=n.unit_id WHERE a.id=$1 AND a.hospital_id=$2`, [alertId, user.hospitalId]);
  const x = r.rows[0]; if (!x) return [];
  return [x.newborn_identifier, x.hospital, x.unit, ...x.devices, ...x.names, ...x.emails].filter(Boolean);
}

interface Rec { alertId: string | null; kind: AiKind; provider: string; mode: AiMode; requestedMode: AiMode; status: 'completed' | 'blocked' | 'invalid' | 'failed'; tools?: unknown; output?: AiOutput | null; flags?: string[]; validation?: Partial<Validation>; model?: string | null; latencyMs?: number; errorCategory?: string; digest?: string }
async function record(user: AuthUser, r: Rec) {
  const role = user.roles.join(',');
  const row = await pool.query(
    `INSERT INTO ai_interactions(hospital_id,user_id,alert_id,kind,provider,mode,status,tool_calls,output,safeguard_flags,model_id,requested_mode,user_role,validation,latency_ms,error_category,request_digest)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [user.hospitalId, user.id, r.alertId, r.kind, r.provider, r.mode, r.status, JSON.stringify(r.tools ?? []), r.output ? JSON.stringify(r.output) : null, JSON.stringify(r.flags ?? []), r.model ?? null, r.requestedMode, role, JSON.stringify(r.validation ?? {}), r.latencyMs ?? null, r.errorCategory ?? null, r.digest ?? null]);
  const id = row.rows[0].id as string;
  const action = r.status === 'completed' ? `ai.${r.kind === 'summary' ? 'summary' : r.kind === 'draft_assessment' ? 'draft' : 'documentation'}_generated` : r.status === 'failed' ? 'ai.request_failed' : 'ai.output_rejected';
  await audit({ hospitalId: user.hospitalId, userId: user.id, action, resourceType: 'alert', resourceId: r.alertId, metadata: { interactionId: id, kind: r.kind, provider: r.provider, mode: r.mode, model: r.model ?? null, role, status: r.status, errorCategory: r.errorCategory ?? null, flags: r.flags ?? [], checksFailed: (r.validation?.checks ?? []).filter((c) => !c.ok).map((c) => c.name) } });
  return id;
}

const inflight = new Set<string>();

export async function runAssistance(user: AuthUser, alertId: string, kind: AiKind, opts: { mode?: AiMode } = {}) {
  if (!aiEnabled()) throw new HttpError(503, 'AI assistance is switched off. The alert workflow is unaffected.', 'ai_disabled', SAFE);
  const requested: AiMode = opts.mode ?? defaultMode();
  if (requested === 'azure' && !azureConfigured())
    throw new HttpError(409, 'Azure OpenAI is not configured on this server, so no real AI response was produced. Choose Demo Mode, or ask an administrator to configure Azure.', 'ai_not_configured', { demoAvailable: true, workflowUnaffected: true });

  const key = `${user.id}:${alertId}:${kind}:${requested}`;
  if (inflight.has(key)) throw new HttpError(409, 'The same request is already being processed. Please wait for it to finish.', 'ai_request_in_progress');
  inflight.add(key);
  try {
    const tb = new ToolBox(user, alertId);
    const a = await tb.getAlert();
    const recent = await tb.getRecentObservations(a.newborn_id); const history = await tb.getResponseHistory(); const guidance = await tb.getGuidance('rule signal quality alert lifecycle ai summary draft');
    const map = (r: any) => ({ measurementType: r.measurementType, value: r.value, unit: r.unit, observedAt: new Date(r.observedAt).toISOString(), quality: r.quality });
    const bundle: Bundle = {
      alert: { priority: a.priority, title: a.title, explanation: a.explanation, status: a.status, createdAt: a.created_at.toISOString(), ruleName: a.rule_name, ruleVersion: a.rule_version, illustrative: !!a.evidence?.illustrative, triggering: (a.evidence?.triggering ?? []).map(map), context: (a.evidence?.context ?? []).map(map) },
      recent, history, guidance, unavailable: tb.unavailable,
    };
    const t0 = Date.now();

    if (requested === 'demo') {
      let output = ensurePlaceholders(await demoProvider.generate(kind, bundle)); let status: 'completed' | 'blocked' = 'completed';
      const flags = checkOutput(output); if (flags.length) { output = withheld(flags); status = 'blocked'; }
      const validation = { passed: !flags.length, checks: [{ name: 'safety_patterns', ok: !flags.length }], flags, note: 'Template text assembled from stored data. No AI model was used.' };
      const id = await record(user, { alertId, kind, provider: 'local-template', mode: 'demo', requestedMode: requested, status, tools: tb.calls, output, flags, validation, model: 'template-v1', latencyMs: Date.now() - t0 });
      return { interactionId: id, kind, mode: 'demo' as const, generated: false, label: DEMO_LABEL, model: 'template-v1', status, output, validation, notice: NOTICE };
    }

    try {
      const forbidden = await forbiddenStrings(user, alertId);
      const res = await azureGenerate(kind, bundle, { forbidden });
      const output = ensurePlaceholders(res.output);
      const id = await record(user, { alertId, kind, provider: 'azure-openai', mode: 'azure', requestedMode: requested, status: 'completed', tools: tb.calls, output, validation: res.validation, model: `${res.deployment} (${res.model})`, latencyMs: Date.now() - t0, digest: res.digest });
      return { interactionId: id, kind, mode: 'azure' as const, generated: true, label: `Generated by Azure OpenAI · ${res.model}`, model: res.model, status: 'completed' as const, output, validation: res.validation, notice: NOTICE };
    } catch (e) {
      const base = { alertId, kind, provider: 'azure-openai', mode: 'azure' as const, requestedMode: requested, tools: tb.calls, model: azureConfig()?.deployment ?? null, latencyMs: Date.now() - t0 };
      if (e instanceof OutputRejected) {
        await record(user, { ...base, status: 'invalid', flags: e.validation.flags, validation: e.validation, errorCategory: 'output_rejected' });
        throw new HttpError(422, 'The generated text did not pass the accuracy and safety checks, so it is not shown. You can try again or use Demo Mode.', 'ai_output_rejected', { ...SAFE, failedChecks: e.validation.checks.filter((c) => !c.ok).map((c) => c.name) });
      }
      if (e instanceof PrivacyError) {
        await record(user, { ...base, status: 'failed', errorCategory: 'privacy_blocked' });
        throw new HttpError(500, 'The request was stopped because it might have contained identifying information. Nothing was sent to the AI service.', 'ai_privacy_blocked', SAFE);
      }
      if (e instanceof AzureError) {
        const f = FAIL[e.category]; await record(user, { ...base, status: 'failed', errorCategory: e.category });
        throw new HttpError(f.status, f.message, f.code, { ...SAFE, ...(e.retryAfterSeconds ? { retryAfterSeconds: e.retryAfterSeconds } : {}) });
      }
      throw e;
    }
  } finally { inflight.delete(key); }
}

/** The clinician explicitly rejects an AI draft. (Recording it is handled by the assessment endpoint.) */
export async function rejectDraft(user: AuthUser, interactionId: string) {
  const r = await pool.query(`SELECT id, alert_id FROM ai_interactions WHERE id=$1 AND hospital_id=$2 AND user_id=$3 AND kind='draft_assessment' AND status='completed'`, [interactionId, user.hospitalId, user.id]);
  if (!r.rows[0]) throw new HttpError(404, 'Draft not found', 'not_found');
  try { await pool.query(`INSERT INTO ai_draft_decisions(interaction_id,user_id,decision) VALUES ($1,$2,'rejected')`, [interactionId, user.id]); }
  catch (e: any) { if (e.code === '23505') throw new HttpError(409, 'A decision has already been recorded for this draft', 'decision_exists'); throw e; }
  await audit({ hospitalId: user.hospitalId, userId: user.id, action: 'ai.draft_rejected', resourceType: 'alert', resourceId: r.rows[0].alert_id, metadata: { interactionId } });
  return { ok: true };
}

/** Administrator check of the Azure connection using fixed synthetic data. This is how a real connection gets established and evidenced. */
export async function testConnection(user: AuthUser) {
  if (!azureConfigured()) { const m = azureConfigProblem(); return { ok: false, category: 'not_configured', message: m ?? 'Azure is not configured' }; }
  const t0 = Date.now(); let out: { ok: boolean; category: string | null; model: string | null; message: string; checks?: Validation['checks'] };
  try { const r = await azureGenerate('summary', syntheticBundle(), { forbidden: [] }); out = { ok: true, category: null, model: r.model, message: 'Connected. The model answered and the output passed validation.', checks: r.validation.checks }; }
  catch (e) {
    if (e instanceof OutputRejected) out = { ok: false, category: 'output_rejected', model: null, message: 'Connected, but the model output failed validation. This is a prompt/model compatibility issue, not a credentials issue.', checks: e.validation.checks };
    else if (e instanceof AzureError) out = { ok: false, category: e.category, model: null, message: FAIL[e.category].message };
    else out = { ok: false, category: 'unknown', model: null, message: 'Unexpected error.' };
  }
  await audit({ hospitalId: user.hospitalId, userId: user.id, action: 'ai.connection_test', resourceType: 'ai', metadata: { ok: out.ok, category: out.category, model: out.model, deployment: azureConfig()?.deployment ?? null, latencyMs: Date.now() - t0 } });
  return { ...out, latencyMs: Date.now() - t0, note: VALIDATION_NOTE };
}
