#!/usr/bin/env bash
set -euo pipefail

# Quickly start control-plane and node-agent using configs under ~/.config/atlas.
# If tmux is available, starts a session with two panes; otherwise prints commands.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CFG_DIR="${HOME}/.config/atlas"
CTL_BIN="${ROOT_DIR}/services/control-plane/control-plane"
AGENT_BIN="${ROOT_DIR}/agents/node-agent/bin/node-agent"

build_if_missing() {
  if [ ! -x "${CTL_BIN}" ] || [ ! -x "${AGENT_BIN}" ]; then
    echo "Building binaries..."
    (cd "${ROOT_DIR}/services/control-plane" && go build ./cmd/control-plane)
    (cd "${ROOT_DIR}/agents/node-agent" && go build -o ./bin/node-agent ./cmd/node-agent)
  fi
}

build_if_missing

if [ ! -f "${CFG_DIR}/control-plane.json" ] || [ ! -f "${CFG_DIR}/agent.json" ]; then
  echo "Configs not found in ${CFG_DIR}. Run atlas/scripts/bootstrap_chezmoi.sh first." >&2
  exit 1
fi

CTL_CMD="\"${CTL_BIN}\" -config \"${CFG_DIR}/control-plane.json\""
AGENT_CMD="\"${AGENT_BIN}\" -config \"${CFG_DIR}/agent.json\""

if command -v tmux >/dev/null 2>&1; then
  SESSION="atlas-dev"
  tmux new-session -d -s "${SESSION}" "${CTL_CMD}"
  tmux split-window -v "${AGENT_CMD}"
  tmux select-layout even-vertical
  tmux attach -t "${SESSION}"
else
  echo "tmux not found. Run these in two terminals:"
  echo "${CTL_CMD}"
  echo "${AGENT_CMD}"
fi
