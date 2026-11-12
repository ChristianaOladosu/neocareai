import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error', public extra?: Record<string, unknown>) { super(message); }
}
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message, ...(err.extra ?? {}) });
  if (err instanceof ZodError) return res.status(400).json({ error: 'validation_error', message: 'Invalid request', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  console.error(err);
  res.status(500).json({ error: 'internal_error', message: 'Unexpected server error' });
}
