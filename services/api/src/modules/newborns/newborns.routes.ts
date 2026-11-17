import { Router } from 'express';
import { z } from 'zod';
import type pg from 'pg';
import { pool, tx } from '../../database/db.js';
import { asyncHandler, HttpError } from '../../utils/errors.js';
import { requireAuth, requirePermission, type AuthUser } from '../../middleware/auth.js';
import { audit } from '../audit/audit.service.js';
import { canAccessNewborn, scopeSql } from './scope.js';
import { newbornStatuses } from '../monitoring/status.js';
import { publish } from '../../events/bus.js';

export const newbornsRouter = Router();
newbornsRouter.use(requireAuth);
const uuid = z.string().uuid();
const STATES = ['normal', 'concerning', 'insufficient_signal', 'disconnected', 'not_monitored'] as const;
const COLS = `n.id, n.newborn_identifier, n.date_of_birth, n.birth_time, n.gestational_age_weeks, n.birth_weight_grams, n.admission_date, n.admission_source, n.monitoring_status, n.unit_id, un.name AS unit_name, n.created_at, n.discharged_at, n.discharge_reason, n.transferred_to`;
const SORTS: Record<string, string> = { identifier: 'n.newborn_identifier', admission: 'n.admission_date', gestational_age: 'n.gestational_age_weeks', unit: 'un.name', registered: 'n.created_at' };

async function mustAccess(u: AuthUser, id: string) { if (!(await canAccessNewborn(u, id))) throw new HttpError(404, 'Newborn not found', 'not_found'); } // 404 also hides out-of-scope and other-hospital records
async function assertUnit(unitId: string, hospitalId: string) { if (!(await pool.query('SELECT 1 FROM units WHERE id=$1 AND hospital_id=$2', [unitId, hospitalId])).rowCount) throw new HttpError(404, 'Unit not found', 'not_found'); }

newbornsRouter.get('/', requirePermission('newborn:read'), asyncHandler(async (req, res) => {
  const q = z.object({ search: z.string().max(50).optional(), unitId: uuid.optional(), status: z.enum(['monitoring', 'paused', 'transferred', 'discharged', 'inactive']).optional(), health: z.enum(STATES).optional(),
    admission: z.enum(['recent', 'current', 'discharged']).optional(), sort: z.enum(Object.keys(SORTS) as [string, ...string[]]).default('identifier'), dir: z.enum(['asc', 'desc']).default('asc'),
    page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
  const p: unknown[] = [req.user!.hospitalId]; const scope = scopeSql('n.id', p, req.user!); p.push(q.search ?? null); const s = p.length; p.push(q.unitId ?? null); const un = p.length; p.push(q.status ?? null); const st = p.length;
  const adm = q.admission === 'recent' ? `AND n.created_at > now() - interval '7 days'` : q.admission === 'current' ? `AND n.monitoring_status IN ('monitoring','paused')` : q.admission === 'discharged' ? `AND n.monitoring_status='discharged'` : '';
  const base = await pool.query(`SELECT ${COLS} FROM newborns n LEFT JOIN units un ON un.id=n.unit_id WHERE n.hospital_id=$1 AND ${scope} AND ($${s}::text IS NULL OR n.newborn_identifier ILIKE '%'||$${s}||'%') AND ($${un}::uuid IS NULL OR n.unit_id=$${un}) AND ($${st}::text IS NULL OR n.monitoring_status=$${st}) ${adm} ORDER BY ${SORTS[q.sort]} ${q.dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, n.newborn_identifier`, p);
  let rows = base.rows;
  const wantsState = q.health || q.page || req.query.include === 'state';
  if (wantsState) { const sts = new Map((await newbornStatuses(req.user!, rows.map((r) => r.id))).map((x) => [x.id, x])); rows = rows.map((r) => ({ ...r, state: sts.get(r.id)?.state ?? null, signal: sts.get(r.id)?.signal ?? null, alerts: sts.get(r.id)?.alerts ?? null })); if (q.health) rows = rows.filter((r) => r.state === q.health); }
  if (!q.page) return res.json(rows);                                             // backwards-compatible plain array
  const total = rows.length; res.json({ items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total, page: q.page, pageSize: q.pageSize });
}));

const createSchema = z.object({
  newbornIdentifier: z.string().trim().min(1).max(40).optional(), dateOfBirth: z.string().date(), birthTime: z.string().datetime({ offset: true }).optional(),
  gestationalAgeWeeks: z.number().min(20).max(45).optional(), birthWeightGrams: z.number().int().min(200).max(8000).optional(), unitId: uuid.optional(),
  admissionSource: z.enum(['inborn', 'outborn', 'transfer_in', 'other']).optional(), clinicalSummary: z.string().trim().max(2000).optional(), teamUserIds: z.array(uuid).max(20).optional(),
});
newbornsRouter.post('/', requirePermission('newborn:write'), asyncHandler(async (req, res) => {
  const b = createSchema.parse(req.body); const u = req.user!;
  if (b.clinicalSummary && !u.permissions.has('newborn:clinical')) throw new HttpError(403, 'Your role cannot record clinical details.', 'forbidden');
  if (b.unitId) await assertUnit(b.unitId, u.hospitalId);
  const id = await tx(async (c) => {
    let ident = b.newbornIdentifier;
    if (!ident) { const n = (await c.query(`SELECT COALESCE(max(substring(newborn_identifier from '^NB-\\d{4}-(\\d+)$')::int),0)+1 AS n FROM newborns WHERE hospital_id=$1`, [u.hospitalId])).rows[0].n; ident = `NB-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`; }
    let r; try { r = await c.query(`INSERT INTO newborns(hospital_id,unit_id,newborn_identifier,date_of_birth,birth_time,gestational_age_weeks,birth_weight_grams,admission_source,clinical_summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [u.hospitalId, b.unitId ?? null, ident, b.dateOfBirth, b.birthTime ?? null, b.gestationalAgeWeeks ?? null, b.birthWeightGrams ?? null, b.admissionSource ?? null, b.clinicalSummary ?? null]); }
    catch (e: any) { if (e.code === '23505') throw new HttpError(409, 'Newborn identifier already exists in this hospital', 'duplicate'); throw e; }
    const nid = r.rows[0].id as string;
    await c.query('INSERT INTO monitoring_sessions(newborn_id,started_by,reason) VALUES ($1,$2,$3)', [nid, u.id, 'Admission']);
    for (const uid of new Set(b.teamUserIds ?? [])) { if ((await c.query(`SELECT 1 FROM users WHERE id=$1 AND hospital_id=$2 AND account_status='active'`, [uid, u.hospitalId])).rowCount) await c.query('INSERT INTO newborn_team(newborn_id,user_id,assigned_by) VALUES ($1,$2,$3)', [nid, uid, u.id]); }
    await audit({ hospitalId: u.hospitalId, userId: u.id, action: 'newborn.register', resourceType: 'newborn', resourceId: nid }, c);
    return nid;
  });
  res.status(201).json({ id });
}));

newbornsRouter.get('/:id', requirePermission('newborn:read'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); const u = req.user!; await mustAccess(u, id);
  const r = await pool.query(`SELECT ${COLS}, n.clinical_summary FROM newborns n LEFT JOIN units un ON un.id=n.unit_id WHERE n.id=$1 AND n.hospital_id=$2`, [id, u.hospitalId]);
  const row = r.rows[0]; if (!u.permissions.has('newborn:clinical')) delete row.clinical_summary;
  const team = await pool.query(`SELECT t.user_id, us.full_name, t.assigned_at, (SELECT string_agg(ro.name, ', ') FROM user_roles ur JOIN roles ro ON ro.id=ur.role_id WHERE ur.user_id=us.id) AS roles FROM newborn_team t JOIN users us ON us.id=t.user_id WHERE t.newborn_id=$1 AND t.unassigned_at IS NULL ORDER BY us.full_name`, [id]);
  const session = await pool.query('SELECT id, started_at, reason FROM monitoring_sessions WHERE newborn_id=$1 AND ended_at IS NULL', [id]);
  if (u.permissions.has('newborn:clinical')) await audit({ hospitalId: u.hospitalId, userId: u.id, action: 'newborn.view', resourceType: 'newborn', resourceId: id }); // access event
  res.json({ ...row, team: team.rows, currentSession: session.rows[0] ?? null });
}));

newbornsRouter.patch('/:id', requirePermission('newborn:write'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); const u = req.user!; await mustAccess(u, id);
  const b = z.object({ unitId: uuid.nullable().optional(), gestationalAgeWeeks: z.number().min(20).max(45).optional(), birthWeightGrams: z.number().int().min(200).max(8000).optional(), clinicalSummary: z.string().trim().max(2000).optional() }).parse(req.body);
  if (b.clinicalSummary !== undefined && !u.permissions.has('newborn:clinical')) throw new HttpError(403, 'Your role cannot edit clinical details.', 'forbidden');
  if (b.unitId) await assertUnit(b.unitId, u.hospitalId);
  await pool.query(`UPDATE newborns SET unit_id = CASE WHEN $3::boolean THEN $4::uuid ELSE unit_id END, gestational_age_weeks=COALESCE($5,gestational_age_weeks), birth_weight_grams=COALESCE($6,birth_weight_grams), clinical_summary=COALESCE($7,clinical_summary), updated_at=now() WHERE id=$1 AND hospital_id=$2`,
    [id, u.hospitalId, b.unitId !== undefined, b.unitId ?? null, b.gestationalAgeWeeks ?? null, b.birthWeightGrams ?? null, b.clinicalSummary ?? null]);
  await audit({ hospitalId: u.hospitalId, userId: u.id, action: 'newborn.update', resourceType: 'newborn', resourceId: id, metadata: { fields: Object.keys(b) } });
  res.json({ ok: true });
}));

// ---- lifecycle ----
const NEXT: Record<string, Record<string, string>> = {
  monitoring: { pause: 'paused', transfer: 'transferred', discharge: 'discharged', inactivate: 'inactive' }, paused: { resume: 'monitoring', transfer: 'transferred', discharge: 'discharged', inactivate: 'inactive' },
  transferred: { reactivate: 'monitoring', inactivate: 'inactive' }, discharged: { reactivate: 'monitoring', inactivate: 'inactive' }, inactive: { reactivate: 'monitoring' },
};
newbornsRouter.post('/:id/lifecycle', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); const u = req.user!;
  if (!u.permissions.has('monitoring:manage') && !u.permissions.has('newborn:write')) throw new HttpError(403, 'Insufficient permissions', 'forbidden');
  await mustAccess(u, id);
  const b = z.object({ action: z.enum(['pause', 'resume', 'transfer', 'discharge', 'inactivate', 'reactivate']), reason: z.string().trim().max(500).optional(), transferredTo: z.string().trim().max(200).optional() }).parse(req.body);
  const out = await tx(async (c) => {
    const cur = (await c.query('SELECT monitoring_status FROM newborns WHERE id=$1 AND hospital_id=$2 FOR UPDATE', [id, u.hospitalId])).rows[0]; if (!cur) throw new HttpError(404, 'Newborn not found', 'not_found');
    const to = NEXT[cur.monitoring_status]?.[b.action]; if (!to) throw new HttpError(409, `Cannot ${b.action} a newborn whose status is ${cur.monitoring_status}.`, 'invalid_transition');
    if (b.action === 'transfer' && !b.transferredTo) throw new HttpError(400, 'Say where the newborn is being transferred to.', 'validation_error');
    await c.query(`UPDATE newborns SET monitoring_status=$2, updated_at=now(), discharged_at=CASE WHEN $2='discharged' THEN now() WHEN $2='monitoring' THEN NULL ELSE discharged_at END,
      discharge_reason=CASE WHEN $2='discharged' THEN $3 WHEN $2='monitoring' THEN NULL ELSE discharge_reason END, transferred_to=CASE WHEN $2='transferred' THEN $4 WHEN $2='monitoring' THEN NULL ELSE transferred_to END WHERE id=$1`, [id, to, b.reason ?? null, b.transferredTo ?? null]);
    if (to === 'monitoring') await c.query('INSERT INTO monitoring_sessions(newborn_id,started_by,reason) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, u.id, b.reason ?? (b.action === 'resume' ? 'Resumed' : 'Readmitted')]);
    else await c.query('UPDATE monitoring_sessions SET ended_at=now(), ended_by=$2, reason=COALESCE($3,reason) WHERE newborn_id=$1 AND ended_at IS NULL', [id, u.id, b.reason ?? b.action]);
    await audit({ hospitalId: u.hospitalId, userId: u.id, action: `newborn.${b.action}`, resourceType: 'newborn', resourceId: id, metadata: { from: cur.monitoring_status, to, reason: b.reason ?? null } }, c);
    return { from: cur.monitoring_status, to };
  });
  publish({ type: 'newborn.lifecycle', hospitalId: u.hospitalId, payload: { newbornId: id, status: out.to } });
  res.json({ ok: true, ...out });
}));
newbornsRouter.get('/:id/sessions', requirePermission('newborn:read'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); await mustAccess(req.user!, id);
  res.json((await pool.query(`SELECT s.id, s.started_at, s.ended_at, s.reason, a.full_name AS started_by, b.full_name AS ended_by FROM monitoring_sessions s LEFT JOIN users a ON a.id=s.started_by LEFT JOIN users b ON b.id=s.ended_by WHERE s.newborn_id=$1 ORDER BY s.started_at DESC`, [id])).rows);
}));

// ---- clinical notes (append-only, clinical permission) ----
newbornsRouter.get('/:id/notes', requirePermission('newborn:clinical'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); await mustAccess(req.user!, id);
  res.json((await pool.query(`SELECT n.id, n.note_type, n.note_text, n.created_at, u.full_name AS author FROM clinical_notes n JOIN users u ON u.id=n.author_id WHERE n.newborn_id=$1 ORDER BY n.created_at DESC LIMIT 200`, [id])).rows);
}));
newbornsRouter.post('/:id/notes', requirePermission('notes:write'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); const u = req.user!; await mustAccess(u, id);
  const b = z.object({ text: z.string().trim().min(3).max(4000), type: z.enum(['clinical_note', 'observation']).default('clinical_note') }).parse(req.body);
  const r = await pool.query('INSERT INTO clinical_notes(newborn_id,author_id,note_type,note_text) VALUES ($1,$2,$3,$4) RETURNING id', [id, u.id, b.type, b.text]);
  await audit({ hospitalId: u.hospitalId, userId: u.id, action: 'note.create', resourceType: 'newborn', resourceId: id, metadata: { noteId: r.rows[0].id, type: b.type } });
  res.status(201).json({ id: r.rows[0].id });
}));

// ---- clinical team ----
newbornsRouter.put('/:id/team', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); const u = req.user!;
  if (!u.permissions.has('newborn:write') && !u.permissions.has('monitoring:manage')) throw new HttpError(403, 'Insufficient permissions', 'forbidden');
  await mustAccess(u, id); const { userIds } = z.object({ userIds: z.array(uuid).max(30) }).parse(req.body);
  await tx(async (c) => {
    const ok = (await c.query(`SELECT id FROM users WHERE id = ANY($1::uuid[]) AND hospital_id=$2 AND account_status='active'`, [userIds, u.hospitalId])).rows.map((x) => x.id as string);
    await c.query(`UPDATE newborn_team SET unassigned_at=now() WHERE newborn_id=$1 AND unassigned_at IS NULL AND NOT (user_id = ANY($2::uuid[]))`, [id, ok]);
    for (const uid of ok) await c.query('INSERT INTO newborn_team(newborn_id,user_id,assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, uid, u.id]);
    await audit({ hospitalId: u.hospitalId, userId: u.id, action: 'newborn.team_changed', resourceType: 'newborn', resourceId: id, metadata: { members: ok.length } }, c);
  });
  res.json({ ok: true });
}));
