import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../services/api/src/app.js';
import { seed } from '../../services/api/src/database/seed.js';
import { ensureDefaultRules } from '../../services/api/src/modules/alerts/alert-engine.js';
import { pool } from '../../services/api/src/database/db.js';
import { env } from '../../services/api/src/config/env.js';
import { createGatewayApp } from '../../services/device-gateway/src/gateway.js';
import { Forwarder } from '../../services/device-gateway/src/connection/forwarder.js';
import { simulatorAdapter } from '../../services/device-gateway/src/adapters/simulator.adapter.js';
import { runScenario } from '../../services/simulator/src/simulator.js';
import { monitoringOverview } from './helpers.js';

const servers: Array<{ close: () => void }> = [];
afterAll(async () => { servers.forEach((s) => s.close()); await pool.end(); });

let apiUrl = '', gwUrl = '', hospitalId = '';
const nbId = async (ident: string) => (await pool.query('SELECT id FROM newborns WHERE hospital_id=$1 AND newborn_identifier=$2', [hospitalId, ident])).rows[0].id as string;

beforeEach(async () => {
  servers.splice(0).forEach((s) => s.close());
  await seed(true); await ensureDefaultRules();
  hospitalId = (await pool.query(`SELECT id FROM hospitals WHERE name LIKE 'Demo General%'`)).rows[0].id;
  const api = createApp().listen(0); servers.push(api); apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const { app } = createGatewayApp({ apiUrl, gatewayKey: env.gatewayKey, hospitalId });
  const gw = app.listen(0); servers.push(gw); gwUrl = `http://127.0.0.1:${(gw.address() as AddressInfo).port}`;
});

const post = (url: string, body: object) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const run = (scenario: string, deviceId = 'SIM-MON-01') => runScenario({
  deviceId, scenario, mode: 'fast',
  sendReading: (m) => post(`${gwUrl}/ingest/simulator`, m), sendConnection: (status) => post(`${gwUrl}/connection/${deviceId}`, { status }),
});
const alertsFor = async (ident: string) => (await pool.query('SELECT title, priority, status FROM clinical_alerts WHERE newborn_id=$1', [await nbId(ident)])).rows;

describe('adapter and gateway behaviour', () => {
  it('normalises a simulator message and never invents missing measurements', () => {
    const obs = simulatorAdapter.parse({ deviceId: 'SIM-MON-01', ts: new Date().toISOString(), synthetic: true, readings: { hr: 140, spo2: 97 }, signal: { hr: 'ok', spo2: 'weak' } }, new Date());
    expect(obs.map((o) => o.measurementType)).toEqual(['heart_rate', 'spo2']);
    expect(obs[1]).toMatchObject({ deviceQuality: 'questionable', unit: '%', source: { adapter: 'simulator', synthetic: true } });
  });
  it('rejects malformed or non-synthetic simulator messages', () => {
    expect(() => simulatorAdapter.parse({ deviceId: 'x', ts: 'bad', synthetic: true, readings: {} }, new Date())).toThrow();
    expect(() => simulatorAdapter.parse({ deviceId: 'x', ts: new Date().toISOString(), synthetic: false, readings: {} }, new Date())).toThrow();
  });
  it('returns 400 for invalid messages over HTTP', async () => {
    const r = await fetch(`${gwUrl}/ingest/simulator`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nonsense: true }) });
    expect(r.status).toBe(400);
  });
  it('buffers during an API outage and delivers in order after recovery', async () => {
    let up = false; const delivered: string[] = [];
    const fakeFetch = (async (_u: any, init: any) => {
      if (!up) throw new Error('ECONNREFUSED');
      delivered.push(JSON.parse(init.body).observedAt);
      return new Response(JSON.stringify({ duplicate: false }), { status: 201 });
    }) as typeof fetch;
    const f = new Forwarder({ apiUrl: 'http://x', gatewayKey: 'k'.repeat(16), hospitalId: 'h', fetchImpl: fakeFetch });
    const mk = (n: number) => ({ deviceIdentifier: 'D', measurementType: 'heart_rate' as const, value: 140, unit: 'bpm', observedAt: new Date(1_700_000_000_000 + n * 1000).toISOString(), receivedAt: '', source: { adapter: 'simulator', synthetic: true } });
    for (let i = 0; i < 3; i++) expect((await f.send(mk(i))).status).toBe('buffered');
    expect(f.buffered).toBe(3);
    up = true; await f.send(mk(3));
    expect(f.buffered).toBe(0);
    expect(delivered).toEqual([0, 1, 2, 3].map((n) => new Date(1_700_000_000_000 + n * 1000).toISOString()));
  });
});

describe('end-to-end scenarios: simulator -> gateway -> API -> PostgreSQL -> rules', () => {
  it('A routine: stores observations with provenance and raises no alert', async () => {
    await run('A');
    const n = await pool.query(`SELECT count(*)::int AS c, count(*) FILTER (WHERE quality_status='good')::int AS good, min(source) AS src FROM observations`);
    expect(n.rows[0]).toMatchObject({ c: 80, good: 80, src: 'device:SIM-MON-01' });
    expect(await alertsFor('NB-0001')).toEqual([]);
    const o = (await monitoringOverview(apiUrl, hospitalId)).find((x: any) => x.newborn_identifier === 'NB-0001');
    expect(o.measurements.length).toBe(4);
    expect(o.dataCurrent).toBe(true);
  });
  it('B concerning trend: raises an explainable illustrative alert with evidence', async () => {
    await run('B');
    const a = (await pool.query(`SELECT * FROM clinical_alerts WHERE newborn_id=$1`, [await nbId('NB-0001')])).rows;
    expect(a.length).toBe(1);
    expect(a[0]).toMatchObject({ priority: 'high', status: 'awaiting_acknowledgement' });
    expect(a[0].explanation).toMatch(/Illustrative/);
    expect(a[0].evidence.triggering.length).toBe(6);
    expect(a[0].evidence.illustrative).toBe(true);
  });
  it('C poor signal: preserved as poor, no physiological alert, only a data-quality notice', async () => {
    await run('C');
    const q = await pool.query(`SELECT count(*) FILTER (WHERE quality_status IN ('poor','unavailable','questionable'))::int AS bad FROM observations`);
    expect(q.rows[0].bad).toBeGreaterThan(5);
    const al = await alertsFor('NB-0001');
    expect(al.length).toBeGreaterThan(0);
    expect(al.every((x) => x.priority === 'low' && x.title.startsWith('Measurements unreliable'))).toBe(true);
  });
  it('D missing observations: stopped measurement shows as stale while others stay current', async () => {
    await run('D');
    const o = (await monitoringOverview(apiUrl, hospitalId)).find((x: any) => x.newborn_identifier === 'NB-0001');
    const by = Object.fromEntries(o.measurements.map((m: any) => [m.measurement_type, m.isStale]));
    expect(by.spo2).toBe(true); expect(by.temperature).toBe(true);
    expect(by.heart_rate).toBe(false); expect(by.respiratory_rate).toBe(false);
  });
  it('E disconnection: recorded in audit, buffered readings synchronised after reconnection, nothing lost', async () => {
    await run('E');
    const audit = (await pool.query(`SELECT action FROM audit_logs WHERE action LIKE 'device.%' ORDER BY created_at`)).rows.map((r) => r.action);
    expect(audit).toEqual(['device.disconnected', 'device.connected']);
    expect((await pool.query('SELECT count(*)::int AS c FROM observations')).rows[0].c).toBe(72);
    expect((await pool.query(`SELECT connection_status FROM devices WHERE device_identifier='SIM-MON-01' AND hospital_id=$1`, [hospitalId])).rows[0].connection_status).toBe('connected');
  });
  it('F recovery: values normalise but the alert is NOT auto-resolved', async () => {
    await run('F');
    const al = await alertsFor('NB-0001');
    expect(al.length).toBe(1);
    expect(al[0].status).toBe('awaiting_acknowledgement');
    const last = (await pool.query(`SELECT value FROM observations WHERE measurement_type='heart_rate' ORDER BY observed_at DESC LIMIT 1`)).rows[0].value;
    expect(last).toBeLessThan(160);
  });
  it('device messages cannot be attributed to a newborn other than the assigned one', async () => {
    const r = await fetch(`${apiUrl}/api/gateway/observations`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gateway-key': env.gatewayKey },
      body: JSON.stringify({ hospitalId, deviceIdentifier: 'SIM-MON-01', newbornIdentifier: 'NB-0003', measurementType: 'heart_rate', value: 140, observedAt: new Date().toISOString() }) });
    expect(r.status).toBe(409);
  });
});
