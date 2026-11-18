import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/db.js';
import { asyncHandler } from '../../utils/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { audit } from '../audit/audit.service.js';

/** Hospital-level operational settings. Clinical rule thresholds are NOT editable here: they need clinical review. */
export const settingsRouter = Router();
export const SETTING_DEFS = { reminder_minutes: { min: 1, max: 120, def: 5, label: 'Unacknowledged-alert reminder interval (minutes)' }, notification_retention_days: { min: 7, max: 365, def: 90, label: 'Keep notifications for (days)' }, report_history_retention_days: { min: 30, max: 3650, def: 365, label: 'Keep report history for (days)' } } as const;
export async function settingValue(hospitalId: string, key: keyof typeof SETTING_DEFS): Promise<number> {
  const r = await pool.query('SELECT value FROM system_settings WHERE hospital_id=$1 AND key=$2', [hospitalId, key]); return r.rows[0] ? Number(r.rows[0].value) : SETTING_DEFS[key].def;
}
settingsRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const out = []; for (const [k, d] of Object.entries(SETTING_DEFS)) out.push({ key: k, label: d.label, min: d.min, max: d.max, value: await settingValue(req.user!.hospitalId, k as keyof typeof SETTING_DEFS), default: d.def });
  res.json(out);
}));
settingsRouter.put('/', requireAuth, requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  const b = z.record(z.string(), z.number().int()).parse(req.body);
  for (const [k, v] of Object.entries(b)) { const d = SETTING_DEFS[k as keyof typeof SETTING_DEFS]; if (!d || v < d.min || v > d.max) { res.status(400).json({ error: 'validation_error', message: `Invalid value for ${k}` }); return; } }
  for (const [k, v] of Object.entries(b)) await pool.query(`INSERT INTO system_settings(hospital_id,key,value,updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT (hospital_id,key) DO UPDATE SET value=$3, updated_by=$4, updated_at=now()`, [req.user!.hospitalId, k, JSON.stringify(v), req.user!.id]);
  await audit({ hospitalId: req.user!.hospitalId, userId: req.user!.id, action: 'settings.update', resourceType: 'settings', metadata: b }); res.json({ ok: true });
}));
