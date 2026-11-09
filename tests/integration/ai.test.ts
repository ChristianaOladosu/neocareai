import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../services/api/src/app.js';
import { seed, DEMO_PASSWORD } from '../../services/api/src/database/seed.js';
import { ensureDefaultRules } from '../../services/api/src/modules/alerts/alert-engine.js';
import { pool } from '../../services/api/src/database/db.js';
import { env } from '../../services/api/src/config/env.js';
import { ToolBox } from '../../services/api/src/modules/ai/tools.js';
import type { AuthUser } from '../../services/api/src/middleware/auth.js';

const app = createApp(); let hospitalA = ''; let alertId = '';
const agent = async (email: string) => { const a = request.agent(app); await a.post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200); return a; };
const ts = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const count = async (sql: string, p: any[] = []) => (await pool.query(sql, p)).rows[0].c as number;
const realFetch = globalThis.fetch;
const azureEnv = () => Object.assign(process.env, { AI_PROVIDER: 'azure', AZURE_OPENAI_ENDPOINT: 'https://example.invalid', AZURE_OPENAI_API_KEY: 'x'.repeat(16), AZURE_OPENAI_DEPLOYMENT: 'test' });
afterEach(() => { globalThis.fetch = realFetch; for (const k of ['AI_PROVIDER', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_DEPLOYMENT', 'AI_ENABLED']) delete process.env[k]; });
afterAll(async () => { await pool.end(); });

beforeAll(async () => {
  await seed(true); await ensureDefaultRules();
  hospitalA = (await pool.query(`SELECT id FROM hospitals WHERE name LIKE 'Demo General%'`)).rows[0].id;
  for (let i = 0; i < 3; i++) for (const [t, v] of [['heart_rate', 190 + i], ['respiratory_rate', 70 + i]] as const)
    await request(app).post('/api/gateway/observations').set({ 'x-gateway-key': env.gatewayKey }).send({ hospitalId: hospitalA, deviceIdentifier: 'SIM-MON-01', measurementType: t, value: v, observedAt: ts(3 - i), deviceQuality: 'good' }).expect(201);
  alertId = (await pool.query(`SELECT id FROM clinical_alerts WHERE priority='high' LIMIT 1`)).rows[0].id;
});

describe('AI assistance: status, permissions, isolation', () => {
  it('reports Demo Mode and lists what it cannot do', async () => {
    const d = await agent('doctor@demo.neocareai.test'); const s = (await d.get('/api/ai/status').expect(200)).body;
    expect(s).toMatchObject({ mode: 'demo', label: 'Demo Mode – Not Connected to Azure', azureConfigured: false });
    expect(s.cannot).toEqual(expect.arrayContaining(['Diagnose', 'Make clinical decisions']));
  });
  it('enforces roles: administrator none, nurse summary only, doctor both', async () => {
    const admin = await agent('admin@demo.neocareai.test'); const nurse = await agent('nurse@demo.neocareai.test'); const doc = await agent('doctor@demo.neocareai.test');
    await admin.post(`/api/alerts/${alertId}/ai/summary`).expect(403); await admin.post(`/api/alerts/${alertId}/ai/draft-assessment`).expect(403);
    await nurse.post(`/api/alerts/${alertId}/ai/summary`).expect(200); await nurse.post(`/api/alerts/${alertId}/ai/draft-assessment`).expect(403);
    await doc.post(`/api/alerts/${alertId}/ai/summary`).expect(200); await doc.post(`/api/alerts/${alertId}/ai/draft-assessment`).expect(200);
    await request(app).post(`/api/alerts/${alertId}/ai/summary`).expect(401);
  });
  it('cannot be used on another hospital’s alert', async () => {
    const b = await agent('doctor.b@demo.neocareai.test'); await b.post(`/api/alerts/${alertId}/ai/summary`).expect(404);
  });
  it('denies tools the user lacks permission for, and audits the denial', async () => {
    const u: AuthUser = { id: (await pool.query(`SELECT id FROM users WHERE email='nurse@demo.neocareai.test'`)).rows[0].id, fullName: 'x', email: 'x', hospitalId: hospitalA, roles: [], permissions: new Set(['alert:read']) };
    const tb = new ToolBox(u, alertId); const a = await tb.getAlert();
    expect(await tb.getRecentObservations(a.newborn_id)).toBeUndefined(); expect(await tb.getResponseHistory()).toBeUndefined();
    expect(tb.calls.filter((c) => !c.allowed).map((c) => c.tool)).toEqual(['get_related_observations', 'get_response_history']);
    expect(await count(`SELECT count(*)::int c FROM audit_logs WHERE action='ai.tool_denied'`)).toBe(2);
    const noAlert = new ToolBox({ ...u, permissions: new Set() }, alertId); await expect(noAlert.getAlert()).rejects.toThrow(/Insufficient/);
  });
});

describe('AI assistance: content, auditability, no side effects', () => {
  it('summary is grounded, labelled and sourced', async () => {
    const d = await agent('doctor@demo.neocareai.test'); const r = (await d.post(`/api/alerts/${alertId}/ai/summary`).expect(200)).body;
    expect(r).toMatchObject({ mode: 'demo', label: 'Demo Mode – Not Connected to Azure', status: 'completed', kind: 'summary' });
    const txt = JSON.stringify(r.output); expect(txt).toMatch(/illustrative/); expect(txt).toMatch(/190/); expect(txt).not.toMatch(/NB-\d/);
    expect(r.output.sources.length).toBeGreaterThan(1); expect(r.output.limitations.join(' ')).toMatch(/not a diagnosis/i);
  });
  it('records every interaction and tool call, and never alters the alert or clinical records', async () => {
    const before = { ev: await count(`SELECT count(*)::int c FROM response_events WHERE alert_id=$1`, [alertId]), as: await count(`SELECT count(*)::int c FROM clinical_assessments`), obs: await count(`SELECT count(*)::int c FROM observations`) };
    const d = await agent('doctor@demo.neocareai.test'); await d.post(`/api/alerts/${alertId}/ai/summary`).expect(200); await d.post(`/api/alerts/${alertId}/ai/draft-assessment`).expect(200);
    expect(await count(`SELECT count(*)::int c FROM response_events WHERE alert_id=$1`, [alertId])).toBe(before.ev);
    expect(await count(`SELECT count(*)::int c FROM clinical_assessments`)).toBe(before.as); expect(await count(`SELECT count(*)::int c FROM observations`)).toBe(before.obs);
    expect((await pool.query(`SELECT status FROM clinical_alerts WHERE id=$1`, [alertId])).rows[0].status).toBe('awaiting_acknowledgement');
    const i = (await pool.query(`SELECT * FROM ai_interactions ORDER BY created_at DESC LIMIT 1`)).rows[0];
    expect(i.tool_calls.map((c: any) => c.tool)).toEqual(['get_alert', 'get_related_observations', 'get_response_history', 'get_guidance']);
    expect(await count(`SELECT count(*)::int c FROM audit_logs WHERE action IN ('ai.summary_generated','ai.draft_generated')`)).toBeGreaterThanOrEqual(4);
    await expect(pool.query(`UPDATE ai_interactions SET status='completed'`)).rejects.toThrow(/append-only/);
    await expect(pool.query(`DELETE FROM ai_interactions`)).rejects.toThrow(/append-only/);
  });
  it('restricts the AI oversight view to users with audit access', async () => {
    const admin = await agent('admin@demo.neocareai.test'); const list = (await admin.get('/api/ai/interactions').expect(200)).body;
    expect(list.length).toBeGreaterThan(0); expect(list[0]).not.toHaveProperty('output');
    await (await agent('nurse@demo.neocareai.test')).get('/api/ai/interactions').expect(403);
  });
  it('can be switched off without affecting the alert workflow', async () => {
    process.env.AI_ENABLED = 'false'; const d = await agent('doctor@demo.neocareai.test');
    const r = await d.post(`/api/alerts/${alertId}/ai/summary`).expect(503); expect(r.body.error).toBe('ai_disabled');
    await d.post(`/api/alerts/${alertId}/acknowledge`).expect(200);
  });
});

describe('AI drafts cannot reach the clinical record unreviewed', () => {
  it('rejects an unmodified draft, accepts a completed one, and marks AI assistance in the history', async () => {
    const d = await agent('doctor@demo.neocareai.test');
    const draft = (await d.post(`/api/alerts/${alertId}/ai/draft-assessment`).expect(200)).body;
    expect(draft.output.draftText.split('[Clinician to complete').length - 1).toBe(3);
    expect((await d.post(`/api/alerts/${alertId}/assessment`).send({ assessmentText: draft.output.draftText, aiInteractionId: draft.interactionId }).expect(422)).body.error).toBe('draft_incomplete');
    const partial = draft.output.draftText.replace(/\[Clinician to complete: findings on examination\]/, 'Alert, term infant, comfortable.');
    await d.post(`/api/alerts/${alertId}/assessment`).send({ assessmentText: partial }).expect(422);
    await d.post(`/api/alerts/${alertId}/assessment`).send({ assessmentText: 'Reviewed at bedside (synthetic).', aiInteractionId: '00000000-0000-4000-8000-000000000000' }).expect(400);
    const done = draft.output.draftText.replace(/\[Clinician to complete[^\]]*\]/g, 'Completed by clinician (synthetic).');
    await d.post(`/api/alerts/${alertId}/assessment`).send({ assessmentText: done, aiInteractionId: draft.interactionId }).expect(200);
    const ev = (await d.get(`/api/alerts/${alertId}`).expect(200)).body.events.find((e: any) => e.event_type === 'assessment_recorded');
    expect(ev.event_details).toMatchObject({ aiAssisted: true, aiInteractionId: draft.interactionId }); expect(ev.user_name).toBe('Dr. Demo Doctor');
  });
});

describe('Azure integration seam (stubbed network; no real Azure call was made)', () => {
  const azureReply = (content: object) => async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });
  it('uses the Azure provider when configured and passes only anonymised data', async () => {
    azureEnv(); let sent = '';
    globalThis.fetch = (async (u: any, init: any) => (String(u).startsWith('https://example.invalid') ? (sent = init.body, azureReply({ title: 'Summary', sections: [{ heading: 'What the system detected', text: 'Heart rate readings of 190 to 195 bpm.' }] })()) : realFetch(u, init))) as typeof fetch;
    const d = await agent('doctor@demo.neocareai.test'); const r = (await d.post(`/api/alerts/${alertId}/ai/summary`).expect(200)).body;
    expect(r.mode).toBe('azure'); expect(sent).not.toMatch(/NB-\d|Demo Doctor|doctor@/); expect(r.output.sources.some((s: any) => s.id === 'ALERT-EVIDENCE')).toBe(true);
  });
  it('withholds unsafe model output (diagnosis, dismissal) and records the flags', async () => {
    azureEnv(); globalThis.fetch = (async (u: any, init: any) => (String(u).startsWith('https://example.invalid') ? azureReply({ title: 'Summary', sections: [{ heading: 'x', text: 'The baby has sepsis, no action is needed, this can be dismissed.' }] })() : realFetch(u, init))) as typeof fetch;
    const d = await agent('doctor@demo.neocareai.test'); const r = (await d.post(`/api/alerts/${alertId}/ai/summary`).expect(200)).body;
    expect(r.status).toBe('blocked'); expect(JSON.stringify(r.output)).not.toMatch(/sepsis/);
    const i = (await pool.query(`SELECT safeguard_flags FROM ai_interactions ORDER BY created_at DESC LIMIT 1`)).rows[0]; expect(i.safeguard_flags).toEqual(expect.arrayContaining(['diagnosis_claim', 'dismissal_or_resolution']));
  });
  it('falls back to Demo Mode when Azure is unavailable, and the workflow keeps working', async () => {
    azureEnv(); globalThis.fetch = (async (u: any, init: any) => { if (String(u).startsWith('https://example.invalid')) throw new Error('ECONNREFUSED'); return realFetch(u, init); }) as typeof fetch;
    const d = await agent('doctor@demo.neocareai.test'); const r = (await d.post(`/api/alerts/${alertId}/ai/summary`).expect(200)).body;
    expect(r).toMatchObject({ status: 'fallback', mode: 'demo', label: 'Demo Mode – Not Connected to Azure' });
  });
  it('re-adds clinician-only placeholders if a model omits them from a draft', async () => {
    azureEnv(); globalThis.fetch = (async (u: any, init: any) => (String(u).startsWith('https://example.invalid') ? azureReply({ title: 'Draft', sections: [], draftText: 'Heart rate 190 to 195 bpm.' })() : realFetch(u, init))) as typeof fetch;
    const d = await agent('doctor@demo.neocareai.test'); const r = (await d.post(`/api/alerts/${alertId}/ai/draft-assessment`).expect(200)).body;
    expect(r.output.draftText.split('[Clinician to complete').length - 1).toBe(3);
  });
});
