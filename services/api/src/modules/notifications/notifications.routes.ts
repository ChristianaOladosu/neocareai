import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/db.js';
import { asyncHandler, HttpError } from '../../utils/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { TYPES } from './notify.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
const uuid = z.string().uuid();

notificationsRouter.get('/', asyncHandler(async (req, res) => {
  const q = z.object({ unread: z.enum(['true', 'false']).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
  const r = await pool.query(`SELECT id, type, priority, title, body, link, alert_id, newborn_id, created_at, read_at, acknowledged_at FROM notifications WHERE user_id=$1 AND ($2::boolean IS NOT TRUE OR read_at IS NULL) ORDER BY created_at DESC LIMIT $3`, [req.user!.id, q.unread === 'true', q.limit]);
  const c = await pool.query(`SELECT count(*) FILTER (WHERE read_at IS NULL)::int AS unread, count(*) FILTER (WHERE read_at IS NULL AND priority='high')::int AS unread_high FROM notifications WHERE user_id=$1`, [req.user!.id]);
  res.json({ items: r.rows, ...c.rows[0] });
}));
notificationsRouter.post('/read-all', asyncHandler(async (req, res) => { await pool.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.user!.id]); res.json({ ok: true }); }));
notificationsRouter.post('/:id/read', asyncHandler(async (req, res) => { const r = await pool.query('UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id', [uuid.parse(req.params.id), req.user!.id]); if (!r.rowCount) throw new HttpError(404, 'Notification not found', 'not_found'); res.json({ ok: true }); }));
notificationsRouter.post('/:id/acknowledge', asyncHandler(async (req, res) => { const r = await pool.query('UPDATE notifications SET read_at=COALESCE(read_at,now()), acknowledged_at=COALESCE(acknowledged_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id', [uuid.parse(req.params.id), req.user!.id]); if (!r.rowCount) throw new HttpError(404, 'Notification not found', 'not_found'); res.json({ ok: true }); }));

notificationsRouter.get('/preferences', asyncHandler(async (req, res) => {
  const r = await pool.query('SELECT type, in_app, email FROM notification_preferences WHERE user_id=$1', [req.user!.id]); const m = new Map(r.rows.map((x) => [x.type, x]));
  res.json(TYPES.map((t) => ({ type: t, in_app: m.get(t)?.in_app ?? true, email: m.get(t)?.email ?? false })));
}));
notificationsRouter.put('/preferences', asyncHandler(async (req, res) => {
  const b = z.array(z.object({ type: z.enum(TYPES as [string, ...string[]]), in_app: z.boolean(), email: z.boolean() })).max(20).parse(req.body);
  for (const p of b) await pool.query(`INSERT INTO notification_preferences(user_id,type,in_app,email) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,type) DO UPDATE SET in_app=$3, email=$4`, [req.user!.id, p.type, p.in_app, p.email]);
  res.json({ ok: true });
}));
