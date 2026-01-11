#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)

pushd "$ROOT_DIR/atlas/services/control-plane" >/dev/null
  go build ./cmd/control-plane
popd >/dev/null

pushd "$ROOT_DIR/atlas/agents/node-agent" >/dev/null
  go build -o ./bin/node-agent ./cmd/node-agent
popd >/dev/null

"$ROOT_DIR/atlas/scripts/smoke_test.sh"
