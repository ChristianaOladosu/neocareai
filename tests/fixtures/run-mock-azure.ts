// Runs the LOCAL MOCK Azure server on a fixed port for browser tests. It is NOT Azure.
import http from 'node:http';
import { startMockAzure, MOCK_KEY } from './mock-azure.js';

async function main() {
  const port = Number(process.env.MOCK_AZURE_PORT ?? 4500);
  const m = await startMockAzure(); // listens on an ephemeral port; proxied to the fixed one below
  http.createServer((req, res) => {
    const p = http.request(m.url + (req.url ?? ''), { method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 500, r.headers); r.pipe(res); });
    req.pipe(p); p.on('error', () => { res.writeHead(502); res.end(); });
  }).listen(port, '127.0.0.1', () => console.log(`mock azure on :${port}; key=${MOCK_KEY.slice(0, 8)}...`));
}
main();
