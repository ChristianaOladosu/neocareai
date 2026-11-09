import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../../database/db.js';
import { asyncHandler } from '../../utils/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { aiStatus, runAssistance } from './ai.service.js';

export const aiRouter = Router();
aiRouter.use(requireAuth);
const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, skip: () => env.nodeEnv === 'test', keyGenerator: (req) => req.user?.id ?? 'anon', validate: false });
const uuid = z.string().uuid();

aiRouter.get('/ai/status', (_req, res) => res.json(aiStatus()));

aiRouter.post('/alerts/:id/ai/summary', requirePermission('ai:summarise'), limiter, asyncHandler(async (req, res) => {
  res.json(await runAssistance(req.user!, uuid.parse(req.params.id), 'summary'));
}));
aiRouter.post('/alerts/:id/ai/draft-assessment', requirePermission('ai:draft'), limiter, asyncHandler(async (req, res) => {
  res.json(await runAssistance(req.user!, uuid.parse(req.params.id), 'draft_assessment'));
}));

// Oversight view of AI use (administrators and others holding audit:read).
aiRouter.get('/ai/interactions', requirePermission('audit:read'), asyncHandler(async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limit);
  const r = await pool.query(
    `SELECT i.id, i.kind, i.provider, i.mode, i.status, i.tool_calls, i.safeguard_flags, i.created_at, i.alert_id, u.full_name AS user_name, n.newborn_identifier
     FROM ai_interactions i JOIN users u ON u.id=i.user_id LEFT JOIN clinical_alerts a ON a.id=i.alert_id LEFT JOIN newborns n ON n.id=a.newborn_id
     WHERE i.hospital_id=$1 ORDER BY i.created_at DESC LIMIT $2`, [req.user!.hospitalId, limit]);
  res.json(r.rows);
}));
