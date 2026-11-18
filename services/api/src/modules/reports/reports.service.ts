import { pool } from '../../database/db.js';
import type { AuthUser } from '../../middleware/auth.js';
import { HttpError } from '../../utils/errors.js';
import { canAccessNewborn, scopeSql } from '../newborns/scope.js';

export interface Section { title: string; columns: string[]; rows: Array<Array<string | number | null>> }
export interface Report { kind: string; title: string; generatedAt: string; params: Record<string, unknown>; summary: Array<[string, string | number]>; sections: Section[]; note: string }
export const NOTE = 'SYNTHETIC DEMONSTRATION DATA. Not clinical records. Thresholds and rules are illustrative and not clinically approved.';

export const KINDS: Record<string, { label: string; group: 'clinical' | 'operational'; needsNewborn: boolean }> = {
  newborn_monitoring: { label: 'Newborn monitoring report', group: 'clinical', needsNewborn: true },
  measurements: { label: 'Physiological measurements', group: 'clinical', needsNewborn: true },
  trends: { label: 'Historical trend report (hourly)', group: 'clinical', needsNewborn: true },
  alert_history: { label: 'Alert history', group: 'clinical', needsNewborn: false },
  clinical_responses: { label: 'Clinical response report', group: 'clinical', needsNewborn: false },
  observation_history: { label: 'Observation history (notes)', group: 'clinical', needsNewborn: true },
  monitoring_summary: { label: 'Monitoring summary', group: 'operational', needsNewborn: false },
  device_connectivity: { label: 'Device connectivity', group: 'operational', needsNewborn: false },
  signal_quality: { label: 'Signal-quality summary', group: 'operational', needsNewborn: false },
  alert_distribution: { label: 'Alert distribution', group: 'operational', needsNewborn: false },
  acknowledgement_statistics: { label: 'Acknowledgement statistics', group: 'operational', needsNewborn: false },
  response_documentation: { label: 'Response documentation statistics', group: 'operational', needsNewborn: false },
};
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().replace('T', ' ').slice(0, 19) : d == null ? null : String(d));
const r1 = (n: unknown) => (n == null ? null : Math.round(Number(n) * 10) / 10);

export async function buildReport(u: AuthUser, kind: string, p: { from: string; to: string; newbornId?: string }): Promise<Report> {
  const def = KINDS[kind]; if (!def) throw new HttpError(400, 'Unknown report type', 'validation_error');
  if (!u.permissions.has(def.group === 'clinical' ? 'reports:clinical' : 'reports:operational')) throw new HttpError(403, 'Insufficient permissions', 'forbidden');
  if (def.needsNewborn && !p.newbornId) throw new HttpError(400, 'Choose a newborn for this report.', 'validation_error');
  let ident = ''; if (p.newbornId) { if (!(await canAccessNewborn(u, p.newbornId))) throw new HttpError(404, 'Newborn not found', 'not_found'); ident = (await pool.query('SELECT newborn_identifier FROM newborns WHERE id=$1', [p.newbornId])).rows[0].newborn_identifier; }
  const base: Report = { kind, title: `${def.label}${ident ? ` — ${ident}` : ''}`, generatedAt: new Date().toISOString(), params: p, summary: [], sections: [], note: NOTE };
  const A = [u.hospitalId, p.from, p.to, p.newbornId ?? null]; // $1 hospital $2 from $3 to $4 newborn
  const sc = (alias: string, arr: unknown[]) => scopeSql(alias, arr, u);
  const q = async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows;
  const S = (title: string, columns: string[], rows: any[][]): Section => ({ title, columns, rows });

  switch (kind) {
    case 'newborn_monitoring': {
      const st = await q(`SELECT measurement_type, count(*)::int n, min(value) mn, max(value) mx, avg(value) av, count(*) FILTER (WHERE quality_status='good')::int good FROM observations WHERE newborn_id=$4 AND $1::uuid IS NOT NULL AND observed_at BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 1`, A);
      base.sections.push(S('Measurements by parameter', ['Parameter', 'Readings', 'Min', 'Max', 'Mean', 'Good-signal readings'], st.map((x) => [x.measurement_type, x.n, r1(x.mn), r1(x.mx), r1(x.av), x.good])));
      const al = await q(`SELECT created_at, category, priority, status, title FROM clinical_alerts WHERE newborn_id=$4 AND hospital_id=$1 AND created_at BETWEEN $2 AND $3 ORDER BY created_at`, A);
      base.sections.push(S('Alerts', ['Generated', 'Category', 'Priority', 'Status', 'Title'], al.map((x) => [iso(x.created_at), x.category, x.priority, x.status, x.title])));
      const ev = await q(`SELECT e.created_at, e.event_type, u.full_name FROM response_events e JOIN clinical_alerts a ON a.id=e.alert_id LEFT JOIN users u ON u.id=e.user_id WHERE a.newborn_id=$4 AND a.hospital_id=$1 AND e.created_at BETWEEN $2 AND $3 ORDER BY e.seq`, A);
      base.sections.push(S('Response events', ['Time', 'Event', 'By'], ev.map((x) => [iso(x.created_at), x.event_type, x.full_name ?? 'System'])));
      base.summary = [['Total readings', st.reduce((a, x) => a + x.n, 0)], ['Alerts', al.length], ['Response events', ev.length]]; break; }
    case 'measurements': {
      const r = await q(`SELECT o.observed_at, o.measurement_type, o.value, o.unit, o.quality_status, o.source FROM observations o JOIN newborns n ON n.id=o.newborn_id WHERE n.hospital_id=$1 AND o.newborn_id=$4 AND o.observed_at BETWEEN $2 AND $3 ORDER BY o.observed_at LIMIT 5000`, A);
      base.sections.push(S('Measurements (max 5000 rows)', ['Observed', 'Parameter', 'Value', 'Unit', 'Signal quality', 'Source'], r.map((x) => [iso(x.observed_at), x.measurement_type, x.value, x.unit, x.quality_status, x.source]))); base.summary = [['Rows', r.length]]; break; }
    case 'trends': {
      const r = await q(`SELECT date_trunc('hour', o.observed_at) h, o.measurement_type t, count(*)::int n, min(o.value) mn, max(o.value) mx, avg(o.value) av FROM observations o JOIN newborns n ON n.id=o.newborn_id WHERE n.hospital_id=$1 AND o.newborn_id=$4 AND o.observed_at BETWEEN $2 AND $3 AND o.quality_status IN ('good','unknown') GROUP BY 1,2 ORDER BY 1,2`, A);
      base.sections.push(S('Hourly values (reliable readings only)', ['Hour', 'Parameter', 'Readings', 'Min', 'Max', 'Mean'], r.map((x) => [iso(x.h), x.t, x.n, r1(x.mn), r1(x.mx), r1(x.av)]))); break; }
    case 'alert_history': { const ps: unknown[] = [u.hospitalId, p.from, p.to, p.newbornId ?? null]; const s = sc('a.newborn_id', ps);
      const r = await q(`SELECT a.created_at, n.newborn_identifier, a.category, a.priority, a.status, a.title, a.occurrence_count, (SELECT min(e.created_at) FROM response_events e WHERE e.alert_id=a.id AND e.event_type='acknowledged') ack FROM clinical_alerts a JOIN newborns n ON n.id=a.newborn_id WHERE a.hospital_id=$1 AND a.created_at BETWEEN $2 AND $3 AND ($4::uuid IS NULL OR a.newborn_id=$4) AND ${s} ORDER BY a.created_at DESC`, ps);
      base.sections.push(S('Alerts', ['Generated', 'Newborn', 'Category', 'Priority', 'Status', 'Title', 'Occurrences', 'Acknowledged'], r.map((x) => [iso(x.created_at), x.newborn_identifier, x.category, x.priority, x.status, x.title, x.occurrence_count, iso(x.ack)]))); base.summary = [['Alerts', r.length]]; break; }
    case 'clinical_responses': { const ps: unknown[] = [u.hospitalId, p.from, p.to, p.newbornId ?? null]; const s = sc('a.newborn_id', ps);
      const r = await q(`SELECT e.created_at, n.newborn_identifier, a.title, e.event_type, COALESCE(us.full_name,'System') who FROM response_events e JOIN clinical_alerts a ON a.id=e.alert_id JOIN newborns n ON n.id=a.newborn_id LEFT JOIN users us ON us.id=e.user_id WHERE a.hospital_id=$1 AND e.created_at BETWEEN $2 AND $3 AND ($4::uuid IS NULL OR a.newborn_id=$4) AND ${s} ORDER BY e.seq`, ps);
      base.sections.push(S('Response events', ['Time', 'Newborn', 'Alert', 'Event', 'By'], r.map((x) => [iso(x.created_at), x.newborn_identifier, x.title, x.event_type, x.who]))); break; }
    case 'observation_history': { const r = await q(`SELECT c.created_at, c.note_type, u.full_name, c.note_text FROM clinical_notes c JOIN users u ON u.id=c.author_id JOIN newborns n ON n.id=c.newborn_id WHERE n.hospital_id=$1 AND c.newborn_id=$4 AND c.created_at BETWEEN $2 AND $3 ORDER BY c.created_at`, A);
      base.sections.push(S('Notes and observations', ['Time', 'Type', 'Author', 'Text'], r.map((x) => [iso(x.created_at), x.note_type, x.full_name, x.note_text]))); break; }
    case 'monitoring_summary': { const ps: unknown[] = [u.hospitalId, p.from, p.to]; const s = sc('n.id', ps);
      const r = await q(`SELECT n.newborn_identifier, n.monitoring_status, d.device_identifier, d.connection_status, count(o.id)::int readings, count(o.id) FILTER (WHERE o.quality_status='good')::int good, max(o.observed_at) last FROM newborns n LEFT JOIN device_assignments da ON da.newborn_id=n.id AND da.unassigned_at IS NULL LEFT JOIN devices d ON d.id=da.device_id
        LEFT JOIN observations o ON o.newborn_id=n.id AND o.observed_at BETWEEN $2 AND $3 WHERE n.hospital_id=$1 AND ${s} GROUP BY 1,2,3,4 ORDER BY 1`, ps);
      base.sections.push(S('Per newborn', ['Newborn', 'Status', 'Device', 'Connection', 'Readings', 'Good-signal %', 'Last reading'], r.map((x) => [x.newborn_identifier, x.monitoring_status, x.device_identifier, x.connection_status, x.readings, x.readings ? Math.round((x.good / x.readings) * 100) : null, iso(x.last)])));
      base.summary = [['Newborns', r.length], ['Monitored', r.filter((x) => x.monitoring_status === 'monitoring').length]]; break; }
    case 'device_connectivity': { const r = await q(`SELECT d.device_identifier, d.is_simulated, d.connection_status, d.last_seen_at, n.newborn_identifier, (SELECT count(*)::int FROM audit_logs a WHERE a.resource_id=d.id::text AND a.action='device.disconnected' AND a.created_at BETWEEN $2 AND $3) disc FROM devices d LEFT JOIN device_assignments da ON da.device_id=d.id AND da.unassigned_at IS NULL LEFT JOIN newborns n ON n.id=da.newborn_id WHERE d.hospital_id=$1 ORDER BY 1`, [A[0], A[1], A[2]]);
      base.sections.push(S('Devices', ['Device', 'Simulated', 'Connection', 'Last seen', 'Assigned newborn', 'Disconnections in range'], r.map((x) => [x.device_identifier, x.is_simulated ? 'yes' : 'no', x.connection_status, iso(x.last_seen_at), x.newborn_identifier, x.disc]))); break; }
    case 'signal_quality': { const ps: unknown[] = [u.hospitalId, p.from, p.to]; const s = sc('o.newborn_id', ps);
      const r = await q(`SELECT o.quality_status q, count(*)::int n FROM observations o JOIN newborns n ON n.id=o.newborn_id WHERE n.hospital_id=$1 AND o.observed_at BETWEEN $2 AND $3 AND ${s} GROUP BY 1 ORDER BY 2 DESC`, ps); const tot = r.reduce((a, x) => a + x.n, 0);
      base.sections.push(S('Readings by signal quality', ['Signal quality', 'Readings', 'Share %'], r.map((x) => [x.q, x.n, tot ? Math.round((x.n / tot) * 100) : 0]))); base.summary = [['Readings', tot]]; break; }
    case 'alert_distribution': { const ps: unknown[] = [u.hospitalId, p.from, p.to]; const s = sc('a.newborn_id', ps);
      const r = await q(`SELECT a.category, a.priority, a.status, count(*)::int n FROM clinical_alerts a WHERE a.hospital_id=$1 AND a.created_at BETWEEN $2 AND $3 AND ${s} GROUP BY 1,2,3 ORDER BY 1,2,3`, ps);
      base.sections.push(S('Alerts by category, priority and status', ['Category', 'Priority', 'Status', 'Alerts'], r.map((x) => [x.category, x.priority, x.status, x.n]))); break; }
    case 'acknowledgement_statistics': { const ps: unknown[] = [u.hospitalId, p.from, p.to]; const s = sc('a.newborn_id', ps);
      const r = await q(`SELECT a.priority, count(*)::int alerts, count(ack.t)::int acked, avg(extract(epoch FROM ack.t - a.created_at)/60) avg_min, percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ack.t - a.created_at)/60) med_min FROM clinical_alerts a LEFT JOIN LATERAL (SELECT min(e.created_at) t FROM response_events e WHERE e.alert_id=a.id AND e.event_type='acknowledged') ack ON true WHERE a.hospital_id=$1 AND a.created_at BETWEEN $2 AND $3 AND ${s} GROUP BY 1 ORDER BY 1`, ps);
      base.sections.push(S('Time to acknowledge (minutes)', ['Priority', 'Alerts', 'Acknowledged', 'Mean', 'Median'], r.map((x) => [x.priority, x.alerts, x.acked, r1(x.avg_min), r1(x.med_min)]))); break; }
    case 'response_documentation': { const ps: unknown[] = [u.hospitalId, p.from, p.to]; const s = sc('a.newborn_id', ps);
      const r = await q(`SELECT e.event_type, count(*)::int n FROM response_events e JOIN clinical_alerts a ON a.id=e.alert_id WHERE a.hospital_id=$1 AND e.created_at BETWEEN $2 AND $3 AND ${s} GROUP BY 1 ORDER BY 2 DESC`, ps);
      const c = (await q(`SELECT count(*)::int total, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM response_events e WHERE e.alert_id=a.id AND e.event_type IN ('assessment_recorded','response_documented')))::int documented FROM clinical_alerts a WHERE a.hospital_id=$1 AND a.created_at BETWEEN $2 AND $3 AND ${s}`, ps))[0];
      base.sections.push(S('Events by type', ['Event', 'Count'], r.map((x) => [x.event_type, x.n]))); base.summary = [['Alerts in range', c.total], ['With a documented assessment or response', c.documented]]; break; }
  }
  return base;
}

const safe = (v: unknown) => { const s = v == null ? '' : String(v); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };   // CSV/formula injection protection
const esc = (v: unknown) => `"${safe(v).replace(/"/g, '""')}"`;
export function toCsv(r: Report): string {
  const out = [esc(r.title), esc(`Generated ${r.generatedAt}`), esc(r.note), ''];
  for (const [k, v] of r.summary) out.push([esc(k), esc(v)].join(','));
  for (const s of r.sections) { out.push('', esc(s.title), s.columns.map(esc).join(',')); for (const row of s.rows) out.push(row.map(esc).join(',')); }
  return '\ufeff' + out.join('\r\n');
}
