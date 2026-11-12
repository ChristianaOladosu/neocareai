# API Documentation

Base URL `http://localhost:4000/api`. JSON in and out. Authentication is an HTTP-only session cookie set by `POST /auth/login` (8 hours). The device gateway uses an `x-gateway-key` header instead. All data is synthetic.

**Errors** use `{ "error": "<code>", "message": "..." }`. Validation errors return `400 validation_error` with `issues: [{path, message}]`. Codes: `unauthenticated` 401, `forbidden` 403, `not_found` 404 (also used for other hospitals' records), `duplicate` 409, `invalid_transition` 409, `association_mismatch` 409, `assessment_required` 409, `draft_incomplete` 422, `invalid_timestamp` 422, `ai_disabled` 503, and AI errors listed under *AI assistance* below.

## Permissions

| Permission | Doctor | Nurse | Administrator |
|---|:-:|:-:|:-:|
| newborn:read | ✓ | ✓ | ✓ |
| newborn:write | | | ✓ |
| observation:read / observation:write | ✓ | ✓ | |
| alert:read, alert:acknowledge | ✓ | ✓ | |
| alert:assess, alert:escalate, alert:resolve | ✓ | | |
| response:read | ✓ | ✓ | |
| device:read | ✓ | ✓ | ✓ |
| device:manage, user:manage, unit:manage*, audit:read | | | ✓ |
| ai:summarise (summary, documentation checklist) | ✓ | ✓ | |
| ai:draft | ✓ | | |
| ai:manage (test Azure connection) | | | ✓ |

\* `unit:manage` exists but no unit create/edit endpoints are implemented yet.

## Auth

| Method and path | Permission | Notes |
|---|---|---|
| `POST /auth/login` `{email, password}` | none | Rate limited. Failed attempts are audited |
| `POST /auth/logout` | signed in | Clears cookie |
| `GET /auth/me` | signed in | `{id, fullName, email, hospitalId, roles, permissions[]}` |
| `POST /auth/register` `{fullName, email, password(≥10), role}` | user:manage | Creates a user in the caller's hospital |
| `POST /auth/change-password` `{currentPassword, newPassword}` | signed in | Audited |

## Hospital

`GET /hospital` · `GET /units` · `GET /users` and `GET /roles` (user:manage) · `GET /alert-rules` (alert:read or user:manage; read-only).

## Newborns

| Method and path | Permission | Notes |
|---|---|---|
| `GET /newborns?search&unitId&status` | newborn:read | Own hospital only |
| `POST /newborns` `{newbornIdentifier, dateOfBirth, gestationalAgeWeeks?, unitId?}` | newborn:write | `409 duplicate` if the identifier exists in this hospital |
| `GET /newborns/:id` | newborn:read | |
| `PATCH /newborns/:id` `{unitId?, monitoringStatus?, gestationalAgeWeeks?}` | newborn:write | Audited |
| `POST /newborns/:id/observations` | observation:write | Manual entry (API only; no UI form yet) |
| `GET /newborns/:id/observations?type&limit&since` | observation:read | Includes `quality_status`, `quality_reason`, `source` |

Observation body: `{measurementType: heart_rate|respiratory_rate|spo2|temperature, value, unit?, observedAt (ISO with offset), deviceQuality?: good|questionable|poor|unavailable, metadata?}`. Response `201 {id, quality, qualityReason, alertIds[]}` or `200 {duplicate:true}`. Timestamps more than 5 minutes in the future or more than 24 hours old are rejected.

## Monitoring

`GET /monitoring/overview` (observation:read) returns `{staleAfterSeconds, newborns: [{id, newborn_identifier, monitoring_status, unit_name, device_identifier, connection_status, last_seen_at, is_simulated, measurements: [{measurement_type, value, unit, observed_at, quality_status, isStale}], openAlerts, unacknowledgedAlerts, dataCurrent}]}`.

## Alerts

| Method and path | Permission | Valid from → to |
|---|---|---|
| `GET /alerts?status=a,b&newbornId&limit` | alert:read | |
| `GET /alerts/:id` | alert:read | Read-only; includes `evidence`, `events`, `assessments` |
| `POST /alerts/:id/acknowledge` | alert:acknowledge | awaiting_acknowledgement → acknowledged |
| `POST /alerts/:id/assessment` `{assessmentText, responseText?, aiInteractionId?}` | alert:assess | acknowledged/under_assessment → under_assessment. `422 draft_incomplete` if text still contains `[Clinician to complete` |
| `POST /alerts/:id/escalate` `{reason}` | alert:escalate | acknowledged/under_assessment → escalated |
| `POST /alerts/:id/resolve` `{resolutionNote}` | alert:resolve | under_assessment/escalated → resolved; needs a recorded assessment |
| `GET /response-log?limit` | response:read | Newest first across the hospital |

Event types: `generated, acknowledged, assessment_recorded, response_documented, escalated, resolved`, each with `previous_status`, `new_status`, user and time, ordered by `seq`.

## Devices

`GET /devices` (device:read) · `POST /devices` `{deviceIdentifier, manufacturer?, model?}` · `POST /devices/:id/assign {newbornId}` (replaces any existing assignment of the device or newborn, audited as reassign) · `POST /devices/:id/unassign` (all device:manage).

## Audit

`GET /audit?limit` (audit:read).

## AI assistance

Request bodies for the three generating endpoints: `{ "mode": "demo" | "azure" }` (optional; the default is Demo Mode unless the server sets `AI_PROVIDER=azure` and Azure is configured). Azure is never used unless it is both configured and selected.

| Method and path | Permission | Notes |
|---|---|---|
| `GET /ai/status` | signed in | `{enabled, defaultMode, label, azure: {configured, requested, lastConnectionTest, (administrators: deployment, apiVersion, auth, configurationProblem)}, capabilities, cannot, tools}`. Credentials and the endpoint are never returned |
| `POST /alerts/:id/ai/summary` | ai:summarise | Summary, trend explanation, observations and responses so far, uncertainty, neutral questions |
| `POST /alerts/:id/ai/draft-assessment` | ai:draft | Structured draft with three clinician-only placeholders |
| `POST /alerts/:id/ai/documentation-help` | ai:summarise | Neutral documentation checklist |
| `POST /ai/interactions/:id/reject` | ai:draft (own drafts) | Records the clinician's rejection. `409 decision_exists` if already decided |
| `GET /ai/interactions` | audit:read | Model, role, outcome, validation result, latency, clinician decision. Not the output text |
| `POST /ai/test-connection` | ai:manage | Sends fixed synthetic data to Azure and validates the reply. Recorded in the audit log |

Success response: `{interactionId, kind, mode: "demo"|"azure", generated: boolean, label, model, status: "completed"|"blocked", output, validation: {passed, checks[], flags[], note}, notice}`. `generated` is `true` only for real model output. `label` is `"Demo Mode – Not Connected to Azure"` for templates and `"Generated by Azure OpenAI · <model>"` for real output. `output` holds `title`, `sections[]` (each with `statements[]` of `{kind: fact|uncertainty|question, text, refs[]}` for real output), `sourceRecords[]`, `missingInformation[]`, `draftText` (drafts), `sources[]` and `limitations[]`.

AI errors always include `demoAvailable: true` and `workflowUnaffected: true`, and never include text from the provider:

| HTTP | `error` | Meaning |
|---|---|---|
| 409 | `ai_not_configured` | Azure requested but not configured. Nothing was produced |
| 409 | `ai_request_in_progress` | The same request from the same user is still running |
| 502 | `ai_credentials_invalid` | Azure rejected the credentials |
| 502 | `ai_misconfigured` | Endpoint, deployment name or API version problem |
| 502 | `ai_malformed` | Empty, truncated or unusable response |
| 429 | `ai_rate_limited` | Rate limit; `retryAfterSeconds` when Azure supplied it |
| 504 / 503 | `ai_timeout` / `ai_unavailable` | No timely answer / service unreachable |
| 422 | `ai_content_filtered` | The service declined or filtered the response |
| 422 | `ai_output_rejected` | The text failed validation and is **not shown**; `failedChecks[]` names the checks |
| 500 | `ai_privacy_blocked` | The request was stopped before sending because it might contain identifying data |
| 503 | `ai_disabled` | `AI_ENABLED=false` |

Recording an AI draft uses the normal `POST /alerts/:id/assessment` with `aiInteractionId`. The draft must be the caller's own, for this alert, successfully generated, and not already recorded or rejected (`400 invalid_ai_reference`, `409 draft_already_decided`). Text still containing `[Clinician to complete` returns `422 draft_incomplete`. A successful record writes the clinician's decision (`recorded`, with whether the text was modified) and puts `aiMode`, `aiModel` and `aiModified` in the history event.

## Device gateway (header `x-gateway-key`)

`GET /gateway/hospitals` · `POST /gateway/observations` `{hospitalId, deviceIdentifier, newbornIdentifier?, ...observation}` (newborn is derived from the device assignment; a conflicting `newbornIdentifier` returns `409 association_mismatch`) · `POST /gateway/devices/:identifier/connection {hospitalId, status: connected|disconnected}`.

## WebSocket

`ws://host/ws` (same session cookie). Hospital-scoped events: `observation.stored`, `alert.generated`, `alert.updated`, `device.connection`. Events are notifications only; clients refetch data through the API.

## Health

`GET /health` → `{ok:true, synthetic:true}`.
