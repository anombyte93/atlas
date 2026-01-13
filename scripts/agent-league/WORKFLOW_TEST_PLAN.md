# Workflow Test Plan: Agent League Framework

**Created**: 2026-01-12
**Status**: Ready for Execution
**Context**: After fixing 15 critical security/reliability issues, validate system works end-to-end

---

## Overview

This workflow test will validate the Agent League framework works correctly with all security hardening and reliability fixes applied.

**Test Strategy**: Integration testing + Chaos engineering + Security validation

**Success Criteria**:
1. ✅ Docker security flags are enforced (verified via `docker inspect`)
2. ✅ Agent containers execute in isolation with network restrictions
3. ✅ Atlas Coin API integration works correctly
4. ✅ Cleanup mechanisms prevent zombie containers
5. ✅ Error handling and retry logic works under stress
6. ✅ Signal handlers clean up on process crash

---

## Phase 1: Environment Setup (5 min)

### 1.1 Start Atlas Coin Control Plane
```bash
cd /home/anombyte/Atlas/atlas/services/control-plane/cmd/control-plane
go run . &
CONTROL_PLANE_PID=$!
echo "Control plane PID: $CONTROL_PLANE_PID"
```

**Verify**:
```bash
curl -s http://localhost:3000/tasks/list -H "Authorization: Bearer test-token" | jq '.'
```

### 1.2 Set Environment Variables
```bash
export DOCKER_IMAGE="node:22-alpine"
export ATLAS_COIN_API_URL="http://localhost:3000"
export ATLAS_COIN_AUTH_TOKEN="test-token"
```

### 1.3 Verify Docker Available
```bash
docker --version
docker ps
```

---

## Phase 2: Security Validation (10 min)

### 2.1 Test Docker Security Flags
**Goal**: Verify all security hardening flags are present in running containers

**Test Script**: `tests/security/docker-security.test.sh`
```bash
#!/bin/bash
# Test: Verify container security flags

echo "Starting security test container..."
TEST_CONTAINER="security-test-$(date +%s)"

docker run -d --name "$TEST_CONTAINER" \
  --read-only \
  --cap-drop=ALL \
  --security-opt no-new-privileges \
  --pids-limit 100 \
  --tmpfs /tmp:rw \
  --network=none \
  --memory 512m \
  --cpus 1 \
  node:22-alpine \
  sleep 30

# Inspect container
INSPECT=$(docker inspect "$TEST_CONTAINER")

# Check security flags
echo "Checking security flags..."
echo "$INSPECT" | jq -r '.[0].HostConfig.ReadonlyRootfs' | grep -q true && echo "✅ ReadonlyRootfs" || echo "❌ ReadonlyRootfs FAILED"
echo "$INSPECT" | jq -r '.[0].HostConfig.CapDrop' | grep -q "ALL" && echo "✅ CapDrop ALL" || echo "❌ CapDrop FAILED"
echo "$INSPECT" | jq -r '.[0].HostConfig.SecurityOpt[]' | grep -q "no-new-privileges" && echo "✅ No-new-privileges" || echo "❌ No-new-privileges FAILED"
echo "$INSPECT" | jq -r '.[0].HostConfig.PidsLimit' | grep -q 100 && echo "✅ PidsLimit 100" || echo "❌ PidsLimit FAILED"
echo "$INSPECT" | jq -r '.[0].HostConfig.NetworkMode' | grep -q "none" && echo "✅ Network none" || echo "❌ Network none FAILED"

# Cleanup
docker rm -f "$TEST_CONTAINER"
```

**Expected Output**:
```
✅ ReadonlyRootfs
✅ CapDrop ALL
✅ No-new-privileges
✅ PidsLimit 100
✅ Network none
```

### 2.2 Test Image Validation
**Goal**: Verify `ensureImageExists()` pulls missing images

**Test**:
```bash
# Remove image if exists
docker rmi node:22-alpine 2>/dev/null || true

# Run agent execution (should auto-pull)
npx tsx -e "
import { AgentExecutionService } from './scripts/agent-league/AgentExecutionService.js';
const service = new AgentExecutionService();
await service.executeAgent('test-agent', 'test-bounty', '.', {
  image: 'node:22-alpine',
  timeoutMs: 5000
}).then(() => console.log('✅ Image pull works')).catch(e => console.error('❌ FAILED:', e.message));
"
```

---

## Phase 3: Integration Testing (15 min)

### 3.1 Test Real Competition Flow
**Goal**: Verify end-to-end execution with Atlas Coin API

**Prerequisites**:
- Control plane running on :3000
- Test bounty exists in system

**Test**:
```bash
# Create test bounty first
curl -X POST http://localhost:3000/tasks/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{
    "task_id": "test-bounty-1",
    "task": {
      "type": "code_fix",
      "description": "Fix a simple bug",
      "code": "function add(a, b) { return a + b; }",
      "test": "console.assert(add(1, 2) === 3);"
    }
  }'

# Run real competition (single season, single round)
TEST_OUTPUT=$(npx tsx scripts/agent-league/run-real-competition.ts 2>&1)

# Check for success indicators
echo "$TEST_OUTPUT" | grep -q "Agent container completed" && echo "✅ Agent executed"
echo "$TEST_OUTPUT" | grep -q "Starting agent container" && echo "✅ Container started"
echo "$TEST_OUTPUT" | grep -q "cleanup.*container" && echo "✅ Cleanup triggered"
```

### 3.2 Test Evidence Parser
**Goal**: Verify agent output is correctly parsed

**Test Script**: `tests/integration/evidence-parser.test.ts`
```typescript
import { EvidenceParser } from "../scripts/agent-league/EvidenceParser";

const parser = new EvidenceParser();

// Test 1: JSON output
const jsonOutput = `
## Test Results
{"passed": true, "coverage": 85, "tests": 10}
`;

const result1 = parser.parseFromOutput(jsonOutput, "");
console.assert(result1.evidence.ci_passed === true, "JSON parsing failed");
console.assert(result1.evidence.coverage_percent === 85, "Coverage parsing failed");
console.log("✅ JSON evidence parsing works");

// Test 2: Plain text output
const textOutput = `
Running tests...
✅ Test 1 passed
✅ Test 2 passed
Coverage: 75.5%
`;

const result2 = parser.parseFromOutput(textOutput, "");
console.log("✅ Plain text evidence parsing works");
```

---

## Phase 4: Chaos Engineering (15 min)

### 4.1 Test Cleanup on Crash
**Goal**: Verify signal handlers clean up containers

**Test**:
```bash
#!/bin/bash
# Test: Signal handler cleanup

# Start agent in background
npx tsx -e "
import { AgentExecutionService } from './scripts/agent-league/AgentExecutionService.js';
const service = new AgentExecutionService();
console.log('Agent PID:', process.pid);
await service.executeAgent('test-agent', 'test-bounty', '.', {
  image: 'node:22-alpine',
  timeoutMs: 30000  // 30s execution
});
" &

AGENT_PID=$!
echo "Started agent PID: $AGENT_PID"
sleep 2  # Let container start

# Check container exists
CONTAINER=$(docker ps --filter "name=test-agent" --format "{{.Names}}")
echo "Container: $CONTAINER"

# Kill the agent process (simulating crash)
echo "Killing agent process..."
kill -SIGTERM $AGENT_PID

# Wait a moment for cleanup
sleep 2

# Verify container is gone
REMAINING=$(docker ps --filter "name=test-agent" --format "{{.Names}}")
if [ -z "$REMAINING" ]; then
  echo "✅ Signal handler cleanup works"
else
  echo "❌ FAILED: Container still running: $REMAINING"
  docker rm -f "$REMAINING"
fi
```

### 4.2 Test API Retry Logic
**Goal**: Verify AtlasCoinClient retries on failure

**Test**: Requires control plane to be stopped/misconfigured
```bash
#!/bin/bash
# Test: Retry logic with jitter

# Stop control plane to simulate failure
# pkill -f "control-plane"

# Test client retry behavior
npx tsx -e "
import { AtlasCoinClient } from './scripts/agent-league/AtlasCoinClient.js';
const client = new AtlasCoinClient({
  baseUrl: 'http://localhost:3000',
  retries: 3,
  retryDelayMs: 100
});

// Try to submit to non-existent API
client.submitBounty('test-id', {
  claimant: 'test',
  stakeAmount: 100,
  evidence: { ci_passed: true, coverage_percent: 50 }
}).then(() => {
  console.log('❌ Should have failed');
}).catch(e => {
  console.log('✅ Retry logic works:', e.message);
  console.log('✅ Backoff with jitter applied');
});
"
```

### 4.3 Test Network Isolation
**Goal**: Verify containers cannot access network

**Test**:
```bash
#!/bin/bash
# Test: Network isolation

# Start container with --network=none
docker run -d --name network-test \
  --read-only \
  --network=none \
  node:22-alpine \
  node -e "require('http').get('http://google.com', () => console.log('FAIL'))"

# Wait for execution
sleep 2

# Check logs (should be empty or connection refused)
LOGS=$(docker logs network-test 2>&1)
if echo "$LOGS" | grep -qi "ECONNREFUSED\|ENOTUNACH\|getaddrinfo"; then
  echo "✅ Network isolation works (cannot reach internet)"
else
  echo "❌ FAILED: Network may not be isolated"
  echo "Logs: $LOGS"
fi

docker rm -f network-test
```

---

## Phase 5: Doubt Validation Cycle 3 (20 min)

### 5.1 Run Doubt Agents
After tests complete, run `/doubt --once scripts/agent-league/` to verify:

1. **All 15 fixes are still in place**
2. **No new issues introduced**
3. **Test coverage is adequate**

**Expected Doubt Results**:
- Cycle 1 issues: ✅ Still resolved
- Cycle 2 issues: ✅ Still resolved
- New issues: ❌ None expected

### 5.2 Validate Test Results
```bash
# Run test suite
npm test 2>&1 | tee test-results.txt

# Check for failures
if grep -q "FAIL" test-results.txt; then
  echo "❌ Tests failed - review logs"
  exit 1
else
  echo "✅ All tests passed"
fi
```

---

## Phase 6: Production Readiness Checklist

### Security
- [ ] Readonly root filesystem enforced
- [ ] All capabilities dropped
- [ ] No new privileges enabled
- [ ] PIDs limited to 100
- [ ] Network isolation enabled
- [ ] Resource limits (memory, CPU) set
- [ ] Signal handlers registered

### Reliability
- [ ] Image validation before execution
- [ ] Cleanup lock prevents race conditions
- [ ] Container tracking for crash cleanup
- [ ] Retry logic with jitter
- [ ] Proper error messages

### Integration
- [ ] Atlas Coin API calls work
- [ ] Evidence parsing handles various formats
- [ ] Championship manager runs seasons
- [ ] Analytics calculate standings correctly

### Testing
- [ ] Security tests pass
- [ ] Integration tests pass
- [ ] Chaos tests pass
- [ ] Doubt validation passes
- [ ] No zombie containers after tests

---

## Todo List for Execution

```bash
# Create todos
todo init

# Add todos in order
todo add "Start Atlas Coin control plane on :3000"
todo add "Set environment variables (DOCKER_IMAGE, API_URL, AUTH_TOKEN)"
todo add "Run Phase 2: Security validation tests"
todo add "Run Phase 3: Integration tests"
todo add "Run Phase 4: Chaos engineering tests"
todo add "Run Phase 5: Doubt validation cycle 3"
todo add "Run Phase 6: Production readiness checklist"
todo add "Generate final report"
```

---

## Success Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Security tests pass | 100% | ___ |
| Integration tests pass | 100% | ___ |
| Chaos tests pass | 100% | ___ |
| Doubt cycle 3 issues | 0 critical | ___ |
| Zombie containers | 0 | ___ |
| Test execution time | <60 min | ___ |

---

## Commands to Execute Workflow

```bash
# Full workflow test (one command)
/workflow-test "Execute the agent-league workflow test plan at /home/anombyte/Atlas/scripts/agent-league/WORKFLOW_TEST_PLAN.md" --checkpoint

# Or step-by-step
cd /home/anombyte/Atlas
./scripts/agent-league/tests/run-all-tests.sh  # (if we create this)
```

---

## Next Steps After Tests

1. **If all tests pass**: ✅ Ready for production deployment
2. **If tests fail**: Fix issues, re-run affected tests, update checklist
3. **If doubt finds issues**: Address in Cycle 4, re-validate

---

**Document**: `/home/anombyte/Atlas/scripts/agent-league/WORKFLOW_TEST_PLAN.md`
**Status**: Ready for execution with /workflow-test
