# Sprint D: Shell-Safe Command Escaping (US-004)

## ROLE
Script developer implementing safe JSON escaping for shell commands.

## CONSTRAINTS
- Use codex-exec.sh for code generation
- MUST escape commands properly to avoid JSON injection
- Use jq for escaping (preferred) or Python json.dumps()
- Handle quotes, backslashes, newlines, binary data

## GOAL
Implement shell-safe command escaping in atlas-track-v2.

## TASKS

1. **Implement jq-based escaping**:
   ```bash
   escape_json() {
       local input="$1"
       echo "$input" | jq -Rs .
   }
   
   # Usage in JSON construction:
   escaped_command=$(escape_json "$COMMAND")
   cat <<EOF
   {"command": $escaped_command, ...}
   EOF
   ```

2. **Test special characters**:
   ```bash
   # Test 1: Quotes
   atlas-track-v2 "quotes" -- echo 'Hello "world"'
   
   # Test 2: Backslashes
   atlas-track-v2 "backslash" -- echo "path\\to\\file"
   
   # Test 3: Newlines
   atlas-track-v2 "newlines" -- echo $'line1\nline2'
   
   # Test 4: Binary/null
   atlas-track-v2 "binary" -- printf "test\x00null"
   ```

3. **Validate JSON output**:
   - Pipe generated JSON through jq
   - Verify it's valid JSON
   - Add validation in script

## COMPLETION SIGNAL

Write `sprint-d/.sprint-complete.json`:
```json
{"status": "complete", "escaping_method": "jq", "tests_pass": true}
```
