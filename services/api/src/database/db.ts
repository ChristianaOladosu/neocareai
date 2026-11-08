import pg from 'pg';
import { env } from '../config/env.js';

pg.types.setTypeParser(1700, (v) => Number(v)); // numeric -> number

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });
export type Db = pg.Pool | pg.PoolClient;

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
