import { Router } from 'express';
import { z } from 'zod';
import { pool, tx } from '../../database/db.js';
import { asyncHandler, HttpError } from '../../utils/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { audit } from '../audit/audit.service.js';

export const devicesRouter = Router();
devicesRouter.use(requireAuth);
const uuid = z.string().uuid();

devicesRouter.get('/', requirePermission('device:read'), asyncHandler(async (req, res) => {
  const r = await pool.query(
    `SELECT d.id, d.device_identifier, d.manufacturer, d.model, d.device_type, d.is_simulated, d.connection_status, d.last_seen_at, n.id AS newborn_id, n.newborn_identifier,
       (SELECT quality_status FROM observations o WHERE o.device_id=d.id ORDER BY observed_at DESC LIMIT 1) AS last_quality
     FROM devices d LEFT JOIN device_assignments da ON da.device_id=d.id AND da.unassigned_at IS NULL LEFT JOIN newborns n ON n.id=da.newborn_id
     WHERE d.hospital_id=$1 ORDER BY d.device_identifier`, [req.user!.hospitalId]);
  res.json(r.rows);
}));

devicesRouter.post('/', requirePermission('device:manage'), asyncHandler(async (req, res) => {
  const b = z.object({ deviceIdentifier: z.string().min(1).max(60), manufacturer: z.string().max(80).optional(), model: z.string().max(80).optional(), isSimulated: z.boolean().default(false) }).parse(req.body);
  try {
    const r = await pool.query('INSERT INTO devices(hospital_id,device_identifier,manufacturer,model,is_simulated) VALUES ($1,$2,$3,$4,$5) RETURNING id', [req.user!.hospitalId, b.deviceIdentifier, b.manufacturer ?? null, b.model ?? null, b.isSimulated]);
    await audit({ hospitalId: req.user!.hospitalId, userId: req.user!.id, action: 'device.register', resourceType: 'device', resourceId: r.rows[0].id });
    res.status(201).json({ id: r.rows[0].id });
  } catch (e: any) { if (e.code === '23505') throw new HttpError(409, 'Device identifier already registered', 'duplicate'); throw e; }
}));

// Controlled association: reassignment closes the previous assignment and is recorded in the audit trail.
devicesRouter.post('/:id/assign', requirePermission('device:manage'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); const { newbornId } = z.object({ newbornId: uuid }).parse(req.body); const u = req.user!;
  await tx(async (c) => {
    const d = await c.query('SELECT 1 FROM devices WHERE id=$1 AND hospital_id=$2 FOR UPDATE', [id, u.hospitalId]);
    const n = await c.query('SELECT 1 FROM newborns WHERE id=$1 AND hospital_id=$2 FOR UPDATE', [newbornId, u.hospitalId]);
    if (!d.rowCount || !n.rowCount) throw new HttpError(404, 'Device or newborn not found', 'not_found');
    const closed = await c.query('UPDATE device_assignments SET unassigned_at=now() WHERE unassigned_at IS NULL AND (device_id=$1 OR newborn_id=$2) RETURNING device_id, newborn_id', [id, newbornId]);
    await c.query('INSERT INTO device_assignments(device_id,newborn_id,assigned_by) VALUES ($1,$2,$3)', [id, newbornId, u.id]);
    await audit({ hospitalId: u.hospitalId, userId: u.id, action: closed.rowCount ? 'device.reassign' : 'device.assign', resourceType: 'device', resourceId: id, metadata: { newbornId, replaced: closed.rows } }, c);
  });
  res.json({ ok: true });
}));

devicesRouter.post('/:id/unassign', requirePermission('device:manage'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); const u = req.user!;
  await tx(async (c) => {
    const d = await c.query('SELECT 1 FROM devices WHERE id=$1 AND hospital_id=$2', [id, u.hospitalId]);
    if (!d.rowCount) throw new HttpError(404, 'Device not found', 'not_found');
    await c.query('UPDATE device_assignments SET unassigned_at=now() WHERE device_id=$1 AND unassigned_at IS NULL', [id]);
    await audit({ hospitalId: u.hospitalId, userId: u.id, action: 'device.unassign', resourceType: 'device', resourceId: id }, c);
  });
  res.json({ ok: true });
}));
