# The Origin and Journey of NeocareAI

> Sections marked **[TEAM TO COMPLETE]** need facts only the team can supply. They are left blank on purpose so that authorship and contributions are recorded accurately and nothing is invented.

## 1. The beginning of the idea

NeocareAI emerged from an exploration of how artificial intelligence and digital health technologies could contribute to earlier identification of health risks and improve healthcare delivery.

During the development of the concept, the focus evolved from general child-health monitoring towards a more specific and critical problem: delayed recognition of clinical deterioration.

We recognised that monitoring a patient's physiological measurements is only one part of effective care. The ability to recognise concerning changes, interpret emerging patterns, communicate clinical concerns and ensure timely professional responses is equally important.

## 2. The original idea creator

**[TEAM TO COMPLETE]** Name(s) of the person or people who originated the idea, and when.

## 3. Team members and their actual contributions

**[TEAM TO COMPLETE]** One entry per person: name, role, and what they personally contributed (for example concept, clinical input, research, design, engineering, writing, presentation).

| Name | Role | Actual contribution |
|------|------|---------------------|
| _[to be added]_ | _[to be added]_ | _[to be added]_ |

Engineering note: the software foundation described in this repository (backend, database, device gateway, simulator, intelligence engine, web workspace and tests) was built with AI engineering assistance under the founders' direction. This is recorded here for accuracy.

## 4. Why neonatal healthcare was selected

This led to the decision to focus initially on neonatal care.

Newborns are particularly vulnerable, and changes in their physiological condition can require prompt clinical attention. However, collecting measurements alone does not guarantee that concerning trends will be recognised early enough.

**[TEAM TO COMPLETE, optional]** Any further, personally held reasons the team wants recorded, in the team's own words.

## 5. The product vision

We therefore envisioned a system that could help bridge the gap between physiological monitoring and clinical response.

NeocareAI was developed around this vision: an AI-assisted neonatal clinical monitoring and decision-support platform designed to help healthcare professionals identify concerning physiological trends, understand why alerts are generated and maintain accountability throughout the clinical response process.

The product evolved into a connected clinical workspace incorporating newborn registration, physiological observations, live monitoring, signal-quality awareness, trend visualisation, explainable alerts and clinical response documentation.

An important principle throughout its development has been that artificial intelligence should support, not replace, clinical judgement. Clinical professionals remain responsible for assessment and intervention.

## 6. Major architectural decisions

These are decisions recorded during development, with the reason for each.

- **Modular monorepo** with separate web app, API, device gateway, simulator and intelligence packages, so each part can be tested and replaced independently.
- **The core product does not depend on generative AI.** Ingestion, storage, signal-quality checks, trend analysis, rules and alert management run without any external AI service. AI assistance is optional and sits on top.
- **Explainable, rule-based alerts first.** Every alert keeps its triggering readings, historical context, rule identifier and version, and signal quality, so a clinician can see why it was raised.
- **Signal quality is separate from physiological status.** Poor or missing signal never triggers a physiological alert and is never shown as "stable". Repeated poor signal produces a distinct data-quality notice.
- **Stale data is never shown as live.** Readings that are old, or come from a disconnected device, are visibly marked "Not current".
- **The gateway never chooses the newborn.** Attribution comes from the device's active assignment in the database, and a mismatch is rejected. Assignments and reassignments are audited.
- **Append-only clinical history.** Audit logs, response events and clinical assessments cannot be updated or deleted, enforced by database triggers rather than application code alone.
- **Hospital-level data isolation** on every query, returning "not found" for another hospital's records.
- **No automatic resolution.** An alert is never closed because a value returns to normal. Only a clinician can resolve it, after recording an assessment.
- **Administrators have no automatic clinical access.**

## 7. Important technical challenges

Recorded honestly, including defects found by testing:

- **Stored device state corrupted data quality.** Newly registered devices start as "disconnected", and ingestion treated that as "reading unavailable", so no alert could ever fire. Found by the integration tests; fixed so a message from a device counts as evidence it is connected, and lateness is judged by a delay check instead.
- **A failing sensor could be hidden by healthy ones.** The data-quality rule originally looked at the last readings across all sensors. Fixed to evaluate each measurement separately, with a regression test.
- **Representing missing and delayed data truthfully.** Missing measurements are shown as missing, never invented; delayed or buffered messages are kept but marked questionable.
- **Test environment issues.** A reset script silently did nothing and left stale data; corrected and re-verified on clean data.

## 8. Development milestones

| Date | Milestone | Evidence |
|------|-----------|----------|
| 2026-11-08 | Phase 1: monorepo foundation, PostgreSQL, environment templates | Database connection verified |
| 2026-11-08 | Phase 2: schema, authentication, permissions, newborns, observations, alert lifecycle, audit, intelligence rules | 27 automated tests passing |
| 2026-11-08 | Phase 3: device gateway and synthetic simulator (scenarios A to F) | 39 automated tests passing; live run with separate processes |
| 2026-11-08 | Phase 5/6: React clinical workspace and alert response workflow | 20 of 20 browser checks passing |

See `docs/DEVELOPMENT_LOG.md` for detail. Not yet complete: AI assistance layer, full documentation set, Docker files (untested), pitch materials.

## 9. Competition milestones

**[TEAM TO COMPLETE]** Name of the competition, stages, dates and outcomes. Only the submission deadline of Friday 13 November 2026 has been stated so far. No awards, partnerships or endorsements are claimed.

## 10. Future plans

The initial prototype uses simulated monitoring devices and synthetic data to demonstrate the proposed workflow. Clinical validation, integration with real monitoring equipment and evaluation in actual neonatal care environments remain future development priorities.

Our long-term vision is to contribute to safer neonatal care by helping healthcare professionals move from simply collecting patient measurements to recognising concerning changes and responding with greater awareness and accountability.

Required before any real-world use: involvement of neonatal clinicians; clinical review and approval of all alert rules and thresholds (current ones are illustrative); clinical validation; device compatibility testing against manufacturer documentation; cybersecurity assessment; privacy and data-governance review for the intended jurisdictions; applicable regulatory assessment; and usability testing with intended users.

---
*NEOCAREAI: Earlier awareness. Clearer decisions. More accountable neonatal care.*
