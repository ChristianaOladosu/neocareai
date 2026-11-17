import type { AuthUser } from '../../middleware/auth.js';
import { pool } from '../../database/db.js';

/**
 * Newborn-level access scope. Users holding `newborn:all` see every newborn in their hospital; everyone else (e.g. nurses)
 * sees only newborns they are currently assigned to. Backend-enforced on every clinical read and write.
 * `sql` is a boolean SQL fragment for use in WHERE clauses; it needs the user's id and `newborn:all` flag as the two params it appends.
 */
export const hasAll = (u: AuthUser) => u.permissions.has('newborn:all');
export function scopeSql(alias: string, params: unknown[], u: AuthUser): string {
  params.push(hasAll(u)); const a = params.length; params.push(u.id); const b = params.length;
  return `($${a}::boolean OR EXISTS (SELECT 1 FROM newborn_team nt WHERE nt.newborn_id=${alias} AND nt.user_id=$${b} AND nt.unassigned_at IS NULL))`;
}
export async function canAccessNewborn(u: AuthUser, newbornId: string): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM newborns n WHERE n.id=$1 AND n.hospital_id=$2 AND ($3::boolean OR EXISTS (SELECT 1 FROM newborn_team nt WHERE nt.newborn_id=n.id AND nt.user_id=$4 AND nt.unassigned_at IS NULL))`, [newbornId, u.hospitalId, hasAll(u), u.id]);
  return !!r.rowCount;
}
