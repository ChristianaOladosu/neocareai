import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { migrate } from './migrate.js';

// SYNTHETIC DEMO DATA ONLY. Demo passwords are for local development; never reuse in a real deployment.
export const DEMO_PASSWORD = 'DemoPass#2026';

const PERMS = ['newborn:read', 'newborn:write', 'observation:read', 'observation:write', 'alert:read', 'alert:acknowledge', 'alert:assess',
  'alert:escalate', 'alert:resolve', 'response:read', 'device:read', 'device:manage', 'user:manage', 'unit:manage', 'audit:read'];
const ROLE_PERMS: Record<string, string[]> = {
  Doctor: ['newborn:read', 'observation:read', 'observation:write', 'alert:read', 'alert:acknowledge', 'alert:assess', 'alert:escalate', 'alert:resolve', 'response:read', 'device:read'],
  Nurse: ['newborn:read', 'observation:read', 'observation:write', 'alert:read', 'alert:acknowledge', 'response:read', 'device:read'],
  // Administrators deliberately get no observation/alert permissions (no unrestricted clinical access).
  Administrator: ['newborn:read', 'newborn:write', 'device:read', 'device:manage', 'user:manage', 'unit:manage', 'audit:read'],
};

export async function seed(reset = false) {
  await migrate(false);
  if (reset) {
    await pool.query('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only; ALTER TABLE response_events DISABLE TRIGGER response_events_append_only; ALTER TABLE clinical_assessments DISABLE TRIGGER assessments_append_only');
    await pool.query(`TRUNCATE signal_quality_assessments, observations, clinical_assessments, response_events, clinical_alerts, alert_rules, device_assignments, devices,
      newborns, user_roles, role_permissions, roles, permissions, users, units, hospitals, audit_logs RESTART IDENTITY CASCADE`);
    await pool.query('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only; ALTER TABLE response_events ENABLE TRIGGER response_events_append_only; ALTER TABLE clinical_assessments ENABLE TRIGGER assessments_append_only');
  }
  const already = await pool.query('SELECT count(*)::int AS n FROM hospitals');
  if (already.rows[0].n > 0) return;

  for (const p of PERMS) await pool.query('INSERT INTO permissions(name) VALUES ($1)', [p]);
  for (const [role, perms] of Object.entries(ROLE_PERMS)) {
    const r = await pool.query('INSERT INTO roles(name) VALUES ($1) RETURNING id', [role]);
    for (const p of perms) await pool.query('INSERT INTO role_permissions SELECT $1, id FROM permissions WHERE name=$2', [r.rows[0].id, p]);
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const hosp = async (name: string, loc: string) => (await pool.query('INSERT INTO hospitals(name,location) VALUES ($1,$2) RETURNING id', [name, loc])).rows[0].id as string;
  const unit = async (h: string, name: string) => (await pool.query('INSERT INTO units(hospital_id,name,unit_type) VALUES ($1,$2,$3) RETURNING id', [h, name, 'NICU'])).rows[0].id as string;
  const user = async (h: string, name: string, email: string, role: string) => {
    const u = await pool.query('INSERT INTO users(hospital_id,full_name,email,password_hash) VALUES ($1,$2,$3,$4) RETURNING id', [h, name, email, hash]);
    await pool.query('INSERT INTO user_roles SELECT $1, id FROM roles WHERE name=$2', [u.rows[0].id, role]);
  };

  const hA = await hosp('Demo General Hospital (synthetic)', 'Demo City');
  const hB = await hosp('Demo Teaching Hospital B (synthetic)', 'Other Demo City');
  const uA = await unit(hA, 'NICU A'); const uA2 = await unit(hA, 'Special Care Baby Unit'); const uB = await unit(hB, 'NICU B');

  await user(hA, 'Dr. Demo Doctor', 'doctor@demo.neocareai.test', 'Doctor');
  await user(hA, 'Nurse Demo', 'nurse@demo.neocareai.test', 'Nurse');
  await user(hA, 'Admin Demo', 'admin@demo.neocareai.test', 'Administrator');
  await user(hB, 'Dr. Other Hospital', 'doctor.b@demo.neocareai.test', 'Doctor');

  const baby = async (h: string, u: string, id: string, ga: number) => (await pool.query(
    `INSERT INTO newborns(hospital_id,unit_id,newborn_identifier,date_of_birth,gestational_age_weeks) VALUES ($1,$2,$3,current_date - 3,$4) RETURNING id`, [h, u, id, ga])).rows[0].id as string;
  const n1 = await baby(hA, uA, 'NB-0001', 34); const n2 = await baby(hA, uA, 'NB-0002', 36); const n3 = await baby(hA, uA2, 'NB-0003', 38);
  await baby(hB, uB, 'NB-0001', 35); // same identifier allowed in a different hospital

  const dev = async (h: string, id: string, sim: boolean) => (await pool.query(
    `INSERT INTO devices(hospital_id,device_identifier,manufacturer,model,is_simulated) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [h, id, sim ? 'NeocareAI' : null, sim ? 'Synthetic Monitor Simulator' : null, sim])).rows[0].id as string;
  for (const [id, n] of [['SIM-MON-01', n1], ['SIM-MON-02', n2], ['SIM-MON-03', n3]] as const) {
    const d = await dev(hA, id, true);
    await pool.query('INSERT INTO device_assignments(device_id,newborn_id) VALUES ($1,$2)', [d, n]);
  }
  await dev(hB, 'SIM-MON-B1', true);
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seed(process.argv.includes('--reset')).then(() => { console.log('seed complete'); return pool.end(); }).catch((e) => { console.error(e); process.exit(1); });
}
