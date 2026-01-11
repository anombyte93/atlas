#!/usr/bin/env bash
set -euo pipefail

LOG_PATH="atlas/logs/demo.jsonl"
mkdir -p atlas/logs

cat > "$LOG_PATH" <<'LOG'
{"event_type":"ai_call","timestamp":"2026-01-11T00:00:00Z","device_id":"dev-1","agent_id":"agent-1","model":"demo","payload":{"run_id":"run-1","file_path":"atlas/config/device.json"}}
{"event_type":"ai_call","timestamp":"2026-01-11T00:00:10Z","device_id":"dev-1","agent_id":"agent-1","model":"demo","payload":{"run_id":"run-2","file_path":"atlas/config/service.json"}}
LOG

python3 atlas/scripts/graph_tools.py export --log "$LOG_PATH" --format ascii --output atlas/docs/graph-examples/demo.txt
