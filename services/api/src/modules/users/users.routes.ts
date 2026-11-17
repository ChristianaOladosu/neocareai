import { Router } from 'express';
import { z } from 'zod';
import { pool, tx } from '../../database/db.js';
import { asyncHandler, HttpError } from '../../utils/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { audit } from '../audit/audit.service.js';
import { DEFAULT_ROLES, PERMISSIONS, roleLabel } from '../../database/rbac.js';

export const usersRouter = Router();
const uuid = z.string().uuid();

usersRouter.get('/users', requireAuth, requirePermission('user:manage'), asyncHandler(async (req, res) => {
  const r = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.account_status, u.email_verified_at, u.last_login_at, u.created_at, COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
     FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.hospital_id=$1 GROUP BY u.id ORDER BY (u.account_status='pending_approval') DESC, u.full_name`, [req.user!.hospitalId]);
  res.json(r.rows);
}));
const roleName = z.enum(Object.keys(DEFAULT_ROLES) as [string, ...string[]]);
usersRouter.post('/users/:id/approve', requireAuth, requirePermission('user:manage'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); const { role } = z.object({ role: roleName }).parse(req.body);
  await tx(async (c) => {
    const u = await c.query(`UPDATE users SET account_status='active', updated_at=now() WHERE id=$1 AND hospital_id=$2 AND account_status='pending_approval' RETURNING id`, [id, req.user!.hospitalId]);
    if (!u.rows[0]) throw new HttpError(409, 'Only verified accounts awaiting approval can be approved.', 'invalid_state');
    await c.query('DELETE FROM user_roles WHERE user_id=$1', [id]); await c.query('INSERT INTO user_roles SELECT $1, id FROM roles WHERE name=$2', [id, role]);
    await audit({ hospitalId: req.user!.hospitalId, userId: req.user!.id, action: 'user.approve', resourceType: 'user', resourceId: id, metadata: { role } }, c);
  });
  res.json({ ok: true });
}));
usersRouter.post('/users/:id/status', requireAuth, requirePermission('user:manage'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); const { status } = z.object({ status: z.enum(['active', 'disabled']) }).parse(req.body);
  if (id === req.user!.id) throw new HttpError(409, 'You cannot change your own account status.', 'invalid_state');
  const r = await pool.query(`UPDATE users SET account_status=$3, updated_at=now() WHERE id=$1 AND hospital_id=$2 AND account_status IN ('active','disabled') RETURNING id`, [id, req.user!.hospitalId, status]);
  if (!r.rows[0]) throw new HttpError(404, 'User not found or not in a changeable state', 'not_found');
  await audit({ hospitalId: req.user!.hospitalId, userId: req.user!.id, action: `user.${status === 'active' ? 'enable' : 'disable'}`, resourceType: 'user', resourceId: id }); res.json({ ok: true });
}));
usersRouter.put('/users/:id/role', requireAuth, requirePermission('user:manage'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); const { role } = z.object({ role: roleName }).parse(req.body);
  if (id === req.user!.id) throw new HttpError(409, 'You cannot change your own role.', 'invalid_state');
  await tx(async (c) => { const u = await c.query('SELECT 1 FROM users WHERE id=$1 AND hospital_id=$2', [id, req.user!.hospitalId]); if (!u.rowCount) throw new HttpError(404, 'User not found', 'not_found');
    await c.query('DELETE FROM user_roles WHERE user_id=$1', [id]); await c.query('INSERT INTO user_roles SELECT $1, id FROM roles WHERE name=$2', [id, role]);
    await audit({ hospitalId: req.user!.hospitalId, userId: req.user!.id, action: 'user.role_change', resourceType: 'user', resourceId: id, metadata: { role } }, c); });
  res.json({ ok: true });
}));

usersRouter.get('/permissions', requireAuth, requirePermission('roles:manage'), (_req, res) => res.json(PERMISSIONS));
usersRouter.get('/roles', requireAuth, requirePermission('user:manage'), asyncHandler(async (_req, res) => {
  const r = await pool.query(`SELECT r.name, COALESCE(array_agg(p.name ORDER BY p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS permissions FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id GROUP BY r.name ORDER BY r.name`);
  res.json(r.rows.map((x) => ({ ...x, label: roleLabel(x.name) })));
}));
// Permissions are configurable at runtime and enforced by the backend on every request.
usersRouter.put('/roles/:name/permissions', requireAuth, requirePermission('roles:manage'), asyncHandler(async (req, res) => {
  const name = roleName.parse(req.params.name); const { permissions } = z.object({ permissions: z.array(z.enum(PERMISSIONS as [string, ...string[]])).max(60) }).parse(req.body);
  if (name === 'Administrator' && !(permissions.includes('roles:manage') && permissions.includes('user:manage'))) throw new HttpError(409, 'The Administrator role must keep user and role management so the system cannot be locked.', 'lockout_prevented');
  await tx(async (c) => {
    const role = (await c.query('SELECT id FROM roles WHERE name=$1', [name])).rows[0]; await c.query('DELETE FROM role_permissions WHERE role_id=$1', [role.id]);
    for (const p of new Set(permissions)) await c.query('INSERT INTO role_permissions SELECT $1, id FROM permissions WHERE name=$2', [role.id, p]);
    await audit({ hospitalId: req.user!.hospitalId, userId: req.user!.id, action: 'role.permissions_changed', resourceType: 'role', resourceId: name, metadata: { permissions } }, c);
  });
  res.json({ ok: true });
}));
