#!/bin/bash
# US-002: UUID v4 task IDs are unique and valid

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$SCRIPT_DIR/../atlas-track-v2"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

export XDG_CONFIG_HOME="$TMP_DIR"
export HOME="$TMP_DIR"

DB_PATH="$XDG_CONFIG_HOME/atlas/visibility.db"

echo "=== US-002 UUID v4 ==="
for i in {1..25}; do
  "$TRACKER" "uuid-$i" -- true >/dev/null
done

echo "=== Verification ==="
python3 - <<PY
import re
import sqlite3
import sys

path = "${DB_PATH}"
conn = sqlite3.connect(path)
rows = [r[0] for r in conn.execute("SELECT task_id FROM entries").fetchall()]
conn.close()

unique = len(set(rows))
if unique != len(rows):
    print(f"FAIL: Only {unique}/{len(rows)} unique UUIDs")
    sys.exit(1)

pattern = re.compile(r"^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$")
invalid = [r for r in rows if not pattern.match(r)]
if invalid:
    print("FAIL: Invalid UUID format detected")
    sys.exit(1)

print("PASS: UUIDs are valid and unique")
PY
