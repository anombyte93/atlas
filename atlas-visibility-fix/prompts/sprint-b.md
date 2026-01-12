# Sprint B: UUID v4 Task IDs (US-002)

## ROLE
Script developer implementing UUID-based task ID generation.

## CONSTRAINTS
- Use codex-exec.sh for code generation
- MUST use uuidgen or Python uuid.uuid4()
- UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
- MUST be collision-resistant even for rapid successive commands

## GOAL
Implement UUID v4 task IDs in atlas-track-v2.

## TASKS

1. **Add UUID generation function**:
   ```bash
   gen_uuid() {
       if command -v uuidgen >/dev/null 2>&1; then
           uuidgen | tr '[:upper:]' '[:lower:]'
       else
           python3 -c "import uuid; print(str(uuid.uuid4()))"
       fi
   }
   ```

2. **Validate UUID format**:
   - Check format matches regex: `^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`
   - Add validation in script

3. **Test collision resistance**:
   - Run 100 rapid commands in loop
   - Verify all IDs are unique
   ```bash
   for i in {1..100}; do
       atlas-track-v2 "rapid test $i" -- true &
   done
   wait
   sqlite3 ~/.config/atlas/visibility.db "SELECT COUNT(DISTINCT task_id) FROM entries" | grep -q "100"
   ```

## COMPLETION SIGNAL

Write `sprint-b/.sprint-complete.json`:
```json
{"status": "complete", "collision_tests": 100, "all_unique": true}
```
