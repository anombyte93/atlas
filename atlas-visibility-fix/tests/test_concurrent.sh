#!/bin/bash
# Test concurrent access (10 parallel processes)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$SCRIPT_DIR/../atlas-track-v2"
DB_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/atlas/visibility.db"

echo "=== Testing Concurrent Access ==="
echo "Launching 10 parallel processes..."
echo ""

# Clear any existing test data
sqlite3 "$DB_PATH" "DELETE FROM entries WHERE description LIKE 'concurrent-%';" 2>/dev/null || true

# Launch 10 processes in parallel
for i in {1..10}; do
  "$TRACKER" "concurrent-$i" -- echo "test-$i" &
done

# Wait for all to complete
wait

echo ""
echo "=== Verification ==="
count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM entries WHERE description LIKE 'concurrent-%';")

if [ "$count" -eq 10 ]; then
  echo "✅ PASS: All 10 concurrent writes succeeded"
  echo "   Entries created: $count/10"
  exit 0
else
  echo "❌ FAIL: Only $count/10 entries created"
  echo "   Some writes were lost!"
  sqlite3 "$DB_PATH" "SELECT description, status FROM entries WHERE description LIKE 'concurrent-%';"
  exit 1
fi
