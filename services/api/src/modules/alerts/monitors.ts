import { pool } from '../../database/db.js';
import { createAlert } from './alert-engine.js';
import { notify } from '../notifications/notify.js';
import { STALE_AFTER_SECONDS } from '../observations/observations.service.js';
import { settingValue } from '../hospitals/settings.routes.js';

const NAME: Record<string, string> = { heart_rate: 'Heart rate', respiratory_rate: 'Respiratory rate', spo2: 'Oxygen saturation', temperature: 'Temperature' };

/**
 * Periodic checks that need no incoming message: device disconnection, missing measurements, silent data loss, and unacknowledged-alert reminders.
 * These raise DATA and DEVICE alerts (never physiological ones) and are deliberately worded so. They never resolve anything.
 */
export async function runMonitors() {
  const r = { deviceAlerts: 0, missingDataAlerts: 0, interruptions: 0, reminders: 0 };
  const open = (n: string, cat: string) => pool.query(`SELECT 1 FROM clinical_alerts WHERE newborn_id=$1 AND category=$2 AND status NOT IN ('resolved','closed') LIMIT 1`, [n, cat]);
  const nb = await pool.query(`SELECT n.id, n.hospital_id, n.newborn_identifier, d.id AS device_id, d.device_identifier, d.connection_status, d.last_seen_at
    FROM newborns n JOIN device_assignments da ON da.newborn_id=n.id AND da.unassigned_at IS NULL JOIN devices d ON d.id=da.device_id WHERE n.monitoring_status='monitoring'`);
  for (const x of nb.rows) {
    if (x.connection_status === 'disconnected') {
      if (!(await open(x.id, 'device_disconnection')).rowCount) {
        await createAlert(pool, x.hospital_id, x.id, { category: 'device_disconnection', priority: 'medium', title: 'Monitoring device disconnected',
          explanation: `Device ${x.device_identifier} is disconnected, so measurements are no longer current. This is a device concern: it says nothing about the newborn's condition. Check the connection and the newborn.`, evidence: { triggering: [], context: [], qualityOfTriggering: [], illustrative: false, ruleKey: 'system-device-disconnection', ruleVersion: 1 }, deviceId: x.device_id });
        await notify(x.hospital_id, { type: 'device_disconnected', priority: 'medium', title: `Device disconnected: ${x.newborn_identifier}`, body: `${x.device_identifier} stopped connecting. Data is not current.`, link: `/newborns/${x.id}`, newbornId: x.id, dedupeKey: `device:${x.device_id}:${x.last_seen_at?.getTime() ?? 0}` });
        r.deviceAlerts++;
      }
      continue;
    }
    const lat = (await pool.query(`SELECT measurement_type, max(observed_at) AS at FROM observations WHERE newborn_id=$1 GROUP BY measurement_type`, [x.id])).rows;
    const age = (t: string) => { const v = lat.find((l) => l.measurement_type === t); return v ? (Date.now() - v.at.getTime()) / 1000 : null; };
    const types = Object.keys(NAME); const current = types.filter((t) => (age(t) ?? Infinity) <= STALE_AFTER_SECONDS); const seen = types.filter((t) => age(t) !== null);
    if (seen.length && !current.length) {   // connected but nothing arriving at all: a monitoring interruption
      const bucket = Math.floor((Date.now() - 0) / (10 * 60_000));
      r.interruptions += await notify(x.hospital_id, { type: 'monitoring_interrupted', priority: 'medium', title: `Monitoring interrupted: ${x.newborn_identifier}`, body: 'The device is connected but no measurements have arrived recently.', link: `/newborns/${x.id}`, newbornId: x.id, dedupeKey: `interrupt:${x.id}:${bucket}` });
    } else if (current.length) {
      const missing = seen.filter((t) => !current.includes(t));
      if (missing.length && !(await open(x.id, 'missing_data')).rowCount) {
        await createAlert(pool, x.hospital_id, x.id, { category: 'missing_data', priority: 'low', title: 'Some measurements are missing', explanation: `${missing.map((t) => NAME[t]).join(' and ')} ${missing.length > 1 ? 'have' : 'has'} not been received recently while other measurements are still arriving. A missing reading is a data concern, not an abnormal reading.`, evidence: { triggering: [], context: [], qualityOfTriggering: [], illustrative: false, ruleKey: 'system-missing-data', ruleVersion: 1 } });
        r.missingDataAlerts++;
      }
    }
  }
  // Reminders for alerts nobody has acknowledged yet (repeats every reminder interval, at most 6 times). The interval is a per-hospital setting.
  for (const h of (await pool.query(`SELECT id FROM hospitals WHERE status='active'`)).rows) {
    const mins = Number(process.env.REMINDER_MINUTES) || await settingValue(h.id, 'reminder_minutes');
    const un = await pool.query(`SELECT a.id, a.hospital_id, a.newborn_id, a.title, a.priority, n.newborn_identifier, extract(epoch FROM now()-a.created_at)/60 AS mins FROM clinical_alerts a JOIN newborns n ON n.id=a.newborn_id WHERE a.hospital_id=$1 AND a.status='awaiting_acknowledgement' AND a.created_at < now() - ($2 || ' minutes')::interval`, [h.id, String(mins)]);
    for (const a of un.rows) {
      const k = Math.min(6, Math.floor(a.mins / mins));
      r.reminders += await notify(a.hospital_id, { type: 'unacknowledged_reminder', priority: a.priority, title: `Still unacknowledged: ${a.newborn_identifier}`, body: `${a.title} has waited about ${Math.round(a.mins)} minutes.`, link: `/alerts/${a.id}`, alertId: a.id, newbornId: a.newborn_id, dedupeKey: `alert:${a.id}:reminder:${k}` });
    }
    // Retention applies to operational data only (notifications, report history, development outbox). Clinical records and audit history are never purged here.
    await pool.query(`DELETE FROM notifications WHERE hospital_id=$1 AND created_at < now() - ($2 || ' days')::interval`, [h.id, String(await settingValue(h.id, 'notification_retention_days'))]);
    await pool.query(`DELETE FROM reports WHERE hospital_id=$1 AND created_at < now() - ($2 || ' days')::interval`, [h.id, String(await settingValue(h.id, 'report_history_retention_days'))]);
  }
  return r;
}
