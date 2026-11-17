import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { pool, tx } from '../../database/db.js';
import { env } from '../../config/env.js';
import { asyncHandler, HttpError } from '../../utils/errors.js';
import { audit } from '../audit/audit.service.js';
import { notify } from '../notifications/notify.js';

/**
 * Public account flows. Nothing here grants clinical access: sign-up needs the hospital's organisation code, the email must be verified,
 * and an administrator must approve the account and assign a role. Email is NOT sent anywhere: messages are recorded in a development outbox.
 */
export const accountRouter = Router();
const lim = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, skip: () => env.nodeEnv === 'test' });
const registrationEnabled = () => process.env.ALLOW_REGISTRATION !== 'false';
const devOutbox = () => env.nodeEnv !== 'production' && process.env.DEV_MAIL_OUTBOX !== 'false';
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const password = z.string().min(10, 'Use at least 10 characters').max(128);

async function issueToken(userId: string, kind: 'verify_email' | 'reset_password', hours: number) {
  const token = randomBytes(32).toString('base64url');
  await pool.query(`UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND kind=$2 AND used_at IS NULL`, [userId, kind]);
  await pool.query(`INSERT INTO auth_tokens(user_id,kind,token_hash,expires_at) VALUES ($1,$2,$3, now() + ($4 || ' hours')::interval)`, [userId, kind, hash(token), String(hours)]);
  return token;
}
async function queueMail(hospitalId: string, to: string, kind: string, subject: string, body: string, link: string) {
  await pool.query('INSERT INTO email_outbox(hospital_id,to_email,kind,subject,body,link) VALUES ($1,$2,$3,$4,$5,$6)', [hospitalId, to, kind, subject, body, link]);
}

accountRouter.get('/registration-info', (_req, res) => res.json({ enabled: registrationEnabled(), requiresOrganisationCode: true, emailDelivery: devOutbox() ? 'development-outbox' : 'not-configured' }));

accountRouter.post('/signup', lim, asyncHandler(async (req, res) => {
  if (!registrationEnabled()) throw new HttpError(403, 'Self-registration is not enabled for this system.', 'registration_disabled');
  const b = z.object({ fullName: z.string().trim().min(2).max(120), email: z.string().email().max(200), password, organisationCode: z.string().trim().min(4).max(60) }).parse(req.body);
  const h = await pool.query('SELECT id FROM hospitals WHERE registration_code=$1 AND status=$2', [b.organisationCode, 'active']);
  if (!h.rows[0]) throw new HttpError(400, 'That organisation code is not valid.', 'invalid_organisation_code');
  const exists = await pool.query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [b.email]);
  const generic = { ok: true, message: 'Check your email to verify your address. An administrator must then approve your account before you can sign in.' };
  if (exists.rowCount) return res.status(202).json(generic);          // do not reveal whether an email is already registered
  const u = await pool.query(`INSERT INTO users(hospital_id,full_name,email,password_hash,account_status) VALUES ($1,$2,$3,$4,'pending_verification') RETURNING id`, [h.rows[0].id, b.fullName, b.email, await bcrypt.hash(b.password, 10)]);
  const token = await issueToken(u.rows[0].id, 'verify_email', 24); const link = `${env.webOrigin}/verify-email?token=${token}`;
  await queueMail(h.rows[0].id, b.email, 'verify_email', 'Verify your NeocareAI email address', `Open this link to verify your email address (valid 24 hours): ${link}`, link);
  await audit({ hospitalId: h.rows[0].id, userId: u.rows[0].id, action: 'account.signup', resourceType: 'user', resourceId: u.rows[0].id });
  res.status(202).json({ ...generic, ...(devOutbox() ? { devLink: link, devNote: 'Development mode: no email service is configured, so the verification link is shown here instead of being emailed.' } : {}) });
}));

async function consume(token: string, kind: 'verify_email' | 'reset_password') {
  const r = await pool.query(`SELECT id, user_id FROM auth_tokens WHERE token_hash=$1 AND kind=$2 AND used_at IS NULL AND expires_at > now()`, [hash(token), kind]);
  if (!r.rows[0]) throw new HttpError(400, 'This link is invalid or has expired. Request a new one.', 'invalid_token');
  return r.rows[0] as { id: string; user_id: string };
}
accountRouter.post('/verify-email', lim, asyncHandler(async (req, res) => {
  const { token } = z.object({ token: z.string().min(20).max(200) }).parse(req.body); const t = await consume(token, 'verify_email');
  const u = await tx(async (c) => {
    await c.query('UPDATE auth_tokens SET used_at=now() WHERE id=$1', [t.id]);
    return (await c.query(`UPDATE users SET email_verified_at=now(), account_status=CASE WHEN account_status='pending_verification' THEN 'pending_approval' ELSE account_status END, updated_at=now() WHERE id=$1 RETURNING hospital_id, full_name, account_status`, [t.user_id])).rows[0];
  });
  await audit({ hospitalId: u.hospital_id, userId: t.user_id, action: 'account.email_verified', resourceType: 'user', resourceId: t.user_id });
  if (u.account_status === 'pending_approval') await notify(u.hospital_id, { type: 'system', priority: 'low', title: 'New account awaiting approval', body: `${u.full_name} verified their email and is waiting for approval.`, link: '/settings?tab=team' });
  res.json({ ok: true, status: u.account_status });
}));

accountRouter.post('/forgot-password', lim, asyncHandler(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body); const u = (await pool.query(`SELECT id, hospital_id FROM users WHERE lower(email)=lower($1) AND account_status IN ('active','pending_approval')`, [email])).rows[0];
  const generic = { ok: true, message: 'If an account exists for that email, a reset link has been sent.' }; let devLink: string | undefined;
  if (u) { const token = await issueToken(u.id, 'reset_password', 1); devLink = `${env.webOrigin}/reset-password?token=${token}`;
    await queueMail(u.hospital_id, email, 'reset_password', 'Reset your NeocareAI password', `Open this link to choose a new password (valid 1 hour): ${devLink}`, devLink);
    await audit({ hospitalId: u.hospital_id, userId: u.id, action: 'account.password_reset_requested', resourceType: 'user', resourceId: u.id }); }
  res.json({ ...generic, ...(devOutbox() && devLink ? { devLink, devNote: 'Development mode: no email service is configured, so the reset link is shown here instead of being emailed.' } : {}) });
}));
accountRouter.post('/reset-password', lim, asyncHandler(async (req, res) => {
  const b = z.object({ token: z.string().min(20).max(200), password }).parse(req.body); const t = await consume(b.token, 'reset_password');
  const u = await tx(async (c) => { await c.query('UPDATE auth_tokens SET used_at=now() WHERE id=$1', [t.id]); return (await c.query('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1 RETURNING hospital_id', [t.user_id, await bcrypt.hash(b.password, 10)])).rows[0]; });
  await audit({ hospitalId: u.hospital_id, userId: t.user_id, action: 'account.password_reset', resourceType: 'user', resourceId: t.user_id });
  res.json({ ok: true });
}));
