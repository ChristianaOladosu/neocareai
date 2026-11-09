# Clinical Safety Statement

NeocareAI is an early-stage competition prototype. It is **not** a medical device, has **no** regulatory approval or certification, has **not** been clinically validated, and has **not** been used with real patients. This document states the limits and the design choices that support safe future development. It does not claim compliance with any standard.

## What it must not be used for

Any care of real patients. Any decision about a newborn. Any use with real patient data.

## Human oversight (by design)

- Every alert must be acknowledged by a clinician; nothing closes automatically, even if values return to a previous level.
- Resolution requires a recorded clinician assessment. Every transition is attributed and timestamped in an append-only history.
- Opening an alert never changes it.
- AI assistance cannot diagnose, advise treatment, dismiss or resolve alerts, or alter records (see RESPONSIBLE_AI.md).

## Illustrative rules

All rules and thresholds (for example heart rate above 180, respiratory rate above 65, SpO₂ below 90 on three consecutive readings) are **placeholders to exercise the software**. They are not clinical guidance and must never be presented as such. They are labelled "illustrative" in the data, the explanation text, the UI and the AI summaries. Before any real use, qualified neonatal clinicians must define, review, approve and version the rules.

## Hazards considered and mitigations

| Hazard | Mitigation in the prototype | Residual risk |
|---|---|---|
| Stale data mistaken for live | Server computes staleness; stale or disconnected values are struck through and labelled | Needs usability testing with clinicians |
| Poor signal read as "stable" | Quality shown separately; poor data never triggers or clears alerts; explicit wording | Quality logic is simple, not validated signal analysis |
| Missed alert | Unacknowledged alerts shown in badge, notification centre and overview | Notification channels (pager, audible) not built |
| Wrong-baby attribution | One active assignment per device and newborn; mismatches rejected; audited; confirmation dialog | Physical cot-side verification is a human process |
| Alert fatigue | One open alert per newborn per rule | Not evaluated with real workloads |
| Over-reliance on AI | Prominent Demo Mode label, scope statement, placeholders that must be completed, safety filter | Behaviour of a real language model is not evaluated |
| Silent history change | Database triggers block UPDATE/DELETE on history | A database superuser could still alter data |
| Cross-hospital exposure | Hospital filter on every query; tested | Row-level security not enabled |
| Rule or software error | Automated tests; rules versioned and stored with each alert | No clinical safety case, no independent review |

## Known gaps against the original product specification

- Nurse access is hospital-wide; the specified restriction to *assigned* newborns and units is **not** implemented.
- Unit creation/editing and user disable/edit are not implemented (units and users are listed; users can be added).
- Manual observation entry exists as an API but has no UI form.
- No notification channel beyond the in-app badge and list.
- No data-retention or deletion policy is implemented.

## Required before any real-world use

1. Neonatal clinician involvement in design and rules.
2. Clinical protocol review and approval of every rule.
3. Clinical validation (retrospective, then prospective) with predefined performance measures.
4. Device compatibility testing against manufacturer documentation.
5. Cybersecurity assessment and penetration testing.
6. Privacy and data-governance review under the data protection and health-information law of each intended deployment jurisdiction (to be identified by the team with legal advice).
7. Regulatory assessment (software as a medical device) in each target market.
8. Usability testing and a clinical safety case with a named clinical safety officer.

Nothing here is legal or regulatory advice.
