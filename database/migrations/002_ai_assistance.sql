-- AI assistance interactions: append-only record of every request, tool call and output.
CREATE TABLE ai_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id),
  user_id uuid NOT NULL REFERENCES users(id),
  alert_id uuid REFERENCES clinical_alerts(id),
  kind text NOT NULL CHECK (kind IN ('summary','draft_assessment')),
  provider text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('demo','azure')),
  status text NOT NULL CHECK (status IN ('completed','blocked','fallback')),
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  output jsonb,
  safeguard_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_interactions_hospital_time ON ai_interactions(hospital_id, created_at DESC);
CREATE TRIGGER ai_interactions_append_only BEFORE UPDATE OR DELETE ON ai_interactions FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
