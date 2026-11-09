# NeocareAI Architecture

Status: working prototype. Synthetic data only. Thresholds are illustrative.

## End-to-end flow

```
 MEDICAL MONITOR OR SIMULATOR
            |  vendor message
            v
 DEVICE GATEWAY  (adapter -> standard observation -> validation -> forwarder with buffering)
            |  HTTPS + gateway key
            v
 BACKEND API  (device->newborn association, timestamp checks, de-duplication)
            |
            v
 POSTGRESQL  (observations, quality assessments)
            |
            v
 INTELLIGENCE  signal quality -> trend analysis -> configurable rules
            |
            v
 EXPLAINABLE ALERT  (evidence, rule + version, signal quality)
            |-- WebSocket --> REACT CLINICAL WORKSPACE
            v
 CLINICAL RESPONSE  acknowledge -> assess -> escalate / resolve
            |
            v
 APPEND-ONLY RESPONSE HISTORY + AUDIT LOG

 AI ASSISTANCE (optional, read-only): reads an existing alert through permission-checked tools,
 returns a summary or a draft with clinician-only fields. It writes nothing.
```

## Components

| Component | Path | Responsibility |
|---|---|---|
| Web workspace | `apps/web` | React clinical UI; reads real API data; WebSocket refresh with polling fallback |
| API | `services/api` | Auth, RBAC, hospital isolation, newborns, observations, alerts, devices, audit, AI assistance, WebSocket events |
| Intelligence | `services/intelligence` | Pure functions: data-quality checks, trend slope, rule evaluation. No I/O, so it is easy to test and review |
| Device gateway | `services/device-gateway` | Adapters, normalisation, validation, buffering and ordered resync |
| Simulator | `services/simulator` | Six labelled-synthetic scenarios, deterministic |
| Database | `database/migrations` | Schema, constraints, append-only triggers |

The API imports the intelligence package in-process (a deliberate simplification; it could be a separate service later).

## Key decisions

1. **The core never depends on generative AI.** Ingestion, storage, quality, trends, rules and alerts work with AI off (`AI_ENABLED=false` is tested).
2. **Rules are data.** Rules are stored as versioned configuration and evaluated by a generic engine; controllers contain no thresholds.
3. **Quality is separate from physiology.** Readings with poor or unavailable quality are not counted by physiological rules; repeated unreliable data raises its own low-priority notice. Per-measurement, so healthy sensors cannot mask a failing one.
4. **The gateway cannot pick the newborn.** Attribution comes from the device's active assignment (unique active assignment per device and per newborn). A message naming a different newborn is rejected.
5. **Append-only history.** `audit_logs`, `response_events`, `clinical_assessments` and `ai_interactions` reject UPDATE and DELETE via triggers. `response_events.seq` gives deterministic order within a transaction.
6. **Hospital isolation on every query**, returning "not found" for other hospitals' records.
7. **No automatic resolution.** Valid transitions are enforced with row locks; resolving requires a recorded assessment.
8. **Permissions are re-read on every request**, so revocation is immediate. Administrators have no clinical permissions by default.
9. **Idempotent ingestion.** Unique (newborn, measurement, observed time, source) makes duplicate messages safe.
10. **Staleness is computed on the server** (default 120 s) and returned explicitly; the UI never infers "current".

## Security measures implemented

bcrypt password hashing; signed, HTTP-only, SameSite session cookie (secure in production); Zod validation on every request; rate limiting (login, API, AI); Helmet headers; CORS limited to the web origin; timing-safe gateway key comparison; no public self-registration; audit of sign-ins, failed sign-ins, password changes, assignments, alerts and AI use; secrets only in environment variables (production start refuses a weak `SESSION_SECRET`).

Not yet done: TLS termination and deployment hardening, penetration test, formal threat model, secret management service, session revocation list, MFA.

## Data model (summary)

`hospitals` → `units`, `users` (+ `roles`, `permissions`, joins) · `newborns` (unique identifier per hospital) · `devices`, `device_assignments` · `observations`, `signal_quality_assessments` · `alert_rules`, `clinical_alerts`, `clinical_assessments`, `response_events` · `audit_logs` · `ai_interactions`.

## Scaling and future work

Multi-hospital isolation exists at query level (row-level security in PostgreSQL is a sensible hardening step). Observation volume would warrant time-partitioning. The gateway would become a durable-queue-backed service. See [DEVICE_INTEGRATION.md](../device-integration/DEVICE_INTEGRATION.md).
