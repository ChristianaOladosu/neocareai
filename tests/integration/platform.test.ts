import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../services/api/src/app.js';
import { seed, DEMO_PASSWORD, DEMO_ORG_CODE } from '../../services/api/src/database/seed.js';
import { pool } from '../../services/api/src/database/db.js';
import { env } from '../../services/api/src/config/env.js';
import { runMonitors } from '../../services/api/src/modules/alerts/monitors.js';

const app = createApp(); let hospitalA = ''; const ids: Record<string, string> = {};
const login = async (email: string, pw = DEMO_PASSWORD) => { const a = request.agent(app); await a.post('/api/auth/login').send({ email, password: pw }).expect(200); return a; };
const who = (n: string) => login(`${n}@demo.neocareai.test`);
const ts = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const gw = (body: object) => request(app).post('/api/gateway/observations').set({ 'x-gateway-key': env.gatewayKey }).send({ hospitalId: hospitalA, ...body });
const rows = async (sql: string, p: any[] = []) => (await pool.query(sql, p)).rows;
const feed = async (dev: string, type: string, vals: number[], startMin = 4, step = 0.3, q = 'good') => { for (let i = 0; i < vals.length; i++) await gw({ deviceIdentifier: dev, measurementType: type, value: vals[i], observedAt: ts(startMin - i * step), deviceQuality: q }).expect(201); };
afterEach(() => { delete process.env.ALLOW_REGISTRATION; });
afterAll(async () => { await pool.end(); });
beforeAll(async () => {
  await seed(true); hospitalA = (await rows(`SELECT id FROM hospitals WHERE name LIKE 'Demo General%'`))[0].id;
  for (const n of ['NB-0001', 'NB-0002', 'NB-0003']) ids[n] = (await rows(`SELECT id FROM newborns WHERE hospital_id=$1 AND newborn_identifier=$2`, [hospitalA, n]))[0].id;
});

describe('accounts: sign-up, verification, approval, password reset', () => {
  let link = ''; const email = 'new.nurse@demo.neocareai.test'; const pw = 'FreshPassw0rd#1';
  it('exposes registration info and refuses invalid organisation codes', async () => {
    expect((await request(app).get('/api/auth/registration-info')).body).toMatchObject({ enabled: true, requiresOrganisationCode: true });
    expect((await request(app).post('/api/auth/signup').send({ fullName: 'X Y', email, password: pw, organisationCode: 'WRONG-CODE' })).body.error).toBe('invalid_organisation_code');
    expect((await request(app).post('/api/auth/signup').send({ fullName: 'X Y', email, password: 'short', organisationCode: DEMO_ORG_CODE })).status).toBe(400);
  });
  it('can be switched off', async () => { process.env.ALLOW_REGISTRATION = 'false'; expect((await request(app).post('/api/auth/signup').send({ fullName: 'X Y', email, password: pw, organisationCode: DEMO_ORG_CODE })).status).toBe(403); });
  it('creates an account that cannot sign in until verified AND approved, then works', async () => {
    const r = await request(app).post('/api/auth/signup').send({ fullName: 'New Nurse', email, password: pw, organisationCode: DEMO_ORG_CODE }).expect(202); link = r.body.devLink; expect(link).toMatch(/verify-email\?token=/); expect(r.body.devNote).toMatch(/no email service/i);
    expect((await request(app).post('/api/auth/login').send({ email, password: pw })).body.error).toBe('account_pending_verification');
    expect((await request(app).post('/api/auth/login').send({ email, password: 'wrong-password-1' })).body.error).toBe('invalid_credentials');   // wrong password reveals nothing
    expect((await rows(`SELECT count(*)::int c FROM email_outbox WHERE to_email=$1 AND kind='verify_email'`, [email]))[0].c).toBe(1);
    const token = link.split('token=')[1]; expect((await request(app).post('/api/auth/verify-email').send({ token })).body).toMatchObject({ ok: true, status: 'pending_approval' });
    expect((await request(app).post('/api/auth/verify-email').send({ token })).body.error).toBe('invalid_token');          // single use
    expect((await request(app).post('/api/auth/login').send({ email, password: pw })).body.error).toBe('account_pending_approval');
    const admin = await who('admin'); const u = (await admin.get('/api/users')).body.find((x: any) => x.email === email); expect(u.account_status).toBe('pending_approval'); expect(u.roles).toEqual([]);
    expect((await (await who('doctor')).post(`/api/users/${u.id}/approve`).send({ role: 'Nurse' })).status).toBe(403);
    await admin.post(`/api/users/${u.id}/approve`).send({ role: 'Nurse' }).expect(200);
    const n = await login(email, pw); expect((await n.get('/api/auth/me')).body.roles).toEqual(['Nurse']); expect((await n.get('/api/newborns')).body).toEqual([]);   // approved, but assigned to nobody yet
  });
  it('does not reveal whether an email is already registered', async () => {
    const r = await request(app).post('/api/auth/signup').send({ fullName: 'Dup', email: 'doctor@demo.neocareai.test', password: pw, organisationCode: DEMO_ORG_CODE }); expect(r.status).toBe(202); expect(r.body).not.toHaveProperty('devLink');
  });
  it('supports forgot and reset password, single use, and never reveals unknown emails', async () => {
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.org' }); expect(unknown.status).toBe(200); expect(unknown.body).not.toHaveProperty('devLink');
    const r = await request(app).post('/api/auth/forgot-password').send({ email }).expect(200); const token = r.body.devLink.split('token=')[1];
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'weak' })).status).toBe(400);
    await request(app).post('/api/auth/reset-password').send({ token, password: 'BrandNewPassw0rd#2' }).expect(200);
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'AnotherPassw0rd#3' })).body.error).toBe('invalid_token');
    await request(app).post('/api/auth/login').send({ email, password: pw }).expect(401); await login(email, 'BrandNewPassw0rd#2');
    expect((await rows(`SELECT count(*)::int c FROM audit_logs WHERE action IN ('account.signup','account.email_verified','user.approve','account.password_reset_requested','account.password_reset')`))[0].c).toBeGreaterThanOrEqual(5);
  });
  it('a disabled account cannot sign in, and an administrator cannot disable themselves', async () => {
    const admin = await who('admin'); const me = (await admin.get('/api/auth/me')).body.id; expect((await admin.post(`/api/users/${me}/status`).send({ status: 'disabled' })).status).toBe(409);
    const u = (await admin.get('/api/users')).body.find((x: any) => x.email === email); await admin.post(`/api/users/${u.id}/status`).send({ status: 'disabled' }).expect(200);
    await request(app).post('/api/auth/login').send({ email, password: 'BrandNewPassw0rd#2' }).expect(401);
  });
});

describe('roles and configurable permissions (enforced by the backend)', () => {
  it('provides the five roles with the intended access', async () => {
    const p = async (n: string) => (await (await who(n)).get('/api/auth/me')).body.permissions as string[];
    const [doc, mo, nurse, sup, adm] = await Promise.all(['doctor', 'mo', 'nurse', 'supervisor', 'admin'].map(p));
    expect(doc).toEqual(expect.arrayContaining(['alert:resolve', 'alert:close', 'newborn:all'])); expect(mo).toContain('alert:escalate'); expect(mo).not.toContain('alert:resolve');
    expect(nurse).toContain('alert:respond'); expect(nurse).not.toContain('newborn:all'); expect(nurse).not.toContain('alert:assess');
    expect(sup).toEqual(expect.arrayContaining(['audit:read', 'reports:operational', 'reports:export'])); expect(sup).not.toContain('alert:acknowledge');
    expect(adm).not.toContain('observation:read'); expect(adm).toContain('roles:manage');
  });
  it('lets an administrator change a role’s permissions with immediate effect, with a lock-out guard', async () => {
    const admin = await who('admin'); const doc = await who('doctor');
    expect((await doc.put('/api/roles/Nurse/permissions').send({ permissions: ['newborn:read'] })).status).toBe(403);
    expect((await admin.put('/api/roles/Administrator/permissions').send({ permissions: ['newborn:read'] })).body.error).toBe('lockout_prevented');
    expect((await admin.put('/api/roles/Nurse/permissions').send({ permissions: ['not:a:permission'] })).status).toBe(400);
    const before = (await admin.get('/api/roles')).body.find((r: any) => r.name === 'Supervisor' || r.name === 'Clinical Supervisor').permissions as string[];
    await admin.put('/api/roles/Clinical Supervisor/permissions'.replace(' ', '%20')).send({ permissions: before.filter((x) => x !== 'reports:export') }).expect(200);
    expect((await (await who('supervisor')).post('/api/reports').send({ kind: 'alert_distribution', format: 'csv', from: ts(60), to: ts(0) })).status).toBe(403);
    await admin.put('/api/roles/Clinical Supervisor/permissions'.replace(' ', '%20')).send({ permissions: before }).expect(200);
    expect((await rows(`SELECT count(*)::int c FROM audit_logs WHERE action='role.permissions_changed'`))[0].c).toBe(2);
  });
});

describe('newborn registration, lifecycle, notes, team, scope', () => {
  let nb = ''; 
  it('registers with full details and an auto-generated identifier; clinical detail needs the clinical permission', async () => {
    const admin = await who('admin'); expect((await admin.post('/api/newborns').send({ dateOfBirth: '2026-11-10', clinicalSummary: 'x'.repeat(5) })).status).toBe(403);
    const r = await admin.post('/api/newborns').send({ dateOfBirth: '2026-11-10', birthTime: '2026-11-10T04:30:00Z', gestationalAgeWeeks: 33, birthWeightGrams: 1900, admissionSource: 'inborn' }).expect(201); nb = r.body.id;
    const d = (await admin.get(`/api/newborns/${nb}`)).body; expect(d.newborn_identifier).toMatch(/^NB-\d{4}-\d{4}$/); expect(d).toMatchObject({ birth_weight_grams: 1900, admission_source: 'inborn' }); expect(d).not.toHaveProperty('clinical_summary');
    expect((await rows(`SELECT count(*)::int c FROM monitoring_sessions WHERE newborn_id=$1 AND ended_at IS NULL`, [nb]))[0].c).toBe(1);
    expect((await admin.post('/api/newborns').send({ dateOfBirth: '2026-11-10', birthWeightGrams: 50 })).status).toBe(400);
    const doc = await who('doctor'); await doc.patch(`/api/newborns/${nb}`).send({ clinicalSummary: 'Synthetic summary' }).expect(403);   // doctors lack newborn:write
  });
  it('limits a nurse to assigned newborns across every clinical surface', async () => {
    const nurse = await who('nurse'); expect((await nurse.get(`/api/newborns/${nb}`)).status).toBe(404); expect((await nurse.get('/api/newborns')).body.map((x: any) => x.newborn_identifier).sort()).toEqual(['NB-0001', 'NB-0002', 'NB-0003']);
    expect((await nurse.get(`/api/newborns/${nb}/observations`)).status).toBe(404); expect((await nurse.get(`/api/intelligence/newborns/${nb}`)).status).toBe(404); expect((await nurse.post(`/api/newborns/${nb}/notes`).send({ text: 'note attempt' })).status).toBe(404);
    expect((await nurse.get('/api/search?q=NB-')).body.newborns.length).toBe(3);
    const admin = await who('admin'); const nurseId = (await nurse.get('/api/auth/me')).body.id;
    await admin.put(`/api/newborns/${nb}/team`).send({ userIds: [nurseId] }).expect(200); expect((await nurse.get(`/api/newborns/${nb}`)).status).toBe(200);
    await admin.put(`/api/newborns/${nb}/team`).send({ userIds: [] }).expect(200); expect((await nurse.get(`/api/newborns/${nb}`)).status).toBe(404);
    expect((await (await who('doctor')).get(`/api/newborns/${nb}`)).status).toBe(200);   // newborn:all
  });
  it('stores append-only clinical notes visible only to clinical roles', async () => {
    const doc = await who('doctor'); await doc.post(`/api/newborns/${nb}/notes`).send({ text: 'Synthetic clinical note.', type: 'clinical_note' }).expect(201);
    expect((await doc.get(`/api/newborns/${nb}/notes`)).body[0]).toMatchObject({ note_text: 'Synthetic clinical note.', author: 'Dr. Demo Doctor' }); expect((await (await who('admin')).get(`/api/newborns/${nb}/notes`)).status).toBe(403);
    await expect(pool.query(`UPDATE clinical_notes SET note_text='changed'`)).rejects.toThrow(/append-only/); await expect(pool.query(`DELETE FROM clinical_notes`)).rejects.toThrow(/append-only/);
    expect((await rows(`SELECT count(*)::int c FROM audit_logs WHERE action IN ('note.create','newborn.view')`))[0].c).toBeGreaterThan(0);
  });
  it('manages lifecycle with validated transitions and stops accepting measurements when not monitored', async () => {
    const doc = await who('doctor'); const life = (a: string, extra = {}) => doc.post(`/api/newborns/${ids['NB-0003']}/lifecycle`).send({ action: a, ...extra });
    expect((await life('resume')).status).toBe(409); expect((await life('transfer')).status).toBe(400);
    expect((await life('transfer', { transferredTo: 'Other Unit (synthetic)' })).body).toMatchObject({ from: 'monitoring', to: 'transferred' });
    expect((await gw({ deviceIdentifier: 'SIM-MON-03', measurementType: 'heart_rate', value: 140, observedAt: ts(1), deviceQuality: 'good' })).status).toBe(409);
    expect((await rows(`SELECT count(*)::int c FROM monitoring_sessions WHERE newborn_id=$1 AND ended_at IS NULL`, [ids['NB-0003']]))[0].c).toBe(0);
    await life('reactivate', { reason: 'Returned' }).then((r) => expect(r.body.to).toBe('monitoring')); await life('discharge', { reason: 'Home (synthetic)' });
    const d = (await doc.get(`/api/newborns/${ids['NB-0003']}`)).body; expect(d).toMatchObject({ monitoring_status: 'discharged', discharge_reason: 'Home (synthetic)' }); expect(d.discharged_at).toBeTruthy();
    await life('reactivate'); expect((await (await who('nurse')).post(`/api/newborns/${ids['NB-0003']}/lifecycle`).send({ action: 'pause' })).status).toBe(403);
    expect((await doc.get(`/api/newborns/${ids['NB-0003']}/sessions`)).body.length).toBeGreaterThanOrEqual(3);
  });
  it('supports search, filter, sort and pagination', async () => {
    const doc = await who('doctor'); const r = (await doc.get('/api/newborns?page=1&pageSize=2&sort=identifier&dir=desc')).body; expect(r).toMatchObject({ page: 1, pageSize: 2 }); expect(r.items.length).toBe(2); expect(r.total).toBeGreaterThanOrEqual(4);
    expect(r.items[0].newborn_identifier > r.items[1].newborn_identifier).toBe(true); expect((await doc.get('/api/newborns?search=0002')).body.length).toBe(1); expect((await doc.get('/api/newborns?admission=recent&page=1')).body.total).toBeGreaterThanOrEqual(1);
    expect((await doc.get('/api/newborns?health=bogus')).status).toBe(400);
  });
});

describe('alert categories, closing, responses, duplicates', () => {
  it('raises measurement, trend and signal-quality alerts with the right categories, and a trend rule that ignores noise', async () => {
    await feed('SIM-MON-01', 'heart_rate', [190, 192, 195]); await feed('SIM-MON-01', 'respiratory_rate', [70, 72, 75]);
    await feed('SIM-MON-01', 'spo2', [98, 96, 93, 91, 88, 85, 83, 80], 5, 0.4);
    const al = await rows(`SELECT category, priority, title FROM clinical_alerts WHERE newborn_id=$1 ORDER BY created_at`, [ids['NB-0001']]);
    expect(al.map((a) => a.category)).toEqual(expect.arrayContaining(['measurement', 'trend'])); expect(al.some((a) => a.title.includes('Rapid fall'))).toBe(true);
    await feed('SIM-MON-02', 'spo2', [97.5, 96.4, 97.8, 96.1, 97.2, 96.8, 97.0, 96.5], 5, 0.4);   // routine jitter must NOT raise a trend alert
    expect((await rows(`SELECT count(*)::int c FROM clinical_alerts WHERE newborn_id=$1`, [ids['NB-0002']]))[0].c).toBe(0);
    for (let i = 0; i < 3; i++) await gw({ deviceIdentifier: 'SIM-MON-02', measurementType: 'temperature', value: 70, observedAt: ts(2 - i * 0.3), deviceQuality: 'poor' }).expect(201);
    expect((await rows(`SELECT category, priority FROM clinical_alerts WHERE newborn_id=$1`, [ids['NB-0002']]))[0]).toEqual({ category: 'signal_quality', priority: 'low' });
  });
  it('counts duplicate occurrences instead of raising duplicate alerts', async () => {
    const before = (await rows(`SELECT id, occurrence_count FROM clinical_alerts WHERE newborn_id=$1 AND title LIKE 'Sustained%'`, [ids['NB-0001']]))[0];
    await gw({ deviceIdentifier: 'SIM-MON-01', measurementType: 'heart_rate', value: 199, observedAt: ts(0.1), deviceQuality: 'good' }).expect(201);
    const after = await rows(`SELECT id, occurrence_count FROM clinical_alerts WHERE newborn_id=$1 AND title LIKE 'Sustained%'`, [ids['NB-0001']]); expect(after.length).toBe(1); expect(after[0].occurrence_count).toBe(before.occurrence_count + 1);
  });
  it('lets a nurse document a response without assessing; only a doctor resolves; closing is explicit and only after resolution', async () => {
    const nurse = await who('nurse'); const doc = await who('doctor'); const a = (await doc.get(`/api/alerts?newbornId=${ids['NB-0001']}&category=measurement`)).body[0];
    expect((await nurse.post(`/api/alerts/${a.id}/response`).send({ text: 'Checked sensor position.' })).body.error).toBe('invalid_transition');
    await nurse.post(`/api/alerts/${a.id}/acknowledge`).expect(200); await nurse.post(`/api/alerts/${a.id}/response`).send({ text: 'Checked sensor position (synthetic).' }).expect(200);
    expect((await nurse.post(`/api/alerts/${a.id}/assessment`).send({ assessmentText: 'nurse assessing' })).status).toBe(403); expect((await nurse.post(`/api/alerts/${a.id}/close`)).status).toBe(403);
    expect((await doc.post(`/api/alerts/${a.id}/close`)).body.error).toBe('invalid_transition');
    await doc.post(`/api/alerts/${a.id}/assessment`).send({ assessmentText: 'Reviewed (synthetic).' }).expect(200); await doc.post(`/api/alerts/${a.id}/resolve`).send({ resolutionNote: 'Resolved (synthetic).' }).expect(200);
    await doc.post(`/api/alerts/${a.id}/close`).expect(200); const d = (await doc.get(`/api/alerts/${a.id}`)).body; expect(d.status).toBe('closed'); expect(d.events.map((e: any) => e.event_type)).toEqual(['generated', 'acknowledged', 'response_documented', 'assessment_recorded', 'resolved', 'closed']);
    expect((await doc.post(`/api/alerts/${a.id}/acknowledge`)).body.error).toBe('invalid_transition');
  });
  it('filters by priority and category and hides alerts of unassigned newborns from nurses', async () => {
    const doc = await who('doctor'); expect((await doc.get('/api/alerts?priority=low')).body.every((x: any) => x.priority === 'low')).toBe(true); expect((await doc.get('/api/alerts?category=bogus')).status).toBe(400);
    const nurse = await who('nurse'); const a = (await doc.get(`/api/alerts?newbornId=${ids['NB-0001']}`)).body[0];
    await pool.query('UPDATE newborn_team SET unassigned_at=now() WHERE newborn_id=$1', [ids['NB-0001']]);
    expect((await nurse.get(`/api/alerts/${a.id}`)).status).toBe(404); expect((await nurse.post(`/api/alerts/${a.id}/acknowledge`)).status).toBe(404); expect((await nurse.post(`/api/alerts/${a.id}/ai/summary`).send({})).status).toBe(404);
    expect((await nurse.get('/api/alerts')).body.every((x: any) => x.newborn_identifier !== 'NB-0001')).toBe(true);
    await pool.query('INSERT INTO newborn_team(newborn_id,user_id) SELECT $1, id FROM users WHERE email=$2', [ids['NB-0001'], 'nurse@demo.neocareai.test']);
  });
});

describe('monitors and notifications', () => {
  it('raises a device-disconnection alert (a device concern, not a physiological one) once, never auto-resolving', async () => {
    await request(app).post('/api/gateway/devices/SIM-MON-02/connection').set({ 'x-gateway-key': env.gatewayKey }).send({ hospitalId: hospitalA, status: 'disconnected' }).expect(200);
    expect((await runMonitors()).deviceAlerts).toBeGreaterThanOrEqual(1); expect((await runMonitors()).deviceAlerts).toBe(0);   // a device that never connected (NB-0003's) also raises its own, once
    expect((await rows(`SELECT count(*)::int c FROM clinical_alerts WHERE newborn_id=$1 AND category='device_disconnection'`, [ids['NB-0002']]))[0].c).toBe(1);
    const a = (await rows(`SELECT category, priority, explanation, status FROM clinical_alerts WHERE newborn_id=$1 AND category='device_disconnection'`, [ids['NB-0002']]))[0]; expect(a).toMatchObject({ priority: 'medium', status: 'awaiting_acknowledgement' }); expect(a.explanation).toMatch(/device concern/i);
    await request(app).post('/api/gateway/devices/SIM-MON-02/connection').set({ 'x-gateway-key': env.gatewayKey }).send({ hospitalId: hospitalA, status: 'connected' }).expect(200); await runMonitors();
    expect((await rows(`SELECT status FROM clinical_alerts WHERE newborn_id=$1 AND category='device_disconnection'`, [ids['NB-0002']]))[0].status).toBe('awaiting_acknowledgement');
  });
  it('raises a missing-data alert when only some measurements keep arriving', async () => {
    await pool.query(`UPDATE observations SET observed_at = observed_at - interval '10 minutes' WHERE newborn_id=$1 AND measurement_type IN ('spo2','temperature')`, [ids['NB-0003']]);
    await gw({ deviceIdentifier: 'SIM-MON-03', measurementType: 'spo2', value: 97, observedAt: ts(4.5), deviceQuality: 'good' }).expect(201);
    await pool.query(`UPDATE observations SET observed_at = now() - interval '12 minutes' WHERE newborn_id=$1 AND measurement_type='spo2'`, [ids['NB-0003']]);
    await feed('SIM-MON-03', 'heart_rate', [140, 141], 1.0, 0.3);   // heart rate is current, SpO2 is not
    expect((await runMonitors()).missingDataAlerts).toBe(1); expect((await rows(`SELECT explanation FROM clinical_alerts WHERE newborn_id=$1 AND category='missing_data'`, [ids['NB-0003']]))[0].explanation).toMatch(/not an abnormal reading/);
  });
  it('routes notifications by role and assignment, with unread counts, read and acknowledge', async () => {
    const doc = await who('doctor'); const n = (await doc.get('/api/notifications')).body; expect(n.unread).toBeGreaterThan(0); expect(n.items.some((x: any) => x.type === 'high_priority_alert' && x.priority === 'high')).toBe(true);
    expect(n.items.every((x: any) => x.link)).toBe(true); expect((await (await who('admin')).get('/api/notifications')).body.items.every((x: any) => x.type === 'system')).toBe(true);
    await doc.post(`/api/notifications/${n.items[0].id}/read`).expect(200); await doc.post(`/api/notifications/${n.items[1].id}/acknowledge`).expect(200); expect((await doc.get('/api/notifications')).body.unread).toBe(n.unread - 2);
    await doc.post('/api/notifications/read-all').expect(200); expect((await doc.get('/api/notifications?unread=true')).body.items.length).toBe(0); expect((await doc.post(`/api/notifications/00000000-0000-4000-8000-000000000000/read`)).status).toBe(404);
    expect((await (await who('doctor.b')).get('/api/notifications')).body.items.length).toBe(0);   // never crosses hospitals
  });
  it('sends unacknowledged reminders once per interval, honours preferences, and email preference only fills the dev outbox', async () => {
    const doc = await who('doctor'); const a = (await doc.get(`/api/alerts?status=awaiting_acknowledgement`)).body[0]; await pool.query(`UPDATE clinical_alerts SET created_at = now() - interval '12 minutes' WHERE id=$1`, [a.id]);
    await doc.put('/api/notifications/preferences').send([{ type: 'unacknowledged_reminder', in_app: true, email: true }]).expect(200);
    expect((await runMonitors()).reminders).toBeGreaterThan(0); expect((await runMonitors()).reminders).toBe(0);
    expect((await doc.get('/api/notifications')).body.items.some((x: any) => x.type === 'unacknowledged_reminder')).toBe(true); expect((await rows(`SELECT count(*)::int c FROM email_outbox WHERE kind='notification' AND to_email='doctor@demo.neocareai.test'`))[0].c).toBeGreaterThan(0);
    await doc.put('/api/notifications/preferences').send([{ type: 'new_alert', in_app: false, email: false }]).expect(200); expect((await doc.get('/api/notifications/preferences')).body.find((p: any) => p.type === 'new_alert').in_app).toBe(false);
    expect((await doc.put('/api/notifications/preferences').send([{ type: 'bogus', in_app: true, email: false }])).status).toBe(400);
  });
});

describe('dashboard, search, activity, intelligence', () => {
  it('summarises states, alerts and devices, separating clinical, data and device concerns; withholds clinical data from administrators', async () => {
    const s = (await (await who('doctor')).get('/api/dashboard/summary')).body; expect(s.registered).toBeGreaterThanOrEqual(4); expect(s.clinical.states.concerning).toBeGreaterThanOrEqual(1); expect(Object.keys(s.clinical.signalDistribution)).toEqual(['reliable', 'reduced_quality', 'poor_quality', 'missing_data', 'device_disconnected', 'insufficient_information']);
    expect(s.clinical.alerts.high).toBeGreaterThanOrEqual(1); expect(s.devices.total).toBe(3); const a = (await (await who('admin')).get('/api/dashboard/summary')).body; expect(a.clinical).toBeNull(); expect(a.devices.total).toBe(3);
    const list = (await (await who('doctor')).get('/api/newborns?health=concerning')).body; expect(list.map((x: any) => x.newborn_identifier)).toContain('NB-0001'); expect(list.every((x: any) => x.state === 'concerning')).toBe(true);
    const mon = (await (await who('doctor')).get('/api/monitoring/overview')).body.newborns.find((x: any) => x.newborn_identifier === 'NB-0002'); expect(mon).toHaveProperty('signal.category'); expect(mon.state).not.toBe('concerning');
  });
  it('a missing or disconnected signal is never presented as clinical concern', async () => {
    await pool.query(`UPDATE devices SET connection_status='disconnected' WHERE device_identifier='SIM-MON-03'`); const doc = await who('doctor');
    const n3 = (await doc.get('/api/monitoring/overview')).body.newborns.find((x: any) => x.newborn_identifier === 'NB-0003'); expect(n3.signal.category).toBe('device_disconnected'); expect(n3.state).toBe('disconnected'); expect(n3.signal.explanation).toMatch(/not current/);
    await pool.query(`UPDATE devices SET connection_status='connected' WHERE device_identifier='SIM-MON-03'`);
  });
  it('provides availability, activity feed and scoped search', async () => {
    const doc = await who('doctor'); expect((await doc.get('/api/dashboard/availability?minutes=60')).body.length).toBeGreaterThan(0);
    const act = (await doc.get('/api/activity?limit=50')).body; expect(act.map((x: any) => x.type)).toEqual(expect.arrayContaining(['newborn_registered', 'monitoring_started', 'measurement_received', 'generated', 'acknowledged', 'resolved', 'closed']));
    expect(act.every((x: any, i: number) => i === 0 || new Date(act[i - 1].at) >= new Date(x.at))).toBe(true); expect((await doc.get('/api/search?q=Rapid')).body.alerts.length).toBeGreaterThan(0); expect((await (await who('admin')).get('/api/search?q=Rapid')).body.alerts).toEqual([]);
  });
  it('explains trend analysis and rule evaluation without scores or predictions', async () => {
    const doc = await who('doctor'); const d = (await doc.get(`/api/intelligence/newborns/${ids['NB-0001']}?minutes=60`)).body;
    expect(d.trends.spo2).toMatchObject({ classification: 'falling' }); expect(d.trends.spo2.netChange).toBeLessThan(0); expect(d.disclaimer).toMatch(/not diagnoses, predictions or risk scores/); expect(JSON.stringify({ ...d, disclaimer: '' })).not.toMatch(/risk score|probability|likelihood/i);
    const rapid = d.evaluation.find((e: any) => e.ruleKey === 'demo-rapid-spo2-fall'); expect(rapid).toMatchObject({ status: 'met', category: 'trend', illustrative: true }); expect(rapid.conditions[0].observed).toMatch(/Fitted change/);
    expect(d.assessmentHistory.length).toBeGreaterThan(0); expect(d.missingInformation.join(' ')).toMatch(/illustrative/);
    const o = (await doc.get('/api/intelligence/overview')).body; expect(o.illustrative).toBe(true); expect(o.items.find((x: any) => x.identifier === 'NB-0001').rulesMet).toBeGreaterThan(0);
    expect((await (await who('admin')).get('/api/intelligence/overview')).status).toBe(403);
  });
});

describe('reports, devices, settings, audit', () => {
  const body = (kind: string, format = 'json', extra = {}) => ({ kind, format, from: ts(24 * 60), to: ts(-1), ...extra });
  it('offers report types by permission and enforces scope and date rules', async () => {
    const kinds = async (n: string) => (await (await who(n)).get('/api/reports/kinds')).body.map((k: any) => k.group); expect(new Set(await kinds('doctor'))).toEqual(new Set(['clinical'])); expect(new Set(await kinds('supervisor'))).toEqual(new Set(['clinical', 'operational'])); expect(new Set(await kinds('admin'))).toEqual(new Set(['operational'])); expect(await kinds('nurse')).toEqual([]);
    const doc = await who('doctor'); expect((await doc.post('/api/reports').send(body('measurements'))).body.error).toBe('validation_error'); expect((await doc.post('/api/reports').send(body('alert_distribution'))).status).toBe(403);
    expect((await (await who('admin')).post('/api/reports').send(body('alert_history'))).status).toBe(403); expect((await doc.post('/api/reports').send({ ...body('alert_history'), from: ts(0), to: ts(60) })).status).toBe(400);
    expect((await (await who('nurse')).post('/api/reports').send(body('alert_history'))).status).toBe(403);
  });
  it('builds every report type from real data', async () => {
    const sup = await who('supervisor'); for (const k of ['alert_history', 'clinical_responses', 'monitoring_summary', 'device_connectivity', 'signal_quality', 'alert_distribution', 'acknowledgement_statistics', 'response_documentation']) { const r = await sup.post('/api/reports').send(body(k)); expect(r.status, k).toBe(200); expect(r.body.note).toMatch(/SYNTHETIC/); expect(r.body.sections.length).toBeGreaterThan(0); }
    for (const k of ['newborn_monitoring', 'measurements', 'trends', 'observation_history']) { const r = await sup.post('/api/reports').send(body(k, 'json', { newbornId: ids['NB-0001'] })); expect(r.status, k).toBe(200); }
    const m = (await sup.post('/api/reports').send(body('measurements', 'json', { newbornId: ids['NB-0001'] }))).body.sections[0].rows; expect(m.length).toBeGreaterThan(10);
    expect((await sup.post('/api/reports').send(body('acknowledgement_statistics'))).body.sections[0].rows.some((r: any[]) => r[2] > 0)).toBe(true);
  });
  it('exports real CSV and PDF files, audited, only for roles that may export, with CSV-injection protection', async () => {
    const sup = await who('supervisor'); const csv = await sup.post('/api/reports').send(body('alert_history', 'csv')).expect(200); expect(csv.headers['content-type']).toMatch(/text\/csv/); expect(csv.headers['content-disposition']).toMatch(/attachment; filename=.*\.csv/); expect(csv.text.charCodeAt(0)).toBe(0xfeff); expect(csv.text).toMatch(/SYNTHETIC DEMONSTRATION DATA/); expect(csv.text).toMatch(/"Generated","Newborn","Category"/);
    const pdf = await sup.post('/api/reports').send(body('device_connectivity', 'pdf')).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200); expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-'); expect((pdf.body as Buffer).length).toBeGreaterThan(1000);
    expect((await (await who('mo')).post('/api/reports').send(body('alert_history', 'csv'))).status).toBe(403); expect((await (await who('mo')).post('/api/reports').send(body('alert_history'))).status).toBe(200);   // MO may view but not export
    const { toCsv } = await import('../../services/api/src/modules/reports/reports.service.js'); expect(toCsv({ kind: 'x', title: 't', generatedAt: '', params: {}, summary: [], note: '', sections: [{ title: 's', columns: ['c'], rows: [['=cmd|calc'], ['+1'], ['@x'], ['-2']] }] })).toMatch(/"'=cmd\|calc"[\s\S]*"'\+1"[\s\S]*"'@x"[\s\S]*"'-2"/);
    const h = (await sup.get('/api/reports/history')).body; expect(h.length).toBe(2); expect(h[0]).toMatchObject({ format: 'pdf', generated_by: 'Supervisor Demo' }); expect((await (await who('doctor')).get('/api/reports/history')).body).toEqual([]);   // own history only unless audit access
    expect((await rows(`SELECT count(*)::int c FROM audit_logs WHERE action='report.export'`))[0].c).toBe(2);
  });
  it('records device history and append-only maintenance, with status filtering', async () => {
    const admin = await who('admin'); const dev = (await admin.get('/api/devices')).body.find((d: any) => d.device_identifier === 'SIM-MON-01');
    await admin.post(`/api/devices/${dev.id}/maintenance`).send({ kind: 'calibration', notes: 'Synthetic calibration check', nextDue: '2027-01-15' }).expect(201); expect((await (await who('nurse')).post(`/api/devices/${dev.id}/maintenance`).send({ kind: 'note', notes: 'nurse note' })).status).toBe(403);
    const h = (await admin.get(`/api/devices/${dev.id}/history`)).body; expect(h.maintenance[0]).toMatchObject({ kind: 'calibration', performed_by: 'Admin Demo' }); expect(h.assignments[0].newborn_identifier).toBe('NB-0001'); expect(Array.isArray(h.connection)).toBe(true);
    await expect(pool.query(`UPDATE device_maintenance SET notes='x'`)).rejects.toThrow(/append-only/);
    await request(app).post('/api/gateway/devices/SIM-MON-02/connection').set({ 'x-gateway-key': env.gatewayKey }).send({ hospitalId: hospitalA, status: 'disconnected' });
    expect((await admin.get('/api/devices?status=disconnected')).body.map((d: any) => d.device_identifier)).toEqual(['SIM-MON-02']); expect((await admin.get('/api/devices?status=bogus')).status).toBe(400);
    await request(app).post('/api/gateway/devices/SIM-MON-02/connection').set({ 'x-gateway-key': env.gatewayKey }).send({ hospitalId: hospitalA, status: 'connected' });
  });
  it('validates and audits operational settings, and keeps clinical rules out of them', async () => {
    const admin = await who('admin'); const s = (await admin.get('/api/settings')).body; expect(s.map((x: any) => x.key)).toEqual(['reminder_minutes', 'notification_retention_days', 'report_history_retention_days']);
    expect((await admin.put('/api/settings').send({ reminder_minutes: 0 })).status).toBe(400); expect((await admin.put('/api/settings').send({ alert_threshold: 5 })).status).toBe(400); expect((await (await who('doctor')).put('/api/settings').send({ reminder_minutes: 10 })).status).toBe(403);
    await admin.put('/api/settings').send({ reminder_minutes: 15 }).expect(200); expect((await admin.get('/api/settings')).body[0].value).toBe(15); await admin.put('/api/settings').send({ reminder_minutes: 5 });
  });
  it('filters the audit log and records access events', async () => {
    const sup = await who('supervisor'); const a = (await sup.get('/api/audit?action=report.&limit=50')).body; expect(a.length).toBe(2); expect(a.every((x: any) => x.action.startsWith('report.'))).toBe(true);
    expect((await sup.get(`/api/audit?user=${encodeURIComponent('Supervisor')}`)).body.length).toBeGreaterThan(0); expect((await (await who('nurse')).get('/api/audit')).status).toBe(403);
    expect((await sup.get('/api/audit?limit=500')).body.map((x: any) => x.action)).toEqual(expect.arrayContaining(['newborn.view', 'auth.login', 'alert.closed', 'user.approve']));
  });
});
