#!/bin/bash
# Test binary data handling (null bytes)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$SCRIPT_DIR/../atlas-track-v2"
DB_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/atlas/visibility.db"

echo "=== Testing Binary Data (Null Bytes) ==="
echo ""

# Clear any existing test data
sqlite3 "$DB_PATH" "DELETE FROM entries WHERE description='binary test';" 2>/dev/null || true

# Run command that generates null bytes
"$TRACKER" "binary test" -- printf "test\\x00null"

echo ""
echo "=== Verification ==="
exists=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM entries WHERE description='binary test';")

if [ "$exists" -eq 1 ]; then
  echo "✅ PASS: Binary data handled"
  echo "   Entry created successfully"
  exit 0
else
  echo "❌ FAIL: Binary data failed"
  echo "   Entry not created"
  exit 1
fi
