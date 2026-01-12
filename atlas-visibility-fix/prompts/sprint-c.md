# Sprint C: Error Handling with User Feedback (US-003)

## ROLE
Script developer implementing comprehensive error handling.

## CONSTRAINTS
- Use codex-exec.sh for code generation
- NO silent failures - all errors must be reported
- curl failures MUST be captured and shown
- "✓ Tracked" only appears AFTER confirmation

## GOAL
Implement error handling with proper user feedback in atlas-track-v2.

## TASKS

1. **Add HTTP error capture**:
   ```bash
   submit_to_atlas() {
       local task_id="$1"
       local task_json="$2"
       
       # Submit with status code capture
       response=$(curl -s -w "%{http_code}" -X POST "$ATLAS_URL/tasks/submit" \
           -H "Content-Type: application/json" \
           -H "Authorization: Bearer $ATLAS_TOKEN" \
           -d "$task_json")
       
       http_code="${response: -3}"
       body="${response%???}"
       
       if [ "$http_code" -ge 400 ]; then
           echo "[ERROR] Failed to submit task (HTTP $http_code): $body"
           return 1
       fi
       
       return 0
   }
   ```

2. **Add retry logic with exponential backoff**:
   ```bash
   submit_with_retry() {
       local max_retries=3
       local retry=0
       local delay=1
       
       while [ $retry -lt $max_retries ]; do
           if submit_to_atlas "$@"; then
               return 0
           fi
           
           ((retry++))
           if [ $retry -lt $max_retries ]; then
               echo "[RETRY $retry/$max_retries] Waiting ${delay}s..."
               sleep $delay
               delay=$((delay * 2))
           fi
       done
       
       return 1
   }
   ```

3. **Add database operation error handling**:
   - Capture sqlite3 errors
   - Report meaningful messages
   - Return proper exit codes

## COMPLETION SIGNAL

Write `sprint-c/.sprint-complete.json`:
```json
{"status": "complete", "error_handling": "comprehensive", "retry_logic": "exponential_backoff"}
```
