-- Platform expansion: accounts, newborn lifecycle, teams, notes, monitoring sessions, alert categories, intelligence history,
-- notifications, device maintenance, reports, settings. Existing data and APIs are preserved.

-- ---- accounts ----
ALTER TABLE users DROP CONSTRAINT users_account_status_check;
ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK (account_status IN ('active','disabled','pending_verification','pending_approval'));
ALTER TABLE users ADD COLUMN email_verified_at timestamptz, ADD COLUMN last_login_at timestamptz;
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;   -- accounts created by an administrator are trusted
ALTER TABLE hospitals ADD COLUMN registration_code text UNIQUE;                   -- organisation code needed for public sign-up
CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('verify_email','reset_password')), token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE email_outbox (   -- development mail outbox: no email service is configured, so messages are recorded here, never sent
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid REFERENCES hospitals(id), to_email text NOT NULL, kind text NOT NULL,
  subject text NOT NULL, body text NOT NULL, link text, created_at timestamptz NOT NULL DEFAULT now());

-- ---- newborn lifecycle, clinical detail, team ----
ALTER TABLE newborns DROP CONSTRAINT newborns_monitoring_status_check;
ALTER TABLE newborns ADD CONSTRAINT newborns_monitoring_status_check CHECK (monitoring_status IN ('monitoring','paused','transferred','discharged','inactive'));
ALTER TABLE newborns ADD COLUMN birth_time timestamptz, ADD COLUMN birth_weight_grams integer CHECK (birth_weight_grams BETWEEN 200 AND 8000),
  ADD COLUMN admission_source text, ADD COLUMN clinical_summary text, ADD COLUMN discharged_at timestamptz, ADD COLUMN discharge_reason text, ADD COLUMN transferred_to text;
CREATE TABLE newborn_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), newborn_id uuid NOT NULL REFERENCES newborns(id), user_id uuid NOT NULL REFERENCES users(id),
  assigned_by uuid REFERENCES users(id), assigned_at timestamptz NOT NULL DEFAULT now(), unassigned_at timestamptz);
CREATE UNIQUE INDEX one_active_team_member ON newborn_team(newborn_id, user_id) WHERE unassigned_at IS NULL;
CREATE INDEX team_user_active ON newborn_team(user_id) WHERE unassigned_at IS NULL;
CREATE TABLE clinical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), newborn_id uuid NOT NULL REFERENCES newborns(id), author_id uuid NOT NULL REFERENCES users(id),
  note_type text NOT NULL DEFAULT 'clinical_note' CHECK (note_type IN ('clinical_note','observation')), note_text text NOT NULL CHECK (length(trim(note_text)) > 0),
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX notes_newborn ON clinical_notes(newborn_id, created_at DESC);
CREATE TRIGGER notes_append_only BEFORE UPDATE OR DELETE ON clinical_notes FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TABLE monitoring_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), newborn_id uuid NOT NULL REFERENCES newborns(id), started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
  started_by uuid REFERENCES users(id), ended_by uuid REFERENCES users(id), reason text);
CREATE UNIQUE INDEX one_open_session ON monitoring_sessions(newborn_id) WHERE ended_at IS NULL;

-- ---- alerts: category, closing, duplicate counting ----
ALTER TABLE clinical_alerts ADD COLUMN category text NOT NULL DEFAULT 'measurement' CHECK (category IN ('measurement','trend','signal_quality','missing_data','device_disconnection')),
  ADD COLUMN occurrence_count integer NOT NULL DEFAULT 1, ADD COLUMN last_occurrence_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN device_id uuid REFERENCES devices(id);
ALTER TABLE clinical_alerts DROP CONSTRAINT clinical_alerts_status_check;
ALTER TABLE clinical_alerts ADD CONSTRAINT clinical_alerts_status_check CHECK (status IN ('awaiting_acknowledgement','acknowledged','under_assessment','escalated','resolved','closed'));
ALTER TABLE response_events DROP CONSTRAINT response_events_event_type_check;
ALTER TABLE response_events ADD CONSTRAINT response_events_event_type_check CHECK (event_type IN ('generated','acknowledged','assessment_recorded','response_documented','escalated','resolved','closed','duplicate_suppressed'));
UPDATE clinical_alerts SET category = CASE WHEN title LIKE 'Measurements unreliable%' THEN 'signal_quality' ELSE 'measurement' END;

-- ---- intelligence assessment history (status changes only; categorical, NOT a clinical score) ----
CREATE TABLE intelligence_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), newborn_id uuid NOT NULL REFERENCES newborns(id), evaluated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('no_criteria_met','criteria_met','insufficient_reliable_data','data_quality_concern','device_concern')), details jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE INDEX assess_newborn ON intelligence_assessments(newborn_id, evaluated_at DESC);

-- ---- notifications ----
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL REFERENCES hospitals(id), user_id uuid NOT NULL REFERENCES users(id),
  type text NOT NULL CHECK (type IN ('new_alert','high_priority_alert','unacknowledged_reminder','device_disconnected','monitoring_interrupted','system')),
  priority text NOT NULL DEFAULT 'low' CHECK (priority IN ('low','medium','high')), title text NOT NULL, body text, link text,
  alert_id uuid REFERENCES clinical_alerts(id), newborn_id uuid REFERENCES newborns(id), dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz, acknowledged_at timestamptz);
CREATE UNIQUE INDEX notif_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX notif_user ON notifications(user_id, created_at DESC);
CREATE TABLE notification_preferences (user_id uuid NOT NULL REFERENCES users(id), type text NOT NULL, in_app boolean NOT NULL DEFAULT true, email boolean NOT NULL DEFAULT false, PRIMARY KEY (user_id, type));

-- ---- devices, reports, settings ----
CREATE TABLE device_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), device_id uuid NOT NULL REFERENCES devices(id), performed_by uuid REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('inspection','calibration','repair','firmware','note')), notes text NOT NULL, performed_at timestamptz NOT NULL DEFAULT now(), next_due date);
CREATE TRIGGER maintenance_append_only BEFORE UPDATE OR DELETE ON device_maintenance FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL REFERENCES hospitals(id), generated_by uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL, params jsonb NOT NULL DEFAULT '{}'::jsonb, row_count integer, format text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE system_settings (hospital_id uuid NOT NULL REFERENCES hospitals(id), key text NOT NULL, value jsonb NOT NULL, updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (hospital_id, key));
