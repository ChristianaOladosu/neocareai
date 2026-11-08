import { SCENARIOS, mulberry32, type Tick } from './scenarios/index.js';

export interface RunOptions {
  deviceId: string; scenario: string; seed?: number;
  /** live: real time with sleeps. fast: virtual timestamps, no sleeping (used by tests). */
  mode: 'live' | 'fast'; intervalSeconds?: number;
  sendReading: (msg: object) => Promise<unknown>;
  sendConnection: (status: 'connected' | 'disconnected') => Promise<unknown>;
  sleep?: (ms: number) => Promise<void>;
  onLog?: (line: string) => void;
}

/** Runs one labelled-synthetic scenario against a gateway. Device-side buffering during link-down is simulated here. */
export async function runScenario(o: RunOptions) {
  const sc = SCENARIOS[o.scenario.toUpperCase()];
  if (!sc) throw new Error(`Unknown scenario ${o.scenario}. Available: ${Object.keys(SCENARIOS).join(', ')}`);
  const step = (o.intervalSeconds ?? (o.mode === 'live' ? 5 : 12)) * 1000;
  const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const rnd = mulberry32(o.seed ?? 42);
  const startVirtual = Date.now() - sc.ticks * step;
  const log = o.onLog ?? (() => {});
  const buffered: object[] = []; let linkDown = false;
  log(`[SYNTHETIC] scenario ${sc.id}: ${sc.name} on ${o.deviceId}`);

  const build = (t: Tick, ts: number) => ({ deviceId: o.deviceId, ts: new Date(ts).toISOString(), synthetic: true, readings: t.readings, signal: t.signal ?? {} });

  for (let i = 0; i < sc.ticks; i++) {
    const ts = o.mode === 'live' ? Date.now() : startVirtual + i * step;
    const t = sc.tick(i, rnd);
    if (t.link === 'down' && !linkDown) { linkDown = true; log(`tick ${i}: link DOWN`); await o.sendConnection('disconnected'); }
    if (t.link === 'down') { buffered.push(build(t, ts)); }
    else {
      if (linkDown) {
        linkDown = false; log(`tick ${i}: link UP, flushing ${buffered.length} buffered readings`);
        await o.sendConnection('connected');
        for (const m of buffered.splice(0)) await o.sendReading(m);
      }
      await o.sendReading(build(t, ts));
    }
    if (o.mode === 'live') await sleep(step);
  }
  log(`scenario ${sc.id} complete`);
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
  const gw = args.gateway ?? process.env.GATEWAY_URL ?? 'http://localhost:4100';
  const device = args.device ?? 'SIM-MON-01';
  if (args.list) { for (const s of Object.values(SCENARIOS)) console.log(`${s.id}: ${s.name} - ${s.description}`); return; }
  const post = (path: string, body: object) => fetch(`${gw}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  await runScenario({
    deviceId: device, scenario: args.scenario ?? 'A', mode: args.fast ? 'fast' : 'live', intervalSeconds: args.interval ? Number(args.interval) : undefined,
    sendReading: (m) => post('/ingest/simulator', m), sendConnection: (status) => post(`/connection/${device}`, { status }), onLog: console.log,
  });
}
if (process.argv[1]?.endsWith('simulator.ts')) main().catch((e) => { console.error(e); process.exit(1); });
