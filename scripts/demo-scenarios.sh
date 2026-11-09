#!/usr/bin/env bash
# Starts the three live synthetic scenarios used in the demo, in parallel. Requires the API and gateway to be running.
#   NB-0001 / SIM-MON-01 : B  concerning trend  (illustrative alert appears about 52 s after start, measured)
#   NB-0002 / SIM-MON-02 : E  disconnect and reconnect (not-current state at about 27 s, reconnects at about 57 s, measured)
#   NB-0003 / SIM-MON-03 : C  poor signal (poor readings from about 15 s, data-quality notice at about 27 s, measured)
cd "$(dirname "$0")/.."
echo "Starting synthetic scenarios (all values are fictional)..."
npm run simulate -- --scenario=B --device=SIM-MON-01 >/dev/null 2>&1 &
npm run simulate -- --scenario=E --device=SIM-MON-02 >/dev/null 2>&1 &
npm run simulate -- --scenario=C --device=SIM-MON-03 >/dev/null 2>&1 &
wait
echo "Scenarios finished. Readings will show as 'Not current' about 2 minutes after the last one."
