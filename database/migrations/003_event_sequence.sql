-- Deterministic ordering of response events written within one transaction (they share a transaction timestamp).
ALTER TABLE response_events ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY;
CREATE INDEX response_events_alert_seq ON response_events(alert_id, seq);
