#!/bin/bash
# Test large output capture (1MB)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACKER="$SCRIPT_DIR/../atlas-track-v2"
DB_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/atlas/visibility.db"

echo "=== Testing Large Output Capture ==="
echo "Generating 1MB of output..."
echo ""

# Clear any existing test data
sqlite3 "$DB_PATH" "DELETE FROM entries WHERE description='large output';" 2>/dev/null || true

# Run command that generates 1MB
"$TRACKER" "large output" -- dd if=/dev/zero bs=1024 count=1024 2>/dev/null

echo ""
echo "=== Verification ==="
size=$(sqlite3 "$DB_PATH" "SELECT length(stdout) FROM entries WHERE description='large output';")

if [ "$size" -ge 1048576 ]; then
  echo "✅ PASS: Full 1MB captured"
  echo "   Captured: $size bytes (1MB = 1048576 bytes)"
  exit 0
else
  echo "❌ FAIL: Output truncated"
  echo "   Captured: $size bytes (expected: 1048576)"
  echo "   Loss: $((1048576 - size)) bytes"
  exit 1
fi
