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
| AI assistance (summary and draft assessment) | **Built in Demo Mode** with a local template provider. Not a language model |
| Azure OpenAI provider | **Written, never run against Azure** (no credentials) |
| Azure AI Search / retrieval of approved clinical guidance | **Not built** |
| Real medical-device integration (HL7, FHIR, IEEE 11073, vendor APIs) | **Not built.** Architecture allows it |
| Docker / Docker Compose | **Not provided** (no Docker in the build environment) |
| Clinical validation, regulatory assessment, security assessment | **Not done** |

## Main features

- **Live monitoring** where stale or disconnected readings are struck through and labelled "Not current", and signal quality is shown separately from the value.
- **Explainable alerts** that keep the triggering readings, recent context, rule and version, and signal quality.
- **Accountable response**: every acknowledgement, assessment, escalation and resolution is attributed to a named user and time. Alerts never close automatically.
- **Controlled AI assistance** (Demo Mode): summarises an existing alert and prepares a draft the clinician must complete. It cannot diagnose, advise treatment, dismiss, resolve or change any record. Every use is audited.
- **Device-agnostic gateway** with adapters, a standard observation format, controlled device-to-newborn association, buffering and ordered resync.

## Technology

React, Vite, TypeScript, React Router, TanStack Query, Recharts, Lucide · Node.js, Express, TypeScript, Zod, WebSockets (`ws`) · PostgreSQL 16 (UUIDs, constraints, triggers, migrations) · Node device gateway and simulator · Vitest, Supertest, Playwright.

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

All settings are environment variables (see `.env.example`). Nothing needs Azure or any paid service. `AI_PROVIDER=mock` (default) uses the local Demo Mode provider. Azure variables are optional and unverified.

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

## Testing

```bash
npm test                                      # 72 automated tests (needs PostgreSQL)
python3 tests/e2e/ui_workflow.py              # 20 browser checks (stack running, scenarios loaded)
python3 tests/e2e/ai_workflow.py              # 15 browser checks for AI assistance
```

Results and caveats: [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

## Current limitations

Synthetic data and illustrative rules only; no real device; no clinical, regulatory, security or usability validation; the gateway buffer is in memory; the demo AI provider is templated text; Azure integration is unverified; browser tests use Chromium only; no accessibility audit with assistive technology.

## Documentation

[Architecture](docs/architecture/ARCHITECTURE.md) · [API](docs/api/API_DOCUMENTATION.md) · [Device integration](docs/device-integration/DEVICE_INTEGRATION.md) · [Clinical safety](docs/clinical-safety/CLINICAL_SAFETY.md) · [Responsible AI](docs/responsible-ai/RESPONSIBLE_AI.md) · [Test report](docs/TEST_REPORT.md) · [Development log](docs/DEVELOPMENT_LOG.md) · [Origin and journey](NEOCAREAI_ORIGIN_AND_JOURNEY.md)
