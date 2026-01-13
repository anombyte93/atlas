#!/bin/bash
# US-001: SQLite backend creates schema with indexes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$SCRIPT_DIR/../atlas-track-v2"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

export XDG_CONFIG_HOME="$TMP_DIR"
export HOME="$TMP_DIR"

DB_PATH="$XDG_CONFIG_HOME/atlas/visibility.db"

echo "=== US-001 SQLite Backend ==="
"$TRACKER" "us001 sqlite" -- true

echo "=== Verification ==="
if [ ! -f "$DB_PATH" ]; then
  echo "❌ FAIL: Database not created"
  exit 1
fi

schema=$(sqlite3 "$DB_PATH" ".schema")
if echo "$schema" | grep -q "CREATE TABLE entries" && echo "$schema" | grep -q "idx_entries_task_id"; then
  echo "✅ PASS: Schema and indexes present"
  exit 0
fi

echo "❌ FAIL: Schema missing"
exit 1
