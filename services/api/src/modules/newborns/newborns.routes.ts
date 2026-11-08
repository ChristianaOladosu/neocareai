import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/db.js';
import { asyncHandler, HttpError } from '../../utils/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { audit } from '../audit/audit.service.js';

export const newbornsRouter = Router();
newbornsRouter.use(requireAuth);

const COLS = `n.id, n.newborn_identifier, n.date_of_birth, n.gestational_age_weeks, n.admission_date, n.monitoring_status, n.unit_id, u.name AS unit_name`;

newbornsRouter.get('/', requirePermission('newborn:read'), asyncHandler(async (req, res) => {
  const q = z.object({ search: z.string().max(50).optional(), unitId: z.string().uuid().optional(), status: z.enum(['monitoring', 'paused', 'discharged']).optional() }).parse(req.query);
  const r = await pool.query(
    `SELECT ${COLS} FROM newborns n LEFT JOIN units u ON u.id=n.unit_id
     WHERE n.hospital_id=$1 AND ($2::text IS NULL OR n.newborn_identifier ILIKE '%'||$2||'%')
       AND ($3::uuid IS NULL OR n.unit_id=$3) AND ($4::text IS NULL OR n.monitoring_status=$4)
     ORDER BY n.newborn_identifier`, [req.user!.hospitalId, q.search ?? null, q.unitId ?? null, q.status ?? null]);
  res.json(r.rows);
}));

const createSchema = z.object({
  newbornIdentifier: z.string().min(1).max(40), dateOfBirth: z.string().date(),
  gestationalAgeWeeks: z.number().min(20).max(45).optional(), unitId: z.string().uuid().optional(),
});
newbornsRouter.post('/', requirePermission('newborn:write'), asyncHandler(async (req, res) => {
  const b = createSchema.parse(req.body);
  if (b.unitId) await assertUnit(b.unitId, req.user!.hospitalId);
  try {
    const r = await pool.query(
      `INSERT INTO newborns(hospital_id,unit_id,newborn_identifier,date_of_birth,gestational_age_weeks) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [req.user!.hospitalId, b.unitId ?? null, b.newbornIdentifier, b.dateOfBirth, b.gestationalAgeWeeks ?? null]);
    await audit({ hospitalId: req.user!.hospitalId, userId: req.user!.id, action: 'newborn.register', resourceType: 'newborn', resourceId: r.rows[0].id });
    res.status(201).json({ id: r.rows[0].id });
  } catch (e: any) {
    if (e.code === '23505') throw new HttpError(409, 'Newborn identifier already exists in this hospital', 'duplicate');
    throw e;
  }
}));

async function assertUnit(unitId: string, hospitalId: string) {
  const u = await pool.query('SELECT 1 FROM units WHERE id=$1 AND hospital_id=$2', [unitId, hospitalId]);
  if (!u.rowCount) throw new HttpError(404, 'Unit not found', 'not_found');
}

newbornsRouter.get('/:id', requirePermission('newborn:read'), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const r = await pool.query(`SELECT ${COLS} FROM newborns n LEFT JOIN units u ON u.id=n.unit_id WHERE n.id=$1 AND n.hospital_id=$2`, [id, req.user!.hospitalId]);
  if (!r.rows[0]) throw new HttpError(404, 'Newborn not found', 'not_found'); // 404 (not 403) avoids revealing cross-hospital existence
  res.json(r.rows[0]);
}));

const patchSchema = z.object({ unitId: z.string().uuid().nullable().optional(), monitoringStatus: z.enum(['monitoring', 'paused', 'discharged']).optional(), gestationalAgeWeeks: z.number().min(20).max(45).optional() });
newbornsRouter.patch('/:id', requirePermission('newborn:write'), asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id); const b = patchSchema.parse(req.body);
  if (b.unitId) await assertUnit(b.unitId, req.user!.hospitalId);
  const r = await pool.query(
    `UPDATE newborns SET unit_id = CASE WHEN $3::boolean THEN $4::uuid ELSE unit_id END, monitoring_status=COALESCE($5,monitoring_status),
       gestational_age_weeks=COALESCE($6,gestational_age_weeks), updated_at=now() WHERE id=$1 AND hospital_id=$2 RETURNING id`,
    [id, req.user!.hospitalId, b.unitId !== undefined, b.unitId ?? null, b.monitoringStatus ?? null, b.gestationalAgeWeeks ?? null]);
  if (!r.rows[0]) throw new HttpError(404, 'Newborn not found', 'not_found');
  await audit({ hospitalId: req.user!.hospitalId, userId: req.user!.id, action: 'newborn.update', resourceType: 'newborn', resourceId: id, metadata: b });
  res.json({ ok: true });
}));
