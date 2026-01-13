#!/bin/bash
# US-008: HTTP retry with exponential backoff logs attempts

set -euo pipefail

ATLAS_PY="/home/anombyte/.claude/skills/atlas.py"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

export XDG_CONFIG_HOME="$TMP_DIR"
export HOME="$TMP_DIR"
export ATLAS_URL="http://127.0.0.1:9"

stderr_file="$TMP_DIR/retry.stderr"

echo "=== US-008 Retry ==="
python3 "$ATLAS_PY" tasks 1>/dev/null 2>"$stderr_file" || true

if grep -q "Retry 1/3" "$stderr_file"; then
  echo "✅ PASS: retry attempts logged"
  exit 0
fi

echo "❌ FAIL: retry attempts not logged"
exit 1
