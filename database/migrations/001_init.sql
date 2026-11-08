-- NeocareAI initial schema. Synthetic-data prototype.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id),
  name text NOT NULL,
  unit_type text NOT NULL DEFAULT 'NICU',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  UNIQUE (hospital_id, name)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (id serial PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE permissions (id serial PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE role_permissions (
  role_id int NOT NULL REFERENCES roles(id),
  permission_id int NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id),
  role_id int NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE newborns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id),
  unit_id uuid REFERENCES units(id),
  newborn_identifier text NOT NULL,
  date_of_birth date NOT NULL,
  gestational_age_weeks numeric(4,1) CHECK (gestational_age_weeks BETWEEN 20 AND 45),
  admission_date timestamptz NOT NULL DEFAULT now(),
  monitoring_status text NOT NULL DEFAULT 'monitoring' CHECK (monitoring_status IN ('monitoring','paused','discharged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, newborn_identifier)
);

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id),
  device_identifier text NOT NULL,
  manufacturer text,
  model text,
  device_type text NOT NULL DEFAULT 'monitor',
  is_simulated boolean NOT NULL DEFAULT false,
  connection_status text NOT NULL DEFAULT 'disconnected' CHECK (connection_status IN ('connected','disconnected','unknown')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, device_identifier)
);

CREATE TABLE device_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id),
  newborn_id uuid NOT NULL REFERENCES newborns(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  assigned_by uuid REFERENCES users(id)
);
-- One active assignment per device and per newborn (prevents silent misattribution).
CREATE UNIQUE INDEX one_active_assignment_per_device ON device_assignments(device_id) WHERE unassigned_at IS NULL;
CREATE UNIQUE INDEX one_active_assignment_per_newborn ON device_assignments(newborn_id) WHERE unassigned_at IS NULL;

CREATE TABLE observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  newborn_id uuid NOT NULL REFERENCES newborns(id),
  device_id uuid REFERENCES devices(id),
  measurement_type text NOT NULL CHECK (measurement_type IN ('heart_rate','respiratory_rate','spo2','temperature')),
  value numeric NOT NULL,
  unit text NOT NULL,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  quality_status text NOT NULL DEFAULT 'unknown' CHECK (quality_status IN ('good','questionable','poor','unavailable','unknown')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (newborn_id, measurement_type, observed_at, source)  -- duplicate-message protection
);
CREATE INDEX obs_newborn_type_time ON observations(newborn_id, measurement_type, observed_at DESC);

CREATE TABLE signal_quality_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES observations(id),
  quality_status text NOT NULL CHECK (quality_status IN ('good','questionable','poor','unavailable','unknown')),
  assessment_reason text NOT NULL,
  assessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL,
  name text NOT NULL,
  description text,
  rule_version int NOT NULL DEFAULT 1,
  configuration jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (rule_key, rule_version)
);

CREATE TABLE clinical_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id),
  newborn_id uuid NOT NULL REFERENCES newborns(id),
  rule_id uuid REFERENCES alert_rules(id),
  priority text NOT NULL CHECK (priority IN ('low','medium','high')),
  title text NOT NULL,
  explanation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,  -- triggering observations, context, rule id/version, signal quality
  status text NOT NULL DEFAULT 'awaiting_acknowledgement'
    CHECK (status IN ('awaiting_acknowledgement','acknowledged','under_assessment','escalated','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alerts_hospital_status ON clinical_alerts(hospital_id, status, created_at DESC);

CREATE TABLE clinical_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES clinical_alerts(id),
  clinician_id uuid NOT NULL REFERENCES users(id),
  assessment_text text NOT NULL CHECK (length(trim(assessment_text)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE response_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES clinical_alerts(id),
  user_id uuid REFERENCES users(id),  -- null = system-generated
  event_type text NOT NULL CHECK (event_type IN ('generated','acknowledged','assessment_recorded','response_documented','escalated','resolved')),
  previous_status text,
  new_status text,
  event_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX response_events_alert ON response_events(alert_id, created_at);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid REFERENCES hospitals(id),
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit and response history are append-only: block UPDATE/DELETE.
CREATE FUNCTION prevent_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER response_events_append_only BEFORE UPDATE OR DELETE ON response_events FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER assessments_append_only BEFORE UPDATE OR DELETE ON clinical_assessments FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
