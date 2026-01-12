# Architect Sprint: Database Schema Design

## ROLE
Database architect designing the SQLite schema for Atlas visibility tracking system.

## CONSTRAINTS
- Use only: sqlite3, standard bash built-ins
- Target database: ~/.config/atlas/visibility.db
- Must be ACID compliant with transactional integrity
- Must enable WAL mode for better concurrency
- Use codex-exec.sh for all code generation

## GOAL
Design and implement production-ready SQLite schema for the Atlas visibility system.

## TASKS

1. **Create database initialization script** at `src/init-db.sh`:
   ```bash
   #!/bin/bash
   set -euo pipefail
   
   DB_FILE="${1:-~/.config/atlas/visibility.db}"
   
   # Create database with schema
   sqlite3 "$DB_FILE" <<'EOSQL'
   PRAGMA journal_mode=WAL;
   PRAGMA synchronous=NORMAL;
   PRAGMA foreign_keys=ON;
   PRAGMA busy_timeout=5000;
   
   CREATE TABLE IF NOT EXISTS entries (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       task_id TEXT UNIQUE NOT NULL,
       description TEXT NOT NULL,
       command TEXT,
       exit_code INTEGER,
       duration_seconds INTEGER,
       status TEXT NOT NULL CHECK(status IN ('logged', 'running', 'completed', 'failed')),
       stdout TEXT,
       stderr TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   
   CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at DESC);
   CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
   CREATE INDEX IF NOT EXISTS idx_entries_task_id ON entries(task_id);
   
   -- Cleanup policy trigger
   CREATE TRIGGER IF NOT EXISTS cleanup_old_entries
   AFTER INSERT ON entries
   BEGIN
     DELETE FROM entries WHERE created_at < datetime('now', '-90 days');
   END;
   
   EOSQL
   
   echo "Database initialized at $DB_FILE"
   ```

2. **Create database health check script** at `src/check-db.sh`:
   ```bash
   #!/bin/bash
   set -euo pipefail
   
   DB_FILE="${1:-~/.config/atlas/visibility.db}"
   
   # Check database exists
   [ -f "$DB_FILE" ] || { echo "ERROR: Database not found"; exit 1; }
   
   # Run integrity check
   RESULT=$(sqlite3 "$DB_FILE" "PRAGMA integrity_check;")
   [ "$RESULT" = "ok" ] || { echo "ERROR: Database corrupted: $RESULT"; exit 1; }
   
   # Check schema
   SCHEMA=$(sqlite3 "$DB_FILE" ".schema" | grep -c "CREATE TABLE")
   [ "$SCHEMA" -ge 1 ] || { echo "ERROR: No schema found"; exit 1; }
   
   echo "OK: Database healthy"
   ```

3. **Create migration script** at `src/migrate.sh`:
   - Back up existing ~/.config/atlas/visibility.log
   - Parse JSONL format and insert into SQLite
   - Use transactions for batch inserts
   - Verify record count matches

4. **Test the schema**:
   - Run init-db.sh
   - Verify .schema command works
   - Test INSERT/COMMIT/ROLLBACK
   - Test cleanup trigger

## COMPLETION SIGNAL

Write `architect/.sprint-complete.json`:
```json
{"status": "complete", "files": 3, "tests_pass": true, "schema_valid": true}
```

Verify:
```bash
[ -f architect/.sprint-complete.json ] && \
sqlite3 ~/.config/atlas/visibility.db ".schema" | grep -q "CREATE TABLE entries"
```
