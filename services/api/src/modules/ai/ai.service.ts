import { pool } from '../../database/db.js';
import type { AuthUser } from '../../middleware/auth.js';
import { HttpError } from '../../utils/errors.js';
import { audit } from '../audit/audit.service.js';
import { demoProvider } from './providers/demo.provider.js';
import { azureConfigured, azureProvider } from './providers/azure.provider.js';
import { checkOutput, withheld } from './safeguards.js';
import { ToolBox } from './tools.js';
import { DEMO_LABEL, PLACEHOLDER_TOKEN, type AiKind, type AiOutput, type AiProvider, type Bundle } from './types.js';

export const aiEnabled = () => process.env.AI_ENABLED !== 'false';
export function activeProvider(): AiProvider { return process.env.AI_PROVIDER === 'azure' && azureConfigured() ? azureProvider : demoProvider; }

export function aiStatus() {
  const p = activeProvider();
  return {
    enabled: aiEnabled(), mode: p.mode, label: p.mode === 'demo' ? DEMO_LABEL : p.label, provider: p.name,
    azureRequested: process.env.AI_PROVIDER === 'azure', azureConfigured: azureConfigured(),
    capabilities: ['Summarise an existing alert from stored data', 'Prepare a draft assessment with fields the clinician must complete'],
    cannot: ['Diagnose', 'Recommend or describe treatment', 'Acknowledge, escalate, dismiss or resolve alerts', 'Create or change any clinical record', 'Make clinical decisions'],
    tools: [{ name: 'get_alert', needs: 'alert:read' }, { name: 'get_related_observations', needs: 'observation:read' }, { name: 'get_response_history', needs: 'response:read' }, { name: 'get_guidance', needs: 'alert:read' }],
  };
}

/** Guarantees the three clinician-only fields exist, whatever the provider produced. */
function ensurePlaceholders(o: AiOutput): AiOutput {
  if (o.draftText === undefined) return o;
  const n = o.draftText.split(PLACEHOLDER_TOKEN).length - 1;
  if (n >= 3) return o;
  return { ...o, draftText: `${o.draftText}\n\nBedside assessment: ${PLACEHOLDER_TOKEN}: findings on examination]\nInterpretation: ${PLACEHOLDER_TOKEN}: your clinical interpretation]\nActions taken or planned: ${PLACEHOLDER_TOKEN}: response and follow-up]` };
}

export async function runAssistance(user: AuthUser, alertId: string, kind: AiKind) {
  if (!aiEnabled()) throw new HttpError(503, 'AI assistance is switched off. The alert workflow is unaffected.', 'ai_disabled');
  const tb = new ToolBox(user, alertId);
  const a = await tb.getAlert();
  const recent = await tb.getRecentObservations(a.newborn_id);
  const history = await tb.getResponseHistory();
  const guidance = await tb.getGuidance('rule signal quality alert lifecycle ai summary draft');
  const map = (r: any) => ({ measurementType: r.measurementType, value: r.value, unit: r.unit, observedAt: new Date(r.observedAt).toISOString(), quality: r.quality });
  const bundle: Bundle = {
    alert: { priority: a.priority, title: a.title, explanation: a.explanation, status: a.status, createdAt: a.created_at.toISOString(), ruleName: a.rule_name, ruleVersion: a.rule_version, illustrative: !!a.evidence?.illustrative, triggering: (a.evidence?.triggering ?? []).map(map), context: (a.evidence?.context ?? []).map(map) },
    recent, history, guidance, unavailable: tb.unavailable,
  };

  let provider = activeProvider(); let status: 'completed' | 'blocked' | 'fallback' = 'completed'; let output: AiOutput;
  try { output = await provider.generate(kind, bundle); }
  catch (e) {
    if (provider.mode === 'azure') { provider = demoProvider; status = 'fallback'; output = await provider.generate(kind, bundle); } // Azure unavailable: stay usable in demo mode
    else throw new HttpError(503, 'AI assistance is temporarily unavailable. The alert workflow is unaffected.', 'ai_unavailable');
  }
  output = ensurePlaceholders(output);
  const flags = checkOutput(output);
  if (flags.length) { output = withheld(flags); status = 'blocked'; }

  const label = provider.mode === 'demo' ? DEMO_LABEL : provider.label;
  const row = await pool.query(
    `INSERT INTO ai_interactions(hospital_id,user_id,alert_id,kind,provider,mode,status,tool_calls,output,safeguard_flags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [user.hospitalId, user.id, alertId, kind, provider.name, provider.mode, status, JSON.stringify(tb.calls), JSON.stringify(output), JSON.stringify(flags)]);
  const id = row.rows[0].id as string;
  await audit({ hospitalId: user.hospitalId, userId: user.id, action: kind === 'summary' ? 'ai.summary_generated' : 'ai.draft_generated', resourceType: 'alert', resourceId: alertId, metadata: { interactionId: id, provider: provider.name, mode: provider.mode, status, flags, tools: tb.calls.map((c) => `${c.tool}:${c.allowed ? 'ok' : 'denied'}`) } });
  return { interactionId: id, kind, mode: provider.mode, label, status, output, notice: 'AI-prepared. Not part of the clinical record. A clinician must review everything.' };
}
