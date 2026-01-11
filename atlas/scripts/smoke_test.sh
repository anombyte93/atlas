#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
CONTROL_DIR="$ROOT_DIR/atlas/services/control-plane"
BIN="$CONTROL_DIR/control-plane"

export ATLAS_API_TOKEN="test-token"
export ATLAS_INSECURE="1"
export ATLAS_LISTEN_ADDR=":18080"
export ATLAS_DATA_DIR="$(mktemp -d)"

cd "$CONTROL_DIR"
if [ ! -x "$BIN" ]; then
  go build -o "$BIN" ./cmd/control-plane
fi

"$BIN" >/tmp/atlas-control-plane.log 2>&1 &
CP_PID=$!
trap 'kill $CP_PID 2>/dev/null || true; rm -rf "$ATLAS_DATA_DIR"' EXIT

sleep 1

for _ in {1..5}; do
  if curl -sS -H "Authorization: Bearer $ATLAS_API_TOKEN" http://localhost:18080/health >/dev/null; then
    break
  fi
  sleep 1
done

TASK_ID="task-smoke-$(date +%s)"

curl -sS -H "Authorization: Bearer $ATLAS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"schema_version":"1.0.0","id":"'$TASK_ID'","type":"shell","command":"echo ok","timeout_sec":5,"required_tags":["role:server"],"max_attempts":1}' \
  http://localhost:18080/tasks/submit >/dev/null

CLAIM=$(curl -sS -H "Authorization: Bearer $ATLAS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags":["role:server"],"agent_id":"agent-smoke"}' \
  http://localhost:18080/tasks/claim || true)

if [ -z "${CLAIM// /}" ]; then
  echo "claim failed (empty response)"
  curl -sS -H "Authorization: Bearer $ATLAS_API_TOKEN" http://localhost:18080/tasks/list || true
  tail -n 50 /tmp/atlas-control-plane.log || true
  exit 1
fi

export CLAIM_JSON="$CLAIM"
CLAIM_ID=$(python3 - <<'PY'
import json, os
try:
    data = json.loads(os.environ.get('CLAIM_JSON',''))
    print(data.get('id',''))
except Exception:
    print('')
PY
)

if [ -z "$CLAIM_ID" ]; then
  echo "claim failed (invalid json)"
  echo "$CLAIM"
  curl -sS -H "Authorization: Bearer $ATLAS_API_TOKEN" http://localhost:18080/tasks/list || true
  tail -n 50 /tmp/atlas-control-plane.log || true
  exit 1
fi

if [ "$CLAIM_ID" != "$TASK_ID" ]; then
  echo "claim failed"
  echo "$CLAIM"
  curl -sS -H "Authorization: Bearer $ATLAS_API_TOKEN" http://localhost:18080/tasks/list || true
  tail -n 50 /tmp/atlas-control-plane.log || true
  exit 1
fi

curl -sS -H "Authorization: Bearer $ATLAS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"schema_version":"1.0.0","id":"'$TASK_ID'","claimed_by":"agent-smoke","status":"completed","result":{"exit_code":0,"stdout":"ok","stderr":""}}' \
  http://localhost:18080/tasks/report >/dev/null

echo "smoke test ok"
