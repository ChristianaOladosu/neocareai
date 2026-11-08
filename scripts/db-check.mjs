import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
if (existsSync('.env')) for (const l of readFileSync('.env','utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try { await client.connect(); const r = await client.query('select now() as now, current_database() as db'); console.log('DB OK:', r.rows[0]); }
catch (e) { console.error('DB FAILED:', e.message); process.exitCode = 1; }
finally { await client.end().catch(()=>{}); }
