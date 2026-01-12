#!/usr/bin/env bash
# auto-remediate.sh - Automated remediation for common Atlas issues
#
# Design Pattern: Self-Healing System
# - Detects known issues and applies safe fixes
# - Logs all actions for audit trail
# - Dry-run mode for testing
# - Opt-in via config (not enabled by default)
#
# Safety Features:
# - Only remediates KNOWN issues (not general errors)
# - Never modifies critical system files
# - All actions logged with timestamp
# - Dry-run mode for safe testing
#
# Usage:
#   ./auto-remediate.sh                    # Run with config file settings
#   ./auto-remediate.sh --dry-run          # Show what would be done
#   ./auto-remediate.sh --fix port-conflict # Fix specific issue
#   ./auto-remediate.sh --list             # List detected issues

set -euo pipefail

# Configuration
readonly CONFIG_FILE="${CONFIG_FILE:-$HOME/.config/atlas/auto-remediate.conf}"
readonly LOG_FILE="${LOG_FILE:-$HOME/.local/state/atlas/auto-remediate.log}"
readonly ATLAS_ROOT="/home/anombyte/Atlas"

# Auto-remediation enabled? (default: no - must be explicitly enabled)
AUTO_REMEDIATE_ENABLED="${AUTO_REMEDIATE_ENABLED:-false}"

# Colors
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# State
dry_run=false
specific_fix=""
detected_issues=()
actions_taken=()

log_info() {
  echo -e "${GREEN}[INFO]${NC} $*" | tee -a "$LOG_FILE"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
}

log_action() {
  echo -e "${BLUE}[ACTION]${NC} $*" | tee -a "$LOG_FILE"
  actions_taken+=("$(date -Iseconds): $*")
}

# Check for Docker port conflicts
check_port_conflicts() {
  log_info "Checking for Docker port conflicts..."

  # Look for port allocation errors in last hour
  local port_conflicts
  port_conflicts=$(journalctl --since "1 hour ago" --no-pager 2>/dev/null | \
    grep -oE "port [0-9]+" | sort | uniq -c | sort -rn | head -5)

  if [[ -n "$port_conflicts" ]]; then
    detected_issues+=("port-conflict")
    echo "$port_conflicts"
  fi
}

# Fix port conflicts by identifying conflicting services
fix_port_conflict() {
  log_info "Investigating port conflicts..."

  # Check what's using the conflicting ports
  local port
  while read -r count port_num; do
    log_info "Port $port_num had $count allocation failures"

    # Check what's using the port
    if command -v ss >/dev/null 2>&1; then
      local using_port
      using_port=$(ss -tulpn | grep ":$port_num " || echo "Nothing currently using port $port_num")
      log_info "Current port usage: $using_port"
    fi

    # Suggest manual review for safety
    log_warn "Port $port_num conflict requires manual review"
    log_action "Would resolve port $port_num conflict (requires manual intervention)"
  done < <(journalctl --since "1 hour ago" --no-pager 2>/dev/null | \
    grep -oE "port [0-9]+" | sort | uniq -c | sort -rn | head -5)
}

# Check for failed services
check_failed_services() {
  log_info "Checking for failed Atlas services..."

  export XDG_RUNTIME_DIR="/run/user/1000"
  local failed_services
  failed_services=$(systemctl --user list-units --state=failed 2>/dev/null | \
    grep -E " atlas|mcp|dashboard" | awk '{print $1}' || echo "")

  if [[ -n "$failed_services" ]]; then
    detected_issues+=("failed-services")
    echo "$failed_services"
  fi
}

# Fix failed services (non-critical only)
fix_failed_services() {
  log_info "Attempting to restart failed services..."

  export XDG_RUNTIME_DIR="/run/user/1000"
  local failed_services
  failed_services=$(systemctl --user list-units --state=failed 2>/dev/null | \
    grep -E " atlas|mcp|dashboard" | awk '{print $1}' || echo "")

  if [[ -z "$failed_services" ]]; then
    log_info "No failed services to restart"
    return
  fi

  while read -r service; do
    # Safety: Skip critical services
    if [[ "$service" =~ (mcp-router|perplexity-proxy|control-plane) ]]; then
      log_warn "Skipping critical service: $service (requires manual intervention)"
      continue
    fi

    log_action "Restarting service: $service"
    if [[ "$dry_run" == true ]]; then
      log_info "[DRY-RUN] Would restart: $service"
    else
      systemctl --user restart "$service" 2>&1 | tee -a "$LOG_FILE" || log_error "Failed to restart $service"
    fi
  done <<< "$failed_services"
}

# Check for stale paths
check_stale_paths() {
  log_info "Checking for stale path references..."

  # Use the validate-paths script if available
  if [[ -x "$ATLAS_ROOT/scripts/validate-paths.sh" ]]; then
    local output
    output=$("$ATLAS_ROOT/scripts/validate-paths.sh" 2>&1 || true)
    # Check for actual stale path warnings (not just "0 stale" messages)
    if echo "$output" | grep -q "Stale path"; then
      detected_issues+=("stale-paths")
      log_info "Stale path references detected"
    fi
  fi
}

# List all detected issues
list_issues() {
  echo "=== Detected Issues ==="
  if [[ ${#detected_issues[@]} -eq 0 ]]; then
    log_info "No issues detected"
  else
    for issue in "${detected_issues[@]}"; do
      log_warn "Issue detected: $issue"
    done
  fi
}

# Run all checks
run_checks() {
  check_port_conflicts
  check_failed_services
  check_stale_paths
}

# Run all fixes
run_fixes() {
  if [[ -n "$specific_fix" ]]; then
    case "$specific_fix" in
      port-conflict)
        fix_port_conflict
        ;;
      failed-services)
        fix_failed_services
        ;;
      stale-paths)
        log_info "Run manual path validation: $ATLAS_ROOT/scripts/validate-paths.sh"
        ;;
      *)
        log_error "Unknown fix type: $specific_fix"
        exit 1
        ;;
    esac
  else
    # Run all fixes
    fix_port_conflict
    fix_failed_services
  fi
}

# Load config from file if exists
load_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE"
  fi
}

# Main execution
main() {
  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        dry_run=true
        shift
        ;;
      --fix)
        specific_fix="$2"
        shift 2
        ;;
      --list)
        run_checks
        list_issues
        exit 0
        ;;
      --help|-h)
        cat <<HELP
Usage: auto-remediate.sh [options]

Automated remediation for common Atlas issues.

Options:
  --dry-run           Show what would be done without making changes
  --fix <type>        Fix specific issue (port-conflict, failed-services, stale-paths)
  --list              List detected issues only
  --help, -h          Show this help message

Environment Variables:
  AUTO_REMEDIATE_ENABLED  Enable auto-remediation (default: false)
  CONFIG_FILE             Config file location (default: ~/.config/atlas/auto-remediate.conf)
  LOG_FILE                Log file location (default: ~/.local/state/atlas/auto-remediate.log)

Examples:
  ./auto-remediate.sh --list
  ./auto-remediate.sh --dry-run
  ./auto-remediate.sh --fix failed-services
  AUTO_REMEDIATE_ENABLED=true ./auto-remediate.sh

Safety:
  - Only fixes KNOWN issues (not general errors)
  - Never modifies critical system files
  - All actions logged with timestamp
  - Critical services require manual intervention

Design Pattern: Self-Healing System
- Detects known issues and applies safe fixes
- Logs all actions for audit trail
- Dry-run mode for safe testing
HELP
        exit 0
        ;;
      *)
        echo "Unknown option: $1" >&2
        exit 1
        ;;
    esac
  done

  # Initialize log
  mkdir -p "$(dirname "$LOG_FILE")"
  echo "=== Auto-Remediation Run: $(date -Iseconds) ===" | tee -a "$LOG_FILE"

  # Load config
  load_config

  # Check if auto-remediation is enabled
  if [[ "$AUTO_REMEDIATE_ENABLED" != "true" && "$dry_run" != true && "$specific_fix" == "" ]]; then
    log_warn "Auto-remediation is disabled (set AUTO_REMEDIATE_ENABLED=true)"
    log_info "Run with --dry-run to preview actions, or --fix <type> for specific fixes"
    exit 0
  fi

  if [[ "$dry_run" == true ]]; then
    log_info "Running in DRY-RUN mode - no changes will be made"
  fi

  # Run checks
  run_checks

  # Show detected issues
  list_issues

  # Run fixes
  if [[ ${#detected_issues[@]} -gt 0 || -n "$specific_fix" ]]; then
    echo ""
    log_info "Running fixes..."
    run_fixes
  fi

  # Summary
  echo ""
  echo "=== Summary ==="
  if [[ ${#actions_taken[@]} -eq 0 ]]; then
    log_info "No actions taken"
  else
    log_info "Actions taken: ${#actions_taken[@]}"
    for action in "${actions_taken[@]}"; do
      echo "  - $action"
    done
  fi

  if [[ "$dry_run" == true ]]; then
    log_info "This was a DRY-RUN - no changes were made"
    log_info "Run without --dry-run to apply fixes"
  fi

  echo "Full log: $LOG_FILE"
}

# Run main
main "$@"
