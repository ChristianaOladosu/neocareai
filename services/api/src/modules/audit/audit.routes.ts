import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/db.js';
import { asyncHandler } from '../../utils/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';

export const auditRouter = Router();
auditRouter.get('/', requireAuth, requirePermission('audit:read'), asyncHandler(async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(500).default(100).parse(req.query.limit);
  const r = await pool.query(
    `SELECT a.id, a.action, a.resource_type, a.resource_id, a.metadata, a.created_at, u.full_name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
     WHERE a.hospital_id=$1 ORDER BY a.created_at DESC LIMIT $2`, [req.user!.hospitalId, limit]);
  res.json(r.rows);
}));
