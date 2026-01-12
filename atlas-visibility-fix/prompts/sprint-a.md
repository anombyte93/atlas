# Sprint A: SQLite Backend Implementation (US-001)

## ROLE
Bash script developer implementing SQLite backend for Atlas visibility tracking.

## CONSTRAINTS
- Use codex-exec.sh for code generation
- Target: ~/.claude/bin/atlas-track-v2
- Database: ~/.config/atlas/visibility.db (already initialized by architect)
- All writes MUST use transactions (BEGIN/COMMIT)
- MUST implement rollback on error

## GOAL
Create atlas-track-v2 script with SQLite backend supporting transactional integrity.

## TASKS

1. **Create atlas-track-v2** with this structure:
   ```bash
   #!/bin/bash
   set -euo pipefail
   
   # Configuration
   DB_FILE="${ATLAS_DB:-~/.config/atlas/visibility.db}"
   ATLAS_URL="${ATLAS_URL:-http://localhost:8080}"
   ATLAS_TOKEN="${ATLAS_API_TOKEN:-dev-token-archie}"
   
   # Cleanup handler for transaction rollback
   cleanup() {
       local exit_code=$?
       if [ $exit_code -ne 0 ]; then
           echo "[WARNING] Script failed, rolling back any open transaction"
           sqlite3 "$DB_FILE" "ROLLBACK;" 2>/dev/null || true
       fi
   }
   trap cleanup EXIT ERR INT TERM
   
   # Function: Generate UUID v4
   gen_uuid() {
       if command -v uuidgen >/dev/null 2>&1; then
           uuidgen | tr '[:upper:]' '[:lower:]'
       else
           # Fallback: Python
           python3 -c "import uuid; print(str(uuid.uuid4()))"
       fi
   }
   
   # Function: Log entry to database
   log_to_db() {
       local task_id="$1"
       local description="$2"
       local command="$3"
       local exit_code="${4:-}"
       local duration="${5:-0}"
       local status="${6:-logged}"
       
       sqlite3 "$DB_FILE" <<EOSQL
   BEGIN IMMEDIATE TRANSACTION;
   INSERT INTO entries (task_id, description, command, exit_code, duration_seconds, status)
   VALUES ('$task_id', '$description', $(sqlite3 "$DB_FILE" "SELECT quote('$command')"), $exit_code, $duration, '$status');
   COMMIT;
   EOSQL
   }
   
   # Parse arguments
   if [ $# -eq 0 ]; then
       echo "Usage: atlas-track-v2 \"description\" [-- command]"
       exit 1
   fi
   
   DESCRIPTION="$1"
   shift
   TASK_ID=$(gen_uuid)
   TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
   
   # Log to database first (always succeeds)
   log_to_db "$TASK_ID" "$DESCRIPTION" "" "" "" "logged"
   
   # If command provided, execute it
   if [ "$#" -gt 0 ] && [ "$1" = "--" ]; then
       shift
       COMMAND="$*"
       
       echo "→ Executing: $COMMAND"
       START_TIME=$(date +%s)
       
       # Execute command
       OUTPUT=$("$@" 2>&1) || true
       EXIT_CODE=${PIPESTATUS[0]}
       END_TIME=$(date +%s)
       DURATION=$((END_TIME - START_TIME))
       
       # Update database with result
       sqlite3 "$DB_FILE" <<EOSQL
   BEGIN IMMEDIATE TRANSACTION;
   UPDATE entries 
   SET command = $(sqlite3 "$DB_FILE" "SELECT quote('$COMMAND')"),
       exit_code = $EXIT_CODE,
       duration_seconds = $DURATION,
       status = CASE $EXIT_CODE WHEN 0 THEN 'completed' ELSE 'failed' END,
       stdout = $(sqlite3 "$DB_FILE" "SELECT quote('$OUTPUT')"),
       updated_at = datetime('now')
   WHERE task_id = '$TASK_ID';
   COMMIT;
   EOSQL
       
       echo "✓ $DESCRIPTION (${DURATION}s)"
       [ "$EXIT_CODE" -ne 0 ] && echo "  Exit: $EXIT_CODE"
       
       exit $EXIT_CODE
   else
       echo "✓ Logged: $DESCRIPTION"
       echo "  Task ID: $TASK_ID"
   fi
   ```

2. **Test transactional integrity**:
   - Simulate failure during write
   - Verify rollback happens
   - Verify no partial data in database

3. **Test concurrent access**:
   - Run 10 atlas-track-v2 commands simultaneously
   - Verify all entries are written correctly
   - Verify no database corruption

## COMPLETION SIGNAL

Write `sprint-a/.sprint-complete.json`:
```json
{"status": "complete", "commit": "abc123", "files": 1, "transaction_safe": true}
```

Verify:
```bash
[ -f sprint-a/.sprint-complete.json ] && \
~/.claude/bin/atlas-track-v2 "Test transaction" -- echo "test" && \
sqlite3 ~/.config/atlas/visibility.db "SELECT COUNT(*) FROM entries" | grep -q "[1-9]"
```
