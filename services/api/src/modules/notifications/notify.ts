import { pool, type Db } from '../../database/db.js';
import { publish } from '../../events/bus.js';

export type NotificationType = 'new_alert' | 'high_priority_alert' | 'unacknowledged_reminder' | 'device_disconnected' | 'monitoring_interrupted' | 'system';
/** Role-based routing: a notification type goes to users holding this permission (and, for patient-linked ones, who can access that newborn). */
export const ROUTE: Record<NotificationType, string> = { new_alert: 'alert:read', high_priority_alert: 'alert:read', unacknowledged_reminder: 'alert:acknowledge', device_disconnected: 'alert:read', monitoring_interrupted: 'alert:read', system: 'user:manage' };
export const TYPES = Object.keys(ROUTE) as NotificationType[];

export async function recipientsFor(hospitalId: string, permission: string, newbornId?: string, db: Db = pool): Promise<string[]> {
  const r = await db.query(
    `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN role_permissions rp ON rp.role_id=ur.role_id JOIN permissions p ON p.id=rp.permission_id
     WHERE u.hospital_id=$1 AND u.account_status='active' AND p.name=$2
       AND ($3::uuid IS NULL
            OR EXISTS (SELECT 1 FROM user_roles ur2 JOIN role_permissions rp2 ON rp2.role_id=ur2.role_id JOIN permissions p2 ON p2.id=rp2.permission_id WHERE ur2.user_id=u.id AND p2.name='newborn:all')
            OR EXISTS (SELECT 1 FROM newborn_team nt WHERE nt.user_id=u.id AND nt.newborn_id=$3 AND nt.unassigned_at IS NULL))`, [hospitalId, permission, newbornId ?? null]);
  return r.rows.map((x) => x.id);
}

export interface Notice { type: NotificationType; priority: 'low' | 'medium' | 'high'; title: string; body?: string; link?: string; alertId?: string; newbornId?: string; dedupeKey?: string }
/** Creates in-app notifications honouring each user's preferences. Email preference records a message in the development outbox only (no mail service is configured). */
export async function notify(hospitalId: string, n: Notice, db: Db = pool, recipients?: string[]) {
  const to = recipients ?? await recipientsFor(hospitalId, ROUTE[n.type], n.newbornId, db); let created = 0;
  for (const uid of to) {
    const pref = (await db.query('SELECT in_app, email FROM notification_preferences WHERE user_id=$1 AND type=$2', [uid, n.type])).rows[0] ?? { in_app: true, email: false };
    if (pref.in_app) {
      const r = await db.query(`INSERT INTO notifications(hospital_id,user_id,type,priority,title,body,link,alert_id,newborn_id,dedupe_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id`,
        [hospitalId, uid, n.type, n.priority, n.title, n.body ?? null, n.link ?? null, n.alertId ?? null, n.newbornId ?? null, n.dedupeKey ?? null]);
      created += r.rowCount ?? 0;
    }
    if (pref.email) { const u = (await db.query('SELECT email FROM users WHERE id=$1', [uid])).rows[0]; if (u) await db.query(`INSERT INTO email_outbox(hospital_id,to_email,kind,subject,body,link) VALUES ($1,$2,'notification',$3,$4,$5)`, [hospitalId, u.email, `[NeocareAI] ${n.title}`, n.body ?? n.title, n.link ?? null]); }
  }
  if (created) publish({ type: 'notification.created', hospitalId, payload: { type: n.type, priority: n.priority } });
  return created;
}
