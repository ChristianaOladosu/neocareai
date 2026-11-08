import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorMiddleware } from './utils/errors.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { newbornsRouter } from './modules/newborns/newborns.routes.js';
import { observationsRouter, monitoringRouter, gatewayRouter } from './modules/observations/observations.routes.js';
import { alertsRouter, responseLogRouter } from './modules/alerts/alerts.routes.js';
import { devicesRouter } from './modules/devices/devices.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.webOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', rateLimit({ windowMs: 60_000, limit: env.nodeEnv === 'test' ? 100000 : 600, standardHeaders: true, legacyHeaders: false }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, synthetic: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/newborns', newbornsRouter);
  app.use('/api/newborns', observationsRouter);
  app.use('/api/monitoring', monitoringRouter);
  app.use('/api/gateway', gatewayRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/response-log', responseLogRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'Unknown endpoint' }));
  app.use(errorMiddleware);
  return app;
}
