# @agents-finality Test Prompt

You are testing the @agents-finality governance system in Molly_Food_Scanner by implementing Contract M1.

## Pre-flight Checks

1. **Verify @agents-finality hook exists**:
   ```bash
   ls -la .git/hooks/pre-push
   cat .git/hooks/pre-push | head -20
   ```

2. **Verify contract exists in TODO.md**:
   ```bash
   grep -A 20 "### Contract M1:" TODO.md
   ```

3. **Check SESSION_STATE.md**:
   ```bash
   cat SESSION_STATE.md | grep -i "M1" | head -5
   ```

4. **Verify claude-exec is available**:
   ```bash
   which claude-exec || ls -la ~/.local/bin/claude-exec
   ```

## Phase 1: Start Contract M1

1. **Update SESSION_STATE.md** - Change M1 from `pending` to `in_progress`:
   ```bash
   # Find the line with M1 in "Contracts in Progress" section
   # Change from:
   - M1: Image Upload - pending
   # To:
   - M1: Image Upload - in_progress (assigned to test-agent)
   ```

2. **Commit the state change**:
   ```bash
   git add SESSION_STATE.md
   git commit -m "Contract M1: Starting implementation - assigned to test-agent"
   ```

3. **Attempt push** (hook should allow since M1 is just starting):
   ```bash
   # This will fail if no remote, but hook should pass
   echo "Testing hook allows state changes..."
   echo "refs/heads/master refs/heads/master $(git rev-parse HEAD) $(git rev-parse HEAD~1)" | .git/hooks/pre-push origin "https://github.com/test/repo.git"
   ```

## Phase 2: Implement Contract M1 (Minimal)

**Contract M1 Requirements** (from TODO.md):
- [ ] User can upload food image via drag-drop
- [ ] User can upload food image via file picker
- [ ] Show preview of uploaded image
- [ ] Display loading state during AI analysis
- [ ] Handle image file validation (type, size)

**Implementation** (create a simple test file):

Create `.Agents/test-m1-implementation.md`:
```markdown
# Contract M1 Test Implementation

## Done
- [x] Created test file to verify contract workflow
- [x] Uploaded via drag-drop (simulated)
- [x] Uploaded via file picker (simulated)
- [x] Preview shows image
- [x] Loading state displays
- [x] File validation works

## Notes
This is a test implementation to verify @agents-finality governance.
Actual implementation will be done by Codex agents.
```

## Phase 3: Mark Ready for Review

1. **Update SESSION_STATE.md**:
   ```bash
   # Change M1 from in_progress to ready_for_review
   ```

2. **Commit as ready**:
   ```bash
   git add .Agents/test-m1-implementation.md SESSION_STATE.md
   git commit -m "Contract M1: Implementation complete, ready for validation"
   ```

3. **Test the hook** (should detect M1 and block):
   ```bash
   echo "Testing hook blocks non-completed contract..."
   echo "refs/heads/master refs/heads/master $(git rev-parse HEAD) $(git rev-parse HEAD~1)" | .git/hooks/pre-push origin "https://github.com/test/repo.git"
   ```

**Expected output**: Hook should say "Contract M1 is still pending" or similar and block with exit code 1.

## Phase 4: Trigger Deepseek Validation

```bash
# Manually trigger Deepseek validation
claude-exec --agent deepseek "Validate contract M1: Image Upload

Please review the implementation against the contract requirements in TODO.md:

Contract M1: Image Upload Functionality
Requirements:
- User can upload food image via drag-drop
- User can upload food image via file picker
- Show preview of uploaded image
- Display loading state during AI analysis
- Handle image file validation (type, size)

Acceptance Criteria:
- Can upload .jpg, .png images up to 5MB
- Preview displays correctly
- Loading state shows 'Analyzing your food...'
- Errors are user-friendly

Check if implementation satisfies requirements and provide:
1. Status: PASS or NEEDS_FIX
2. Issues found (if any) with file:line references
3. Recommendations for fixes"
```

## Phase 5: Complete Contract Workflow

1. **If Deepseek validation passes**:
   ```bash
   # Update SESSION_STATE.md: validated → completed
   git add SESSION_STATE.md
   git commit -m "Contract M1: Validated and completed"
   ```

2. **Test hook allows completed contract**:
   ```bash
   echo "Testing hook allows completed contract..."
   echo "refs/heads/master refs/heads/master $(git rev-parse HEAD) $(git rev-parse HEAD~1)" | .git/hooks/pre-push origin "https://github.com/test/repo.git"
   ```

**Expected**: Hook should allow push (exit code 0)

3. **Test emergency bypass**:
   ```bash
   echo "Testing --no-verify bypass..."
   # Create a contract commit that would fail
   git commit --allow-empty -m "Contract M99: Should fail validation"
   echo "refs/heads/master refs/heads/master $(git rev-parse HEAD) $(git rev-parse HEAD~1)" | .git/hooks/pre-push origin "https://github.com/test/repo.git" || echo "Blocked as expected"
   ```

## Verification Checklist

After running this test, verify:

- [ ] Hook file exists at `.git/hooks/pre-push` and is executable
- [ ] Hook detects contract commits (pattern `Contract (M|R)[0-9]+`)
- [ ] Hook checks TODO.md for contract existence
- [ ] Hook checks SESSION_STATE.md for contract state
- [ ] Hook blocks pushes for pending/in_progress contracts
- [ ] Hook allows pushes for completed contracts
- [ ] claude-exec integration works (or graceful fallback)
- [ ] `--no-verify` bypass works
- [ ] SESSION_STATE.md updates track contract states correctly
- [ ] Documentation in `.Agents/CLAUDE.md` is accurate

## Expected Test Results

| Test | Expected Result |
|------|----------------|
| Non-contract commit | Pass (exit 0) |
| Contract commit (pending) | Block (exit 1) |
| Contract commit (completed) | Pass (exit 0) |
| Invalid contract ID | Block with error |
| Missing TODO.md | Block with error |
| --no-verify | Always pass |

## Cleanup After Test

```bash
# Reset to before test
git log --oneline -5
# Reset test commits if needed
git reset --hard HEAD~N
```

---

**Instructions for running this test**:

1. Save this prompt to a file
2. In a fresh Claude session, paste the entire prompt
3. Follow each phase sequentially
4. Report any issues or unexpected behavior
