# Sprint E: Database Connection Pooling (US-005)

## ROLE
Python developer implementing efficient database queries with pagination.

## CONSTRAINTS
- Use codex-exec.sh for code generation
- Target: ~/.claude/skills/atlas-v2.py
- MUST use LIMIT/OFFSET for pagination
- Default: last 100 entries
- Full log: requires --all flag
- Memory usage must stay constant regardless of log size

## GOAL
Implement efficient database querying with pagination in atlas-v2.py skill.

## TASKS

1. **Implement log() function with pagination**:
   ```python
   def log(limit=100, offset=0, all_entries=False):
       """Return visibility log entries with pagination."""
       import sqlite3
       import json
       
       DB_FILE = os.path.expanduser("~/.config/atlas/visibility.db")
       
       if all_entries:
           limit = -1  # No limit
       
       try:
           conn = sqlite3.connect(DB_FILE)
           conn.row_factory = sqlite3.Row
           cursor = conn.cursor()
           
           cursor.execute("""
               SELECT id, task_id, description, command, exit_code,
                      duration_seconds, status, created_at
               FROM entries
               ORDER BY created_at DESC
               LIMIT ? OFFSET ?
           """, (limit, offset))
           
           entries = []
           for row in cursor:
               entries.append(dict(row))
           
           conn.close()
           return entries
       except Exception as e:
           return [{"error": str(e)}]
   ```

2. **Implement status() function with actual verification**:
   ```python
   def status():
       """Return system health status."""
       import sqlite3
       import subprocess
       
       result = {}
       
       # Check control plane
       try:
           resp = subprocess.run(
               ["curl", "-s", f"{ATLAS_URL}/health"],
               capture_output=True, timeout=2
           )
           result["control_plane"] = "running" if resp.returncode == 0 else "down"
       except:
           result["control_plane"] = "unknown"
       
       # Check database
       try:
           conn = sqlite3.connect(DB_FILE)
           cursor = conn.cursor()
           cursor.execute("SELECT COUNT(*) FROM entries")
           result["database"] = "ok"
           result["total_entries"] = cursor.fetchone()[0]
           conn.close()
       except Exception as e:
           result["database"] = f"error: {str(e)}"
       
       return result
   ```

3. **Test with 10,000 entries**:
   - Insert 10,000 test entries
   - Query should be fast (< 100ms)
   - Memory usage should be constant
   - Test both paginated and full queries

## COMPLETION SIGNAL

Write `sprint-e/.sprint-complete.json`:
```json
{"status": "complete", "pagination": true, "performance_test": "10000_entries"}
```
