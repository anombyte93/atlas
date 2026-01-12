# Atlas User Story Tests

**Purpose**: Verify Atlas system functionality through manual testing
**Tester**: anombyte
**Date**: January 12, 2026
**Instructions**: Run each test, record actual result, mark ✅ Pass / ❌ Fail / ⚠️ Skip

---

## Part 1: Atlas CLI Tests (1-7)

### Test 1: Atlas Command Exists
**What**: Verify `atlas` command is available
**Steps**:
```bash
which atlas
```
**Expected**: `/home/anombyte/bin/atlas`
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 2: Atlas Help Command
**What**: Display help text
**Steps**:
```bash
atlas
```
**Expected**: Shows usage with all commands (start, stop, status, cd, go, sessions)
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 3: Atlas Status Shows Directory
**What**: Check Atlas knows where it lives
**Steps**:
```bash
atlas status
```
**Expected**: Shows "Directory: /home/anombyte/Atlas" and "Exists: Yes"
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 4: Atlas Sessions Command
**What**: List AI sessions via Atlas
**Steps**:
```bash
atlas sessions
```
**Expected**: Shows list of tmux sessions or "No sessions"
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 5: Atlas CD Command
**What**: Navigate to Atlas directory
**Steps**:
```bash
atlas cd
pwd
```
**Expected**: You are now in `/home/anombyte/Atlas`
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 6: Atlas Start Creates Venv
**What**: Initialize Python environment
**Steps**:
```bash
atlas start
```
**Expected**: Message about creating venv (if doesn't exist) or "services ready"
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 7: Atlas Stop Command
**What**: Stop Atlas services
**Steps**:
```bash
atlas stop
```
**Expected**: Shows "Stopping Atlas services..." and "stopped"
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

## Part 2: AI Session Management Tests (8-12)

### Test 8: AI Quick Select Shows Top 6
**What**: Test `ai ts` quick selection
**Steps**:
```bash
ai ts
```
**Expected**: Shows numbered list 1-6 of sessions, then waits for input
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip
*(Press 'q' to exit)*

---

### Test 9: AI Tmux Lists All Sessions
**What**: Non-interactive session list
**Steps**:
```bash
ai tmux
```
**Expected**: Lists all tmux sessions without blocking
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 10: AI Tmux Attach by Name
**What**: Attach to specific session
**Steps**:
1. Find a session name from `ai tmux`
2. Run: `ai tmux <session-name>`
**Expected**: Attaches to that tmux session
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip
*(Press Ctrl+B then D to detach)*

---

### Test 11: AI Help Shows Ts Command
**What**: Verify ai ts is documented
**Steps**:
```bash
ai --help
```
**Expected**: Help text includes session commands
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 12: Create New Session via AI
**What**: Create a new tmux session
**Steps**:
```bash
ai tmux new test-session-$$
```
**Expected**: Creates new session named "test-session-<PID>"
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

## Part 3: Service Verification Tests (13-16)

### Test 13: Node-Agent Process Running
**What**: Verify node-agent is alive
**Steps**:
```bash
ps aux | grep node-agent | grep -v grep
```
**Expected**: Shows at least one node-agent process with PID
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 14: Log Watchers Running
**What**: Check if log monitoring is active
**Steps**:
```bash
ps aux | grep log | grep -v grep
```
**Expected**: Shows log watcher processes
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 15: Atlas Directory Structure Valid
**What**: Verify required directories exist
**Steps**:
```bash
ls -la ~/Atlas/atlas/
```
**Expected**: Shows: agents/, config/, services/, logging/
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 16: README Documentation Exists
**What**: Check Atlas has documentation
**Steps**:
```bash
cat ~/Atlas/README.md | head -20
```
**Expected**: README exists and describes Atlas
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

## Part 4: Integration Tests (17-20)

### Test 17: Atlas Alias via Shell
**What**: Test if shell alias works (expected to FAIL)
**Steps**:
```bash
. 2>&1
```
**Expected**: Error "not enough arguments" (this is KNOWN to fail)
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 18: Chezmoi Config Exists
**What**: Verify chezmoi integration
**Steps**:
```bash
ls -la ~/.local/share/chezmoi/ 2>/dev/null | head -10
```
**Expected**: chezmoi directory exists or message about none
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 19: Git Repos Are Tracked
**What**: Verify Atlas repo has remote
**Steps**:
```bash
cd ~/Atlas && git remote -v
```
**Expected**: Shows origin pointing to github.com/anombyte93/atlas
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

### Test 20: End-to-End Workflow
**What**: Complete workflow from check to navigate
**Steps**:
1. `atlas status` - Check system
2. `ai ts` - View sessions (press q)
3. `atlas cd` - Go to Atlas
4. `ls atlas/agents/` - View agents
5. `exit` - Return to home
**Expected**: All commands complete successfully without errors
**Actual**: ____________________
**Result**: ❌ Pass / Fail / Skip

---

## Test Summary

| Test | Description | Pass | Fail | Skip | Notes |
|------|-------------|------|------|------|-------|
| 1 | Atlas command exists | | | | |
| 2 | Atlas help works | | | | |
| 3 | Atlas status shows directory | | | | |
| 4 | Atlas sessions command | | | | |
| 5 | Atlas cd navigation | | | | |
| 6 | Atlas start creates venv | | | | |
| 7 | Atlas stop command | | | | |
| 8 | AI ts quick select | | | | |
| 9 | AI tmux list sessions | | | | |
| 10 | AI tmux attach by name | | | | |
| 11 | AI help documentation | | | | |
| 12 | Create new session | | | | |
| 13 | Node-agent process running | | | | |
| 14 | Log watchers active | | | | |
| 15 | Atlas directory structure | | | | |
| 16 | README documentation | | | | |
| 17 | Shell alias (expected fail) | | | | |
| 18 | Chezmoi integration | | | | |
| 19 | Git repo tracked | | | | |
| 20 | End-to-end workflow | | | | |

**Total Passed**: ____ / 20
**Total Failed**: ____ / 20
**Total Skipped**: ____ / 20

---

## Issues Found

Record any failures or unexpected behavior:

1. _________________________________________________________________
2. _________________________________________________________________
3. _________________________________________________________________
4. _________________________________________________________________
5. _________________________________________________________________

---

## Tester Feedback

What worked well?
_________________________________________________________________

What needs improvement?
_________________________________________________________________

What features are missing?
_________________________________________________________________

**Signature**: ____________________
**Date**: ____________________
