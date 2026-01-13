#!/bin/bash
# US-003: Error handling surfaces control plane failures without crashing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$SCRIPT_DIR/../atlas-track-v2"
ATLAS_PY="/home/anombyte/.claude/skills/atlas.py"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

export XDG_CONFIG_HOME="$TMP_DIR"
export HOME="$TMP_DIR"

"$TRACKER" "us003 setup" -- true >/dev/null

export ATLAS_URL="http://127.0.0.1:9"

echo "=== US-003 Error Handling ==="
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
control = payload.get("control_plane")
api_status = payload.get("tests", {}).get("control_plane_api", {}).get("status")
if control != "down" or api_status != "failed":
    print("FAIL: control plane failure not reported")
    sys.exit(1)

print("PASS: control plane failure reported without crash")
PY
