# Pitch Content

Audiences: healthcare professionals, technology experts, innovation judges, investors, potential hospital partners. Tone: calm, precise, honest. **Do not invent partnerships, results, endorsements or users.**

## Slide outline with speaker notes

**1. Title.** NeocareAI, *Earlier awareness. Clearer decisions. More accountable neonatal care.* Notes: say "prototype, synthetic data" in the first minute.

**2. The problem.** Newborns can change quickly; teams monitor several babies; observations may be periodic; information is fragmented; sensors fail; a pattern across measurements is easy to miss. Notes: speak from the team's own account; do not add statistics unless you can cite a source.

**3. The gap.** Observation → recognition → response. Collecting measurements does not guarantee concerning trends are recognised, acknowledged and acted on. Six questions: what is happening, can I trust the data, what changed, why this alert, who reviewed it, what was done.

**4. The solution.** One connected workspace: observations, signal quality, trends, explainable alerts, clinical response, audit. Show the flow diagram.

**5. Live demonstration.** (Use DEMO_SCRIPT.md.)

**6. What makes it different** (all built): quality-aware (poor signal is never "stable"; stale data is never live) · explainable (every alert carries evidence, rule version, quality) · accountable (acknowledge, assess, escalate, resolve; append-only) · device-agnostic architecture (adapters, standard format, controlled association) · **controlled AI assistance** (read-only, permission-checked, audited, cannot decide).

**7. Controlled AI, in more detail.** What it does (summarise, draft with clinician-only fields). What it cannot do (diagnose, advise treatment, dismiss, resolve, change records), enforced by read-only tools, an output safety filter and a server-side block on incomplete drafts. Every use is logged. Works with AI switched off. **State clearly: demonstrated in Demo Mode with a local template provider; Azure integration is prepared but not connected.**

**8. Architecture.** Monitor or simulator → device gateway → backend API → PostgreSQL → signal quality → trend analysis → explainable alert engine → AI assistance → React clinical workspace → clinical response.

**9. Responsible by design.** Human oversight, illustrative thresholds labelled everywhere, synthetic data, audit, hospital isolation, role-limited access, honest limits. Known gaps listed (see below).

**10. Where we are today.** Use the status table below. Built and tested: 72 automated tests and 35 browser checks pass. Not done: real devices, clinical validation, approved rules, regulatory work, Azure connection.

**11. Roadmap.** See ROADMAP.md. Sequence and prerequisites, not dates or promises.

**12. What we are looking for.** Neonatal clinicians to review rules and workflows; hospital or clinical-engineering partners for device compatibility work; guidance on validation and regulation. (Adapt to the competition's actual objectives. No funding figure or commercial claim is made here.)

## Status table (use verbatim on slide 10)

| Built and tested | Built, limited | Planned |
|---|---|---|
| Auth, roles, hospital isolation | AI assistance (Demo Mode, templated) | Real device adapters |
| Newborn registry and profiles | Signal quality (data-validity checks only) | Clinician-approved rules |
| Simulator and device gateway | Rule engine (illustrative rules) | Clinical validation |
| Explainable alerts | Azure provider (written, never run) | Azure AI Search with approved guidance |
| Acknowledge, assess, escalate, resolve | | Nurse assignment scoping, notifications |
| Append-only history and audit | | Security assessment, regulatory pathway |

## Anticipated questions

**"Is this clinically validated?"** No. Rules are illustrative placeholders; validation requires neonatal clinicians and a study.
**"Does it work with real monitors?"** Not yet. Only a simulator. The gateway and adapter design are built so a real adapter can be added once manufacturer documentation and hardware are available.
**"Is this using GPT or Azure?"** The demo runs a local template provider, clearly labelled. An Azure provider is written but untested, because we had no credentials. The core product does not depend on it.
**"Why not just use an LLM for alerts?"** Alerts must be explainable and reproducible, so they come from transparent versioned rules. AI only helps read and document, under controls.
**"What stops the AI giving medical advice?"** It has no write tools, a safety filter on every output, and drafts that cannot be recorded until a clinician completes them. For a real model we would add red-team evaluation first.
**"How do you avoid alert fatigue?"** One open alert per rule per newborn and quality gating. Not yet evaluated with real workloads.
**"Privacy?"** Synthetic data only; anonymised AI inputs; hospital isolation; audit. A real deployment needs a data-governance review for its jurisdiction.
**"Who owns the idea?"** Answer from NEOCAREAI_ORIGIN_AND_JOURNEY.md once the team has filled it in.
**"What's the business model / market size?"** Not part of this prototype; do not state figures without sources.

## Responsible AI statement (one slide or spoken)

"AI in NeocareAI supports clinicians and never replaces them. The alert engine is transparent and rule-based. AI assistance only reads existing data, cannot change records or make decisions, and every use is logged. Today it runs in Demo Mode with a local template provider. Any future language model would be evaluated for grounding, safety and bias with clinicians before use."

## Clinical safety statement (one slide or spoken)

"NeocareAI is a prototype for demonstration. It is not a medical device, is not clinically validated and has no regulatory approval. All data is synthetic and all thresholds are illustrative. Clinical validation, device testing, cybersecurity review and regulatory assessment are required before any real use."
