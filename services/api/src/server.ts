import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { migrate } from './database/migrate.js';
import { ensureDefaultRules } from './modules/alerts/alert-engine.js';
import { bus, type DomainEvent } from './events/bus.js';
import { loadUser, COOKIE } from './middleware/auth.js';

async function main() {
  await migrate();
  await ensureDefaultRules();
  const server = createServer(createApp());

  // WebSocket: hospital-scoped realtime events. Authenticated via the same session cookie.
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map<import('ws').WebSocket, string>();
  wss.on('connection', async (ws, req) => {
    try {
      const m = (req.headers.cookie ?? '').match(new RegExp(`${COOKIE}=([^;]+)`));
      if (!m) return ws.close(4401, 'unauthenticated');
      const sub = (jwt.verify(decodeURIComponent(m[1]), env.sessionSecret) as { sub: string }).sub;
      const user = await loadUser(sub);
      if (!user) return ws.close(4401, 'unauthenticated');
      clients.set(ws, user.hospitalId);
      ws.on('close', () => clients.delete(ws));
    } catch { ws.close(4401, 'unauthenticated'); }
  });
  bus.on('event', (e: DomainEvent) => {
    const msg = JSON.stringify({ type: e.type, ...e.payload });
    for (const [ws, hid] of clients) if (hid === e.hospitalId && ws.readyState === ws.OPEN) ws.send(msg);
  });

  server.listen(env.port, () => console.log(`NeocareAI API (synthetic-data prototype) on :${env.port}`));
}
main().catch((e) => { console.error(e); process.exit(1); });
