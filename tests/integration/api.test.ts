import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../services/api/src/app.js';
import { seed, DEMO_PASSWORD } from '../../services/api/src/database/seed.js';
import { ensureDefaultRules } from '../../services/api/src/modules/alerts/alert-engine.js';
import { pool } from '../../services/api/src/database/db.js';
import { env } from '../../services/api/src/config/env.js';

const app = createApp();
const GW = { 'x-gateway-key': env.gatewayKey };
let hospitalA = '', nb1 = '', nb2 = '', hospitalBNb = '';
const agent = async (email: string) => { const a = request.agent(app); await a.post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200); return a; };
const ts = (minAgo: number) => new Date(Date.now() - minAgo * 60000).toISOString();
const gwPost = (body: object) => request(app).post('/api/gateway/observations').set(GW).send({ hospitalId: hospitalA, deviceIdentifier: 'SIM-MON-01', ...body });

beforeAll(async () => {
  await seed(true); await ensureDefaultRules();
  hospitalA = (await pool.query(`SELECT id FROM hospitals WHERE name LIKE 'Demo General%'`)).rows[0].id;
  nb1 = (await pool.query(`SELECT id FROM newborns WHERE hospital_id=$1 AND newborn_identifier='NB-0001'`, [hospitalA])).rows[0].id;
  nb2 = (await pool.query(`SELECT id FROM newborns WHERE hospital_id=$1 AND newborn_identifier='NB-0002'`, [hospitalA])).rows[0].id;
  hospitalBNb = (await pool.query(`SELECT n.id FROM newborns n JOIN hospitals h ON h.id=n.hospital_id WHERE h.name LIKE 'Demo Teaching%'`)).rows[0].id;
});
afterAll(async () => { await pool.end(); });

describe('security', () => {
  it('rejects unauthenticated requests', async () => {
    await request(app).get('/api/newborns').expect(401);
    await request(app).get('/api/alerts').expect(401);
    await request(app).get('/api/monitoring/overview').expect(401);
  });
  it('rejects invalid credentials', async () => {
    await request(app).post('/api/auth/login').send({ email: 'doctor@demo.neocareai.test', password: 'wrong-password' }).expect(401);
  });
  it('enforces permissions (administrator has no clinical access; nurse cannot resolve)', async () => {
    const admin = await agent('admin@demo.neocareai.test');
    await admin.get(`/api/newborns/${nb1}/observations`).expect(403);
    await admin.get('/api/alerts').expect(403);
    const nurse = await agent('nurse@demo.neocareai.test');
    await nurse.post('/api/alerts/00000000-0000-4000-8000-000000000000/resolve').send({ resolutionNote: 'x y z' }).expect(403);
  });
  it('isolates hospitals', async () => {
    const doctor = await agent('doctor@demo.neocareai.test');
    await doctor.get(`/api/newborns/${hospitalBNb}`).expect(404);
    await doctor.get(`/api/newborns/${hospitalBNb}/observations`).expect(404);
    const list = await doctor.get('/api/newborns').expect(200);
    expect(list.body.every((n: any) => n.id !== hospitalBNb)).toBe(true);
    const docB = await agent('doctor.b@demo.neocareai.test');
    expect((await docB.get('/api/newborns').expect(200)).body.length).toBe(1);
  });
  it('rejects bad gateway key and invalid payloads', async () => {
    await request(app).post('/api/gateway/observations').set({ 'x-gateway-key': 'nope' }).send({}).expect(401);
    await gwPost({ measurementType: 'heart_rate', value: 'abc', observedAt: ts(1) }).expect(400);
    await gwPost({ measurementType: 'blood_pressure', value: 1, observedAt: ts(1) }).expect(400);
  });
  it('blocks audit and response history mutation at the database level', async () => {
    await pool.query(`INSERT INTO audit_logs(action,resource_type) VALUES ('test','test')`);
    await expect(pool.query(`UPDATE audit_logs SET action='tampered'`)).rejects.toThrow(/append-only/);
    await expect(pool.query(`DELETE FROM audit_logs`)).rejects.toThrow(/append-only/);
  });
});

describe('ingestion and device association', () => {
  it('stores a routine observation with provenance and quality', async () => {
    const r = await gwPost({ measurementType: 'heart_rate', value: 140, observedAt: ts(4.6), deviceQuality: 'good' }).expect(201);
    expect(r.body.quality).toBe('good');
    const doctor = await agent('doctor@demo.neocareai.test');
    const h = await doctor.get(`/api/newborns/${nb1}/observations?type=heart_rate`).expect(200);
    expect(h.body[0]).toMatchObject({ source: 'device:SIM-MON-01', quality_status: 'good', device_identifier: 'SIM-MON-01' });
  });
  it('treats duplicate messages idempotently', async () => {
    const body = { measurementType: 'temperature', value: 36.8, observedAt: ts(3.4), deviceQuality: 'good' };
    await gwPost(body).expect(201);
    expect((await gwPost(body).expect(200)).body.duplicate).toBe(true);
  });
  it('refuses to attribute a message to the wrong newborn', async () => {
    const r = await gwPost({ measurementType: 'heart_rate', value: 140, observedAt: ts(3.3), newbornIdentifier: 'NB-0002' }).expect(409);
    expect(r.body.error).toBe('association_mismatch');
    const unknown = await request(app).post('/api/gateway/observations').set(GW).send({ hospitalId: hospitalA, deviceIdentifier: 'NOPE', measurementType: 'heart_rate', value: 140, observedAt: ts(1) }).expect(409);
    expect(unknown.body.error).toBe('association_mismatch');
  });
  it('marks delayed (e.g. buffered, post-reconnect) messages questionable rather than discarding them', async () => {
    const r = await gwPost({ measurementType: 'heart_rate', value: 150, observedAt: ts(12), deviceQuality: 'good' }).expect(201);
    expect(r.body.quality).toBe('questionable');
    expect(r.body.qualityReason).toMatch(/Delayed/);
  });
  it('rejects future timestamps', async () => {
    await gwPost({ measurementType: 'heart_rate', value: 140, observedAt: new Date(Date.now() + 3600_000).toISOString() }).expect(422);
  });
  it('poor signal is preserved, and is not evidence of stability or a physiological alert', async () => {
    for (let i = 0; i < 3; i++) await request(app).post('/api/gateway/observations').set(GW).send({ hospitalId: hospitalA, deviceIdentifier: 'SIM-MON-02', measurementType: 'spo2', value: 70, observedAt: ts(3 - i * 0.5), deviceQuality: 'poor' }).expect(201);
    const doctor = await agent('doctor@demo.neocareai.test');
    const alerts = (await doctor.get(`/api/alerts?newbornId=${nb2}`).expect(200)).body;
    expect(alerts.map((a: any) => a.title)).not.toContain('Low oxygen saturation on consecutive readings (illustrative)');
    expect(alerts.some((a: any) => a.title.startsWith('Measurements unreliable') && a.priority === 'low')).toBe(true);
  });
  it('shows disconnected devices as not current', async () => {
    await request(app).post('/api/gateway/devices/SIM-MON-01/connection').set(GW).send({ hospitalId: hospitalA, status: 'disconnected' }).expect(200);
    const doctor = await agent('doctor@demo.neocareai.test');
    const o = (await doctor.get('/api/monitoring/overview').expect(200)).body.newborns.find((n: any) => n.id === nb1);
    expect(o.connection_status).toBe('disconnected');
    expect(o.dataCurrent).toBe(false);
    await request(app).post('/api/gateway/devices/SIM-MON-01/connection').set(GW).send({ hospitalId: hospitalA, status: 'connected' }).expect(200);
  });
});

describe('alert generation and clinical response lifecycle', () => {
  let alertId = '';
  it('generates an explainable alert from an illustrative demo trend', async () => {
    for (let i = 0; i < 3; i++) {
      await gwPost({ measurementType: 'heart_rate', value: 190 + i, observedAt: ts(3 - i), deviceQuality: 'good' }).expect(201);
      await gwPost({ measurementType: 'respiratory_rate', value: 70 + i, observedAt: ts(3 - i), deviceQuality: 'good' }).expect(201);
    }
    const doctor = await agent('doctor@demo.neocareai.test');
    const list = (await doctor.get(`/api/alerts?newbornId=${nb1}`).expect(200)).body;
    const a = list.find((x: any) => x.title.includes('high heart rate with high respiratory rate'));
    expect(a).toBeTruthy();
    alertId = a.id;
    expect(a.status).toBe('awaiting_acknowledgement');
    expect(a.explanation).toMatch(/Illustrative/);
    expect(a.evidence.triggering.length).toBe(6);
    expect(a.evidence.ruleKey).toBe('demo-sustained-tachycardia-tachypnoea');
    expect(a.evidence.illustrative).toBe(true);
  });
  it('does not create duplicate open alerts for the same rule', async () => {
    await gwPost({ measurementType: 'heart_rate', value: 199, observedAt: ts(0.2), deviceQuality: 'good' }).expect(201);
    const doctor = await agent('doctor@demo.neocareai.test');
    const n = (await doctor.get(`/api/alerts?newbornId=${nb1}`).expect(200)).body.filter((x: any) => x.title.includes('high heart rate with high respiratory rate'));
    expect(n.length).toBe(1);
  });
  it('opening an alert does not change its status', async () => {
    const doctor = await agent('doctor@demo.neocareai.test');
    const a = (await doctor.get(`/api/alerts/${alertId}`).expect(200)).body;
    expect(a.status).toBe('awaiting_acknowledgement');
  });
  it('enforces lifecycle order and records every transition', async () => {
    const nurse = await agent('nurse@demo.neocareai.test');
    const doctor = await agent('doctor@demo.neocareai.test');
    await doctor.post(`/api/alerts/${alertId}/resolve`).send({ resolutionNote: 'trying to skip steps' }).expect(409);
    await nurse.post(`/api/alerts/${alertId}/assessment`).send({ assessmentText: 'nurse cannot assess' }).expect(403);
    await nurse.post(`/api/alerts/${alertId}/acknowledge`).expect(200);
    await nurse.post(`/api/alerts/${alertId}/acknowledge`).expect(409); // already acknowledged
    await doctor.post(`/api/alerts/${alertId}/resolve`).send({ resolutionNote: 'no assessment yet' }).expect(409);
    await doctor.post(`/api/alerts/${alertId}/assessment`).send({ assessmentText: 'Bedside review done (synthetic).', responseText: 'Repositioned sensor; repeat observations in 15 min.' }).expect(200);
    await doctor.post(`/api/alerts/${alertId}/resolve`).send({ resolutionNote: 'Clinician judged resolved (synthetic demo).' }).expect(200);
    const a = (await doctor.get(`/api/alerts/${alertId}`).expect(200)).body;
    expect(a.status).toBe('resolved');
    expect(a.events.map((e: any) => e.event_type)).toEqual(['generated', 'acknowledged', 'assessment_recorded', 'response_documented', 'resolved']);
    expect(a.events[1]).toMatchObject({ previous_status: 'awaiting_acknowledgement', new_status: 'acknowledged', user_name: 'Nurse Demo' });
    expect(a.assessments.length).toBe(1);
    const log = (await doctor.get('/api/response-log').expect(200)).body;
    expect(log.filter((e: any) => e.alert_id === alertId).length).toBe(5);
  });
  it('writes audit entries for the lifecycle', async () => {
    const admin = await agent('admin@demo.neocareai.test');
    const actions = (await admin.get('/api/audit?limit=200').expect(200)).body.map((x: any) => x.action);
    for (const a of ['alert.generated', 'alert.acknowledged', 'alert.assessment_recorded', 'alert.resolved', 'auth.login_failed']) expect(actions).toContain(a);
  });
  it('supports escalation path', async () => {
    for (let i = 0; i < 3; i++) await request(app).post('/api/gateway/observations').set(GW).send({ hospitalId: hospitalA, deviceIdentifier: 'SIM-MON-03', measurementType: 'temperature', value: 34.5, observedAt: ts(4 - i * 1.5), deviceQuality: 'good' }).expect(201);
    const doctor = await agent('doctor@demo.neocareai.test');
    const nb3 = (await pool.query(`SELECT id FROM newborns WHERE newborn_identifier='NB-0003' AND hospital_id=$1`, [hospitalA])).rows[0].id;
    const a = (await doctor.get(`/api/alerts?newbornId=${nb3}`).expect(200)).body[0];
    await doctor.post(`/api/alerts/${a.id}/acknowledge`).expect(200);
    await doctor.post(`/api/alerts/${a.id}/escalate`).send({ reason: 'Escalating to senior neonatologist (synthetic).' }).expect(200);
    expect((await doctor.get(`/api/alerts/${a.id}`)).body.status).toBe('escalated');
  });
  it('registers newborns (admin only) with duplicate protection scoped to hospital', async () => {
    const admin = await agent('admin@demo.neocareai.test');
    await admin.post('/api/newborns').send({ newbornIdentifier: 'NB-0100', dateOfBirth: '2026-11-01' }).expect(201);
    await admin.post('/api/newborns').send({ newbornIdentifier: 'NB-0100', dateOfBirth: '2026-11-01' }).expect(409);
    const nurse = await agent('nurse@demo.neocareai.test');
    await nurse.post('/api/newborns').send({ newbornIdentifier: 'NB-0101', dateOfBirth: '2026-11-01' }).expect(403);
  });
});
