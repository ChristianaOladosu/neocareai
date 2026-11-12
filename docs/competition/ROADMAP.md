# Product Roadmap and Deployment Strategy

An ordered sequence with prerequisites. **No dates, costs or outcomes are promised.** Timelines should be set with clinical and hospital partners.

| Stage | Focus | Needs before it can start | Exit criteria |
|---|---|---|---|
| 0. Prototype (now) | Working workflow on synthetic data; Demo Mode AI | n/a | Demonstrated; documented; tested |
| 1. Clinical co-design | Neonatal clinicians review workflows, language, alert rules, and "what would you actually want to see" | Clinical partners; ethics and governance as applicable | Clinician-approved rule set and written requirements; usability findings |
| 2. Hardening | Nurse assignment scoping, unit and user management, notification channels (audible, pager), durable gateway queue, retention policy, row-level security, accessibility audit, threat model, penetration test, Docker packaging | Stage 1 requirements | Security and accessibility findings closed |
| 3. Device integration | First real adapter(s) for documented interfaces (HL7 v2, FHIR, IEEE 11073 or a manufacturer API) | Manufacturer documentation, hardware, hospital authorisation | Conformance and fault-injection tests pass on real hardware in a lab |
| 4. AI evaluation | **The Azure OpenAI integration already exists** (tested against a mock). Connect it to a real deployment (`npm run ai:check`), then evaluate grounding, hallucination, filter misses, bias, consistency, injection, latency and cost on synthetic cases with clinician review; if useful add Azure AI Search with an approved, versioned knowledge base | Azure access; approved corpus; evaluation plan; clinical reviewers | Documented evaluation reviewed by clinicians; go/no-go for each AI feature |
| 5. Clinical validation | Retrospective, then prospective silent-mode evaluation with predefined measures | Ethics approval, data governance, clinical lead | Pre-registered results; safety case |
| 6. Regulatory and pilot | Software-as-a-medical-device assessment per market; supervised pilot | Quality management system, clinical safety officer, regulatory advice | Approval route confirmed; pilot agreement |

## Deployment strategy (principles)

Start with a single neonatal unit as a supervised, non-interfering "silent mode" pilot before any clinical reliance. Keep the existing monitoring and escalation processes in place. Keep AI optional and switchable. Own the data-governance position before touching real data.
