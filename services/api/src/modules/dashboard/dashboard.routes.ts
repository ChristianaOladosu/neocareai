import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../database/db.js';
import { asyncHandler } from '../../utils/errors.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { scopeSql } from '../newborns/scope.js';
import { newbornStatuses, SIGNAL_LABEL, type SignalCategory } from '../monitoring/status.js';

export const dashboardRouter = Router();   // mounted at /api/dashboard, /api/activity, /api/search

dashboardRouter.get('/dashboard/summary', requireAuth, requirePermission('newborn:read'), asyncHandler(async (req, res) => {
  const u = req.user!; const hid = u.hospitalId;
  const p: unknown[] = [hid]; const sc = scopeSql('n.id', p, u);
  const reg = (await pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE n.monitoring_status='monitoring')::int AS monitored, count(*) FILTER (WHERE n.created_at > now() - interval '7 days')::int AS recent FROM newborns n WHERE n.hospital_id=$1 AND ${sc}`, p)).rows[0];
  const dev = u.permissions.has('device:read') ? (await pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE d.connection_status='connected')::int AS connected, count(*) FILTER (WHERE d.connection_status='disconnected')::int AS disconnected,
    count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM device_assignments da WHERE da.device_id=d.id AND da.unassigned_at IS NULL))::int AS unassigned FROM devices d WHERE d.hospital_id=$1`, [hid])).rows[0] : null;
  if (!u.permissions.has('observation:read')) return res.json({ registered: reg.total, monitored: reg.monitored, recentlyRegistered: reg.recent, devices: dev, clinical: null });   // no clinical data for this role
  const sts = (await newbornStatuses(u)).filter((x) => x.monitoringStatus === 'monitoring');
  const states = { normal: 0, concerning: 0, insufficient_signal: 0, disconnected: 0 } as Record<string, number>; for (const s of sts) if (s.state in states) states[s.state]++;
  const dist = {} as Record<SignalCategory, number>; for (const k of Object.keys(SIGNAL_LABEL) as SignalCategory[]) dist[k] = 0; for (const s of sts) dist[s.signal.category]++;
  let alerts = { open: 0, high: 0, unacknowledged: 0 };
  if (u.permissions.has('alert:read')) { const ap: unknown[] = [hid]; const asc = scopeSql('a.newborn_id', ap, u);
    alerts = (await pool.query(`SELECT count(*)::int AS open, count(*) FILTER (WHERE a.priority='high')::int AS high, count(*) FILTER (WHERE a.status='awaiting_acknowledgement')::int AS unacknowledged FROM clinical_alerts a WHERE a.hospital_id=$1 AND a.status NOT IN ('resolved','closed') AND ${asc}`, ap)).rows[0]; }
  res.json({ registered: reg.total, monitored: reg.monitored, recentlyRegistered: reg.recent, devices: dev, clinical: { states, signalDistribution: dist, signalLabels: SIGNAL_LABEL, alerts } });
}));

// Data availability over time: reading counts by signal quality per 5-minute bucket. Describes the data, not the newborns.
dashboardRouter.get('/dashboard/availability', requireAuth, requirePermission('observation:read'), asyncHandler(async (req, res) => {
  const { minutes } = z.object({ minutes: z.coerce.number().int().min(10).max(1440).default(60) }).parse(req.query); const p: unknown[] = [req.user!.hospitalId, String(minutes)]; const sc = scopeSql('o.newborn_id', p, req.user!);
  const r = await pool.query(`SELECT to_timestamp(floor(extract(epoch FROM o.observed_at)/300)*300) AS t, o.quality_status AS q, count(*)::int AS n FROM observations o JOIN newborns nb ON nb.id=o.newborn_id
    WHERE nb.hospital_id=$1 AND o.observed_at > now() - ($2 || ' minutes')::interval AND ${sc} GROUP BY 1,2 ORDER BY 1`, p);
  const map = new Map<string, any>(); for (const x of r.rows) { const k = x.t.toISOString(); const o = map.get(k) ?? { t: k, good: 0, questionable: 0, poor: 0, unavailable: 0, unknown: 0 }; o[x.q] = x.n; map.set(k, o); }
  res.json([...map.values()]);
}));

dashboardRouter.get('/activity', requireAuth, requirePermission('newborn:read'), asyncHandler(async (req, res) => {
  const u = req.user!; const limit = z.coerce.number().int().min(1).max(100).default(30).parse(req.query.limit); const out: Array<{ at: string; type: string; text: string; link?: string; newborn?: string }> = [];
  const p1: unknown[] = [u.hospitalId]; const s1 = scopeSql('n.id', p1, u);
  for (const x of (await pool.query(`SELECT a.created_at, n.id, n.newborn_identifier FROM audit_logs a JOIN newborns n ON n.id::text=a.resource_id WHERE a.hospital_id=$1 AND a.action='newborn.register' AND ${s1} ORDER BY a.created_at DESC LIMIT 15`, p1)).rows) out.push({ at: x.created_at, type: 'newborn_registered', text: `${x.newborn_identifier} registered`, link: `/newborns/${x.id}`, newborn: x.newborn_identifier });
  if (u.permissions.has('observation:read')) {
    const p2: unknown[] = [u.hospitalId]; const s2 = scopeSql('n.id', p2, u);
    for (const x of (await pool.query(`SELECT s.started_at, s.ended_at, s.reason, n.id, n.newborn_identifier FROM monitoring_sessions s JOIN newborns n ON n.id=s.newborn_id WHERE n.hospital_id=$1 AND ${s2} ORDER BY s.started_at DESC LIMIT 20`, p2)).rows) {
      out.push({ at: x.started_at, type: 'monitoring_started', text: `Monitoring started for ${x.newborn_identifier}`, link: `/newborns/${x.id}`, newborn: x.newborn_identifier });
      if (x.ended_at) out.push({ at: x.ended_at, type: 'monitoring_ended', text: `Monitoring ended for ${x.newborn_identifier}${x.reason ? ` (${x.reason})` : ''}`, link: `/newborns/${x.id}`, newborn: x.newborn_identifier });
    }
    const p3: unknown[] = [u.hospitalId]; const s3 = scopeSql('n.id', p3, u);
    for (const x of (await pool.query(`SELECT a.created_at, a.action, d.device_identifier, n.id, n.newborn_identifier FROM audit_logs a JOIN devices d ON d.id::text=a.resource_id JOIN device_assignments da ON da.device_id=d.id AND da.unassigned_at IS NULL JOIN newborns n ON n.id=da.newborn_id
      WHERE a.hospital_id=$1 AND a.action IN ('device.connected','device.disconnected') AND ${s3} ORDER BY a.created_at DESC LIMIT 20`, p3)).rows)
      out.push({ at: x.created_at, type: x.action === 'device.disconnected' ? 'monitoring_interrupted' : 'monitoring_resumed', text: x.action === 'device.disconnected' ? `Monitoring interrupted for ${x.newborn_identifier}: ${x.device_identifier} disconnected` : `${x.device_identifier} reconnected for ${x.newborn_identifier}`, link: `/newborns/${x.id}`, newborn: x.newborn_identifier });
    const p4: unknown[] = [u.hospitalId]; const s4 = scopeSql('n.id', p4, u);
    for (const x of (await pool.query(`SELECT max(o.received_at) AS at, count(*)::int AS c, n.id, n.newborn_identifier FROM observations o JOIN newborns n ON n.id=o.newborn_id WHERE n.hospital_id=$1 AND o.received_at > now() - interval '15 minutes' AND ${s4} GROUP BY n.id, n.newborn_identifier`, p4)).rows)
      out.push({ at: x.at, type: 'measurement_received', text: `${x.c} measurements received for ${x.newborn_identifier} in the last 15 minutes`, link: `/newborns/${x.id}`, newborn: x.newborn_identifier });
  }
  if (u.permissions.has('response:read')) {
    const p5: unknown[] = [u.hospitalId, 40]; const s5 = scopeSql('a.newborn_id', p5, u); const L: Record<string, string> = { generated: 'Alert generated', acknowledged: 'Alert acknowledged', assessment_recorded: 'Clinical assessment recorded', response_documented: 'Clinical response recorded', escalated: 'Alert escalated', resolved: 'Alert resolved', closed: 'Alert closed' };
    for (const x of (await pool.query(`SELECT e.created_at, e.event_type, a.id AS alert_id, n.newborn_identifier, us.full_name FROM response_events e JOIN clinical_alerts a ON a.id=e.alert_id JOIN newborns n ON n.id=a.newborn_id LEFT JOIN users us ON us.id=e.user_id
      WHERE a.hospital_id=$1 AND ${s5} ORDER BY e.seq DESC LIMIT $2`, p5)).rows) out.push({ at: x.created_at, type: x.event_type, text: `${L[x.event_type] ?? x.event_type}: ${x.newborn_identifier}${x.full_name ? ` by ${x.full_name}` : ''}`, link: `/alerts/${x.alert_id}`, newborn: x.newborn_identifier });
  }
  out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()); res.json(out.slice(0, limit));
}));

dashboardRouter.get('/search', requireAuth, asyncHandler(async (req, res) => {
  const u = req.user!; const q = z.string().trim().min(1).max(60).parse(req.query.q); const out: { newborns: any[]; alerts: any[]; devices: any[] } = { newborns: [], alerts: [], devices: [] };
  if (u.permissions.has('newborn:read')) { const p: unknown[] = [u.hospitalId, q]; const sc = scopeSql('n.id', p, u); out.newborns = (await pool.query(`SELECT n.id, n.newborn_identifier, n.monitoring_status, un.name AS unit_name FROM newborns n LEFT JOIN units un ON un.id=n.unit_id WHERE n.hospital_id=$1 AND n.newborn_identifier ILIKE '%'||$2||'%' AND ${sc} ORDER BY n.newborn_identifier LIMIT 6`, p)).rows; }
  if (u.permissions.has('alert:read')) { const p: unknown[] = [u.hospitalId, q]; const sc = scopeSql('a.newborn_id', p, u); out.alerts = (await pool.query(`SELECT a.id, a.title, a.priority, a.status, n.newborn_identifier FROM clinical_alerts a JOIN newborns n ON n.id=a.newborn_id WHERE a.hospital_id=$1 AND (a.title ILIKE '%'||$2||'%' OR n.newborn_identifier ILIKE '%'||$2||'%') AND ${sc} ORDER BY a.created_at DESC LIMIT 6`, p)).rows; }
  if (u.permissions.has('device:read')) out.devices = (await pool.query(`SELECT id, device_identifier, connection_status FROM devices WHERE hospital_id=$1 AND device_identifier ILIKE '%'||$2||'%' ORDER BY device_identifier LIMIT 6`, [u.hospitalId, q])).rows;
  res.json(out);
}));
