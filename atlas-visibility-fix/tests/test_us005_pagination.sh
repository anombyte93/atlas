#!/bin/bash
# US-005: Pagination defaults and offsets for log queries

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$SCRIPT_DIR/../atlas-track-v2"
ATLAS_PY="${ATLAS_PY:-/home/anombyte/.claude/skills/atlas.py}"

if [ ! -f "$ATLAS_PY" ]; then
  echo "SKIP: atlas.py not found at $ATLAS_PY"
  exit 0
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

export XDG_CONFIG_HOME="$TMP_DIR"
export HOME="$TMP_DIR"

for i in {1..150}; do
  "$TRACKER" "page-$i" -- true >/dev/null
done

echo "=== US-005 Pagination ==="
python3 - <<PY
import json
import os
import subprocess
import sys

cmd = ["python3", "${ATLAS_PY}", "log"]
result = subprocess.run(cmd, capture_output=True, text=True, env=os.environ)
rows = json.loads(result.stdout)
if len(rows) != 100:
    print(f"FAIL: expected 100 rows, got {len(rows)}")
    sys.exit(1)

cmd = ["python3", "${ATLAS_PY}", "log", "--limit", "100", "--offset", "100"]
result = subprocess.run(cmd, capture_output=True, text=True, env=os.environ)
rows = json.loads(result.stdout)
if len(rows) != 50:
    print(f"FAIL: expected 50 rows, got {len(rows)}")
    sys.exit(1)

print("PASS: pagination limits work")
PY
