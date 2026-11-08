import { pool } from '../../services/api/src/database/db.js';
import bcrypt from 'bcryptjs';
import { DEMO_PASSWORD } from '../../services/api/src/database/seed.js';

/** Logs in as the demo doctor over HTTP and returns the monitoring overview rows. */
export async function monitoringOverview(apiUrl: string, _hospitalId: string) {
  void pool; void bcrypt; void DEMO_PASSWORD;
  const login = await fetch(`${apiUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'doctor@demo.neocareai.test', password: DEMO_PASSWORD }) });
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  const r = await fetch(`${apiUrl}/api/monitoring/overview`, { headers: { cookie } });
  return (await r.json() as any).newborns;
}
