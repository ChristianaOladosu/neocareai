import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { ensureDefaultRules } from '../modules/alerts/alert-engine.js';
import { ensureRbac } from './rbac.js';

// SYNTHETIC DEMO DATA ONLY. Demo passwords are for local development; never reuse in a real deployment.
export const DEMO_PASSWORD = 'DemoPass#2026';
export const DEMO_ORG_CODE = 'DEMO-GENERAL-2026';   // organisation code needed for public sign-up to hospital A

export async function seed(reset = false) {
  await migrate(false);
  if (reset) {
    await pool.query(`TRUNCATE notifications, notification_preferences, newborn_team, clinical_notes, monitoring_sessions, intelligence_assessments, device_maintenance, reports, system_settings, auth_tokens, email_outbox,
      signal_quality_assessments, observations, clinical_assessments, response_events, clinical_alerts, alert_rules, device_assignments, devices, newborns, user_roles, role_permissions, roles, permissions, users, units, hospitals, audit_logs RESTART IDENTITY CASCADE`);
  }
  if ((await pool.query('SELECT count(*)::int AS n FROM hospitals')).rows[0].n > 0) return;
  await ensureRbac();
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const hosp = async (name: string, loc: string, code: string) => (await pool.query('INSERT INTO hospitals(name,location,registration_code) VALUES ($1,$2,$3) RETURNING id', [name, loc, code])).rows[0].id as string;
  const unit = async (h: string, name: string) => (await pool.query('INSERT INTO units(hospital_id,name,unit_type) VALUES ($1,$2,$3) RETURNING id', [h, name, 'NICU'])).rows[0].id as string;
  const user = async (h: string, name: string, email: string, role: string) => {
    const u = await pool.query(`INSERT INTO users(hospital_id,full_name,email,password_hash,email_verified_at) VALUES ($1,$2,$3,$4,now()) RETURNING id`, [h, name, email, hash]);
    await pool.query('INSERT INTO user_roles SELECT $1, id FROM roles WHERE name=$2', [u.rows[0].id, role]); return u.rows[0].id as string;
  };
  const hA = await hosp('Demo General Hospital (synthetic)', 'Demo City', DEMO_ORG_CODE);
  const hB = await hosp('Demo Teaching Hospital B (synthetic)', 'Other Demo City', 'DEMO-TEACHING-2026');
  const uA = await unit(hA, 'NICU A'); const uA2 = await unit(hA, 'Special Care Baby Unit'); const uB = await unit(hB, 'NICU B');

  await user(hA, 'Dr. Demo Doctor', 'doctor@demo.neocareai.test', 'Doctor');
  const nurse = await user(hA, 'Nurse Demo', 'nurse@demo.neocareai.test', 'Nurse');
  await user(hA, 'Admin Demo', 'admin@demo.neocareai.test', 'Administrator');
  await user(hA, 'Medical Officer Demo', 'mo@demo.neocareai.test', 'Medical Officer');
  await user(hA, 'Supervisor Demo', 'supervisor@demo.neocareai.test', 'Clinical Supervisor');
  await user(hB, 'Dr. Other Hospital', 'doctor.b@demo.neocareai.test', 'Doctor');

  // Fictional newborn records for demonstration only.
  const baby = async (h: string, u: string, id: string, ga: number, weight: number, source: string) => (await pool.query(
    `INSERT INTO newborns(hospital_id,unit_id,newborn_identifier,date_of_birth,birth_time,gestational_age_weeks,birth_weight_grams,admission_source,admission_date) VALUES ($1,$2,$3,current_date - 3,now() - interval '3 days',$4,$5,$6,now() - interval '3 days') RETURNING id`, [h, u, id, ga, weight, source])).rows[0].id as string;
  const n1 = await baby(hA, uA, 'NB-0001', 34, 2100, 'inborn'); const n2 = await baby(hA, uA, 'NB-0002', 36, 2650, 'inborn'); const n3 = await baby(hA, uA2, 'NB-0003', 38, 3200, 'outborn');
  const nB = await baby(hB, uB, 'NB-0001', 35, 2400, 'inborn');
  for (const n of [n1, n2, n3, nB]) await pool.query(`INSERT INTO monitoring_sessions(newborn_id,reason,started_at) VALUES ($1,'Admission', now() - interval '3 days')`, [n]);
  for (const n of [n1, n2, n3]) await pool.query('INSERT INTO newborn_team(newborn_id,user_id) VALUES ($1,$2)', [n, nurse]);   // the nurse is assigned to these newborns only

  const dev = async (h: string, id: string, sim: boolean) => (await pool.query(`INSERT INTO devices(hospital_id,device_identifier,manufacturer,model,is_simulated) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [h, id, sim ? 'NeocareAI' : null, sim ? 'Synthetic Monitor Simulator' : null, sim])).rows[0].id as string;
  for (const [id, n] of [['SIM-MON-01', n1], ['SIM-MON-02', n2], ['SIM-MON-03', n3]] as const) { const d = await dev(hA, id, true); await pool.query('INSERT INTO device_assignments(device_id,newborn_id) VALUES ($1,$2)', [d, n]); }
  await dev(hB, 'SIM-MON-B1', true);
  await ensureDefaultRules();
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seed(process.argv.includes('--reset')).then(() => { console.log('seed complete'); return pool.end(); }).catch((e) => { console.error(e); process.exit(1); });
}
