# Responsible AI Statement

## Where things stand (read this first)

| Capability | Status |
|---|---|
| Demo Mode: fixed templates filled from stored data (not a language model) | **Implemented and tested.** Default |
| Azure OpenAI generative provider through the official SDK | **Implemented.** Tested **only against a local mock of the Azure API**. **Never connected to a real Azure deployment by the authors** |
| Output validation, anonymisation, privacy guard, error handling, clinician decisions, audit | **Implemented and tested** (with the mock) |
| Real-model behaviour: factual accuracy, hallucination rate, safety-filter miss rate, bias, consistency, prompt-injection resistance, cost, latency | **Not measured. Unknown until a real deployment is evaluated** |
| Retrieval of approved clinical guidance (Azure AI Search) | **Not built.** The knowledge base holds system documentation only |
| Alert generation | **Rule-based, transparent, no AI.** The core product works with AI off |

No test in this repository demonstrates that a real language model produces safe or accurate output. The mock returns text that was written to be valid; it shows that *our controls* accept good output and reject bad output, not that a real model will behave.

## Purpose

Help a clinician read and document an alert faster by organising stored data: summarising an alert, explaining stored measurement trends, organising earlier observations and recorded responses, preparing the system-data part of a draft assessment, suggesting neutral questions, and producing a documentation checklist. It never replaces judgement and never decides.

## What it can never do, and how that is enforced

| Rule | Enforcement | Tested |
|---|---|---|
| Never change any record or observation | Tools are read-only; no write path exists in the AI module; the only AI writes are its own append-only audit rows | Record counts unchanged after real-provider calls |
| Never acknowledge, escalate, dismiss or resolve | No such tool. Those actions live only in clinician-permissioned endpoints | Yes |
| Never diagnose, advise treatment or medication | Prompt rules plus two layers of output checks (base filter and strict patterns). Flagged output is rejected and not shown | 15 rejection scenarios (unit) and 12 through the SDK path |
| Never put an unreviewed draft in the record | The server writes the clinician-only fields (the model cannot fill them); the UI blocks recording while any remain; the server returns 422 | Yes (API and browser) |
| Clinician approval is explicit | A draft can only be recorded by its own author, once; rejection is an explicit recorded decision; both are audited | Yes |
| Only what the user may see | Each tool checks the requesting user's permission and hospital; denials are audited | Yes |
| Not a dependency | `AI_ENABLED=false`, any Azure failure, or no configuration leaves the workflow fully working | Yes |

## Output validation (what it does and does not prove)

Before anything from the real model is shown it must: be valid JSON of the expected shape; use only the allowed headings; give every factual statement at least one **source reference that exists** in the supplied records; contain only **numbers that appear in the cited records** (within rounding); mention a measurement (heart rate, respiratory rate, oxygen, temperature) only where a record of that measurement is cited; contain no diagnosis, treatment or medication wording, causes, predictions, severity judgements, reassurance, instructions or markup. Facts are shown with their source chips, a "What the AI did not have" list is always included, and the sources listed are attached by the system, never taken from the model's text.

**Passing these checks does not mean the text is clinically correct.** They cannot detect a statement that is true to the data but misleading, an omission, or a pattern the filters do not know. A real model may also be rejected too often if it does not follow the format. The interface says this next to every result.

## Data privacy

Sent to the provider: measurement values, units, signal quality, times **relative to the alert**, server-computed trend facts, event types and **roles**, and generic system documentation. **Never sent:** newborn identifiers, hospital or unit names, user names or emails, device identifiers, absolute timestamps, gestational age, or free-text clinician notes. A privacy guard checks the serialised request against the real identifiers in the database and against identifier patterns, and refuses to send if anything matches. Credentials are read from the server environment, are never returned to clients and never written to logs or the database (tested). Synthetic data only is used in this project. Before any real data: data-processing agreement, region, retention, abuse-monitoring settings and a legal basis must be settled.

## Audit

Every request records: provider, model/deployment, requested mode, user and role, alert, permission decisions for each tool, validation result and flags, latency, outcome (including failures and rejected output), a SHA-256 digest of the anonymised payload (proves what was sent without storing it), and later the clinician's decision (recorded, whether edited, or rejected). Records are append-only. Neither patient identifiers nor secrets are stored in them (tested).

## Failure behaviour

Azure outages, timeouts, rate limits, bad credentials, wrong deployment, content filtering, truncated or malformed answers and failed validation each produce a specific message. **No template is ever shown in place of a real response.** Clinicians can explicitly switch to Demo Mode, which is labelled "Demo Mode – Not Connected to Azure". Duplicate identical in-flight requests are refused.

## Evaluation still required before any real-model use

Measure on realistic synthetic cases, with neonatal clinician review: factual accuracy against the source records; hallucination and omission rates; false-accept rate of the safety filters (red-team with paraphrased diagnoses and instructions); rejection rate of acceptable output; consistency across runs; bias; prompt-injection resistance; latency and cost; and automation bias in users. Re-run on every model, prompt or API-version change. Appoint a named clinical owner for AI features.

## Known limitations

The first live call may need adjustments (model JSON-mode support, parameters such as temperature, API version). Pattern-based filters can miss paraphrases. Validation can reject legitimate output. The alert rules themselves are illustrative and not clinically approved. Template text is rigid. Keyless Microsoft Entra ID authentication is implemented but untested.
