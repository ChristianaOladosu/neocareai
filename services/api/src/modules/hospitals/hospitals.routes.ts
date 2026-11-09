import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../../database/db.js';
import { asyncHandler, HttpError } from '../../utils/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { audit } from '../audit/audit.service.js';

export const hospitalRouter = Router();
hospitalRouter.use(requireAuth);

hospitalRouter.get('/hospital', asyncHandler(async (req, res) => {
  const r = await pool.query('SELECT id, name, location, status FROM hospitals WHERE id=$1', [req.user!.hospitalId]);
  res.json(r.rows[0]);
}));

hospitalRouter.get('/units', asyncHandler(async (req, res) => {
  const r = await pool.query(
    `SELECT u.id, u.name, u.unit_type, u.status, (SELECT count(*)::int FROM newborns n WHERE n.unit_id=u.id AND n.monitoring_status <> 'discharged') AS newborn_count
     FROM units u WHERE u.hospital_id=$1 ORDER BY u.name`, [req.user!.hospitalId]);
  res.json(r.rows);
}));

hospitalRouter.get('/users', requirePermission('user:manage'), asyncHandler(async (req, res) => {
  const r = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.account_status, u.created_at, COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
     FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.hospital_id=$1 GROUP BY u.id ORDER BY u.full_name`, [req.user!.hospitalId]);
  res.json(r.rows);
}));

hospitalRouter.get('/roles', requirePermission('user:manage'), asyncHandler(async (_req, res) => {
  const r = await pool.query(`SELECT r.name, COALESCE(array_agg(p.name ORDER BY p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS permissions
    FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id GROUP BY r.name ORDER BY r.name`);
  res.json(r.rows);
}));

// Rules are displayed read-only: clinical rules must be reviewed and approved by qualified neonatal clinicians before any change.
hospitalRouter.get('/alert-rules', asyncHandler(async (req, res) => {
  if (!req.user!.permissions.has('alert:read') && !req.user!.permissions.has('user:manage')) throw new HttpError(403, 'Insufficient permissions', 'forbidden');
  const r = await pool.query('SELECT id, rule_key, name, description, rule_version, configuration, enabled FROM alert_rules ORDER BY name');
  res.json(r.rows);
}));

hospitalRouter.post('/auth/change-password', asyncHandler(async (req, res) => {
  const b = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(128) }).parse(req.body);
  const row = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user!.id])).rows[0];
  if (!(await bcrypt.compare(b.currentPassword, row.password_hash))) throw new HttpError(400, 'Current password is incorrect', 'invalid_credentials');
  await pool.query('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [req.user!.id, await bcrypt.hash(b.newPassword, 10)]);
  await audit({ hospitalId: req.user!.hospitalId, userId: req.user!.id, action: 'auth.password_changed', resourceType: 'user', resourceId: req.user!.id });
  res.json({ ok: true });
}));
