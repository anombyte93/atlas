#!/usr/bin/env bash
# validate-paths.sh - Validate critical Atlas paths and detect stale references
#
# Design Pattern: Fail-Fast Validation
# - Check all critical paths before operations
# - Detect stale paths that need updating
# - Exit codes indicate specific failure types
#
# Exit Codes:
#   0 - All paths valid
#   1 - Missing critical paths
#   2 - Stale paths detected
#   3 - Both missing and stale paths
#
# Usage:
#   ./validate-paths.sh                    # Validate all paths
#   ./validate-paths.sh --fix              # Auto-fix stale paths (interactive)
#   cron: 0 * * * * /path/to/validate-paths.sh  # Run hourly

set -euo pipefail

# Configuration
readonly ATLAS_ROOT="/home/anombyte/Atlas"
readonly STALE_PATTERN="den/"  # Old project directory pattern

# Colors
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'

# Counters (global)
missing_count=0
stale_count=0

log_info() {
  echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

# Critical paths that must exist
declare -A CRITICAL_PATHS=(
  ["$ATLAS_ROOT/den/mcp-router/upstream-registry.json"]="MCP Router configuration"
  ["$ATLAS_ROOT/den/mcp-router-wrapper.sh"]="MCP Router wrapper script"
  ["$HOME/.claude/mcp.json"]="MCP configuration"
  ["$ATLAS_ROOT/Atlas_MCP/scripts/atlas-metrics.sh"]="Atlas metrics script"
)

# Stale path patterns to detect
declare -a STALE_PATTERNS=(
  "/home/anombyte/den/"
  "$HOME/den/"
  "den/mcp-router"  # Should be Atlas/den/mcp-router
)

# Check if a path exists
check_path_exists() {
  local path="$1"
  local description="$2"

  if [[ -e "$path" ]]; then
    log_info "✓ Found: $description ($path)"
    return 0
  else
    log_error "✗ Missing: $description ($path)"
    ((missing_count++))
    return 1
  fi
}

# Check for stale path references in scripts
check_stale_paths() {
  local script_dir="$ATLAS_ROOT/scripts"
  local claude_scripts="$HOME/.claude/scripts"

  log_info "Checking for stale path references..."

  for script in "$script_dir"/*.sh "$claude_scripts"/*.sh; do
    if [[ -f "$script" ]]; then
      while IFS= read -r line; do
        for pattern in "${STALE_PATTERNS[@]}"; do
          if [[ "$line" == *"$pattern"* ]]; then
            log_warn "Stale path in $(basename "$script"): $line"
            ((stale_count++))
          fi
        done
      done < "$script"
    fi
  done
}

# Main validation
main() {
  local fix_mode=false

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fix)
        fix_mode=true
        shift
        ;;
      --help|-h)
        cat <<HELP
Usage: validate-paths.sh [options]

Validate critical Atlas paths and detect stale references.

Options:
  --fix              Interactively fix stale paths (experimental)
  --help, -h         Show this help message

Exit Codes:
  0  All paths valid
  1  Missing critical paths
  2  Stale paths detected
  3  Both missing and stale paths

Examples:
  ./validate-paths.sh
  ./validate-paths.sh --fix
  cron: 0 * * * * /path/to/validate-paths.sh
HELP
        exit 0
        ;;
      *)
        echo "Unknown option: $1" >&2
        exit 1
        ;;
    esac
  done

  echo "=== Atlas Path Validation ==="
  echo ""

  # Check critical paths
  log_info "Validating critical paths..."
  for path in "${!CRITICAL_PATHS[@]}"; do
    check_path_exists "$path" "${CRITICAL_PATHS[$path]}"
  done
  echo ""

  # Check for stale path references
  check_stale_paths
  echo ""

  # Report results
  if [[ $missing_count -eq 0 && $stale_count -eq 0 ]]; then
    log_info "✓ All paths valid, no stale references found"
    exit 0
  fi

  # Build exit code
  local exit_code=0
  if [[ $missing_count -gt 0 ]]; then
    log_error "✗ $missing_count critical path(s) missing"
    exit_code=$((exit_code | 1))
  fi
  if [[ $stale_count -gt 0 ]]; then
    log_warn "⚠ $stale_count stale path reference(s) found"
    exit_code=$((exit_code | 2))
  fi

  # Suggest fixes
  echo ""
  log_info "Suggestions:"
  if [[ $missing_count -gt 0 ]]; then
    echo "  - Run setup scripts to create missing paths"
    echo "  - Check if Atlas repo is fully cloned"
  fi
  if [[ $stale_count -gt 0 && "$fix_mode" == true ]]; then
    echo "  - Review and update stale path references manually"
    echo "  - Use: sed -i 's|old/path|new/path|g' script.sh"
  fi

  exit $exit_code
}

# Run main
main "$@"
