#!/usr/bin/env bash
set -euo pipefail

# Stop the tmux-based Atlas dev stack started by dev_up.sh.

SESSION="atlas-dev"

if command -v tmux >/dev/null 2>&1; then
  if tmux has-session -t "${SESSION}" 2>/dev/null; then
    tmux kill-session -t "${SESSION}"
    echo "Stopped tmux session ${SESSION}"
    exit 0
  fi
fi

echo "No tmux session ${SESSION} found. If you started services manually, stop their processes directly."
