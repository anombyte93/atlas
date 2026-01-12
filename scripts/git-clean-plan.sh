#!/usr/bin/env bash
# git-clean-plan.sh
# Safe, non-destructive helper to triage a dirty worktree.
# Default: read-only reports. Destructive actions require explicit flags.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage: scripts/git-clean-plan.sh [options]

Actions (all optional; default is read-only report):
  --report            Show status, modified files, untracked summary (default)
  --list-untracked    List untracked items with counts and disk usage
  --stash PATH...     Stash specific paths (creates a named stash)
  --delete PATH...    Delete untracked paths (requires --force)
  --force             Required with --delete to prevent accidents

Examples:
  scripts/git-clean-plan.sh --report --list-untracked
  scripts/git-clean-plan.sh --stash atlas-visibility-fix Atlas_MCP
  scripts/git-clean-plan.sh --delete logs tmp --force   # deletes untracked only

Notes:
  - Stash uses: git stash push -m "cleanup helper <timestamp>" <paths>
  - Delete only touches untracked paths; tracked files are never removed.
EOF
}

REPORT=true
LIST=false
DO_STASH=()
DO_DELETE=()
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --report) REPORT=true ;;
    --list-untracked) LIST=true ;;
    --stash) shift; while [[ $# -gt 0 && "$1" != --* ]]; do DO_STASH+=("$1"); shift; done; continue ;;
    --delete) shift; while [[ $# -gt 0 && "$1" != --* ]]; do DO_DELETE+=("$1"); shift; done; continue ;;
    --force) FORCE=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
  shift
done

timestamp() { date -Iseconds; }

if $REPORT; then
  echo "=== git status -sb ==="
  git status -sb || true
  echo
  echo "=== Modified (grouped) ==="
  git status --porcelain | grep '^ M' | awk '{print $2}' | sed 's#/[^/]*$#/#' | sort | uniq -c || echo "(none)"
  echo
fi

if $LIST; then
  echo "=== Untracked summary ==="
  untracked=$(git status --porcelain | grep '^??' | awk '{print $2}')
  if [[ -z "$untracked" ]]; then
    echo "(none)"
  else
    printf "%s\n" "$untracked" | sed 's#/.*##' | sort | uniq -c
    echo
    echo "Top untracked items by size (du -sh):"
    printf "%s\n" "$untracked" | head -n 50 | xargs -I{} du -sh {} 2>/dev/null | sort -hr
  fi
  echo
fi

if [[ ${#DO_STASH[@]} -gt 0 ]]; then
  echo "=== Stashing paths ==="
  msg="cleanup helper $(timestamp)"
  git stash push -m "$msg" -- "${DO_STASH[@]}"
fi

if [[ ${#DO_DELETE[@]} -gt 0 ]]; then
  if ! $FORCE; then
    echo "Refusing to delete without --force."
    exit 1
  fi
  echo "=== Deleting untracked paths ==="
  for p in "${DO_DELETE[@]}"; do
    if git status --porcelain -- "$p" | grep -q '^??'; then
      rm -rf -- "$p"
      echo "Deleted untracked: $p"
    else
      echo "Skip (not untracked): $p"
    fi
  done
fi
