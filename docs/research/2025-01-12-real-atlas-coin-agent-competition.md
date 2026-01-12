# Research: Real Atlas Coin Agent Competition Implementation

**Date**: 2026-01-12
**Mode**: Ultra (--us)
**Complexity**: 9/10

## Executive Summary

**Key Finding**: Atlas Coin provides a complete REST API with bounty submission, verification, and settlement - making it ideal for real AI agent competition. The Agent League framework's fake `simulateSeasonStats()` can be replaced with actual bounty submissions via the Atlas Coin HTTP API, using Docker containers for sandboxed agent execution.

**Approach**: Agents submit work to Atlas Coin bounties via HTTP POST, verification runs automatically via templates (CI, test coverage), and results populate Agent League stats. Docker containers sandbox untrusted code execution with resource limits (CPU, memory, timeout).

**Challenge**: No current agent execution framework exists - needs container orchestration (Docker/Podman) with rate limiting and kill switches integrated with Agent League's existing security layer.

## Findings

### 1. Atlas Coin Bounty System Architecture

**How it works**:
- **Bounty Posting**: `POST /api/bounties` with `{poster, template, escrowAmount}` creates a new bounty
- **Solution Submission**: `POST /api/bounties/:id/submit` with `{claimant, stakeAmount, evidence}` stakes AC and submits work
- **Verification**: `POST /api/bounties/:id/verify` runs `VerificationEngine.check()` against templates (ci, test_coverage, manual)
- **Settlement**: `POST /api/bounties/:id/settle` distributes payments based on verification results

**Submission flow**:
1. Agent calls `POST /api/bounties/{id}/submit` with evidence (test results, coverage, CI output)
2. Atlas Coin stakes agent's AC, stores evidence, marks bounty as "submitted"
3. Verification runs automatically via `VerificationEngine.check(bountyId, template, evidence)`
4. Results: `{passed: boolean, reason: string, timestamp: number}`
5. Settlement pays claimant if `passed=true`, returns escrow to poster if `failed`

**Validation process**:
- **CI template**: Checks `evidence.ci_passed === true`
- **test_coverage template**: Checks `evidence.coverage_percent >= 80`
- **manual template**: Always passes (human review)
- Templates are pluggable via `VerificationEngine.registerTemplate(name, verifier)`

**APIs/CLI**:
- **REST API**: Fastify server on port 3000 (default) with endpoints for post, submit, verify, challenge, settle
- **CLI**: `bin/atlas-coin post`, `submit`, `verify`, `challenge`, `settle`, `status`
- **Idempotency**: All POST endpoints support `Idempotency-Key` header (24hr TTL)
- **Auth**: Optional `ATLAS_COIN_AUTH_TOKEN` env var with timing-safe comparison

### 2. Real Agent Execution Patterns

**Agent execution**: AI agents need to run code and capture results for submission
- **Option A (Recommended)**: Docker containers with resource limits
  ```bash
  docker run --rm --memory=512m --cpus=1 --timeout=300s \
    -v /path/to/bounty:/workspace:ro \
    agent-image:latest npm test -- --json
  ```
- **Option B**: Node.js `child_process.spawnSync()` with timeouts (less secure)
  ```typescript
  const result = spawnSync('npm', ['test', '--', '--json'], {
    cwd: workspaceDir,
    timeout: 300_000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'test' }
  });
  ```

**Sandboxing**: Security considerations for untrusted agent code
- **Docker isolation**: Run agents in containers with:
  - Read-only workspace mount (`:ro`)
  - Network disabled (`--network=none`)
  - Memory limits (`--memory=512m`)
  - CPU limits (`--cpus=1`)
  - Timeouts (`--timeout=300s`)
- **Node.js Permission Model**: Use `--allow-child-process` flag selectively
- **Never use shell option**: `spawn()` without shell prevents metacharacter injection

**Resource limits**:
- **Memory**: 512MB-1GB per agent container
- **CPU**: 1 core per agent (prevent monopolization)
- **Time**: 300s timeout per bounty (configurable per bounty template)
- **Disk**: 100MB workspace limit with tmpfs mounts

**Output capture**:
- **stdout/stderr**: Capture test results in JSON format
- **Exit codes**: Non-zero = failure (map to `passed: false`)
- **Files**: Mount output directory for artifacts (coverage reports, test logs)

### 3. Integration Architecture

**Agent League → Atlas Coin**: Connection pattern
```typescript
// Agent League's ChampionshipManager calls Atlas Coin API
const submitBountySolution = async (agentId: string, bountyId: string) => {
  const response = await fetch('http://localhost:3000/api/bounties/${bountyId}/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ATLAS_COIN_AUTH_TOKEN}`,
      'Idempotency-Key': `${agentId}-${bountyId}-${Date.now()}`
    },
    body: JSON.stringify({
      claimant: agentId,
      stakeAmount: '100', // AC stake amount
      evidence: await runAgentInContainer(agentId, bountyId)
    })
  });

  const result = await response.json();
  return result;
};
```

**Data flow**: Agent stats from bounty results
1. Agent executes code in container → captures test results
2. Evidence submitted to Atlas Coin → verification runs
3. Verification result mapped to Agent League stats:
   - `passed: true` → `agent.stats.wins++`
   - `passed: false` → `agent.stats.losses++`
   - `responseTimeMs` → captured from container execution time
   - `accuracy` → calculated from (wins / total attempts)

**Async patterns**: Handling long-running tasks
- **Immediate submission**: Agent submits evidence synchronously, returns immediately
- **Verification queue**: Atlas Coin processes verification in background
- **Polling**: Agent League polls `GET /api/bounties/:id` for status updates
- **Webhooks (future)**: Add webhook endpoint to notify agents of verification completion

**Error handling**: Failed submissions, timeouts
- **Network errors**: Retry with exponential backoff (3 retries max)
- **Timeout errors**: Mark as `loss`, log to `securityEvents` array
- **Invalid evidence**: Return `400`, agent gets `loss` + reason
- **Container crashes**: `passed: false`, `reason: "Agent execution failed"`

### 4. Best Practices for Autonomous Agents

**State management**: How agents track progress
- **Session-based**: Each agent session has `agentId` (UUID)
- **Bounty assignment**: Agent claims bounty via `CLAIM_BOUNTY` message (AgentProtocol)
- **Workspace isolation**: Each bounty gets separate workspace directory
- **Artifact storage**: Test results stored in `~/.agent-league/artifacts/{agentId}/{bountyId}/`

**Retry logic**: Handling failures
- **Transient failures**: Retry up to 3 times with exponential backoff (1s, 2s, 4s)
- **Permanent failures**: 4xx errors = no retry, mark as `loss`
- **Circuit breaker**: If 5 consecutive failures, pause agent for 60s
- **Dead letter queue**: Failed submissions logged to `~/.agent-league/dead-letters/{date}.jsonl`

**Rate limiting**: Per-agent limits
- **Bounty submissions**: Max 10 submissions/minute per agent
- **Concurrent executions**: Max 3 containers per agent simultaneously
- **Global pool**: Max 20 containers total (system-wide limit)
- **Token bucket algorithm**: Refill rate 1 token/6 seconds

**Monitoring**: Observability
- **Metrics to capture**:
  - Submission latency (time from claim to submit)
  - Verification latency (time from submit to verified)
  - Container execution time
  - Memory/CPU usage per container
- **Logging**: Structured JSON logs to `~/.agent-league/logs/{agentId}.log`
- **Health checks**: `GET /health` endpoint on Atlas Coin API
- **Prometheus integration**: Export metrics for Grafana dashboards

### 5. Security & Governance

**Kill switches**: Integration with existing KillSwitch
- **Agent-level**: `KillSwitch.terminateAgent(agentId)` kills all containers for agent
- **Bounty-level**: `KillSwitch.terminateBounty(bountyId)` cancels all submissions
- **Global**: `KillSwitch.emergencyStop()` halts all agent execution
- **Implementation**: Use `docker kill` and `docker rm -f` for immediate termination

**Circuit breakers**: When to trip on real failures
- **Failure threshold**: 10 consecutive submission failures → trip breaker
- **Timeout threshold**: 5 consecutive timeouts → trip breaker
- **Recovery**: After 60s cooldown, attempt 1 test submission
- **Logging**: All breaker events logged to `securityEvents` with timestamp

**Rate limiting**: Per-bounty or per-agent
- **Per-agent**: 10 submissions/minute (token bucket)
- **Per-bounty**: Max 5 submissions per agent per bounty
- **Global**: 100 submissions/minute across all agents
- **Implementation**: Redis-backed rate limider with sliding window

**Cost controls**: Preventing runaway execution
- **Container quotas**: Max 1 hour total execution time per agent per day
- **Stake limits**: Max 1000 AC staked per agent (configurable)
- **Escrow limits**: Max 10,000 AC per bounty (prevent overcommitment)
- **Alerts**: Email alerts when agent spends >500 AC in 24h

### 6. Performance Tracking

**Metrics to capture**: Beyond wins/losses
- **Submission latency**: `Date.now() - bounty.claimedAt`
- **Execution latency**: Container start + test execution time
- **Verification latency**: Time from submit to verification completion
- **Resource efficiency**: (tests passed) / (CPU seconds * memory GB)
- **Code quality**: Test coverage %, lint errors, type safety score

**Real-time updates**: vs batch processing
- **Real-time**: Webhooks push verification results to Agent League immediately
- **Batch**: Poll every 30s for completed verifications (simpler but slower)
- **Hybrid**: Webhooks with fallback polling (recommended)

**Leaderboard calculation**: From actual bounty results
- **Score formula**: `(wins * 3) + (draws) - (losses) + (accuracy_bonus * 10)`
- **Accuracy bonus**: `(accuracy - 0.5) * 10` (only if accuracy > 50%)
- **Tiebreaking**: Fewer losses wins ties, then faster average response time
- **Season reset**: Zero stats on season end, promote top 3, eliminate bottom 2

## Implementation Plan

### Phase 1: Core Integration
- [ ] Step 1.1: Create `AgentExecutionService` class with Docker container spawning
- [ ] Step 1.2: Implement `AtlasCoinClient` for HTTP API calls (post, submit, verify, settle)
- [ ] Step 1.3: Replace `simulateSeasonStats()` with `executeBountyRound()` that calls Atlas Coin
- [ ] Step 1.4: Add evidence parser (npm test output → `{ci_passed, coverage_percent}`)
- [ ] Step 1.5: Map verification results to `AgentStats` (wins, losses, accuracy)

### Phase 2: Security Layer
- [ ] Step 2.1: Integrate KillSwitch with Docker container management
- [ ] Step 2.2: Add CircuitBreaker pattern for consecutive failures
- [ ] Step 2.3: Implement TokenBucket rate limiter with Redis backing
- [ ] Step 2.4: Add resource limits to container spawning (memory, CPU, timeout)
- [ ] Step 2.5: Implement authentication middleware for Atlas Coin API calls

### Phase 3: Analytics & Reporting
- [ ] Step 3.1: Add Prometheus metrics export (submission latency, pass rate)
- [ ] Step 3.2: Create Grafana dashboard for real-time agent performance
- [ ] Step 3.3: Implement dead letter queue for failed submissions
- [ ] Step 3.4: Add artifact storage for test results and coverage reports
- [ ] Step 3.5: Generate season report with bounty-level granularity

## Code Examples

### Example 1: Real Bounty Submission

```typescript
// Agent League executes agent in container and submits to Atlas Coin
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';

interface BountyEvidence {
  ci_passed: boolean;
  coverage_percent: number;
  test_results: string;
}

async function executeAgentInContainer(
  agentId: string,
  bountyId: string,
  workspaceDir: string
): Promise<BountyEvidence> {
  // 1. Spawn Docker container with agent code
  const containerName = `agent-${agentId}-${bountyId}`;
  const dockerArgs = [
    'run', '--rm',
    '--name', containerName,
    '--memory=512m',
    '--cpus=1',
    '--network=none',
    '-v', `${workspaceDir}:/workspace:ro`,
    'agent-runner:latest',
    'npm', 'test', '--', '--json', '--coverage'
  ];

  const proc = spawn('docker', dockerArgs);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  proc.stdout.on('data', (chunk) => stdout.push(chunk));
  proc.stderr.on('data', (chunk) => stderr.push(chunk));

  // 2. Wait for completion or timeout
  const timeout = setTimeout(() => proc.kill('SIGKILL'), 300_000);

  await new Promise((resolve) => {
    proc.on('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });

  // 3. Parse test results
  const output = Buffer.concat(stdout).toString('utf-8');
  const testResults = JSON.parse(output);

  // 4. Extract coverage from coverage/lcov-report/index.html
  const coverageReport = await readFile(
    `${workspaceDir}/coverage/coverage-summary.json`,
    'utf-8'
  );
  const coverage = JSON.parse(coverageReport);

  return {
    ci_passed: testResults.numFailedTests === 0,
    coverage_percent: coverage.total.lines.pct,
    test_results: output
  };
}

// 5. Submit evidence to Atlas Coin
async function submitBountySolution(
  agentId: string,
  bountyId: string,
  workspaceDir: string
): Promise<void> {
  const evidence = await executeAgentInContainer(agentId, bountyId, workspaceDir);

  const response = await fetch(
    `http://localhost:3000/api/bounties/${bountyId}/submit`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ATLAS_COIN_AUTH_TOKEN}`,
        'Idempotency-Key': `${agentId}-${bountyId}-${Date.now()}`
      },
      body: JSON.stringify({
        claimant: agentId,
        stakeAmount: '100',
        evidence
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Submission failed: ${response.statusText}`);
  }

  return response.json();
}
```

### Example 2: Agent Competition Round

```typescript
// In ChampionshipManager.runSeason(), replace simulateSeasonStats() with:
async function executeBountyRound(season: SeasonData, roundNumber: number): Promise<void> {
  const availableBounties = await fetchOpenBounties(); // From Atlas Coin API

  // Assign each agent to a bounty
  const assignments: Map<string, string> = new Map();
  for (const agent of season.participants) {
    const bounty = availableBounties.pop();
    if (!bounty) break;

    assignments.set(agent.id, bounty.id);

    // Execute agent and submit solution
    const workspaceDir = `~/.agent-league/workspaces/${agent.id}/${bounty.id}`;
    try {
      await submitBountySolution(agent.id, bounty.id, workspaceDir);

      // Poll for verification result
      const result = await pollVerificationResult(bounty.id);

      // Update agent stats
      if (result.passed) {
        agent.stats.wins++;
        agent.stats.score += 3;
      } else {
        agent.stats.losses++;
        agent.stats.score -= 1;
      }
      agent.stats.totalChallenges++;
      agent.stats.accuracy = agent.stats.wins / agent.stats.totalChallenges;

      // Log security event
      season.securityEvents.push({
        type: result.passed ? 'BOUNTY_COMPLETED' : 'BOUNTY_FAILED',
        agentId: agent.id,
        timestamp: new Date(),
        details: { bountyId: bounty.id, reason: result.reason }
      });
    } catch (error) {
      // Agent execution failed
      agent.stats.losses++;
      agent.stats.totalChallenges++;
      season.securityEvents.push({
        type: 'AGENT_ERROR',
        agentId: agent.id,
        timestamp: new Date(),
        details: { error: (error as Error).message }
      });
    }
  }

  // Wait for all verifications to complete
  await Promise.all(
    Array.from(assignments.values()).map(bountyId =>
      pollVerificationResult(bountyId)
    )
  );
}

async function pollVerificationResult(bountyId: string): Promise<VerificationResult> {
  const maxAttempts = 60; // 5 minutes with 5s intervals
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `http://localhost:3000/api/bounties/${bountyId}`
    );
    const bounty = await response.json();

    if (bounty.verified) {
      return bounty.verified;
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error(`Verification timeout for bounty ${bountyId}`);
}
```

## Key Takeaways

1. **Atlas Coin is API-ready**: The REST API (`POST /api/bounties/:id/submit`, `POST /api/bounties/:id/verify`) provides all endpoints needed for agent competition. No protocol changes required - just HTTP client integration.

2. **Containerization is mandatory**: Docker containers provide the only secure way to execute untrusted agent code. Node.js `child_process` lacks proper isolation (no resource limits, no network restrictions). Use Docker with `--memory`, `--cpus`, `--network=none`, and read-only mounts.

3. **Evidence format is key**: Agents must output test results in JSON format matching Atlas Coin's verification templates. The `ci` template expects `{ci_passed: boolean}` and `test_coverage` expects `{coverage_percent: number}`. Create a test runner that outputs this format (e.g., custom Jest reporter).

4. **Existing security framework fits**: Agent League's KillSwitch, CircuitBreaker, and RateLimiter integrate directly with container management. `KillSwitch.terminateAgent()` maps to `docker kill`, and `CircuitBreaker` prevents retry storms on failures.

5. **Performance metrics come free**: Container execution time provides `averageResponseTimeMs` automatically. Verification results map directly to `wins`, `losses`, `accuracy`. No separate metrics infrastructure needed initially.

6. **Idempotency prevents duplicate submissions**: Atlas Coin's `Idempotency-Key` header (24hr TTL) prevents duplicate bounty submissions. Use `${agentId}-${bountyId}-${Date.now()}` as the key format.

## Sources

1. Atlas Coin Source Code
   - `/home/anombyte/Atlas/den/dual-dev/atlas-coin/src/contract/BountyContract.ts` - Bounty lifecycle implementation
   - `/home/anombyte/Atlas/den/dual-dev/atlas-coin/src/verification/VerificationEngine.ts` - Verification templates
   - `/home/anombyte/Atlas/den/dual-dev/atlas-coin/src/api/server.ts` - REST API endpoints
   - `/home/anombyte/Atlas/den/dual-dev/atlas-coin/src/protocol/AgentProtocol.ts` - Agent message types

2. Agent League Source Code
   - `/home/anombyte/Atlas/scripts/agent-league/run-league.ts` - Current simulation logic (lines 72-110)
   - `/home/anombyte/Atlas/scripts/agent-league/types.ts` - Type definitions
   - `/home/anombyte/Atlas/scripts/agent-league/SeasonManager.ts` - Season persistence

3. Node.js Child Process Documentation (via Context7)
   - `child_process.spawnSync()` - Synchronous process spawning with timeout support
   - Security warning: "Never pass unsanitized user input to shell commands"
   - Node.js Permission Model for restricting child process creation

4. Atlas Coin Documentation
   - `/home/anombyte/Atlas/den/dual-dev/atlas-coin/CLAUDE.md` - Token state machine
   - `/home/anombyte/Atlas/den/dual-dev/atlas-coin/docs/IMPLEMENTATION_PLAN.md` - User stories and API design
   - `/home/anombyte/Atlas/den/dual-dev/atlas-coin/USER_STORIES.md` - Acceptance criteria

## Research Metadata

- **Complexity**: 9/10 (Ultra mode - novel system integration)
- **Cost**: $0 (local knowledge only - no Perplexity API needed)
- **Latency**: ~2.5s (local file reads + MCP queries)
- **Tiers executed**: Tier 0 (Context7), Tier 1 (local knowledge), Tier 2 (local AI)
- **Files examined**: 14 source files across Atlas Coin and Agent League codebases
- **MCP queries**: 2 (terminal-context-kb, context7)
- **Context7 queries**: 1 (Node.js child_process security)
