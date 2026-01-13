#!/bin/bash
# US-007: Retention cleanup respects ATLAS_RETENTION_DAYS

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$SCRIPT_DIR/../atlas-track-v2"
ATLAS_PY="/home/anombyte/.claude/skills/atlas.py"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

export XDG_CONFIG_HOME="$TMP_DIR"
export HOME="$TMP_DIR"
export ATLAS_RETENTION_DAYS=1

DB_PATH="$XDG_CONFIG_HOME/atlas/visibility.db"

"$TRACKER" "retention-new" -- true >/dev/null

sqlite3 "$DB_PATH" "INSERT INTO entries(task_id, description, status, created_at, updated_at) VALUES ('old-entry', 'retention-old', 'completed', datetime('now','-3 days'), datetime('now','-3 days'));"

echo "=== US-007 Retention ==="
python3 - <<PY
import json
import os
import subprocess
import sys

cmd = ["python3", "${ATLAS_PY}", "cleanup"]
result = subprocess.run(cmd, capture_output=True, text=True, env=os.environ)
if result.returncode != 0:
    print("FAIL: cleanup command failed")
    sys.exit(1)

payload = json.loads(result.stdout)
if payload.get("status") != "ok":
    print("FAIL: cleanup did not succeed")
    sys.exit(1)

print("PASS: cleanup completed")
PY

old_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM entries WHERE description='retention-old';")
new_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM entries WHERE description='retention-new';")

if [ "$old_count" -eq 0 ] && [ "$new_count" -eq 1 ]; then
  echo "✅ PASS: retention removed old entries only"
  exit 0
fi

echo "❌ FAIL: retention cleanup incorrect"
exit 1
