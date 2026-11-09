# API Documentation

Base URL `http://localhost:4000/api`. JSON in and out. Authentication is an HTTP-only session cookie set by `POST /auth/login` (8 hours). The device gateway uses an `x-gateway-key` header instead. All data is synthetic.

**Errors** use `{ "error": "<code>", "message": "..." }`. Validation errors return `400 validation_error` with `issues: [{path, message}]`. Codes: `unauthenticated` 401, `forbidden` 403, `not_found` 404 (also used for other hospitals' records), `duplicate` 409, `invalid_transition` 409, `association_mismatch` 409, `assessment_required` 409, `draft_incomplete` 422, `invalid_timestamp` 422, `ai_disabled`/`ai_unavailable` 503.

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
| ai:summarise | ✓ | ✓ | |
| ai:draft | ✓ | | |

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

| Method and path | Permission | Notes |
|---|---|---|
| `GET /ai/status` | signed in | `{mode, label, enabled, capabilities, cannot, tools}` |
| `POST /alerts/:id/ai/summary` | ai:summarise | Read-only. `{interactionId, mode, label, status: completed|blocked|fallback, output, notice}` |
| `POST /alerts/:id/ai/draft-assessment` | ai:draft | `output.draftText` contains three clinician-only placeholders |
| `GET /ai/interactions` | audit:read | Tool calls and outcomes, not output text |

## Device gateway (header `x-gateway-key`)

`GET /gateway/hospitals` · `POST /gateway/observations` `{hospitalId, deviceIdentifier, newbornIdentifier?, ...observation}` (newborn is derived from the device assignment; a conflicting `newbornIdentifier` returns `409 association_mismatch`) · `POST /gateway/devices/:identifier/connection {hospitalId, status: connected|disconnected}`.

## WebSocket

`ws://host/ws` (same session cookie). Hospital-scoped events: `observation.stored`, `alert.generated`, `alert.updated`, `device.connection`. Events are notifications only; clients refetch data through the API.

## Health

`GET /health` → `{ok:true, synthetic:true}`.
