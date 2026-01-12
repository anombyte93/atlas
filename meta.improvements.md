# Championship Simulation - Improvement Plan

**Generated**: 2026-01-12
**Based On**: Ultra Research (B+ confidence) + Validation Findings

## Executive Summary

Current simulation **runs successfully** but lacks **5 critical production features** from research:
1. ❌ Discriminated unions for type-safe events
2. ❌ Opossum circuit breakers for resilience
3. ❌ Event sourcing (Emmett) for replay
4. ❌ Worker threads for isolation
5. ❌ Test suite (unit/integration/simulation)

## Priority 1: Type-Safe Event Bus (30min)

**Current Gap**: EventBus uses generic `EventType` string, not discriminated unions
**Research Source**: Event-Driven Architecture in JavaScript - 2025 Deep Dive

### Implementation

```typescript
// NEW: scripts/events/types.ts

// Define discriminated union of all possible events
export type ChampionshipEvent =
  | { type: 'AGENT_REGISTERED'; agentId: string; strategy: SolverStrategy }
  | { type: 'ROUND_STARTED'; round: number; seed: number }
  | { type: 'ROUND_COMPLETED'; round: number; results: RoundResult }
  | { type: 'SEASON_ENDED'; seasonNumber: number; winner: string }
  | { type: 'AGENT_TERMINATED'; agentId: string; reason: string };

// Type-safe event handler interface
export interface IEventHandler<TEvent extends ChampionshipEvent> {
  handle(event: TEvent): Promise<void> | void;
}

// Update EventBus signature
export class TypedEventBus {
  subscribe<TEvent extends ChampionshipEvent['type']>(
    type: TEvent,
    handler: IEventHandler<Extract<ChampionshipEvent, { type: TEvent }>>
  ): void;
}
```

**Benefits**:
- ✅ Compile-time type checking prevents whole classes of errors
- ✅ IDE autocomplete for event data
- ✅ Impossible to send wrong data type to handler

---

## Priority 2: Opossum Circuit Breakers (45min)

**Current Gap**: No circuit breakers around agent execution
**Research Source**: 8 Key Features of Effective Circuit Breakers in Node.js

### Implementation

```typescript
// NEW: scripts/security/CircuitBreakerWrapper.ts

import CircuitBreaker from 'opossum';
import { SolverStrategy } from '../agent-league/types';

export function createAgentCircuitBreaker<T>(
  agentId: string,
  execute: () => Promise<T>
): CircuitBreaker<() => Promise<T>> {
  const options = {
    timeout: 5000,              // 5s timeout per operation
    errorThresholdPercentage: 50, // Trip at 50% error rate
    resetTimeout: 30000,          // Try recovery after 30s
    rollingCountTimeout: 10000,   // Rolling count window
    rollingCountBuckets: 10,      // Number of buckets
  };

  const breaker = new CircuitBreaker(execute, options);

  // Event listeners for state changes
  breaker.on('open', () => {
    console.log(`[CIRCUIT BREAKER] Agent ${agentId} circuit OPENED - blocking calls`);
  });

  breaker.on('halfOpen', () => {
    console.log(`[CIRCUIT BREAKER] Agent ${agentId} circuit HALF-OPEN - testing recovery`);
  });

  breaker.on('close', () => {
    console.log(`[CIRCUIT BREAKER] Agent ${agentId} circuit CLOSED - normal operation`);
  });

  return breaker;
}
```

### Integration in ChampionshipManager

```typescript
// Modify scripts/agent-league/ChampionshipManager.ts

import { createAgentCircuitBreaker } from '../security/CircuitBreakerWrapper';

async function runAgentWithProtection(agent: AgentProfile, task: AgentTask) {
  const breaker = createAgentCircuitBreaker(agent.id, () => executeTask(task));
  return breaker.fire();
}
```

**Benefits**:
- ✅ Prevents cascading failures from misbehaving agents
- ✅ Automatic recovery testing after 30s
- ✅ Three-state machine: CLOSED → OPEN → HALF_OPEN

---

## Priority 3: Test Suite (60min)

**Current Gap**: No tests exist (unit, integration, simulation)
**Research Source**: LEMSS: LLM-Based Platform for Multi-Agent Competitive Settings

### Test Structure

```
tests/
├── unit/
│   ├── EventBus.test.ts           # Test type-safe event dispatch
│   ├── KillSwitch.test.ts         # Test 4-level kill switches
│   ├── CircuitBreaker.test.ts     # Test Opossum state machine
│   └── RateLimiter.test.ts        # Test sliding window algorithm
├── integration/
│   ├── AgentRegistry.test.ts      # Test agent registration/lookup
│   ├── SeasonManager.test.ts      # Test season lifecycle
│   └── ChampionshipFlow.test.ts  # Test full season execution
├── simulation/
│   ├── SmallTournament.test.ts    # 5 agents, 3 rounds
│   └── FullChampionship.test.ts   # 10 seasons, known seed
└── chaos/
    └── CircuitBreakerFailure.test.ts # Test breaker with synthetic failures
```

### Example Test

```typescript
// tests/unit/KillSwitch.test.ts

import { describe, it, expect } from 'vitest';
import InMemoryKillSwitch from '../../scripts/security/KillSwitch';
import { EventBus } from '../../scripts/events/EventBus';
import { ConsoleLogger } from '../../scripts/events/ConsoleLogger';

describe('KillSwitch', () => {
  it('should disable tool', () => {
    const eventBus = new EventBus(new ConsoleLogger(false));
    const killSwitch = new InMemoryKillSwitch(eventBus);

    killSwitch.disableTool('tool-1');

    expect(killSwitch.isToolDisabled('tool-1')).toBe(true);
    expect(killSwitch.isToolDisabled('tool-2')).toBe(false);
  });

  it('should terminate agent', () => {
    const eventBus = new EventBus(new ConsoleLogger(false));
    const killSwitch = new InMemoryKillSwitch(eventBus);

    killSwitch.terminateAgent('agent-1');

    expect(killSwitch.isAgentTerminated('agent-1')).toBe(true);
  });

  it('should revoke prompt with TTL expiration', async () => {
    const eventBus = new EventBus(new ConsoleLogger(false));
    const killSwitch = new InMemoryKillSwitch(eventBus);

    // Revoke with 100ms TTL
    killSwitch.revokePrompt('agent-1', 100);

    expect(killSwitch.isPromptRevoked('agent-1')).toBe(true);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(killSwitch.isPromptRevoked('agent-1')).toBe(false);
  });
});
```

---

## Priority 4: Event Sourcing with Emmett (45min)

**Current Gap**: No event persistence, cannot replay rounds
**Research Source**: Practical Introduction to Event Sourcing with Emmett

### Implementation

```typescript
// NEW: scripts/events/EventStore.ts

import { promises as fs } from 'fs';
import * as path from 'path';

export interface StoredEvent {
  id: string;
  type: string;
  timestamp: number;
  data: unknown;
  causationId?: string;
}

export class EventStore {
  private events: StoredEvent[] = [];

  constructor(private readonly storeDir: string) {}

  async append(event: StoredEvent): Promise<void> {
    event.id = crypto.randomUUID();
    this.events.push(event);
    await this.persist();
  }

  async getEventsForRound(round: number): Promise<StoredEvent[]> {
    return this.events.filter(e => e.data['round'] === round);
  }

  async replay(fromRound?: number): Promise<void> {
    const events = fromRound
      ? this.events.filter(e => e.data['round'] >= fromRound)
      : this.events;

    for (const event of events) {
      // Re-publish to EventBus for replay
      await this.eventBus.publish(event);
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(this.storeDir, { recursive: true });
    const filepath = path.join(this.storeDir, 'events.jsonl');
    const line = JSON.stringify(this.events[this.events.length - 1]);
    await fs.appendFile(filepath, line + '\n');
  }
}
```

**Benefits**:
- ✅ Immutable event log for debugging
- ✅ Replay any round from history
- ✅ Audit trail for fair competition verification

---

## Priority 5: Worker Threads for Isolation (60min)

**Current Gap**: All code runs in main process
**Research Source**: Node.js Advanced Techniques in 2025

### Implementation

```typescript
// NEW: scripts/agent-league/AgentWorker.ts

interface WorkerMessage {
  type: 'EXECUTE_TASK';
  taskId: string;
  agentId: string;
  taskData: unknown;
}

interface WorkerResponse {
  type: 'TASK_RESULT' | 'TASK_ERROR';
  taskId: string;
  result?: unknown;
  error?: string;
}

export class AgentWorkerPool {
  private workers = new Map<string, Worker>();

  spawnWorker(agentId: string): Worker {
    const worker = new Worker('./agent-worker.js', {
      resourceLimits: {
        maxOldGenerationSizeMb: 128,  // Memory limit
        maxYoungGenerationSizeMb: 64,
      }
    });

    worker.on('message', (response: WorkerResponse) => {
      this.handleResponse(response);
    });

    worker.on('error', (error) => {
      this.killSwitch.terminateAgent(agentId);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${agentId} exited with code ${code}`);
        this.replenishWorker(agentId);
      }
    });

    this.workers.set(agentId, worker);
    return worker;
  }

  async executeInWorker(agentId: string, task: AgentTask): Promise<unknown> {
    const worker = this.workers.get(agentId);
    if (!worker) {
      throw new Error(`No worker for agent ${agentId}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker timeout')), 5000);

      worker.once('message', (response: WorkerResponse) => {
        clearTimeout(timeout);
        if (response.type === 'TASK_RESULT') {
          resolve(response.result);
        } else {
          reject(new Error(response.error));
        }
      });

      worker.postMessage({ type: 'EXECUTE_TASK', taskId: crypto.randomUUID(), agentId, taskData: task });
    });
  }
}
```

**Benefits**:
- ✅ Agent crashes don't crash championship
- ✅ Memory isolation per agent
- ✅ CPU limits prevent resource exhaustion

---

## Execution Timeline

| Priority | Task | Time | Dependencies |
|----------|------|------|---------------|
| 1 | Type-safe event bus | 30min | None |
| 2 | Opossum circuit breakers | 45min | None |
| 3 | Test suite setup | 60min | 1, 2 |
| 4 | Event sourcing | 45min | None |
| 5 | Worker threads | 60min | None |
| **Total** | | **~4 hours** | |

---

## Validation Checklist

After improvements, verify:

- [ ] EventBus uses discriminated unions (compile-time type safety)
- [ ] Circuit breakers wrap agent execution
- [ ] All components have unit tests (>80% coverage)
- [ ] Integration tests validate multi-agent scenarios
- [ ] Simulation tests use known seeds for reproducibility
- [ ] Event store persists all state changes
- [ ] Worker threads isolate agent execution
- [ ] Chaos tests validate circuit breaker behavior

---

## Next Steps

1. **Review this improvement plan** with user
2. **Get approval** for implementation
3. **Execute improvements** in priority order
4. **Re-run sentinel-meta-validation** to verify fixes
5. **Generate final report** with before/after comparison
