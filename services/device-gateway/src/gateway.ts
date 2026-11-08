import express from 'express';
import { z } from 'zod';
import { adapters } from './adapters/index.js';
import { Forwarder, type ForwarderConfig } from './connection/forwarder.js';

export function createGatewayApp(cfg: ForwarderConfig) {
  const fwd = new Forwarder(cfg);
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, buffered: fwd.buffered, rejected: fwd.rejected.length }));

  // POST /ingest/:adapter  -> adapter -> normalisation -> validation -> backend ingestion API
  app.post('/ingest/:adapter', async (req, res) => {
    const adapter = adapters[req.params.adapter];
    if (!adapter) return res.status(404).json({ error: 'unknown_adapter' });
    let observations;
    try { observations = adapter.parse(req.body, new Date()); }
    catch (e) { return res.status(400).json({ error: 'invalid_message', message: e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join('.')}: ${i.message}`) : String(e) }); }
    const results = [];
    for (const o of observations) results.push((await fwd.send(o)).status);
    res.status(202).json({ accepted: observations.length, results });
  });

  app.post('/connection/:deviceId', async (req, res) => {
    const { status } = z.object({ status: z.enum(['connected', 'disconnected']) }).parse(req.body);
    const ok = await fwd.setConnection(req.params.deviceId, status);
    res.status(ok ? 200 : 502).json({ ok, buffered: fwd.buffered });
  });
  return { app, forwarder: fwd };
}

async function main() {
  const apiUrl = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  const gatewayKey = process.env.GATEWAY_API_KEY ?? '';
  if (gatewayKey.length < 16) throw new Error('GATEWAY_API_KEY (>=16 chars) is required');
  let hospitalId = process.env.GATEWAY_HOSPITAL_ID ?? '';
  if (!hospitalId) {
    const hs = (await (await fetch(`${apiUrl}/api/gateway/hospitals`, { headers: { 'x-gateway-key': gatewayKey } })).json()) as Array<{ id: string; name: string }>;
    const want = process.env.GATEWAY_HOSPITAL_NAME ?? 'Demo General Hospital (synthetic)';
    hospitalId = (hs.find((h) => h.name === want) ?? hs[0])?.id;
    if (!hospitalId) throw new Error('No hospital found; run the seed first');
  }
  const { app } = createGatewayApp({ apiUrl, gatewayKey, hospitalId });
  const port = Number(process.env.GATEWAY_PORT ?? 4100);
  app.listen(port, () => console.log(`Device gateway on :${port} -> ${apiUrl} (hospital ${hospitalId})`));
}
if (process.argv[1]?.endsWith('gateway.ts')) main().catch((e) => { console.error(e); process.exit(1); });
