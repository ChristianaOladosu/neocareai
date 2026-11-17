import { Router } from 'express';
import { z } from 'zod';
import type pg from 'pg';
import { pool, tx } from '../../database/db.js';
import { asyncHandler, HttpError } from '../../utils/errors.js';
import { requireAuth, requirePermission, type AuthUser } from '../../middleware/auth.js';
import { audit } from '../audit/audit.service.js';
import { publish } from '../../events/bus.js';
import { canAccessNewborn, scopeSql } from '../newborns/scope.js';

export const alertsRouter = Router();
alertsRouter.use(requireAuth);
const uuid = z.string().uuid();

alertsRouter.get('/', requirePermission('alert:read'), asyncHandler(async (req, res) => {
  const q = z.object({ status: z.string().optional(), newbornId: uuid.optional(), priority: z.enum(['high', 'medium', 'low']).optional(),
    category: z.enum(['measurement', 'trend', 'signal_quality', 'missing_data', 'device_disconnection']).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
  const statuses = q.status ? q.status.split(',') : null; const p: unknown[] = [req.user!.hospitalId, statuses, q.newbornId ?? null, q.priority ?? null, q.category ?? null, q.limit]; const scope = scopeSql('a.newborn_id', p, req.user!);
  const r = await pool.query(
    `SELECT a.id, a.newborn_id, n.newborn_identifier, a.priority, a.category, a.title, a.explanation, a.status, a.created_at, a.updated_at, a.evidence, a.occurrence_count
     FROM clinical_alerts a JOIN newborns n ON n.id=a.newborn_id
     WHERE a.hospital_id=$1 AND ($2::text[] IS NULL OR a.status = ANY($2)) AND ($3::uuid IS NULL OR a.newborn_id=$3) AND ($4::text IS NULL OR a.priority=$4) AND ($5::text IS NULL OR a.category=$5) AND ${scope}
     ORDER BY a.created_at DESC LIMIT $6`, p);
  res.json(r.rows);
}));

// Opening an alert is read-only: it never changes status.
alertsRouter.get('/:id', requirePermission('alert:read'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const a = await pool.query(
    `SELECT a.*, n.newborn_identifier, r.rule_version, r.name AS rule_name FROM clinical_alerts a JOIN newborns n ON n.id=a.newborn_id
     LEFT JOIN alert_rules r ON r.id=a.rule_id WHERE a.id=$1 AND a.hospital_id=$2`, [id, req.user!.hospitalId]);
  if (!a.rows[0] || !(await canAccessNewborn(req.user!, a.rows[0].newborn_id))) throw new HttpError(404, 'Alert not found', 'not_found');
  const [events, assessments] = await Promise.all([
    pool.query(`SELECT e.id, e.event_type, e.previous_status, e.new_status, e.event_details, e.created_at, u.full_name AS user_name
                FROM response_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.alert_id=$1 ORDER BY e.seq`, [id]),
    pool.query(`SELECT s.id, s.assessment_text, s.created_at, u.full_name AS clinician FROM clinical_assessments s JOIN users u ON u.id=s.clinician_id WHERE s.alert_id=$1 ORDER BY s.created_at`, [id]),
  ]);
  res.json({ ...a.rows[0], events: events.rows, assessments: assessments.rows });
}));

type Status = 'awaiting_acknowledgement' | 'acknowledged' | 'under_assessment' | 'escalated' | 'resolved' | 'closed';

async function transition(user: AuthUser, alertId: string, from: Status[], to: Status, eventType: string, details: Record<string, unknown>, extra?: (c: pg.PoolClient) => Promise<void>, after?: (c: pg.PoolClient) => Promise<void>) {
  return tx(async (c) => {
    const cur = await c.query('SELECT status, newborn_id FROM clinical_alerts WHERE id=$1 AND hospital_id=$2 FOR UPDATE', [alertId, user.hospitalId]);
    if (!cur.rows[0] || !(await canAccessNewborn(user, cur.rows[0].newborn_id))) throw new HttpError(404, 'Alert not found', 'not_found');
    const prev = cur.rows[0].status as Status;
    if (!from.includes(prev)) throw new HttpError(409, `Cannot ${eventType.replace('_', ' ')} an alert that is ${prev.replace(/_/g, ' ')}`, 'invalid_transition');
    if (extra) await extra(c);
    await c.query('UPDATE clinical_alerts SET status=$2, updated_at=now() WHERE id=$1', [alertId, to]);
    await c.query('INSERT INTO response_events(alert_id,user_id,event_type,previous_status,new_status,event_details) VALUES ($1,$2,$3,$4,$5,$6)', [alertId, user.id, eventType, prev, to, JSON.stringify(details)]);
    if (after) await after(c);
    await audit({ hospitalId: user.hospitalId, userId: user.id, action: `alert.${eventType}`, resourceType: 'alert', resourceId: alertId, metadata: { from: prev, to } }, c);
    publish({ type: 'alert.updated', hospitalId: user.hospitalId, payload: { alertId, status: to } });
    return { id: alertId, previousStatus: prev, status: to };
  });
}

alertsRouter.post('/:id/acknowledge', requirePermission('alert:acknowledge'), asyncHandler(async (req, res) => {
  res.json(await transition(req.user!, uuid.parse(req.params.id), ['awaiting_acknowledgement'], 'acknowledged', 'acknowledged', {}));
}));

const assessSchema = z.object({ assessmentText: z.string().trim().min(3).max(4000), responseText: z.string().trim().min(3).max(4000).optional(), aiInteractionId: z.string().uuid().optional() });
alertsRouter.post('/:id/assessment', requirePermission('alert:assess'), asyncHandler(async (req, res) => {
  const b = assessSchema.parse(req.body); const id = uuid.parse(req.params.id); const u = req.user!;
  // An AI draft can never be recorded with its clinician-only fields still empty.
  if (b.assessmentText.includes('[Clinician to complete') || b.responseText?.includes('[Clinician to complete')) throw new HttpError(422, 'Complete every bracketed field in the draft before recording it', 'draft_incomplete');
  let aiNote: Record<string, unknown> = {}; let aiDecision: { id: string; modified: boolean } | null = null;
  if (b.aiInteractionId) {
    // The draft must be this clinician's own, for this alert and hospital, successfully generated, and not already rejected or recorded.
    const ai = await pool.query(
      `SELECT i.mode, i.model_id, i.output->>'draftText' AS draft_text, d.decision FROM ai_interactions i LEFT JOIN ai_draft_decisions d ON d.interaction_id=i.id
       WHERE i.id=$1 AND i.alert_id=$2 AND i.hospital_id=$3 AND i.user_id=$4 AND i.kind='draft_assessment' AND i.status='completed'`, [b.aiInteractionId, id, u.hospitalId, u.id]);
    if (!ai.rowCount) throw new HttpError(400, 'Unknown AI draft for this alert', 'invalid_ai_reference');
    if (ai.rows[0].decision) throw new HttpError(409, ai.rows[0].decision === 'rejected' ? 'This AI draft was rejected and cannot be recorded' : 'This AI draft has already been recorded', 'draft_already_decided');
    const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
    const modified = norm(b.assessmentText) !== norm(ai.rows[0].draft_text ?? '');
    aiNote = { aiAssisted: true, aiInteractionId: b.aiInteractionId, aiMode: ai.rows[0].mode, aiModel: ai.rows[0].model_id, aiModified: modified };
    aiDecision = { id: b.aiInteractionId, modified };
  }
  res.json(await transition(u, id, ['acknowledged', 'under_assessment'], 'under_assessment', 'assessment_recorded', { assessmentLength: b.assessmentText.length, ...aiNote }, async (c) => {
    await c.query('INSERT INTO clinical_assessments(alert_id,clinician_id,assessment_text) VALUES ($1,$2,$3)', [id, u.id, b.assessmentText]);
    if (aiDecision) {
      await c.query(`INSERT INTO ai_draft_decisions(interaction_id,user_id,decision,modified) VALUES ($1,$2,'recorded',$3)`, [aiDecision.id, u.id, aiDecision.modified]);
      await audit({ hospitalId: u.hospitalId, userId: u.id, action: 'ai.draft_recorded', resourceType: 'alert', resourceId: id, metadata: { interactionId: aiDecision.id, modified: aiDecision.modified } }, c);
    }
  }, async (c) => {
    if (b.responseText)
      await c.query(`INSERT INTO response_events(alert_id,user_id,event_type,previous_status,new_status,event_details) VALUES ($1,$2,'response_documented','under_assessment','under_assessment',$3)`, [id, u.id, JSON.stringify({ responseText: b.responseText })]);
  }));
}));

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(2000) });
alertsRouter.post('/:id/escalate', requirePermission('alert:escalate'), asyncHandler(async (req, res) => {
  const b = reasonSchema.parse(req.body);
  res.json(await transition(req.user!, uuid.parse(req.params.id), ['acknowledged', 'under_assessment'], 'escalated', 'escalated', { reason: b.reason }));
}));

alertsRouter.post('/:id/resolve', requirePermission('alert:resolve'), asyncHandler(async (req, res) => {
  const b = z.object({ resolutionNote: z.string().trim().min(3).max(2000) }).parse(req.body); const id = uuid.parse(req.params.id);
  res.json(await transition(req.user!, id, ['under_assessment', 'escalated'], 'resolved', 'resolved', { resolutionNote: b.resolutionNote }, async (c) => {
    const n = await c.query('SELECT 1 FROM clinical_assessments WHERE alert_id=$1 LIMIT 1', [id]);
    if (!n.rowCount) throw new HttpError(409, 'A clinical assessment must be recorded before resolution', 'assessment_required');
  }));
}));

// A clinician closes a RESOLVED alert (archiving it). Closing is never automatic.
alertsRouter.post('/:id/close', requirePermission('alert:close'), asyncHandler(async (req, res) => {
  res.json(await transition(req.user!, uuid.parse(req.params.id), ['resolved'], 'closed', 'closed', {}));
}));
// Documenting an action taken, without making a clinical assessment (for example by a nurse). Status does not change.
alertsRouter.post('/:id/response', requirePermission('alert:respond'), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id); const u = req.user!; const { text } = z.object({ text: z.string().trim().min(3).max(4000) }).parse(req.body);
  await tx(async (c) => {
    const cur = await c.query('SELECT status, newborn_id FROM clinical_alerts WHERE id=$1 AND hospital_id=$2 FOR UPDATE', [id, u.hospitalId]);
    if (!cur.rows[0] || !(await canAccessNewborn(u, cur.rows[0].newborn_id))) throw new HttpError(404, 'Alert not found', 'not_found');
    const st = cur.rows[0].status as Status; if (!['acknowledged', 'under_assessment', 'escalated'].includes(st)) throw new HttpError(409, 'Acknowledge the alert before documenting a response.', 'invalid_transition');
    await c.query(`INSERT INTO response_events(alert_id,user_id,event_type,previous_status,new_status,event_details) VALUES ($1,$2,'response_documented',$3,$3,$4)`, [id, u.id, st, JSON.stringify({ responseText: text })]);
    await c.query('UPDATE clinical_alerts SET updated_at=now() WHERE id=$1', [id]);
    await audit({ hospitalId: u.hospitalId, userId: u.id, action: 'alert.response_documented', resourceType: 'alert', resourceId: id }, c);
    publish({ type: 'alert.updated', hospitalId: u.hospitalId, payload: { alertId: id, status: st } });
  });
  res.json({ ok: true });
}));

export const responseLogRouter = Router();
responseLogRouter.get('/', requireAuth, requirePermission('response:read'), asyncHandler(async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(500).default(100).parse(req.query.limit); const lp: unknown[] = [req.user!.hospitalId, limit];
  const r = await pool.query(
    `SELECT e.id, e.alert_id, e.event_type, e.previous_status, e.new_status, e.event_details, e.created_at, u.full_name AS user_name, n.newborn_identifier, a.title AS alert_title
     FROM response_events e JOIN clinical_alerts a ON a.id=e.alert_id JOIN newborns n ON n.id=a.newborn_id LEFT JOIN users u ON u.id=e.user_id
     WHERE a.hospital_id=$1 AND ${scopeSql('a.newborn_id', lp, req.user!)} ORDER BY e.seq DESC LIMIT $2`, lp);
  res.json(r.rows);
}));
