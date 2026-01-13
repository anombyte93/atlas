# Atlas Visibility System - Claude Code Integration Guide

## Overview

The Atlas Visibility System v1.0.0 provides production-ready task tracking for AI development workflows. This guide shows how to integrate it with Claude Code.

**Three Usage Methods:**

1. **Direct CLI** (`atlas-track-v2`) - Shell wrapper for commands
2. **Python Skill** (`atlas.py`) - Programmatic queries and operations
3. **Claude Code Integration** - Automatic tracking during development

---

## Method 1: Direct Command Line Usage

### Basic Syntax

```bash
atlas-track-v2 "description" -- command [args...]
```

### Examples

```bash
# Track a build command
atlas-track-v2 "Building project" -- make build

# Track tests
atlas-track-v2 "Running integration tests" -- pytest tests/ -v

# Track deployments
atlas-track-v2 "Deploy to production" -- ./deploy.sh prod

# Track data pipelines
atlas-track-v2 "Process daily data" -- cat data.csv | grep processed | wc -l

# Log milestone without executing command
atlas-track-v2 "Completed architecture review"
```

### What Happens

1. Generates UUID v4 task ID
2. Logs task to SQLite database (`~/.config/atlas/visibility.db`)
3. Executes command (if provided)
4. Records exit code, duration, stdout, stderr
5. Updates task status (completed/failed)

---

## Method 2: Python Skill (atlas.py)

### Check System Health

```bash
python3 ~/.claude/skills/atlas.py status
```

**Output:**
```json
{
  "health": "healthy",
  "database": "healthy",
  "control_plane": "down",
  "tests": {
    "database_write": {"status": "passed"},
    "control_plane_api": {"status": "failed"},
    "end_to_end_tracking": {"status": "passed"}
  },
  "stats": {
    "total_entries": 31,
    "by_status": {"completed": 31}
  }
}
```

### View Log Entries

```bash
# Default: last 100 entries
python3 ~/.claude/skills/atlas.py log

# Custom limit
python3 ~/.claude/skills/atlas.py log --limit 20

# Pagination
python3 ~/.claude/skills/atlas.py log --limit 100 --offset 100

# Show all entries (use carefully!)
python3 ~/.claude/skills/atlas.py log --all
```

### Manual Cleanup

```bash
# Delete entries older than retention period
python3 ~/.claude/skills/atlas.py cleanup
```

**Output:**
```json
{
  "status": "ok",
  "deleted": 0,
  "retention_days": 90
}
```

---

## Method 3: Claude Code Integration

### Make Claude Use Atlas Automatically

Claude should track work using these patterns:

#### Pattern 1: Wrap Critical Operations

For deployments, migrations, and important runs:

```bash
# Claude wraps deployment commands
atlas-track-v2 "Deploy control plane v1.0.0" -- ./deploy.sh production

# Claude wraps database migrations
atlas-track-v2 "Apply schema migration" -- ./migrate.sh up

# Claude wraps test suites
atlas-track-v2 "Run acceptance tests" -- make test-acceptance
```

#### Pattern 2: Log Architectural Decisions

For design work without execution:

```bash
# Claude logs decision points
atlas-track-v2 "Chose SQLite over PostgreSQL for visibility backend"
atlas-track-v2 "Implemented UUID v4 for collision-resistant task IDs"
```

#### Pattern 3: Track Multi-Step Workflows

For complex operations:

```bash
# Claude tracks each phase
atlas-track-v2 "Phase 1: Schema design" -- ./design-schema.sh
atlas-track-v2 "Phase 2: Implementation" -- ./implement.sh
atlas-track-v2 "Phase 3: Testing" -- ./test.sh
atlas-track-v2 "Phase 4: Deployment" -- ./deploy.sh
```

#### Pattern 4: Query History Before Work

Before making changes, Claude should check what was done before:

```bash
# Claude checks recent work
python3 ~/.claude/skills/atlas.py log --limit 10 | jq '.[].description'
```

### Claude Code Prompts

**Recommended prompts for Claude:**

```
# Before starting work
"Check the atlas log for recent work on this project"

# During implementation
"Track this work using atlas-track-v2 with description 'Implementing feature X'"

# After completion
"Log this milestone: 'Completed feature X with Y test coverage'"

# Before debugging
"Show atlas entries related to 'tests' to see recent failures"
```

---

## Configuration

### Environment Variables

```bash
# Database Location
export XDG_CONFIG_HOME="$HOME/.config"
# Default: ~/.config/atlas/visibility.db

# Retention Policy
export ATLAS_RETENTION_DAYS=90   # Default: 90 days
export ATLAS_RETENTION_DAYS=365  # Keep 1 year
export ATLAS_RETENTION_DAYS=1    # Testing: 1 day

# Control Plane (optional)
export ATLAS_URL="http://localhost:8080"
export ATLAS_API_TOKEN="dev-token-archie"

# Python Skill Location
export ATLAS_PY="/home/anombyte/.claude/skills/atlas.py"
```

### Adding to .zshrc

```bash
# Atlas Visibility System
export ATLAS_RETENTION_DAYS=90
alias atlas-track="/home/anombyte/Atlas/atlas-visibility-fix/atlas-track-v2"
alias atlas-log="python3 /home/anombyte/.claude/skills/atlas.py log"
alias atlas-status="python3 /home/anombyte/.claude/skills/atlas.py status"
alias atlas-cleanup="python3 /home/anombyte/.claude/skills/atlas.py cleanup"
```

---

## Database Schema

### Entry Table

```sql
CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  command TEXT,
  exit_code INTEGER,
  duration_seconds INTEGER,
  status TEXT CHECK(status IN ('logged','running','completed','failed')),
  stdout TEXT,
  stderr TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Metadata Table

```sql
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**Keys:**
- `schema_version`: Current schema version (1.0)
- `retention_days`: Retention period in days (default: 90)

---

## Testing

### Run All Tests

```bash
cd /home/anombyte/Atlas/atlas-visibility-fix
make test
```

### Run Individual Test

```bash
./tests/test_us001_sqlite_backend.sh
./tests/test_us007_retention.sh
```

### Test Isolation

Tests use `XDG_CONFIG_HOME` for isolation:

```bash
export XDG_CONFIG_HOME=/tmp/atlas-test-$RANDOM
./atlas-track-v2 "test entry" -- true
```

---

## Production Considerations

### Performance

- **Database Size:** ~1KB per entry (10K entries = ~10MB)
- **Query Performance:** Indexed on `created_at`, `status`, `task_id`
- **Concurrency:** WAL mode allows concurrent reads

### Monitoring

Check database size and entry count:

```bash
# Database file size
du -h ~/.config/atlas/visibility.db

# Entry count
sqlite3 ~/.config/atlas/visibility.db "SELECT COUNT(*) FROM entries;"

# Entries by status
sqlite3 ~/.config/atlas/visibility.db "SELECT status, COUNT(*) FROM entries GROUP BY status;"
```

### Cleanup Strategy

Two cleanup mechanisms:

1. **Automatic:** SQLite trigger runs on every INSERT
2. **Manual:** `python3 atlas.py cleanup`

**Recommendation:** Run cleanup weekly via cron:

```bash
# Add to crontab: crontab -e
0 3 * * 0 python3 /home/anombyte/.claude/skills/atlas.py cleanup
```

---

## Troubleshooting

### Database Locked

```bash
# Check for long-running transactions
lsof ~/.config/atlas/visibility.db

# Kill stale connections
pkill -f atlas-track-v2
```

### Schema Version Mismatch

```bash
# Check current version
sqlite3 ~/.config/atlas/visibility.db "SELECT value FROM metadata WHERE key = 'schema_version';"

# If mismatch, backup and recreate:
mv ~/.config/atlas/visibility.db ~/.config/atlas/visibility.db.old
# Next atlas-track-v2 run will recreate with current schema
```

### High Memory Usage

```bash
# Run cleanup
python3 /home/anombyte/.claude/skills/atlas.py cleanup

# Check for large stdout/stderr entries
sqlite3 ~/.config/atlas/visibility.db "SELECT task_id, LENGTH(stdout) FROM entries ORDER BY LENGTH(stdout) DESC LIMIT 10;"
```

---

## Version: 1.0.0

**Release Date:** 2026-01-13

**Features:**
- ✅ SQLite backend with ACID compliance
- ✅ UUID v4 task IDs
- ✅ Configurable retention policy
- ✅ Retry logic with exponential backoff
- ✅ Schema version negotiation
- ✅ Comprehensive test suite (9 tests)
- ✅ Security hardening (SQL injection protection, input validation)

**Documentation:**
- [README](/home/anombyte/Atlas/atlas-visibility-fix/README.md)
- [GitHub Release](https://github.com/anombyte/Atlas/releases/tag/v1.0.0)
