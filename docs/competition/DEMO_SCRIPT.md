# Demonstration Script (about 9 minutes)

Goal: show one connected story, from a measurement to an accountable clinical response, with **controlled AI assistance** as the visible differentiator. Everything shown is synthetic. Say so at the start.

## Setup (10 minutes before)

```bash
npm run seed:reset
npm run api         # terminal 1
npm run gateway     # terminal 2
npm run web         # terminal 3  -> http://localhost:5173
```

Open three browser windows (or profiles), each signed in: **Doctor** (`doctor@demo.neocareai.test`), **Nurse** (`nurse@…`), **Administrator** (`admin@…`), password `DemoPass#2026`. Put the Doctor window on **Live Monitoring**. Keep `bash scripts/demo-scenarios.sh` ready in a fourth terminal. Do not start it yet. Test once, then `npm run seed:reset` again.

## Run of show

| Time | Who | Do | Say (adapt, keep claims honest) |
|---|---|---|---|
| 0:00 | Slide | Title | "NeocareAI helps teams close the gap between observing a newborn and responding to what the observations mean. Everything you will see is synthetic, rules are illustrative, and it is a prototype." |
| 0:30 | Admin | **Newborns** → Register newborn NB-0100 (no names). Then **Devices** → Register device SIM-MON-04 (ticked "Simulated") → Assign to NB-0100 | "A hospital administrator registers a baby and links a monitor. The device can only send data for the baby it is assigned to. Reassignment is confirmed and audited. Note the simulator is labelled as a simulated device." |
| 1:30 | Doctor | On **Live Monitoring**, run `bash scripts/demo-scenarios.sh` | "Three simulated monitors are now sending. I'll narrate while they run." |
| 1:45 | Doctor | Watch NB-0003 (poor signal at ~15 s) | "This baby's sensor signal is poor. Look at how it is shown: signal quality is separate from the value. The system will not treat poor signal as 'stable' and will not raise a clinical alert from it. It raises a data-quality notice instead." |
| 2:20 | Doctor | Watch NB-0002 (disconnect at ~25 s) | "This monitor disconnected. The numbers are struck through and marked Not current. We never show a stale value as a live normal reading. When it reconnects, buffered readings are delivered in order." |
| 2:50 | Doctor | NB-0001 rises, bell badge appears (~50 s). Open the bell | "NB-0001's heart rate and respiratory rate have both stayed above the demo thresholds across consecutive good-quality readings. The alert arrived in real time." |
| 3:30 | Doctor | Open the alert (**Review alert**) | "Opening it does not dismiss it. It says why: which rule and version, the exact triggering readings, their signal quality, and the context. The banner reminds you this is an illustrative rule, not clinical guidance." |
| 4:15 | Doctor | **AI assistance panel**: point at the label, then **Summarise this alert** | "This is the controlled AI assistance, shown in Demo Mode, not connected to Azure. It summarises the stored data and nothing else. It does not diagnose, advise treatment, or change anything. Sources and limitations are one click away." Open **Sources and limitations**. |
| 5:00 | Doctor | **Prepare draft assessment**. Point to the three bracketed fields. Note **Edit draft** is disabled | "The draft fills in what the system knows and deliberately leaves the clinical parts blank. It cannot be edited into the record until the alert has been acknowledged by a clinician." |
| 5:30 | Nurse | Open the same alert → **Acknowledge alert**. Point out the nurse has Summarise but no Draft button | "Roles matter. The nurse can acknowledge and read the summary. Only a doctor can assess, escalate or resolve." |
| 6:00 | Doctor | **Prepare draft assessment** → **Edit draft in assessment form**. Try to record (button disabled). Replace the three fields with a short synthetic note. Record | "The clinician owns the assessment. The system will not accept it while placeholders remain. When it is recorded, the history shows it started from an AI draft, written and recorded by the clinician." |
| 7:00 | Doctor | **Resolve** with a note. Open **Response Log** | "Resolution is a person's decision with a recorded reason. The log is append-only. Even a database update to this history is blocked." |
| 7:40 | Admin | **Settings → AI assistance** | "Administrators can oversee all AI use: who asked, for which alert, which tools ran, whether anything was withheld. Administrators cannot see clinical data themselves." |
| 8:20 | Slide | Honest status | "What is real: this working workflow, tests, audit. What is planned: real devices, clinician-approved rules, validation, Azure. We are not claiming clinical performance." |
| 8:50 | | Questions | |

## If something goes wrong

- Alert slow to appear: scenario B alerts after ~50 s; keep talking about quality and disconnection. If still absent, run `npm run simulate -- --scenario=B --device=SIM-MON-01 --fast` (instant, same alert).
- Readings all show "Not current": scenarios ended more than 2 minutes ago. This is the feature working. Run `npm run simulate -- --scenario=A --device=SIM-MON-01 --fast` to refresh.
- Service crashed: restart that terminal; data persists. As a last resort, `npm run seed:reset` and re-run.
- Keep screenshots of each step as a backup.

## Things not to say

"Clinically validated", "predicts deterioration", "reduces mortality", "approved", "deployed in hospitals", "connected to real monitors", "uses GPT/Azure" (it is Demo Mode and templated), "the AI decides".

## Backup three-sentence version (if time is cut)

Monitoring shows quality and staleness honestly → an explainable alert arrives with its evidence → AI assistance summarises and drafts, but a named clinician must complete, record and resolve, and everything is auditable.
