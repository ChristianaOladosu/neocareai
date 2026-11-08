import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.API_PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://neocare:neocare_dev_only@localhost:5432/neocareai',
  sessionSecret: process.env.SESSION_SECRET ?? '',
  gatewayKey: process.env.GATEWAY_API_KEY ?? '',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  rootDir: root,
};

if (env.nodeEnv === 'production' && (env.sessionSecret.length < 32 || env.sessionSecret.startsWith('change-me'))) {
  throw new Error('SESSION_SECRET must be set to a strong value in production');
}
if (!env.sessionSecret) env.sessionSecret = 'dev-only-insecure-secret-do-not-use-in-production';
