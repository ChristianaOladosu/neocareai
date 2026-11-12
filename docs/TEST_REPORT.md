# Test Report

Date: 2026-11-12. Environment: Linux sandbox, Node 22, PostgreSQL 16.15, Chromium (Playwright). Only tests that were actually executed are listed as passing.

## Read this first: what "Azure tested" means here

**No test in this report connected to a real Azure deployment.** The Azure integration is tested in two ways, both against a **local mock of the Azure OpenAI chat-completions API** (`tests/fixtures/mock-azure.ts`):
1. Automated tests where the real `AzureOpenAI` SDK client sends genuine HTTP requests to the mock (request path, `api-version`, `api-key` header, JSON mode, retries, timeouts and error shapes are real SDK behaviour).
2. Browser tests that drive the interface against the same mock.

These show that *our code* builds correct requests, anonymises data, handles every failure mode, and accepts or rejects model output correctly. They do **not** show that a real model will answer in the expected format, accurately or safely. **A real connection is established only when `npm run ai:check` (or Settings → AI assistance → Test Azure connection) passes against your own deployment.**

## Automated tests (Vitest, real PostgreSQL)

Command: `npm test`. **141 passed, 0 failed** (7 files).

| File | Tests | Covers |
|---|--:|---|
| tests/unit/intelligence.test.ts | 8 | Signal quality, trends, rules, per-sensor masking regression |
| tests/unit/ai.test.ts | 20 | Phase 7 demo provider: 14 unsafe-phrase cases, grounding, sources, no identifiers, clinician-only fields |
| tests/unit/azure.test.ts | 33 | Anonymised payload and privacy guard; 15 rejection scenarios for model output (unsupported numbers, missing/invented sources, wrong measurement, unknown headings, diagnosis, treatment, dismissal, reassurance, inference, severity, instructions, markup); malformed JSON; HTTP-status and SDK-error classification (using the SDK's real timeout shape); configuration checks |
| tests/integration/api.test.ts | 20 | Authentication, permissions, isolation, ingestion, alerts, lifecycle, audit |
| tests/integration/pipeline.test.ts | 11 | Simulator, gateway, scenarios A to F, outage buffering |
| tests/integration/ai.test.ts | 9 | Demo Mode: permissions, tool denial and audit, no side effects, append-only records, switch-off, draft handling |
| tests/integration/azure-ai.test.ts | 40 | **Real SDK to local mock:** correct request shape; anonymised payload; all three request types; credentials never exposed in responses, logs or database; 9 failure modes (invalid credentials, service error, timeout, rate limit, missing deployment, empty answer, truncated answer, content filter, refusal) plus unreachable endpoint, each explicit, recorded, with no substituted output; explicit switch to Demo Mode; Azure requested but unconfigured is refused; duplicate in-flight requests prevented; 12 invalid or unsafe outputs rejected and not displayed; unknown extra fields ignored; permissions by role and cross-hospital denial; no change to alerts, assessments, observations or responses; connection test (administrator only); mode selection is explicit; incomplete drafts rejected; own-draft only; accept (recorded, edited) and reject decisions, audited and append-only; audit completeness and absence of patient data and secrets |

Repeatability: the Azure integration file was run four times consecutively (40 of 40 each time), including the timeout and duplicate-request tests.

## Browser end-to-end checks (Playwright, Chromium)

`bash scripts/e2e-all.sh` starts PostgreSQL-backed API, gateway, web app and the local mock, reseeds before each script, and runs:

| Script | Result | Covers |
|---|---|---|
| ui_workflow.py | **20 / 20** | Core clinical workflow, monitoring staleness labels, role restrictions, duplicates, mobile layout |
| ai_workflow.py | **15 / 15** | Demo Mode AI flow, draft placeholders, history marker, nurse and administrator views |
| ai_azure_workflow.py | **18 / 18** (against the mock) | Azure offered but Demo Mode default; real-provider result labelled with model and distinct from template; source chips; uncertainty and missing-information lists; checks panel states checks are not clinical proof; outage shows a clear error with no substituted text; explicit switch to Demo Mode; unsafe output and unsupported numbers rejected and not shown; draft rejection; Azure-sourced draft dialog; recording blocked while incomplete; history records an Azure-generated, clinician-edited draft; administrator sees "configured, not verified", connection test, and the activity table with decisions; nurse restrictions |

## Defects found by testing and fixed

1. Stored "disconnected" device state marked every reading unavailable.
2. Data-quality rule was masked by healthy sensors (now per measurement).
3. Event order within a transaction was nondeterministic (added a sequence column).
4. UI polish: clipped chip, repeated chart labels; reset script swallowed by npm.
5. **Timeout misclassification:** the real SDK's timeout error has `name: "Error"`; the first classifier reported timeouts as "unavailable". Found only because an integration test used the real SDK; the original unit test had used an idealised error shape. Fixed and the unit test now uses the SDK's real shape.
6. The model-output validator initially applied only the stricter patterns and not the Phase 7 base filter; fixed before tests were written, and both are now tested.
7. The first design silently fell back to template text when Azure failed. Replaced by explicit errors and an explicit switch, as required.
8. Seed reset removed alert rules until the API restarted; the seed now restores them.

## Not tested, or only partly tested

- **No real Azure OpenAI deployment, model, key, quota, latency or cost was involved in any test.** Real-model accuracy, hallucination, safety-filter misses, bias, consistency and prompt-injection resistance are unmeasured.
- Keyless Microsoft Entra ID authentication: written, never executed.
- Model compatibility (JSON mode, `max_completion_tokens`, temperature) is unverified for any specific model.
- No real medical device, load test, penetration test, triaged dependency audit, screen-reader accessibility audit, Safari/Firefox, or clinician usability test.
- Escalation and several security cases are covered at API level, not in the browser. WebSocket reconnect not forced.
- Docker files do not exist.

## How to reproduce

`npm test` (PostgreSQL only). `bash scripts/e2e-all.sh` (add a script name to run one). To test **your** Azure deployment: configure `.env` (see README) and run `npm run ai:check`.
