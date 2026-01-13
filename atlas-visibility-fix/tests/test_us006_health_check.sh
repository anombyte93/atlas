#!/bin/bash
# US-006: Health check verifies database and end-to-end tracking

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$SCRIPT_DIR/../atlas-track-v2"
ATLAS_PY="/home/anombyte/.claude/skills/atlas.py"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

export XDG_CONFIG_HOME="$TMP_DIR"
export HOME="$TMP_DIR"
export ATLAS_URL="http://127.0.0.1:9"

"$TRACKER" "health-setup" -- true >/dev/null

echo "=== US-006 Health Check ==="
python3 - <<PY
import json
import os
import subprocess
import sys

cmd = ["python3", "${ATLAS_PY}", "status"]
result = subprocess.run(cmd, capture_output=True, text=True, env=os.environ)
if result.returncode != 0:
    print("FAIL: status command failed")
    sys.exit(1)

payload = json.loads(result.stdout)
health = payload.get("health")
if health not in ("healthy", "degraded"):
    print(f"FAIL: unexpected health {health}")
    sys.exit(1)

if payload.get("tests", {}).get("database_write", {}).get("status") != "passed":
    print("FAIL: database_write test failed")
    sys.exit(1)

if payload.get("tests", {}).get("end_to_end_tracking", {}).get("status") != "passed":
    print("FAIL: end_to_end_tracking test failed")
    sys.exit(1)

print("PASS: health check verifies functionality")
PY
