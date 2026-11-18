import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/db.js';
import { asyncHandler } from '../../utils/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';

export const auditRouter = Router();
auditRouter.get('/', requireAuth, requirePermission('audit:read'), asyncHandler(async (req, res) => {
  const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), action: z.string().max(60).optional(), user: z.string().max(80).optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() }).parse(req.query);
  const r = await pool.query(
    `SELECT a.id, a.action, a.resource_type, a.resource_id, a.metadata, a.created_at, u.full_name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
     WHERE a.hospital_id=$1 AND ($2::text IS NULL OR a.action ILIKE $2||'%') AND ($3::text IS NULL OR u.full_name ILIKE '%'||$3||'%') AND ($4::timestamptz IS NULL OR a.created_at >= $4) AND ($5::timestamptz IS NULL OR a.created_at <= $5)
     ORDER BY a.created_at DESC LIMIT $6`, [req.user!.hospitalId, q.action ?? null, q.user ?? null, q.from ?? null, q.to ?? null, q.limit]);
  res.json(r.rows);
}));
