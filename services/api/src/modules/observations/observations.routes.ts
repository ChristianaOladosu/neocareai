import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/db.js';
import { asyncHandler, HttpError } from '../../utils/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { history, ingest, latest, observationSchema, STALE_AFTER_SECONDS } from './observations.service.js';
import { publish } from '../../events/bus.js';
import { audit } from '../audit/audit.service.js';
import { timingSafeEqual } from 'node:crypto';

export const observationsRouter = Router();   // /api/newborns/:id/observations etc. (mounted at /api/newborns)
export const monitoringRouter = Router();     // /api/monitoring
export const gatewayRouter = Router();        // /api/gateway (device gateway, API-key protected)

const uuid = z.string().uuid();

observationsRouter.post('/:id/observations', requireAuth, requirePermission('observation:write'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const result = await ingest({ hospitalId: req.user!.hospitalId, newbornId: id, source: 'manual', actorUserId: req.user!.id }, observationSchema.parse(req.body));
  res.status(result.duplicate ? 200 : 201).json(result);
}));

observationsRouter.get('/:id/observations', requireAuth, requirePermission('observation:read'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const q = z.object({ type: z.enum(['heart_rate', 'respiratory_rate', 'spo2', 'temperature']).optional(), limit: z.coerce.number().int().min(1).max(1000).default(200), since: z.string().datetime({ offset: true }).optional() }).parse(req.query);
  const nb = await pool.query('SELECT 1 FROM newborns WHERE id=$1 AND hospital_id=$2', [id, req.user!.hospitalId]);
  if (!nb.rowCount) throw new HttpError(404, 'Newborn not found', 'not_found');
  res.json(await history(req.user!.hospitalId, id, q.type, q.limit, q.since));
}));

// Overview for the live monitoring workspace: one row per newborn with staleness and device state made explicit.
monitoringRouter.get('/overview', requireAuth, requirePermission('observation:read'), asyncHandler(async (req, res) => {
  const hid = req.user!.hospitalId;
  const [nbs, lat, open] = await Promise.all([
    pool.query(`SELECT n.id, n.newborn_identifier, n.monitoring_status, u.name AS unit_name, d.device_identifier, d.connection_status, d.last_seen_at, d.is_simulated
                FROM newborns n LEFT JOIN units u ON u.id=n.unit_id
                LEFT JOIN device_assignments da ON da.newborn_id=n.id AND da.unassigned_at IS NULL LEFT JOIN devices d ON d.id=da.device_id
                WHERE n.hospital_id=$1 AND n.monitoring_status <> 'discharged' ORDER BY n.newborn_identifier`, [hid]),
    latest(hid),
    pool.query(`SELECT newborn_id, count(*)::int AS n, count(*) FILTER (WHERE status='awaiting_acknowledgement')::int AS unack FROM clinical_alerts WHERE hospital_id=$1 AND status <> 'resolved' GROUP BY newborn_id`, [hid]),
  ]);
  res.json({
    staleAfterSeconds: STALE_AFTER_SECONDS,
    newborns: nbs.rows.map((n) => {
      const mine = lat.filter((l) => l.newborn_id === n.id);
      const a = open.rows.find((x) => x.newborn_id === n.id);
      const deviceLive = n.connection_status === 'connected';
      return { ...n, measurements: mine, openAlerts: a?.n ?? 0, unacknowledgedAlerts: a?.unack ?? 0,
        dataCurrent: deviceLive && mine.length > 0 && mine.some((m) => !m.isStale) };
    }),
  });
}));

// ---- Device gateway endpoints (machine-to-machine) ----
function gatewayAuth(req: any, _res: any, next: any) {
  const key = String(req.header('x-gateway-key') ?? '');
  const ok = env.gatewayKey.length >= 16 && key.length === env.gatewayKey.length && timingSafeEqual(Buffer.from(key), Buffer.from(env.gatewayKey));
  next(ok ? undefined : new HttpError(401, 'Invalid gateway key', 'unauthenticated'));
}
gatewayRouter.use(gatewayAuth);
gatewayRouter.get('/hospitals', asyncHandler(async (_req, res) => {
  res.json((await pool.query(`SELECT id, name FROM hospitals WHERE status='active' ORDER BY name`)).rows);
}));

const gwObs = observationSchema.extend({ hospitalId: uuid, deviceIdentifier: z.string().min(1).max(60), newbornIdentifier: z.string().min(1).max(40).optional() });
gatewayRouter.post('/observations', asyncHandler(async (req, res) => {
  const b = gwObs.parse(req.body);
  // The gateway never chooses the newborn: attribution comes from the device's active assignment.
  const a = await pool.query(
    `SELECT d.id AS device_id, n.id AS newborn_id, n.newborn_identifier FROM devices d JOIN device_assignments da ON da.device_id=d.id AND da.unassigned_at IS NULL
     JOIN newborns n ON n.id=da.newborn_id WHERE d.hospital_id=$1 AND d.device_identifier=$2`, [b.hospitalId, b.deviceIdentifier]);
  if (!a.rows[0]) throw new HttpError(409, 'Device has no active newborn assignment', 'association_mismatch');
  if (b.newbornIdentifier && b.newbornIdentifier !== a.rows[0].newborn_identifier)
    throw new HttpError(409, 'Message newborn does not match device assignment', 'association_mismatch');
  const result = await ingest({ hospitalId: b.hospitalId, newbornId: a.rows[0].newborn_id, deviceId: a.rows[0].device_id, source: `device:${b.deviceIdentifier}` }, b);
  res.status(result.duplicate ? 200 : 201).json(result);
}));

gatewayRouter.post('/devices/:identifier/connection', asyncHandler(async (req, res) => {
  const b = z.object({ hospitalId: uuid, status: z.enum(['connected', 'disconnected']) }).parse(req.body);
  const r = await pool.query(`UPDATE devices SET connection_status=$3, last_seen_at=CASE WHEN $3='connected' THEN now() ELSE last_seen_at END WHERE hospital_id=$1 AND device_identifier=$2 RETURNING id`, [b.hospitalId, String(req.params.identifier), b.status]);
  if (!r.rows[0]) throw new HttpError(404, 'Device not found', 'not_found');
  await audit({ hospitalId: b.hospitalId, action: `device.${b.status}`, resourceType: 'device', resourceId: r.rows[0].id });
  publish({ type: 'device.connection', hospitalId: b.hospitalId, payload: { deviceId: r.rows[0].id, status: b.status } });
  res.json({ ok: true });
}));
