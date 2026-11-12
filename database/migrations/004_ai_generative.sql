-- Real generative AI audit: model, role, validation, latency, outcome, and the clinician's decision on each draft.
ALTER TABLE ai_interactions DROP CONSTRAINT ai_interactions_kind_check;
ALTER TABLE ai_interactions ADD CONSTRAINT ai_interactions_kind_check CHECK (kind IN ('summary','draft_assessment','documentation_help'));
ALTER TABLE ai_interactions DROP CONSTRAINT ai_interactions_status_check;
-- 'fallback' is kept only so history written before this migration stays valid; new code never silently falls back.
ALTER TABLE ai_interactions ADD CONSTRAINT ai_interactions_status_check CHECK (status IN ('completed','blocked','fallback','invalid','failed'));
ALTER TABLE ai_interactions
  ADD COLUMN model_id text,
  ADD COLUMN requested_mode text,
  ADD COLUMN user_role text,
  ADD COLUMN validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN latency_ms integer,
  ADD COLUMN error_category text,
  ADD COLUMN request_digest text;   -- SHA-256 of the anonymised payload (proves what was sent without storing it)

-- The clinician's decision on an AI draft. Append-only; one decision per draft.
CREATE TABLE ai_draft_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL UNIQUE REFERENCES ai_interactions(id),
  user_id uuid NOT NULL REFERENCES users(id),
  decision text NOT NULL CHECK (decision IN ('recorded','rejected')),
  modified boolean,            -- for 'recorded': did the clinician change the draft text?
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ai_draft_decisions_append_only BEFORE UPDATE OR DELETE ON ai_draft_decisions FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
