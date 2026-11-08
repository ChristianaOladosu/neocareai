import type { Db } from '../../database/db.js';
import { pool } from '../../database/db.js';

export interface AuditEntry { hospitalId?: string | null; userId?: string | null; action: string; resourceType: string; resourceId?: string | null; metadata?: Record<string, unknown>; }

export async function audit(e: AuditEntry, db: Db = pool) {
  await db.query(
    'INSERT INTO audit_logs(hospital_id,user_id,action,resource_type,resource_id,metadata) VALUES ($1,$2,$3,$4,$5,$6)',
    [e.hospitalId ?? null, e.userId ?? null, e.action, e.resourceType, e.resourceId ?? null, JSON.stringify(e.metadata ?? {})],
  );
}
