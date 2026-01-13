#!/bin/bash
# US-009: Schema version stored and enforced

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$SCRIPT_DIR/../atlas-track-v2"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

export XDG_CONFIG_HOME="$TMP_DIR"
export HOME="$TMP_DIR"

DB_PATH="$XDG_CONFIG_HOME/atlas/visibility.db"

echo "=== US-009 Schema Version ==="
"$TRACKER" "schema-version" -- true >/dev/null

version=$(sqlite3 "$DB_PATH" "SELECT value FROM metadata WHERE key='schema_version';")
if [ "$version" != "1.0" ]; then
  echo "❌ FAIL: schema_version not set"
  exit 1
fi

sqlite3 "$DB_PATH" "UPDATE metadata SET value='0.9' WHERE key='schema_version';"

set +e
"$TRACKER" "schema-mismatch" -- true >/dev/null 2>/dev/null
rc=$?
set -e

if [ "$rc" -eq 0 ]; then
  echo "❌ FAIL: schema mismatch not detected"
  exit 1
fi

echo "✅ PASS: schema version enforced"
exit 0
