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
  const status = z.enum(['connected', 'disconnected', 'unassigned']).optional().parse(req.query.status);
  const r = await pool.query(
    `SELECT d.id, d.device_identifier, d.manufacturer, d.model, d.device_type, d.is_simulated, d.connection_status, d.last_seen_at, n.id AS newborn_id, n.newborn_identifier,
       (SELECT quality_status FROM observations o WHERE o.device_id=d.id ORDER BY observed_at DESC LIMIT 1) AS last_quality
     FROM devices d LEFT JOIN device_assignments da ON da.device_id=d.id AND da.unassigned_at IS NULL LEFT JOIN newborns n ON n.id=da.newborn_id
     WHERE d.hospital_id=$1 AND ($2::text IS NULL OR ($2='unassigned' AND da.id IS NULL) OR ($2<>'unassigned' AND d.connection_status=$2)) ORDER BY d.device_identifier`, [req.user!.hospitalId, status ?? null]);
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

devicesRouter.get('/:id/history', requirePermission('device:read'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); if (!(await pool.query('SELECT 1 FROM devices WHERE id=$1 AND hospital_id=$2', [id, req.user!.hospitalId])).rowCount) throw new HttpError(404, 'Device not found', 'not_found');
  const [assignments, maintenance, connection] = await Promise.all([
    pool.query(`SELECT da.assigned_at, da.unassigned_at, n.newborn_identifier, u.full_name AS assigned_by FROM device_assignments da JOIN newborns n ON n.id=da.newborn_id LEFT JOIN users u ON u.id=da.assigned_by WHERE da.device_id=$1 ORDER BY da.assigned_at DESC`, [id]),
    pool.query(`SELECT m.id, m.kind, m.notes, m.performed_at, m.next_due, u.full_name AS performed_by FROM device_maintenance m LEFT JOIN users u ON u.id=m.performed_by WHERE m.device_id=$1 ORDER BY m.performed_at DESC`, [id]),
    pool.query(`SELECT action, created_at FROM audit_logs WHERE resource_type='device' AND resource_id=$1 AND action IN ('device.connected','device.disconnected') ORDER BY created_at DESC LIMIT 30`, [id]),
  ]);
  res.json({ assignments: assignments.rows, maintenance: maintenance.rows, connection: connection.rows });
}));
// Maintenance records are append-only (they are part of the device's history).
devicesRouter.post('/:id/maintenance', requirePermission('device:manage'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); const b = z.object({ kind: z.enum(['inspection', 'calibration', 'repair', 'firmware', 'note']), notes: z.string().trim().min(3).max(2000), nextDue: z.string().date().optional() }).parse(req.body);
  if (!(await pool.query('SELECT 1 FROM devices WHERE id=$1 AND hospital_id=$2', [id, req.user!.hospitalId])).rowCount) throw new HttpError(404, 'Device not found', 'not_found');
  const r = await pool.query('INSERT INTO device_maintenance(device_id,performed_by,kind,notes,next_due) VALUES ($1,$2,$3,$4,$5) RETURNING id', [id, req.user!.id, b.kind, b.notes, b.nextDue ?? null]);
  await audit({ hospitalId: req.user!.hospitalId, userId: req.user!.id, action: 'device.maintenance', resourceType: 'device', resourceId: id, metadata: { kind: b.kind } }); res.status(201).json({ id: r.rows[0].id });
}));
