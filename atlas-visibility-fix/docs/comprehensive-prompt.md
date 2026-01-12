# Comprehensive Implementation Prompt: Atlas Visibility System Fix

## Original Goal
Fix 15+ critical issues in the Atlas visibility system to make it production-ready.

## Clarified Requirements
Build a production-ready visibility system for tracking development work with:
- SQLite backend for ACID-compliant storage
- UUID v4 for collision-resistant task IDs
- Proper error handling with user feedback
- Shell-safe command escaping
- Transactional integrity guarantees
- Database connection pooling and pagination
- Health checks that verify actual functionality
- Automatic cleanup with retention policy
- Retry logic with exponential backoff

## Context from Research

### SQLite Best Practices (2025)
- Use `BEGIN IMMEDIATE TRANSACTION` to avoid SQLITE_BUSY
- Enable WAL mode: `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`
- Set busy timeout: `PRAGMA busy_timeout=5000;`
- Implement rollback with bash traps:
```bash
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        sqlite3 "$DB_FILE" "ROLLBACK;" 2>/dev/null || true
    fi
}
trap cleanup EXIT ERR INT TERM
```
- Run integrity checks: `PRAGMA integrity_check;`
- Enable foreign keys: `PRAGMA foreign_keys=ON;`

### Proven Patterns from Codebase
- **Database-backed deduplication** (den-0day-hunt): Use SQLite for existence checks
- **Hook system 9/10 validation**: Symlinks for backward compatibility, purge stale data
- **Exponential backoff with jitter** (bounty-scanner): `delay = base * 2^retry ± 20%`
- **File locking with stale detection**: Use mkdir for atomic locks, check PID validity
- **Structured error handling**: Classify error codes, provide actionable feedback

### Available Tools
- Commands: `/atlas-validate`, `/audit-visibility`, `atomic-write.sh`, `file-lock.sh`, `fault-tolerant-exec.sh`
- Skills: `audit-atlas-workflow`, `task-verification-skill`, `scriptify`
- Scripts: `state-automation/lib/error-handling.sh`, `bounty-scanner/lib/backoff.sh`
- MCP: `terminal-context-kb` (search history), `context7` (query docs), `ideas` (capture decisions)

## User Stories (P0 - Must Have)

### US-001: SQLite Backend for ACID Compliance
**As a** developer, **I want** the visibility system to use SQLite for storage, **So that** I get transactional integrity and no data corruption.

**Acceptance Criteria**:
- [ ] AC1: SQLite database created at ~/.config/atlas/visibility.db
- [ ] AC2: All writes use transactions (BEGIN/COMMIT)
- [ ] AC3: On failure, transactions roll back automatically
- [ ] AC4: Database schema includes proper indexes and constraints

**Test**: `sqlite3 ~/.config/atlas/visibility.db ".schema" | grep -q "CREATE TABLE"`

### US-002: UUID v4 for Collision-Resistant Task IDs
**As a** developer, **I want** task IDs to use UUID v4, **So that** rapid successive commands don't create collisions.

**Acceptance Criteria**:
- [ ] AC1: atlas-track uses `uuidgen` or Python uuid.uuid4()
- [ ] AC2: No two tasks in same second share same ID
- [ ] AC3: UUID format validated (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)

**Test**: 100 rapid commands all have unique IDs

### US-003: Proper Error Handling with User Feedback
**As a** developer, **I want** to see when tracking fails, **So that** I can fix issues and not lose data silently.

**Acceptance Criteria**:
- [ ] AC1: curl failures are captured and reported
- [ ] AC2: HTTP errors (401, 403, 500, etc.) are shown to user
- [ ] AC3: "✓ Tracked" only appears after confirmation
- [ ] AC4: Network errors trigger retry with exponential backoff

**Test**: Stop control plane, run atlas-track, should show error not "✓"

### US-004: Shell-Safe Command Escaping
**As a** developer, **I want** commands with special characters to be handled safely, **So that** I can track complex commands without JSON injection.

**Acceptance Criteria**:
- [ ] AC1: Commands are escaped using jq -R or Python json.dumps()
- [ ] AC2: Quotes, backslashes, newlines are properly escaped
- [ ] AC3: Binary output is handled without crashing
- [ ] AC4: Command can contain any valid shell characters

**Test**: `atlas-track "complex" -- echo 'Hello "world" \n\t\r'` succeeds

### US-005: Database Connection Pooling and Limits
**As a** developer, **I want** the Python skill to handle large log files efficiently, **So that** it doesn't crash after 10,000 entries.

**Acceptance Criteria**:
- [ ] AC1: Queries use LIMIT/OFFSET for pagination
- [ ] AC2: Log viewing defaults to last 100 entries
- [ ] AC3: Full log access requires explicit --all flag
- [ ] AC4: Memory usage stays constant regardless of log size

**Test**: Insert 10,000 entries, query should be fast and use constant memory

## Schema Design Requirements

```sql
-- Database: ~/.config/atlas/visibility.db
-- Journal mode: WAL
-- Synchronous: NORMAL

CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT UNIQUE NOT NULL,  -- UUID v4
    description TEXT NOT NULL,
    command TEXT,
    exit_code INTEGER,
    duration_seconds INTEGER,
    status TEXT NOT NULL,  -- 'logged', 'running', 'completed', 'failed'
    stdout TEXT,
    stderr TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_task_id ON entries(task_id);

-- Cleanup policy: DELETE FROM entries WHERE created_at < datetime('now', '-90 days')
```

## Implementation Requirements

### File Structure
```
~/.claude/bin/atlas-track-v2      # New tracking script
~/.claude/skills/atlas-v2.py       # New Python skill
~/.config/atlas/visibility.db     # SQLite database
~/.config/atlas/visibility.log    # Fallback log (deprecated but migratable)
```

### Error Handling Pattern
```bash
# All operations must use:
set -euo pipefail
trap cleanup EXIT ERR INT TERM

# All curl calls must capture errors:
if ! response=$(curl -s -w "%{http_code}" ...); then
    echo "[ERROR] Failed to submit task: $response"
    exit 1
fi
```

### JSON Escaping Pattern
```bash
# Use jq for safe escaping:
escaped_command=$(echo "$command" | jq -Rs .)
json "{\"command\": $escaped_command, ...}"
```

## Migration Path

1. **Backup existing data**:
```bash
cp ~/.config/atlas/visibility.log ~/.config/atlas/visibility.log.backup
```

2. **Create new database** (auto-created on first run)

3. **Import existing entries** (if any):
```bash
# Parse JSONL and insert into SQLite
# Each line: {"task_id":"...", "description":"...", ...}
```

4. **Verify migration**:
```bash
# Count old entries vs new entries
# Spot check random entries
```

## Success Criteria

1. All P0 user stories pass acceptance tests
2. /karen validation: VERDICT TRUE, SIMP-O-METER ≥ 8/10
3. /steve validation: Architecture approved
4. No regressions in existing functionality
5. Migration guide complete
6. Documentation updated

## Output Specifications

### atlas-track-v2
- Input: `atlas-track "description" [-- command]`
- Output: 
  - Success: "✓ Tracked: description (duration)s"
  - Failure: "[ERROR] description: reason"
  - Never silent - always report status
- Exit codes: 0 = success, 1 = failure

### atlas-v2.py status
- Returns JSON with:
  - control_plane_status: "healthy" | "degraded" | "down"
  - database_status: "ok" | "error" | "corrupted"
  - last_entry: {timestamp, task_id}
  - total_entries: count

### atlas-v2.py log
- Returns last 100 entries by default
- With --all: returns all entries (use LIMIT/OFFSET)
- Format: JSON array

## Constraints

- Must integrate with existing Atlas control plane API
- Must work with existing node-agent
- Backward compatible with existing visibility.log (migration path)
- No external dependencies beyond standard Unix tools (sqlite3, uuidgen, jq, curl)
- Must be reliable for daily use

## Testing Requirements

1. Unit tests for each user story acceptance criterion
2. Integration test: Submit task via API, verify in database
3. Error injection test: Kill control plane mid-operation, verify rollback
4. Concurrent access test: Run 10 atlas-track commands simultaneously
5. Migration test: Import existing visibility.log, verify data integrity
6. Performance test: 10,000 entries, query time < 100ms

## Sources

- SQLite Best Practices: [10 Common SQLite Bugs](https://medium.com/top-python-libraries/10-common-sqlite-bugs-things-i-wish-i-knew-earlier-c3dd3e542aec)
- File Locking: [File Locking And Concurrency In SQLite Version 3](https://www.sqlite.org/lockingv3.html)
- Error Handling: [Error handling and RollBack Transaction in SQLITE](https://stackoverflow.com/questions/5308272/error-handling-and-rollback-transaction-in-sqlite-from-sql-statement)
- Bash Traps: [How to trap exit code in Bash script](https://stackoverflow.com/questions/5312266/how-to-trap-exit-code-in-bash-script)
- Using Databases From Bash: [Using Databases From Bash Scripts](https://www.michael-joost.de/bash_db.html)
- sqlite-shell-lib: [GitHub - ngirard/sqlite-shell-lib](https://github.com/ngirard/sqlite-shell-lib)
- sqlite-utils: [simonw/sqlite-utils](https://github.com/simonw/sqlite-utils)

## Engineering Safety Margins

Estimated complexity: 5/10
Actual work: ~5 hours
Budgeted time: 12.5 hours (2.5x buffer)
Expected sessions: 2-3

Checkpoint after each major phase:
1. Schema design complete → checkpoint
2. Migration script tested → checkpoint  
3. P0 stories implemented → checkpoint
4. Validation complete → final checkpoint
