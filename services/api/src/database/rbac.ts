import { pool } from './db.js';

/** Default roles and permissions. Administrators can change role permissions at runtime; these are only the starting points. */
export const PERMISSIONS = ['newborn:read', 'newborn:write', 'newborn:all', 'newborn:clinical', 'notes:write', 'observation:read', 'observation:write', 'monitoring:manage',
  'alert:read', 'alert:acknowledge', 'alert:respond', 'alert:assess', 'alert:escalate', 'alert:resolve', 'alert:close', 'response:read', 'device:read', 'device:manage',
  'user:manage', 'roles:manage', 'unit:manage', 'audit:read', 'reports:clinical', 'reports:operational', 'reports:export', 'settings:manage', 'ai:summarise', 'ai:draft', 'ai:manage'];

const CLIN = ['newborn:read', 'newborn:all', 'newborn:clinical', 'notes:write', 'observation:read', 'observation:write', 'alert:read', 'alert:acknowledge', 'alert:respond', 'response:read', 'device:read'];
export const DEFAULT_ROLES: Record<string, { label: string; perms: string[] }> = {
  // Role name 'Doctor' is kept for compatibility; it is displayed as Neonatologist / Paediatrician.
  Doctor: { label: 'Neonatologist / Paediatrician', perms: [...CLIN, 'monitoring:manage', 'alert:assess', 'alert:escalate', 'alert:resolve', 'alert:close', 'reports:clinical', 'reports:export', 'ai:summarise', 'ai:draft'] },
  'Medical Officer': { label: 'Medical officer', perms: [...CLIN, 'monitoring:manage', 'alert:assess', 'alert:escalate', 'reports:clinical', 'ai:summarise', 'ai:draft'] },
  // Nurses deliberately do NOT get newborn:all: they see only newborns they are assigned to.
  Nurse: { label: 'Nurse', perms: ['newborn:read', 'newborn:clinical', 'notes:write', 'observation:read', 'observation:write', 'alert:read', 'alert:acknowledge', 'alert:respond', 'response:read', 'device:read', 'ai:summarise'] },
  'Clinical Supervisor': { label: 'Clinical supervisor', perms: ['newborn:read', 'newborn:all', 'newborn:clinical', 'observation:read', 'alert:read', 'response:read', 'device:read', 'audit:read', 'reports:clinical', 'reports:operational', 'reports:export'] },
  // Administrators manage the system but get no clinical data access by default.
  Administrator: { label: 'Administrator', perms: ['newborn:read', 'newborn:write', 'newborn:all', 'device:read', 'device:manage', 'user:manage', 'roles:manage', 'unit:manage', 'audit:read', 'reports:operational', 'settings:manage', 'ai:manage'] },
};

/** Idempotent: adds missing permissions and roles. Existing roles keep whatever an administrator configured. */
export async function ensureRbac() {
  for (const p of PERMISSIONS) await pool.query('INSERT INTO permissions(name) VALUES ($1) ON CONFLICT DO NOTHING', [p]);
  for (const [name, def] of Object.entries(DEFAULT_ROLES)) {
    const r = await pool.query('INSERT INTO roles(name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [name]);
    if (r.rows[0]) for (const p of def.perms) await pool.query('INSERT INTO role_permissions SELECT $1, id FROM permissions WHERE name=$2 ON CONFLICT DO NOTHING', [r.rows[0].id, p]);
  }
}
export const roleLabel = (name: string) => DEFAULT_ROLES[name]?.label ?? name;
