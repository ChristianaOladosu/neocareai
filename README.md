# NeocareAI

**Earlier awareness. Clearer decisions. More accountable neonatal care.**

NeocareAI is an early-stage, AI-assisted neonatal monitoring and clinical decision-support prototype. It receives physiological observations, judges how reliable each measurement is, analyses trends, raises explainable alerts, and records the clinical response to each alert in a tamper-resistant history.

> **Prototype status.** All patient data is synthetic. All alert thresholds are illustrative, not clinically approved. It is not a medical device, has not been clinically validated, is not connected to any real monitor, and has no regulatory approval. Clinicians remain responsible for every decision.

## The problem

Newborns, especially premature ones, can deteriorate quickly. Teams watch several babies at once, some observations are periodic, information sits in different systems, and a concerning pattern across several measurements is easy to miss. Sensors also fail. And even a correctly spotted alert is only useful if someone acknowledges it, assesses it and the response is recorded.

NeocareAI targets the gap between **observation, recognition of concerning trends, and documented clinical response**.

## The solution

```
Monitor/Simulator -> Device gateway -> Backend API -> PostgreSQL
   -> signal quality -> trend analysis -> explainable alert -> clinician notification
   -> acknowledge -> assess -> escalate or resolve -> auditable response history
```

## What is built, and what is not

| Capability | Status |
|---|---|
| Authentication, roles and permissions, hospital data isolation | **Built and tested** |
| Newborn registration, directory, profiles | **Built and tested** |
| Synthetic monitor simulator (6 scenarios) and device gateway | **Built and tested** |
| Signal-quality checks (data validity, delay, device indicator) | **Built and tested.** Not clinically validated signal-quality analysis |
| Trend analysis and configurable rule engine | **Built and tested** with *illustrative* rules only |
| Explainable alerts with preserved evidence | **Built and tested** |
| Alert lifecycle: acknowledge, assess, escalate, resolve; append-only history and audit | **Built and tested** |
| Live monitoring that never presents stale data as current | **Built and tested** |
| AI assistance in **Demo Mode** (summary, draft, checklist from fixed templates) | **Built and tested.** Not a language model. Default |
| **Generative AI via Azure OpenAI** (official `openai` SDK `AzureOpenAI` client): summaries, trend explanation, organisation of observations and responses, structured draft, neutral questions, documentation checklist | **Implemented. Tested only against a local MOCK Azure server. NOT yet connected to a real Azure deployment** |
| Anonymised payload, privacy guard, strict output validation with source references, explicit failure handling, clinician accept/reject, AI audit | **Implemented and tested** (with the mock) |
| Azure AI Search / retrieval of approved clinical guidance | **Not built** |
| Real medical-device integration (HL7, FHIR, IEEE 11073, vendor APIs) | **Not built.** Architecture allows it |
| Docker / Docker Compose | **Not provided** (no Docker in the build environment) |
| Clinical validation, regulatory assessment, security assessment | **Not done** |

## Main features

- **Live monitoring** where stale or disconnected readings are struck through and labelled "Not current", and signal quality is shown separately from the value.
- **Explainable alerts** that keep the triggering readings, recent context, rule and version, and signal quality.
- **Accountable response**: every acknowledgement, assessment, escalation and resolution is attributed to a named user and time. Alerts never close automatically.
- **Controlled AI assistance**: summarises an existing alert, explains stored trends, organises prior observations and responses, drafts documentation and suggests neutral questions. It works in **Demo Mode** (templates) or with **Azure OpenAI** (a real model), chosen explicitly, and the two are visibly different in the interface. It cannot diagnose, advise treatment or medication, acknowledge, escalate, dismiss, resolve or change any record. A clinician must complete and record any draft. Every use, including failures and the clinician's accept or reject decision, is audited.
- **Device-agnostic gateway** with adapters, a standard observation format, controlled device-to-newborn association, buffering and ordered resync.

## Technology

React, Vite, TypeScript, React Router, TanStack Query, Recharts, Lucide · Node.js, Express, TypeScript, Zod, WebSockets (`ws`) · PostgreSQL 16 (UUIDs, constraints, triggers, migrations) · Node device gateway and simulator · Azure OpenAI through the official `openai` npm package (optional) · Vitest, Supertest, Playwright.

## Architecture

See [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md). Services: `services/api`, `services/device-gateway`, `services/simulator`, `services/intelligence`, `apps/web`; SQL migrations in `database/migrations`.

## Installation

Requirements: Node.js 20+ (tested on 22), PostgreSQL 16, Python 3 with Playwright (only for the browser tests).

```bash
# 1. Database (example for a local PostgreSQL)
sudo -u postgres psql -c "CREATE USER neocare WITH PASSWORD 'neocare_dev_only' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE neocareai OWNER neocare;"

# 2. Configuration
cp .env.example .env        # then set SESSION_SECRET and GATEWAY_API_KEY (min 16 chars)

# 3. Dependencies, schema and synthetic demo data
npm install
npm run seed:reset          # applies migrations and seeds synthetic data
```

## Configuration

All settings are environment variables (see `.env.example`). **Nothing requires Azure or any paid service**: the product and the competition demo run in Demo Mode by default. Azure variables are optional; real values belong only in your private `.env`, which is git-ignored.

## Running locally

Use four terminals:

```bash
npm run api                                   # API + WebSocket on :4000
npm run gateway                               # device gateway on :4100
npm run web                                   # web workspace on http://localhost:5173
npm run simulate -- --scenario=B --device=SIM-MON-01        # live; add --fast to skip waiting
npm run simulate -- --list                    # list the synthetic scenarios
```

Demo accounts (synthetic, password `DemoPass#2026`): `doctor@`, `nurse@`, `admin@demo.neocareai.test`; `doctor.b@demo.neocareai.test` belongs to a second hospital to demonstrate isolation. Use `npm run seed:reset` to return to a clean state. A walk-through is in [docs/competition/DEMO_SCRIPT.md](docs/competition/DEMO_SCRIPT.md).

## Connecting Azure OpenAI (optional)

**Status: the integration is implemented and tested against a local mock of the Azure OpenAI API, but it has never been connected to a real Azure deployment by the authors. Treat the first live connection as the real test.** Follow these steps, then run the check. Only a passing `npm run ai:check` on your own deployment is evidence of a real connection.

**Azure services needed:** one *Azure OpenAI* resource (also surfaced in *Azure AI Foundry*) with one chat-completions model deployment. A model that supports JSON mode (for example the GPT-4o family) is expected; other model families may need adjustment. Azure AI Search, Foundry agents and other services are **not** used. This is a paid service: usage is billed by Azure, and your quota and rate limits apply.

1. In the Azure portal create an Azure OpenAI resource, then deploy a chat model and note the **deployment name** (not the model name).
2. From the resource's *Keys and Endpoint* page copy the **endpoint** (`https://<resource>.openai.azure.com/`) and a **key**. Choose the region and data-processing settings that fit your policy. Use only synthetic data until governance is settled.
3. Put the values in your private `.env` (never in `.env.example`, never committed):
   ```
   AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com/
   AZURE_OPENAI_DEPLOYMENT=<your-deployment-name>
   AZURE_OPENAI_API_KEY=<key>
   AZURE_OPENAI_API_VERSION=2024-10-21
   ```
   Optional: `AI_TIMEOUT_MS` (default 20000), `AI_MAX_OUTPUT_TOKENS` (default 1500), `AZURE_OPENAI_TEMPERATURE` (leave unset unless your model accepts it).
4. Check the connection with synthetic data (no database, never prints the key):
   ```bash
   npm run ai:check
   ```
   `PASS` shows the model answered and the output passed validation. A `FAIL` prints a category (`credentials`, `misconfigured`, `rate_limited`, `timeout`, `unavailable`, `content_filtered`, `malformed`) or `OUTPUT FAILED VALIDATION`, which means the model answered but its output did not meet the format/grounding rules (a model or prompt compatibility issue).
5. Start the API. As an administrator open **Settings → AI assistance → Test Azure connection**. The result and time are recorded.
6. In an alert, choose **Azure OpenAI** in the "Source of the response" selector. To make Azure the default for everyone set `AI_PROVIDER=azure`. Clinicians can always choose Demo Mode.
7. *Keyless alternative (Microsoft's recommended method; implemented, **not tested**):* `npm install @azure/identity`, set `AZURE_OPENAI_AUTH=entra`, and sign in with an identity that has access to the resource.

If Azure fails, the interface shows the reason and offers **Switch to Demo Mode and run again**. Nothing is ever silently substituted, and a template is always labelled "Demo Mode – Not Connected to Azure".

## Testing

```bash
npm test                                      # 141 automated tests (needs PostgreSQL; uses a local MOCK Azure server, not Azure)
bash scripts/e2e-all.sh                       # 53 browser checks on a fresh stack (starts everything, uses the local mock for the Azure UI flow)
npm run ai:check                              # YOUR real Azure check (needs your credentials)
```

Results and caveats: [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

## Current limitations

Synthetic data and illustrative rules only; no real device; no clinical, regulatory, security or usability validation; the gateway buffer is in memory; **the Azure integration has not been connected to a real Azure deployment**, so real-model quality, hallucination rate, bias, latency and cost are unmeasured; output validation checks format, sources, numbers and unsafe patterns but cannot prove clinical correctness; Demo Mode is templated text; no Azure AI Search or approved clinical knowledge base; browser tests use Chromium only; no accessibility audit with assistive technology.

## Documentation

[Architecture](docs/architecture/ARCHITECTURE.md) · [API](docs/api/API_DOCUMENTATION.md) · [Device integration](docs/device-integration/DEVICE_INTEGRATION.md) · [Clinical safety](docs/clinical-safety/CLINICAL_SAFETY.md) · [Responsible AI](docs/responsible-ai/RESPONSIBLE_AI.md) · [Test report](docs/TEST_REPORT.md) · [Development log](docs/DEVELOPMENT_LOG.md) · [Origin and journey](NEOCAREAI_ORIGIN_AND_JOURNEY.md)
