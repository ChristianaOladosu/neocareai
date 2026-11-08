import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool } from '../database/db.js';
import { HttpError } from '../utils/errors.js';

export interface AuthUser { id: string; fullName: string; email: string; hospitalId: string; roles: string[]; permissions: Set<string>; }
declare module 'express-serve-static-core' { interface Request { user?: AuthUser } }

export const COOKIE = 'neocare_session';

export function signSession(userId: string) {
  return jwt.sign({ sub: userId }, env.sessionSecret, { expiresIn: '8h' });
}

export async function loadUser(userId: string): Promise<AuthUser | null> {
  const u = await pool.query('SELECT id, full_name, email, hospital_id, account_status FROM users WHERE id=$1', [userId]);
  if (!u.rows[0] || u.rows[0].account_status !== 'active') return null;
  const r = await pool.query(
    `SELECT r.name AS role, p.name AS perm FROM user_roles ur JOIN roles r ON r.id=ur.role_id
     LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=$1`, [userId]);
  return {
    id: u.rows[0].id, fullName: u.rows[0].full_name, email: u.rows[0].email, hospitalId: u.rows[0].hospital_id,
    roles: [...new Set(r.rows.map((x) => x.role as string))],
    permissions: new Set(r.rows.map((x) => x.perm as string).filter(Boolean)),
  };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new HttpError(401, 'Authentication required', 'unauthenticated');
    let sub: string;
    try { sub = (jwt.verify(token, env.sessionSecret) as { sub: string }).sub; }
    catch { throw new HttpError(401, 'Session invalid or expired', 'unauthenticated'); }
    const user = await loadUser(sub); // permissions re-read every request so revocation is immediate
    if (!user) throw new HttpError(401, 'Account unavailable', 'unauthenticated');
    req.user = user;
    next();
  } catch (e) { next(e); }
}

export const requirePermission = (...perms: string[]) => (req: Request, _res: Response, next: NextFunction) => {
  const u = req.user;
  if (!u) return next(new HttpError(401, 'Authentication required', 'unauthenticated'));
  if (!perms.every((p) => u.permissions.has(p))) return next(new HttpError(403, 'Insufficient permissions', 'forbidden'));
  next();
};
