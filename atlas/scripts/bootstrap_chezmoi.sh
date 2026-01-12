#!/usr/bin/env bash
set -euo pipefail

# Simple bootstrap for applying Atlas chezmoi sources onto the current user.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="${ROOT_DIR}/chezmoi"
CHEZMOI_BIN="${CHEZMOI_BIN:-chezmoi}"

if ! command -v "${CHEZMOI_BIN}" >/dev/null 2>&1; then
  echo "chezmoi is not installed. Install from https://chezmoi.io/install/ then re-run." >&2
  exit 1
fi

if [ ! -d "${SRC_DIR}" ]; then
  echo "chezmoi source directory not found at ${SRC_DIR}" >&2
  exit 1
fi

echo "Applying Atlas chezmoi sources from ${SRC_DIR} ..."
"${CHEZMOI_BIN}" apply --source "${SRC_DIR}" --destination "${HOME}" "$@"
echo "Done."
