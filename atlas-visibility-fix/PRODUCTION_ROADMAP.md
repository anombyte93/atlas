# Atlas Visibility System - Production Roadmap

## Executive Summary

The Atlas Visibility System v1.0.0 is complete and tested. This document outlines the roadmap for production deployment, monitoring, CI/CD, and migration support.

**Current Status:** Production-ready core ✅
**Next Phase:** Production hardening and operational excellence

---

## Phase 1: Production Deployment

### 1.1 Environment Configuration

**Priority:** P1 (Critical)
**Estimate:** 2 hours

#### Tasks

1. **Create production config template**
   - Location: `config/production.env`
   - Variables: `ATLAS_RETENTION_DAYS`, `ATLAS_URL`, `ATLAS_API_TOKEN`
   - Documentation: Comments for each variable

2. **Systemd service for cleanup**
   - Location: `scripts/atlas-cleanup.service`
   - Schedule: Weekly cleanup at 3 AM Sunday
   - User service (no root required)

3. **Installation script**
   - Location: `scripts/install.sh`
   - Actions:
     - Create symlinks in `~/.local/bin/`
     - Add aliases to `.zshrc`
     - Initialize database schema
     - Run health check

#### Acceptance Criteria

- [ ] `./scripts/install.sh` installs atlas-track-v2 to `~/.local/bin/`
- [ ] Systemd timer runs weekly cleanup
- [ ] Production env template documented in README

#### Files to Create

```
scripts/install.sh              # Installation automation
scripts/atlas-cleanup.service   # Systemd service definition
scripts/atlas-cleanup.timer     # Systemd timer (weekly)
config/production.env.example   # Production config template
```

---

## Phase 2: Database Performance Monitoring

**Priority:** P1 (Critical)
**Estimate:** 3 hours

### 2.1 Performance Metrics

**Goal:** System must handle 10K+ entries without degradation

#### Metrics to Track

1. **Query Performance**
   - `SELECT` with LIMIT/OFFSET: <100ms for 10K entries
   - `INSERT` with trigger cleanup: <50ms
   - `DELETE` during cleanup: <1s for 1K entries

2. **Database Size**
   - Entry size: ~1KB average
   - 10K entries: ~10MB
   - 100K entries: ~100MB

3. **Index Effectiveness**
   - `EXPLAIN QUERY PLAN` for critical queries
   - Index hit ratio: >95%

### 2.2 Monitoring Tools

#### Create: `scripts/atlas-monitor.sh`

```bash
#!/bin/bash
# Atlas database performance monitoring

DB_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/atlas/visibility.db"

echo "=== Atlas Database Performance ==="
echo ""

# Database size
echo "Database Size:"
du -h "$DB_PATH"
echo ""

# Entry count
echo "Entry Count:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM entries;"
echo ""

# Entries by status
echo "Entries by Status:"
sqlite3 "$DB_PATH" "SELECT status, COUNT(*) FROM entries GROUP BY status;"
echo ""

# Average entry size
echo "Average Entry Size:"
sqlite3 "$DB_PATH" "
SELECT
  ROUND(LENGTH(COALESCE(stdout, '')) +
        LENGTH(COALESCE(stderr, '')) +
        LENGTH(description) / 1024.0, 2) as avg_kb
FROM entries;"
echo ""

# Slow queries (log from sqlite3)
echo "Potential Issues:"
sqlite3 "$DB_PATH" "PRAGMA integrity_check;"
echo ""

# Index stats
echo "Index Statistics:"
sqlite3 "$DB_PATH" "PRAGMA index_list('entries');"
echo ""

# fragmentation
echo "Database Fragmentation:"
sqlite3 "$DB_PATH" "PRAGMA page_count;"
sqlite3 "$DB_PATH" "PRAGMA freelist_count;"
```

#### Create: `scripts/atlas-vacuum.sh`

```bash
#!/bin/bash
# Vacuum database to reclaim space and defragment

DB_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/atlas/visibility.db"

echo "Vacuuming database..."
sqlite3 "$DB_PATH" "VACUUM;"
echo "✓ Vacuum complete"

# Analyze for query optimization
sqlite3 "$DB_PATH" "ANALYZE;"
echo "✓ Analysis complete"
```

### 2.3 Performance Testing

#### Create: `tests/test_performance.sh`

```bash
#!/bin/bash
# Performance test: 10K entries

set -euo pipefail

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

export XDG_CONFIG_HOME="$TMP_DIR"
TRACKER="./atlas-track-v2"

echo "=== Performance Test: 10K Entries ==="
echo ""

start=$(date +%s)

# Insert 10K entries
for i in {1..10000}; do
  $TRACKER "perf-test-$i" -- true >/dev/null
  if (( i % 1000 == 0 )); then
    echo "Inserted $i entries..."
  fi
done

end=$(date +%s)
elapsed=$((end - start))

echo ""
echo "Results:"
echo "  Total time: ${elapsed}s"
echo "  Rate: $((10000 / elapsed)) entries/second"
echo ""

# Query performance
echo "Query Performance:"
python3 - <<PY
import time
import subprocess
import json

start = time.time()
result = subprocess.run(
    ["python3", "/home/anombyte/.claude/skills/atlas.py", "log"],
    capture_output=True, text=True
)
end = time.time()

entries = json.loads(result.stdout)
print(f"  Fetched {len(entries)} entries in {(end-start)*1000:.2f}ms")

# Test pagination
start = time.time()
result = subprocess.run(
    ["python3", "/home/anombyte/.claude/skills/atlas.py", "log", "--limit", "100", "--offset", "9900"],
    capture_output=True, text=True
)
end = time.time()

entries = json.loads(result.stdout)
print(f"  Page 100 (offset 9900): {len(entries)} entries in {(end-start)*1000:.2f}ms")
PY

# Database size
echo ""
echo "Database Size:"
du -h "$TMP_DIR/atlas/visibility.db"

echo ""
echo "✅ Performance test complete"
```

#### Acceptance Criteria

- [ ] 10K inserts complete in <300 seconds (33+ entries/sec)
- [ ] Query 100 entries in <100ms
- [ ] Query with offset 9900 in <100ms
- [ ] Database size <15MB for 10K entries

---

## Phase 3: CI/CD Pipeline

**Priority:** P2 (Important)
**Estimate:** 4 hours

### 3.1 GitHub Actions Workflow

#### Create: `.github/workflows/test.yml`

```yaml
name: Atlas Visibility System Tests

on:
  push:
    branches: [ master, main, develop ]
  pull_request:
    branches: [ master, main ]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12']

    steps:
    - uses: actions/checkout@v3

    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}

    - name: Install dependencies
      run: |
        sudo apt-get update
        sudo apt-get install -y sqlite3

    - name: Run integration tests
      run: |
        chmod +x tests/test_*.sh
        make test

    - name: Check database integrity
      run: |
        sqlite3 ~/.config/atlas/visibility.db "PRAGMA integrity_check;"
        sqlite3 ~/.config/atlas/visibility.db "PRAGMA foreign_key_check;"

    - name: Check schema version
      run: |
        VERSION=$(sqlite3 ~/.config/atlas/visibility.db "SELECT value FROM metadata WHERE key = 'schema_version';")
        if [ "$VERSION" != "1.0" ]; then
          echo "Schema version mismatch: $VERSION"
          exit 1
        fi

  security-scan:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Run ShellCheck
      uses: ludeeus/action-shellcheck@master
      with:
        scandir: './scripts'
        additional_files: './atlas-track-v2'

    - name: Check for SQL injection patterns
      run: |
        ! grep -r "sqlite_run.*\$RETENTION_DAYS" ./atlas-track-v2 || exit 1
        echo "✅ No direct SQL injection patterns found"

  performance-test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Run performance test
      run: |
        chmod +x tests/test_performance.sh
        ./tests/test_performance.sh

    - name: Assert performance requirements
      run: |
        # Add assertions for 10K entry performance
        python3 - <<PY
        import json
        import subprocess
        result = subprocess.run(
            ["python3", "/home/anombyte/.claude/skills/atlas.py", "status"],
            capture_output=True, text=True
        )
        status = json.loads(result.stdout)
        assert status["health"] == "healthy", "Health check failed"
        print("✅ Performance assertions passed")
        PY
```

### 3.2 Release Automation

#### Create: `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Run tests
      run: make test

    - name: Create release notes
      run: |
        echo "## Atlas Visibility System ${{ github.ref_name }}" > release_notes.md
        echo "" >> release_notes.md
        echo "### Changes" >> release_notes.md
        git log --pretty=format:"- %s" $(git describe --tags --abbrev=0 HEAD^)..HEAD >> release_notes.md

    - name: Create GitHub Release
      uses: softprops/action-gh-release@v1
      with:
        body_path: release_notes.md
        files: |
          atlas-track-v2
          src/schema.sql
        draft: false
        prerelease: false
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 3.3 Pre-commit Hooks

#### Create: `.pre-commit-config.yaml`

```yaml
repos:
  - repo: https://github.com/koalaman/shellcheck-precommit
    rev: v0.9.0
    hooks:
      - id: shellcheck
        files: \.(sh|bash)$
        args: [--severity=warning]

  - repo: local
    hooks:
      - id: atlas-tests
        name: Run Atlas tests
        entry: make test
        language: system
        pass_filenames: false
```

#### Installation

```bash
# Install pre-commit
pip install pre-commit

# Activate hooks
pre-commit install
```

### Acceptance Criteria

- [ ] All tests pass on every PR
- [ ] Security scan runs on every push
- [ ] Performance test runs on every PR
- [ ] Release automation creates GitHub releases
- [ ] Pre-commit hooks catch shell issues

---

## Phase 4: Migration Path for v0.x Users

**Priority:** P2 (Important)
**Estimate:** 2 hours

### 4.1 Migration Assessment

**Old System Issues:**
- File-based logging (no ACID)
- Timestamp-based task IDs (collisions)
- No cleanup mechanism
- No query capability

### 4.2 Migration Tool

#### Create: `scripts/migrate-from-v0.sh`

```bash
#!/bin/bash
# Migrate from v0.x file-based logs to v1.0 SQLite

set -euo pipefail

OLD_LOG="${ATLAS_OLD_LOG:-$HOME/.atlas/tasks.log}"
NEW_DB="${XDG_CONFIG_HOME:-$HOME/.config}/atlas/visibility.db"

echo "=== Atlas Migration: v0.x → v1.0 ==="
echo ""

if [ ! -f "$OLD_LOG" ]; then
  echo "❌ Old log file not found: $OLD_LOG"
  echo "   Set ATLAS_OLD_LOG if using custom location"
  exit 1
fi

echo "Old log: $OLD_LOG"
echo "New database: $NEW_DB"
echo ""

# Backup old log
BACKUP="$OLD_LOG.backup-$(date +%Y%m%d-%H%M%S)"
echo "Backing up old log to: $BACKUP"
cp "$OLD_LOG" "$BACKUP"
echo ""

# Initialize new database if needed
if [ ! -f "$NEW_DB" ]; then
  echo "Initializing new database..."
  ./atlas-track-v2 "migration-init" -- true >/dev/null
fi

# Parse and migrate entries
echo "Migrating entries..."
migrated=0
failed=0

while IFS='|' read -r timestamp description status exit_code duration; do
  # Skip header lines
  if [[ "$timestamp" =~ ^# ]]; then
    continue
  fi

  # Validate fields
  if [[ -z "$description" ]]; then
    ((failed++))
    continue
  fi

  # Generate task ID from old timestamp
  task_id=$(echo -n "${timestamp}${description}" | md5sum | cut -c1-36 | sed 's/\(........\)-\(....\)-\(....\)-\(....\)-\(............\)/\1-\2-3\3-\4-\5/')

  # Insert into new database
  sqlite3 "$NEW_DB" "
    INSERT INTO entries (
      task_id, description, status,
      exit_code, duration_seconds,
      created_at, updated_at
    ) VALUES (
      '$task_id',
      '$(echo "$description" | sed "s/'/''/g")',
      '$(echo "$status" | sed "s/'/''/g")',
      ${exit_code:-0},
      ${duration:-0},
      '${timestamp}',
      '${timestamp}'
    );
  " 2>/dev/null && ((migrated++)) || ((failed++))

done < "$OLD_LOG"

echo ""
echo "Migration Complete:"
echo "  ✓ Migrated: $migrated entries"
echo "  ✗ Failed:   $failed entries"
echo ""

if [ $migrated -gt 0 ]; then
  echo "✅ Migration successful"
  echo ""
  echo "Next steps:"
  echo "  1. Verify entries: python3 /home/anombyte/.claude/skills/atlas.py log"
  echo "  2. Remove old log after verification: rm $OLD_LOG"
  echo "  3. Keep backup until confident: $BACKUP"
else
  echo "❌ Migration failed - no entries migrated"
  exit 1
fi
```

### 4.3 Migration Documentation

#### Create: `docs/MIGRATION.md`

```markdown
# Migration Guide: v0.x → v1.0

## What Changed

### v0.x (Old)
- File-based logging (`~/.atlas/tasks.log`)
- Timestamp-based task IDs (collision-prone)
- No query capability
- No cleanup mechanism
- No integrity guarantees

### v1.0 (New)
- SQLite database (`~/.config/atlas/visibility.db`)
- UUID v4 task IDs (collision-resistant)
- Paginated queries with filtering
- Automatic retention cleanup
- ACID compliance for data integrity

## Migration Steps

### 1. Backup Current Data

```bash
# Backup old log file
cp ~/.atlas/tasks.log ~/.atlas/tasks.log.backup
```

### 2. Install v1.0

```bash
cd /home/anombyte/Atlas/atlas-visibility-fix
./scripts/install.sh
```

### 3. Run Migration Tool

```bash
./scripts/migrate-from-v0.sh
```

**Expected Output:**
```
=== Atlas Migration: v0.x → v1.0 ===

Old log: /home/user/.atlas/tasks.log
New database: /home/user/.config/atlas/visibility.db

Backing up old log to: /home/user/.atlas/tasks.log.backup-20260113-120000

Migrating entries...

Migration Complete:
  ✓ Migrated: 1234 entries
  ✗ Failed:   0 entries

✅ Migration successful
```

### 4. Verify Migration

```bash
# Check entry count matches
wc -l ~/.atlas/tasks.log
python3 ~/.claude/skills/atlas.py status | jq '.stats.total_entries'

# View recent entries
python3 ~/.claude/skills/atlas.py log --limit 10
```

### 5. Update Scripts

Replace old `atlas-track` calls with `atlas-track-v2`:

```bash
# Old
atlas-track "description" -- command

# New
atlas-track-v2 "description" -- command
```

Or use the symlink from `install.sh`:
```bash
atlas-track "description" -- command
```

### 6. Remove Old System (After Verification)

```bash
# Wait 1 week to ensure everything works
# Then remove old log
rm ~/.atlas/tasks.log
rm -rf ~/.atlas/
```

## Rollback

If issues occur:

```bash
# Restore old log
cp ~/.atlas/tasks.log.backup-* ~/.atlas/tasks.log

# Remove new database
rm ~/.config/atlas/visibility.db

# Reinstall old system
# (Use git checkout to previous version)
```

## Compatibility

### Breaking Changes

- **Command name:** `atlas-track` → `atlas-track-v2` (install.sh creates symlink)
- **Database format:** Text file → SQLite (use migration tool)
- **Query method:** Grep/log parsing → SQL queries (use atlas.py)

### Non-Breaking

- **Environment variables:** Same (`ATLAS_RETENTION_DAYS`, `ATLAS_URL`)
- **Output format:** Similar text output
- **Usage pattern:** Same `atlas-track "desc" -- command`

## Support

For issues or questions:
- GitHub Issues: https://github.com/anombyte/Atlas/issues
- Documentation: /home/anombyte/Atlas/atlas-visibility-fix/README.md
```

### Acceptance Criteria

- [ ] Migration tool imports old entries
- [ ] Migration preserves descriptions, timestamps, status
- [ ] Migration documentation is clear
- [ ] Rollback procedure documented
- [ ] Migration tested with sample data

---

## Phase 5: Optional Enhancements

**Priority:** P3 (Future)
**Estimate:** 8 hours total

### 5.1 HTTP API for Visibility Queries

**Goal:** REST API for querying visibility database

**Endpoints:**
```
GET  /api/v1/entries          # List entries (paginated)
GET  /api/v1/entries/:id      # Get single entry
GET  /api/v1/status           # System status
POST /api/v1/cleanup          # Trigger cleanup
GET  /api/v1/metrics          # Performance metrics
```

**Implementation:**
- Python Flask or FastAPI
- SQLite backend
- JWT authentication (optional)

### 5.2 Metrics/Observability Integration

**Goal:** Export Prometheus metrics

**Metrics:**
```
atlas_entries_total{status="completed|failed|logged"}
atlas_database_size_bytes
atlas_query_duration_seconds{query="log|status|cleanup"}
atlas_cleanup_deleted_entries
```

**Implementation:**
- Prometheus client library
- `/metrics` endpoint
- Grafana dashboard templates

### 5.3 Web Dashboard for Task Visualization

**Goal:** Browser-based UI for visibility data

**Features:**
- Task list with filtering
- Timeline view (Gantt chart)
- Status breakdown (pie chart)
- Performance metrics (graphs)
- Cleanup controls

**Implementation:**
- HTML/JS frontend
- HTTP API backend
- Docker Compose for deployment

---

## Timeline

| Phase | Priority | Estimate | Target |
|-------|----------|----------|--------|
| **Phase 1:** Production Deployment | P1 | 2 hours | Week 1 |
| **Phase 2:** Performance Monitoring | P1 | 3 hours | Week 1 |
| **Phase 3:** CI/CD Pipeline | P2 | 4 hours | Week 2 |
| **Phase 4:** Migration Path | P2 | 2 hours | Week 2 |
| **Phase 5:** Optional Enhancements | P3 | 8 hours | Future |

**Total P1+P2:** 11 hours
**Total All Phases:** 19 hours

---

## Success Criteria

### Phase 1 Completion
- [ ] One-command installation works
- [ ] Automated cleanup runs weekly
- [ ] Production config documented

### Phase 2 Completion
- [ ] 10K entry performance test passes
- [ ] Monitoring script provides useful metrics
- [ ] Database vacuum script documented

### Phase 3 Completion
- [ ] All tests pass on PRs automatically
- [ ] Security scans catch issues
- [ ] Releases created automatically on tags

### Phase 4 Completion
- [ ] Migration tool tested with real data
- [ ] Migration guide is clear and complete
- [ ] Rollback procedure documented

---

## Next Steps

1. **Start with Phase 1** - Create installation script and systemd service
2. **Validate Phase 2** - Run performance tests with 10K entries
3. **Set up Phase 3** - Add GitHub Actions workflows
4. **Complete Phase 4** - Write migration tool and documentation
5. **Evaluate Phase 5** - Decide if enhancements are needed based on usage

---

**Version:** 1.0.0
**Last Updated:** 2026-01-13
**Status:** Planning Phase
