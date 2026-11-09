# Responsible AI Statement

## Honest summary

- The AI assistance in this prototype runs in **Demo Mode – Not Connected to Azure**. It uses a **local template provider**: fixed text templates filled with numbers from the alert data. **It is not a language model**, makes no network calls and needs no credentials.
- An **Azure OpenAI provider is written but has never been run against Azure**, because no credentials were available. It is an integration seam, not a demonstrated capability.
- The alert engine itself is **rule-based, transparent and does not use AI**. The product's core works without any AI service.
- No retrieval of approved clinical guidance exists. The small knowledge base holds **system documentation only** (how rules, signal quality, the lifecycle and AI assistance work), with identifiable source IDs. No clinical guidance is loaded or invented.

## Purpose

Reduce the reading effort of an alert: organise the stored evidence, and give the clinician a starting structure for their own assessment. It never replaces judgement.

## What it can do

Summarise an existing alert from stored data (rule, readings, trend, signal quality, earlier context, response so far, sources, limitations, neutral questions for the team) and prepare a draft assessment whose system-data lines are filled in and whose three clinical fields are left for the clinician.

## What it cannot do (enforced, not just promised)

| Rule | How it is enforced | Tested |
|---|---|---|
| Cannot change anything | Tools are read-only; no write tool exists; the AI path performs no writes to alerts, assessments or observations | Yes: counts unchanged after AI use |
| Cannot acknowledge, escalate, dismiss or resolve | No such tool; status transitions live only in clinician-permissioned endpoints | Yes |
| Cannot diagnose or advise treatment | Output safety filter on every provider's output blocks diagnosis, treatment, dismissal, reassurance and autonomous-action language; flagged output is withheld and recorded | Yes: 14 phrase cases plus no false positives on the demo's own text |
| Cannot put an unreviewed draft in the record | Draft contains three `[Clinician to complete …]` fields; UI disables recording while any remain; server returns 422 | Yes (API and browser) |
| Only sees what the user may see | Each tool checks the requesting user's permission and hospital; denials are audited | Yes |
| Cannot leak identifiers | Provider receives an anonymised bundle: no newborn identifier, name or user identity | Yes (checked in the stubbed Azure request) |
| Must be auditable | Every request, tool call, denial, outcome and safeguard flag is stored append-only and audited | Yes |
| Must not be a dependency | `AI_ENABLED=false` and provider failure leave the workflow working; Azure failure falls back to Demo Mode | Yes |

Tool use is a **fixed, controlled workflow** chosen by the service, not by a model, which removes tool-selection risk. A future agentic design would need its own safety case.

## Evaluation performed (and not performed)

| Dimension | What was done | What was not done |
|---|---|---|
| Grounding | Automated check that every measurement value stated by the demo provider exists in the alert data | Not evaluated for a real language model |
| Hallucination | N/A for templates (no free generation) | Real-model hallucination rate unknown |
| Unsafe recommendations | Filter tests against 14 unsafe phrasings; stubbed model returning a diagnosis and "no action needed" is withheld | The filter is pattern-based and can miss paraphrases; no red-team evaluation |
| Source attribution | Sources are attached by the system from what was actually retrieved, never taken from model output | No retrieval of approved clinical material exists |
| Consistency | Demo provider is deterministic | Model consistency untested |
| Bias | Not evaluated | Needed for any model-generated text and for the rules themselves |
| Missing context | Every output lists its limits ("no bedside or clinical context") | Not tested with clinicians |
| Prompt injection | Inputs are system-generated alert data, not free text | Not tested with a real model |
| Usability / automation bias | Not tested | Clinicians may over-trust fluent text; needs a usability study |

## Limitations

The summary can only restate stored data; it cannot know the clinical situation. Template text is rigid. The filter is a safety net, not a guarantee. Alert rules are illustrative, so any summary of an alert inherits that status (it says so). A future model-based provider must repeat the evaluation above on realistic synthetic cases, with clinician review, before any use.

## Privacy

Synthetic data only. Nothing is sent outside the system in Demo Mode. If Azure were enabled: only the anonymised bundle would be sent, and a data-processing agreement, region, retention and consent position would need to be settled first. Do not send identifiable patient information to external AI services.

## Governance for a future deployment

Named clinical owner for AI features · versioned prompts and safeguards · periodic review of the AI activity log (already available to administrators) · incident process for withheld or wrong outputs · re-evaluation on every model or prompt change.
