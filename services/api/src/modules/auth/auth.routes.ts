import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../../database/db.js';
import { asyncHandler, HttpError } from '../../utils/errors.js';
import { COOKIE, requireAuth, requirePermission, signSession } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { audit } from '../audit/audit.service.js';

export const authRouter = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, skip: () => env.nodeEnv === 'test' });
const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, secure: env.nodeEnv === 'production', maxAge: 8 * 3600_000, path: '/' };

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
authRouter.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const r = await pool.query('SELECT id, hospital_id, password_hash, account_status FROM users WHERE lower(email)=lower($1)', [email]);
  const row = r.rows[0];
  const ok = row ? await bcrypt.compare(password, row.password_hash) : await bcrypt.compare(password, bcrypt.hashSync('x', 10));
  // Only after the correct password do we reveal that an account is waiting on verification or approval.
  if (row && ok && row.account_status === 'pending_verification') throw new HttpError(403, 'Please verify your email address first. Check your inbox for the verification link.', 'account_pending_verification');
  if (row && ok && row.account_status === 'pending_approval') throw new HttpError(403, 'Your email is verified. An administrator still needs to approve your account.', 'account_pending_approval');
  if (!row || !ok || row.account_status !== 'active') {
    await audit({ hospitalId: row?.hospital_id, userId: row?.id, action: 'auth.login_failed', resourceType: 'user', metadata: { email } });
    throw new HttpError(401, 'Invalid email or password', 'invalid_credentials');
  }
  await pool.query('UPDATE users SET last_login_at=now() WHERE id=$1', [row.id]);
  res.cookie(COOKIE, signSession(row.id), cookieOpts);
  await audit({ hospitalId: row.hospital_id, userId: row.id, action: 'auth.login', resourceType: 'user', resourceId: row.id });
  res.json({ ok: true });
}));

authRouter.post('/logout', asyncHandler(async (req, res) => {
  res.clearCookie(COOKIE, { ...cookieOpts, maxAge: 0 });
  if (req.user) {
    await audit({ hospitalId: req.user.hospitalId, userId: req.user.id, action: 'auth.logout', resourceType: 'user', resourceId: req.user.id });
  }
  res.json({ ok: true });
}));

authRouter.get('/me', requireAuth, (req, res) => {
  const u = req.user!;
  res.json({ id: u.id, fullName: u.fullName, email: u.email, hospitalId: u.hospitalId, roles: u.roles, permissions: [...u.permissions] });
});

// Account creation is restricted to administrators (no public self-registration on a clinical system).
const registerSchema = z.object({
  fullName: z.string().min(2).max(120), email: z.string().email(),
  password: z.string().min(10).max(128), role: z.enum(['Doctor', 'Medical Officer', 'Nurse', 'Clinical Supervisor', 'Administrator']),
});
authRouter.post('/register', requireAuth, requirePermission('user:manage'), asyncHandler(async (req, res) => {
  const b = registerSchema.parse(req.body);
  const exists = await pool.query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [b.email]);
  if (exists.rowCount) throw new HttpError(409, 'Email already registered', 'duplicate');
  const hash = await bcrypt.hash(b.password, 10);
  const u = await pool.query('INSERT INTO users(hospital_id,full_name,email,password_hash,email_verified_at) VALUES ($1,$2,$3,$4,now()) RETURNING id', [req.user!.hospitalId, b.fullName, b.email, hash]);
  await pool.query('INSERT INTO user_roles(user_id, role_id) SELECT $1, id FROM roles WHERE name=$2', [u.rows[0].id, b.role]);
  await audit({ hospitalId: req.user!.hospitalId, userId: req.user!.id, action: 'user.create', resourceType: 'user', resourceId: u.rows[0].id, metadata: { role: b.role } });
  res.status(201).json({ id: u.rows[0].id });
}));
