import { z } from 'zod';
import { tx, pool } from '../../database/db.js';
import { HttpError } from '../../utils/errors.js';
import { assessQuality, UNITS, type Quality } from '../../../../intelligence/src/index.js';
import { evaluateNewborn } from '../alerts/alert-engine.js';
import { publish } from '../../events/bus.js';
import { audit } from '../audit/audit.service.js';

export const STALE_AFTER_SECONDS = Number(process.env.STALE_AFTER_SECONDS ?? 120);

export const observationSchema = z.object({
  measurementType: z.enum(['heart_rate', 'respiratory_rate', 'spo2', 'temperature']),
  value: z.number().finite(),
  unit: z.string().max(20).optional(),
  observedAt: z.string().datetime({ offset: true }),
  deviceQuality: z.enum(['good', 'questionable', 'poor', 'unavailable']).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ObservationInput = z.infer<typeof observationSchema>;

export interface IngestContext { hospitalId: string; newbornId: string; deviceId?: string; source: string; actorUserId?: string; }

export async function ingest(ctx: IngestContext, o: ObservationInput) {
  const observedAt = new Date(o.observedAt);
  const receivedAt = new Date();
  // Reject timestamps more than 24h in the past or beyond clock-skew in the future (invalid timestamps never stored silently).
  if (observedAt.getTime() > receivedAt.getTime() + 5 * 60_000) throw new HttpError(422, 'observedAt is in the future', 'invalid_timestamp');
  if (observedAt.getTime() < receivedAt.getTime() - 24 * 3600_000) throw new HttpError(422, 'observedAt is more than 24h old', 'invalid_timestamp');

  return tx(async (c) => {
    const nb = await c.query('SELECT id, monitoring_status FROM newborns WHERE id=$1 AND hospital_id=$2 FOR SHARE', [ctx.newbornId, ctx.hospitalId]);
    if (!nb.rows[0]) throw new HttpError(404, 'Newborn not found', 'not_found');
    if (nb.rows[0].monitoring_status === 'discharged') throw new HttpError(409, 'Newborn is discharged', 'not_monitored');
    if (ctx.deviceId) {
      const as = await c.query('SELECT 1 FROM device_assignments WHERE device_id=$1 AND newborn_id=$2 AND unassigned_at IS NULL', [ctx.deviceId, ctx.newbornId]);
      if (!as.rowCount) throw new HttpError(409, 'Device is not currently assigned to this newborn', 'association_mismatch');
      // A message from a device is itself evidence it is connected; stored connection state must not discard
      // valid (e.g. buffered, post-reconnect) data. Lateness is handled by the delayed-message quality check.
    }
    const q = assessQuality({ measurementType: o.measurementType, value: o.value, observedAt, receivedAt, deviceQuality: o.deviceQuality as Quality | undefined });
    const ins = await c.query(
      `INSERT INTO observations(newborn_id,device_id,measurement_type,value,unit,observed_at,received_at,source,quality_status,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (newborn_id,measurement_type,observed_at,source) DO NOTHING RETURNING id`,
      [ctx.newbornId, ctx.deviceId ?? null, o.measurementType, o.value, o.unit ?? UNITS[o.measurementType], observedAt, receivedAt, ctx.source, q.status, JSON.stringify(o.metadata ?? {})]);
    if (!ins.rows[0]) return { duplicate: true as const };
    const obsId = ins.rows[0].id as string;
    await c.query('INSERT INTO signal_quality_assessments(observation_id,quality_status,assessment_reason) VALUES ($1,$2,$3)', [obsId, q.status, q.reason]);
    if (ctx.deviceId) await c.query(`UPDATE devices SET last_seen_at=now(), connection_status='connected' WHERE id=$1`, [ctx.deviceId]);
    if (ctx.actorUserId) await audit({ hospitalId: ctx.hospitalId, userId: ctx.actorUserId, action: 'observation.record', resourceType: 'observation', resourceId: obsId }, c);
    const alertIds = await evaluateNewborn(c, ctx.hospitalId, ctx.newbornId);
    publish({ type: 'observation.stored', hospitalId: ctx.hospitalId, payload: { newbornId: ctx.newbornId, observationId: obsId, measurementType: o.measurementType, quality: q.status } });
    return { duplicate: false as const, id: obsId, quality: q.status, qualityReason: q.reason, alertIds };
  });
}

export async function history(hospitalId: string, newbornId: string, type: string | undefined, limit: number, since?: string) {
  const r = await pool.query(
    `SELECT o.id, o.measurement_type, o.value, o.unit, o.observed_at, o.received_at, o.source, o.quality_status, d.device_identifier, s.assessment_reason AS quality_reason
     FROM observations o JOIN newborns n ON n.id=o.newborn_id LEFT JOIN devices d ON d.id=o.device_id
     LEFT JOIN signal_quality_assessments s ON s.observation_id=o.id
     WHERE o.newborn_id=$1 AND n.hospital_id=$2 AND ($3::text IS NULL OR o.measurement_type=$3) AND ($5::timestamptz IS NULL OR o.observed_at >= $5)
     ORDER BY o.observed_at DESC LIMIT $4`, [newbornId, hospitalId, type ?? null, limit, since ?? null]);
  return r.rows;
}

/** Latest reading per measurement type, with explicit staleness. Stale values are never presented as current. */
export async function latest(hospitalId: string, newbornId?: string) {
  const r = await pool.query(
    `SELECT DISTINCT ON (o.newborn_id, o.measurement_type) o.newborn_id, o.measurement_type, o.value, o.unit, o.observed_at, o.quality_status
     FROM observations o JOIN newborns n ON n.id=o.newborn_id WHERE n.hospital_id=$1 AND ($2::uuid IS NULL OR o.newborn_id=$2)
     ORDER BY o.newborn_id, o.measurement_type, o.observed_at DESC`, [hospitalId, newbornId ?? null]);
  const now = Date.now();
  return r.rows.map((x) => ({ ...x, isStale: now - new Date(x.observed_at).getTime() > STALE_AFTER_SECONDS * 1000 }));
}
