#!/bin/bash
# US-004: Shell-safe command escaping for special characters

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$SCRIPT_DIR/../atlas-track-v2"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

export XDG_CONFIG_HOME="$TMP_DIR"
export HOME="$TMP_DIR"

DB_PATH="$XDG_CONFIG_HOME/atlas/visibility.db"

echo "=== US-004 Escaping ==="
"$TRACKER" "escape test" -- printf 'Hello "world" \n\t\r' >/dev/null

echo "=== Verification ==="
count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM entries WHERE description='escape test';")
command=$(sqlite3 "$DB_PATH" "SELECT command FROM entries WHERE description='escape test';")

if [ "$count" -eq 1 ] && [ -n "$command" ]; then
  echo "✅ PASS: Escaped command recorded"
  exit 0
fi

echo "❌ FAIL: Escaped command not recorded"
exit 1
