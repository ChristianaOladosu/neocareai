# Test Report

Date: 2026-11-09. Environment: Linux sandbox, Node 22, PostgreSQL 16.15, Chromium (Playwright). Only tests that were actually executed are listed as passing.

## Automated tests (Vitest, against a real PostgreSQL database)

Command: `npm test`. **72 passed, 0 failed.**

| File | Tests | Covers |
|---|--:|---|
| tests/unit/intelligence.test.ts | 8 | Signal-quality checks, trend slope, multivariable rule, poor readings do not fire physiological rules, per-sensor masking regression |
| tests/unit/ai.test.ts | 20 | 14 unsafe-phrase cases blocked, no false positives on demo output, grounding of stated values, sources and limitations present, no identifiers, three clinician-only fields, documentation-only knowledge base |
| tests/integration/api.test.ts | 20 | Authentication, invalid credentials, role permissions, hospital isolation, gateway key and payload validation, append-only audit, ingestion and provenance, duplicates, wrong-newborn rejection, future timestamps, delayed data, poor signal, disconnection, alert generation and de-duplication, lifecycle order and recording, escalation, newborn registration, audit trail |
| tests/integration/pipeline.test.ts | 11 | Adapter normalisation and rejection, gateway outage buffering and ordered delivery, scenarios A to F through simulator, gateway, API and database |
| tests/integration/ai.test.ts | 13 | AI permissions, cross-hospital denial, tool-permission denial and audit, grounding, no side effects, append-only AI records, oversight access, AI switch-off, unfinished-draft rejection, AI marker in history; stubbed Azure: used when configured and anonymised, unsafe output withheld, outage falls back, placeholders re-added |

Repeatability: the alert-lifecycle file was run six times consecutively (20 of 20 each time) after fixing an ordering defect.

## Browser end-to-end checks (Playwright, Chromium)

| Script | Result | Covers |
|---|---|---|
| tests/e2e/ui_workflow.py | **20 / 20** | Login redirect, wrong password, overview, monitoring staleness and simulated-device labels, disconnected device, open-without-dismiss, evidence display, acknowledge, assessment, resolve, history, response log, trend charts, administrator restrictions, registration and duplicate error, mobile layout without horizontal scroll |
| tests/e2e/ai_workflow.py | **15 / 15** | Demo Mode label, scope statement, summary, sources and limitations, draft placeholders, draft locked until acknowledged, prefilled form flagged as AI draft, recording blocked until fields completed, AI marker in history, alert stays open, nurse restrictions, administrator oversight and tool list |

## Mapping to the requested scenarios

| Scenario | Automated | Browser |
|---|:-:|:-:|
| 1 Routine observations | ✓ | ✓ |
| 2 Poor signal | ✓ | partly (labels) |
| 3 Concerning trend and alert | ✓ | ✓ |
| 4 Clinical acknowledgement | ✓ | ✓ |
| 5 Clinical response (assess, resolve, escalate) | ✓ | resolve ✓; escalate API only |
| 6 Device disconnection and reconnection | ✓ | disconnected state ✓ |
| 7 Security (unauthenticated, credentials, permissions, cross-hospital, invalid payload, duplicates, unauthorised modification) | ✓ | partly |

## Defects found by testing and fixed

1. Stored "disconnected" device state marked every reading unavailable, so no alert could fire.
2. The data-quality rule looked across all sensors, so healthy sensors masked a failing one.
3. Events written in one transaction had nondeterministic order (random UUID tie-break); added a sequence column.
4. UI: clipped acknowledgement chip; repeated chart time labels.
5. Test tooling: `npm run seed -- --reset` was swallowed by npm, so "reset" did nothing; added `npm run seed:reset`.

## Not tested, or only partly tested

- No test with a real medical device, real Azure services, or a real language model.
- Not load-tested; no performance targets verified.
- No penetration test, dependency audit or threat-model review (`npm audit` reports advisories that have not been triaged).
- No accessibility audit with a screen reader or automated tool; keyboard and focus handling were built but only lightly exercised.
- Chromium only; no Safari or Firefox; mobile checked at one viewport.
- Escalation, cross-hospital access and several security cases are covered at API level, not in the browser.
- The server's WebSocket reconnect path was not forced in a test.
- Docker files do not exist and nothing was run in containers.
- No usability testing with clinicians.

## How to reproduce

`npm run seed:reset`, start `npm run api`, `npm run gateway`, `npm run web`, load scenarios with `npm run simulate -- --scenario=B --device=SIM-MON-01 --fast` (and D, C for devices 02, 03), then run the two Python scripts. `npm test` needs only PostgreSQL.
