#!/usr/bin/env bash
# Runs every browser check on a fresh stack. Requires PostgreSQL, Playwright for Python and Chromium.
# Azure is replaced by a LOCAL MOCK on :4500 for the real-provider UI test. This is NOT a connection to Azure.
set -u; cd "$(dirname "$0")/.."
export AZURE_OPENAI_ENDPOINT=http://127.0.0.1:4500 AZURE_OPENAI_API_KEY=mock-key-0123456789abcdef-NOT-A-REAL-KEY AZURE_OPENAI_DEPLOYMENT=neocare-test AI_TIMEOUT_MS=3000; unset AI_PROVIDER
stop(){ pkill -f "[r]un-mock-azure.ts"; pkill -f "[s]rc/server.ts"; pkill -f "[s]rc/gateway.ts"; pkill -f "[v]ite"; }
trap stop EXIT; stop; sleep 1
(npx tsx tests/fixtures/run-mock-azure.ts > /tmp/mock.log 2>&1 &); (npm run api > /tmp/api.log 2>&1 &); (npm run web > /tmp/vite.log 2>&1 &); sleep 10
cycle(){ script=$1; shift; npm run seed:reset >/dev/null 2>&1; pkill -f "[s]rc/gateway.ts"; sleep 1; (npm run gateway > /tmp/gw.log 2>&1 &); sleep 5
  for s in "$@"; do npm run simulate -- --scenario="${s%%:*}" --device="${s##*:}" --fast >/dev/null 2>&1; done
  [ "$script" = ui_workflow ] && curl -s -X POST localhost:4100/connection/SIM-MON-03 -H 'content-type: application/json' -d '{"status":"disconnected"}' >/dev/null
  echo "=== $script ==="; python3 "tests/e2e/$script.py" 2>&1 | grep -E "^(PASS|FAIL)|passed|Traceback|Error" ; }
want(){ [ $# -eq 0 ] && return 0; for a in "$@"; do [ "$a" = "$NAME" ] && return 0; done; return 1; }
ONLY=("$@")
NAME=ui_workflow; want "${ONLY[@]}" && cycle ui_workflow B:SIM-MON-01 D:SIM-MON-02 C:SIM-MON-03
NAME=ai_workflow; want "${ONLY[@]}" && cycle ai_workflow B:SIM-MON-01
NAME=ai_azure_workflow; want "${ONLY[@]}" && cycle ai_azure_workflow B:SIM-MON-01
