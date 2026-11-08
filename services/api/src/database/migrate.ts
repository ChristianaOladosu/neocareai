import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../config/env.js';
import { pool } from './db.js';

export async function migrate(log = true) {
  const dir = resolve(env.rootDir, 'database/migrations');
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(readFileSync(resolve(dir, f), 'utf8'));
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await c.query('COMMIT');
      if (log) console.log('applied', f);
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
