# Pitch Content

Audiences: healthcare professionals, technology experts, innovation judges, investors, potential hospital partners. Tone: calm, precise, honest. **Do not invent partnerships, results, endorsements or users.**

## Slide outline with speaker notes

**1. Title.** NeocareAI, *Earlier awareness. Clearer decisions. More accountable neonatal care.* Notes: say "prototype, synthetic data" in the first minute.

**2. The problem.** Newborns can change quickly; teams monitor several babies; observations may be periodic; information is fragmented; sensors fail; a pattern across measurements is easy to miss. Notes: speak from the team's own account; do not add statistics unless you can cite a source.

**3. The gap.** Observation → recognition → response. Collecting measurements does not guarantee concerning trends are recognised, acknowledged and acted on. Six questions: what is happening, can I trust the data, what changed, why this alert, who reviewed it, what was done.

**4. The solution.** One connected workspace: observations, signal quality, trends, explainable alerts, clinical response, audit. Show the flow diagram.

**5. Live demonstration.** (Use DEMO_SCRIPT.md.)

**6. What makes it different** (all built): quality-aware (poor signal is never "stable"; stale data is never live) · explainable (every alert carries evidence, rule version, quality) · accountable (acknowledge, assess, escalate, resolve; append-only) · device-agnostic architecture (adapters, standard format, controlled association) · **controlled AI assistance** (read-only, permission-checked, audited, cannot decide).

**7. Controlled AI, in more detail.** What it does (summarise, explain stored trends, organise earlier observations and responses, draft documentation with clinician-only fields, suggest neutral questions). What it cannot do (diagnose, advise treatment or medication, acknowledge, escalate, dismiss, resolve, change records), enforced by read-only permissioned tools, anonymised minimum-necessary inputs, output validation (every fact must cite a stored record and use only its numbers), and a server-side block on incomplete drafts. Every use, failure and the clinician's accept or reject decision is logged. Works with AI switched off. **State clearly which mode you ran: Demo Mode (templates), or Azure OpenAI only if a connection test passed on the day. The real Azure integration is implemented and tested against a simulated Azure service; it has not yet been connected to a real deployment.**

**8. Architecture.** Monitor or simulator → device gateway → backend API → PostgreSQL → signal quality → trend analysis → explainable alert engine → AI assistance → React clinical workspace → clinical response.

**9. Responsible by design.** Human oversight, illustrative thresholds labelled everywhere, synthetic data, audit, hospital isolation, role-limited access, honest limits. Known gaps listed (see below).

**10. Where we are today.** Use the status table below. Built and tested: 141 automated tests and 53 browser checks pass. Not done: real devices, clinical validation, approved rules, regulatory work, a real Azure connection and real-model evaluation.

**11. Roadmap.** See ROADMAP.md. Sequence and prerequisites, not dates or promises.

**12. What we are looking for.** Neonatal clinicians to review rules and workflows; hospital or clinical-engineering partners for device compatibility work; guidance on validation and regulation. (Adapt to the competition's actual objectives. No funding figure or commercial claim is made here.)

## Status table (use verbatim on slide 10)

| Built and tested | Built, limited | Planned |
|---|---|---|
| Auth, roles, hospital isolation | AI assistance: Demo Mode templates | Real device adapters |
| Newborn registry and profiles | Signal quality (data-validity checks only) | Clinician-approved rules |
| Simulator and device gateway | Rule engine (illustrative rules) | Clinical validation |
| Explainable alerts | Azure OpenAI integration (tested against a mock only) | Real-model evaluation; Azure AI Search with approved guidance |
| Acknowledge, assess, escalate, resolve | | Nurse assignment scoping, notifications |
| Append-only history and audit | | Security assessment, regulatory pathway |

## Anticipated questions

**"Is this clinically validated?"** No. Rules are illustrative placeholders; validation requires neonatal clinicians and a study.
**"Does it work with real monitors?"** Not yet. Only a simulator. The gateway and adapter design are built so a real adapter can be added once manufacturer documentation and hardware are available.
**"Is this using GPT or Azure?"** The real integration to Azure OpenAI is implemented and tested against a simulated Azure service, and a one-command check (`npm run ai:check`) establishes a live connection. Say which mode you are actually running. If Azure was not verified, say: "Today's demo is in Demo Mode; the Azure integration is ready to connect." Never imply a real model produced Demo Mode text.
**"Why not just use an LLM for alerts?"** Alerts must be explainable and reproducible, so they come from transparent versioned rules. AI only helps read and document, under controls.
**"What stops the AI giving medical advice?"** Layers: it has no write tools; its inputs are anonymised records; every fact must cite a stored record and use only that record's numbers; diagnosis, treatment, causes, predictions and instructions are rejected by pattern checks; the clinical fields of a draft are written by the server and left blank; and a clinician must complete and record it. Honest limit: these checks cannot prove a statement is clinically correct, the pattern checks can miss paraphrases, and real-model behaviour has not been evaluated yet. That evaluation is the next step.
**"How do you avoid alert fatigue?"** One open alert per rule per newborn and quality gating. Not yet evaluated with real workloads.
**"Privacy?"** Synthetic data only; anonymised AI inputs; hospital isolation; audit. A real deployment needs a data-governance review for its jurisdiction.
**"Who owns the idea?"** Answer from NEOCAREAI_ORIGIN_AND_JOURNEY.md once the team has filled it in.
**"What's the business model / market size?"** Not part of this prototype; do not state figures without sources.

## Responsible AI statement (one slide or spoken)

"AI in NeocareAI supports clinicians and never replaces them. The alert engine is transparent and rule-based. AI assistance only reads anonymised existing data, cannot change records or make decisions, must cite stored records for every fact, and every use and every clinician decision is logged. We have implemented an Azure OpenAI integration and tested it against a simulated service; a real model must be evaluated for accuracy, safety and bias with clinicians before any real use."

## Clinical safety statement (one slide or spoken)

"NeocareAI is a prototype for demonstration. It is not a medical device, is not clinically validated and has no regulatory approval. All data is synthetic and all thresholds are illustrative. Clinical validation, device testing, cybersecurity review and regulatory assessment are required before any real use."
