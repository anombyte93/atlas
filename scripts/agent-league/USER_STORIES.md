# User Stories: Agent League Framework

**Date**: 2026-01-12
**Project**: Agent League - Reusable Competitive AI Agent Simulation Framework
**Version**: 1.0

---

## Executive Summary

The Agent League is a **general-purpose tournament engine** for running competitive simulations between AI agents. It provides:

- **Multi-season tournaments** with elimination and promotion mechanics
- **Performance tracking** via analytics and leaderboards
- **Security controls** including kill switches, circuit breakers, and rate limiting
- **Event-driven architecture** for extensibility and observability

---

## Epics & User Stories

---

## Epic 1: Tournament Management

### US-1: Create and Run Multi-Season Championships

> As a **League Operator**, I want to **run a championship series with multiple seasons**, so that I can identify the best-performing agents over time through fair competition.

**Acceptance Criteria:**
- [ ] System creates a new season with configurable parameters (rounds, challenges, elimination count)
- [ ] Each season runs the specified number of rounds with all registered agents
- [ ] Season results are persisted to `data/agent-league/leagues/season-N.json`
- [ ] Leaderboard is generated and sorted by score (wins × 3 + draws - losses)
- [ ] Top agents are promoted/reproduced, bottom agents are eliminated between seasons
- [ ] System can run multiple consecutive seasons without manual intervention
- [ ] Season-to-season continuity is maintained (eliminated agents removed, new agents added)

**Implementation Evidence:**
- `ChampionshipManager.ts` - `runSeason()`, `executeRound()`, `advanceSeason()`
- `SeasonManager.ts` - `loadSeason()`, `saveSeason()`, `initializeSeason()`
- `run-league.ts` - Main execution loop

---

### US-2: Register and Manage Agent Profiles

> As an **Agent Developer**, I want to **register my agents with the league**, so that they can compete in tournaments and have their performance tracked.

**Acceptance Criteria:**
- [ ] Agents can be registered with unique ID, strategy type, and configuration
- [ ] Agent profiles are persisted across seasons
- [ ] Agent stats accumulate over multiple seasons (wins, losses, draws, score, accuracy)
- [ ] System tracks metadata (total challenges, avg response time, last active timestamp)
- [ ] Duplicate agent IDs are rejected
- [ ] Agent profiles support custom configuration objects

**Implementation Evidence:**
- `AgentRegistry.ts` - `registerAgent()`, `getAgent()`, `getAllAgents()`
- `types.ts` - `AgentProfile`, `AgentConfig`, `AgentStats`

---

### US-3: Configure Season Parameters

> As a **League Operator**, I want to **configure season parameters**, so that I can customize the competition format for different scenarios.

**Acceptance Criteria:**
- [ ] System accepts `SeasonConfig` with:
  - `roundsPerSeason` - Number of competition rounds
  - `challengeCount` - Challenges per round
  - `eliminationCount` - Agents eliminated per season
  - `promotionCount` - Agents promoted/advanced per season
- [ ] Configuration is validated before season start
- [ ] Invalid configurations are rejected with clear error messages
- [ ] Default configuration is available for quick starts

**Implementation Evidence:**
- `types.ts` - `SeasonConfig` interface
- `run-league.ts` - `SEASON_CONFIG` constant

---

## Epic 2: Analytics & Reporting

### US-4: View Season Leaderboards

> As a **League Operator**, I want to **view ranked leaderboards after each season**, so that I can identify top performers and track agent progress.

**Acceptance Criteria:**
- [ ] Leaderboard displays agent rank, ID, score, wins, and losses
- [ ] Leaderboard is sorted by score (descending)
- [ ] Ties are handled by wins (descending), then fewest losses
- [ ] Leaderboard is included in season data output
- [ ] Leaderboard can be exported to JSON
- [ ] Summary across all seasons is available

**Implementation Evidence:**
- `AnalyticsService.ts` - `generateLeaderboard()`, `getSeasonSummary()`
- `types.ts` - `LeaderboardEntry`, `SeasonAnalytics`

---

### US-5: Track Agent Performance Over Time

> As an **Agent Developer**, I want to **track my agent's performance metrics across seasons**, so that I can analyze strategy effectiveness and improve my agents.

**Acceptance Criteria:**
- [ ] Agent stats include: wins, losses, draws, score, accuracy, response time
- [ ] Stats accumulate across all seasons participated
- [ ] Performance trends can be compared between seasons
- [ ] Analytics include aggregate stats (total rounds, total challenges, avg accuracy)
- [ ] Top performer is identified per season

**Implementation Evidence:**
- `types.ts` - `AgentStats` interface
- `AnalyticsService.ts` - `compareSeasons()`, `getTopPerformer()`

---

### US-6: Generate Season Summaries

> As a **League Operator**, I want to **generate comprehensive season summaries**, so that I can review outcomes and understand competition dynamics.

**Acceptance Criteria:**
- [ ] Season summary includes: season number, start/end dates, participants
- [ ] Summary includes complete leaderboard and analytics
- [ ] Summary includes security events (if any occurred)
- [ ] Summary is persisted to `data/agent-league/leagues/agent-league-summary.json`
- [ ] Summary can be regenerated from season data files

**Implementation Evidence:**
- `AnalyticsService.ts` - `generateSeasonSummary()`
- `SeasonManager.ts` - `saveSeason()`

---

## Epic 3: Security Controls

### US-7: Emergency Kill Switches

> As a **League Operator**, I want to **activate emergency kill switches at 4 levels**, so that I can immediately stop agents or tools during security incidents.

**Acceptance Criteria:**
- [ ] **Level 1**: Disable specific tools by ID
- [ ] **Level 2**: Revoke prompts for specific agents (with TTL)
- [ ] **Level 3**: Terminate specific agents entirely
- [ ] **Level 4**: Emergency shutdown (blocks ALL tools)
- [ ] Kill switch state can be queried (`isToolDisabled`, `isPromptRevoked`, `isAgentTerminated`)
- [ ] Kill switch activations publish events for observability
- [ ] Prompt revocations support TTL (time-to-live) for temporary blocks

**Implementation Evidence:**
- `security/KillSwitch.ts` - `InMemoryKillSwitch` class with 4 shutdown levels
- `events/types.ts` - `TOOL_DISABLED`, `PROMPT_REVOKED`, `AGENT_TERMINATED`, `EMERGENCY_SHUTDOWN` events

---

### US-8: Circuit Breaker Pattern

> As a **League Operator**, I want to **circuit-break failing agents**, so that cascading failures don't disrupt the entire competition.

**Acceptance Criteria:**
- [ ] Circuit breaker has 3 states: CLOSED (normal), OPEN (fail-fast), HALF_OPEN (testing recovery)
- [ ] Circuit trips after 5 consecutive failures per agent
- [ ] Circuit opens and blocks agent for 60 seconds (RESET_TIMEOUT)
- [ ] Circuit transitions to HALF_OPEN after timeout, allows 3 test calls
- [ ] Circuit returns to CLOSED after successful recovery
- [ ] State transitions publish events for monitoring
- [ ] Circuit state can be queried per agent

**Implementation Evidence:**
- `security/CircuitBreaker.ts` - `StateCircuitBreaker` with state machine
- `types.ts` - `CircuitState` enum (CLOSED, OPEN, HALF_OPEN)

---

### US-9: Per-Agent Rate Limiting

> As a **League Operator**, I want to **enforce rate limits per agent**, so that no single agent can monopolize resources or overwhelm the system.

**Acceptance Criteria:**
- [ ] Sliding window rate limiting (1-minute window)
- [ ] Maximum 100 actions per minute per agent per action type
- [ ] Rate limit check returns boolean (allowed/blocked)
- [ ] Remaining quota can be queried
- [ ] Old timestamps are pruned automatically to prevent memory leaks
- [ ] Rate limiting is enforced before agent actions execute

**Implementation Evidence:**
- `governance/RateLimiter.ts` - `SlidingWindowRateLimiter` class
- Sliding window algorithm with 60-second window, 100 max requests

---

## Epic 4: Event System

### US-10: Subscribe to Championship Events

> As a **System Integrator**, I want to **subscribe to championship events**, so that I can build custom monitoring, alerting, or logging integrations.

**Acceptance Criteria:**
- [ ] EventBus implements publish-subscribe pattern
- [ ] Multiple handlers can subscribe to same event type
- [ ] Handlers receive event with type, timestamp, and data payload
- [ ] Event handlers can be unsubscribed
- [ ] Failed handlers don't block other handlers (Promise.allSettled)
- [ ] Handler failures are logged with context

**Implementation Evidence:**
- `events/EventBus.ts` - `EventBus` class with subscribe/unsubscribe/publish
- `events/types.ts` - `IEvent`, `IEventHandler`, `IEventBus` interfaces

---

### US-11: Observe System Events in Real-Time

> As a **League Operator**, I want to **see all system events logged to console**, so that I can monitor competition progress and detect issues.

**Acceptance Criteria:**
- [ ] Console logger writes event type, timestamp, and data
- [ ] Log levels include: info, warn, error, debug
- [ ] Logger formats output for readability
- [ ] Logger supports optional metadata for context

**Implementation Evidence:**
- `events/ConsoleLogger.ts` - `ConsoleLogger` class with ILogging interface
- `events/types.ts` - `ILogger` interface

---

## Epic 5: Extensibility

### US-12: Implement Custom Competition Logic

> As a **Developer**, I want to **override the round execution logic**, so that I can implement my own competition rules (e.g., trading, gaming, CTF).

**Acceptance Criteria:**
- [ ] `ChampionshipManager` can be extended/subclassed
- [ ] `executeRound()` method is virtual/overridable
- [ ] Custom competitions can define their own scoring rules
- [ ] Custom competitions can integrate existing security/governance layers
- [ ] Example runner demonstrates extension pattern

**Implementation Evidence:**
- `ChampionshipManager.ts` - `executeRound()` can be overridden in subclasses
- `run-league.ts` - Shows how to implement custom competition logic

---

### US-13: Define Custom Agent Strategies

> As an **Agent Developer**, I want to **define custom agent strategies and configurations**, so that I can test different AI approaches.

**Acceptance Criteria:**
- [ ] Agent profiles support custom `strategy` field (string enum)
- [ ] Agent profiles support custom `config` object (any JSON-serializable data)
- [ ] Strategies can be: aggressive, conservative, balanced, or custom
- [ ] Agent behavior can be configured via `config` object
- [ ] Custom configurations are persisted with agent profiles

**Implementation Evidence:**
- `types.ts` - `AgentProfile` with `strategy` and `config` fields
- `run-league.ts` - Shows example strategies (aggressive, conservative, balanced)

---

### US-14: Integrate with Existing Systems

> As a **System Integrator**, I want to **use Agent League as a library**, so that I can embed tournament functionality into my own applications.

**Acceptance Criteria:**
- [ ] All classes export clean interfaces
- [ ] Dependencies are injected via constructors (DI pattern)
- [ ] Event-driven design allows loose coupling
- [ ] No global state or singleton dependencies
- [ ] Framework can be imported and used programmatically
- [ ] Example demonstrates programmatic usage

**Implementation Evidence:**
- All classes use interface-based design (`IEventBus`, `ILogger`, etc.)
- Constructor injection throughout (`eventBus`, `logger` passed in)
- `run-league.ts` shows programmatic usage pattern

---

## Epic 6: Data Persistence

### US-15: Persist Season Data Between Runs

> As a **League Operator**, I want to **save season data to disk**, so that competitions can resume after system restarts.

**Acceptance Criteria:**
- [ ] Season data is saved to `data/agent-league/leagues/season-N.json`
- [ ] Data includes: season number, dates, participants, leaderboard, analytics, security events
- [ ] Data is saved atomically (write complete file, not partial)
- [ ] Previous season files are not overwritten
- [ ] Data can be loaded to resume competition

**Implementation Evidence:**
- `SeasonManager.ts` - `saveSeason()`, `loadSeason()` methods
- `types.ts` - `SeasonData` interface

---

### US-16: Resume Competitions From Checkpoints

> As a **League Operator**, I want to **resume competitions from the last season**, so that long-running tournaments can continue after interruptions.

**Acceptance Criteria:**
- [ ] System detects highest existing season number in data directory
- [ ] Next season starts at `lastSeasonNumber + 1`
- [ ] Existing agent stats are loaded and continued
- [ ] No data loss when resuming
- [ ] System can run indefinitely across multiple invocations

**Implementation Evidence:**
- `run-league.ts` - Detects existing seasons: `const startSeason = lastSeason + 1`
- `SeasonManager.ts` - `loadSeason()` loads previous data

---

## Epic 7: Competition Mechanics

### US-17: Eliminate Low-Performing Agents

> As a **League Operator**, I want to **eliminate bottom-performing agents each season**, so that competition quality improves over time.

**Acceptance Criteria:**
- [ ] Bottom N agents are removed (configurable via `eliminationCount`)
- [ ] Elimination is based on final leaderboard position
- [ ] Eliminated agents are removed from participant list
- [ ] Eliminated agents' stats are preserved in season history
- [ ] Elimination events are logged

**Implementation Evidence:**
- `ChampionshipManager.ts` - `advanceSeason()` removes bottom performers
- `run-league.ts` - `eliminationCount: 2` in SEASON_CONFIG

---

### US-18: Promote Top-Performing Agents

> As a **League Operator**, I want to **promote/reproduce top agents each season**, so that successful strategies are amplified.

**Acceptance Criteria:**
- [ ] Top N agents are promoted/recognized (configurable via `promotionCount`)
- [ ] Promoted agents can be "reproduced" with mutations
- [ ] Promoted agents are marked in next season
- [ ] Promotion maintains competitive balance
- [ ] Promotion events are logged

**Implementation Evidence:**
- `ChampionshipManager.ts` - `advanceSeason()` handles promotion
- `run-league.ts` - `promotionCount: 3` in SEASON_CONFIG

---

## Epic 8: Observability & Debugging

### US-19: Track Security Events

> As a **Security Auditor**, I want to **view all security events**, so that I can audit agent behavior and system responses.

**Acceptance Criteria:**
- [ ] Security events are recorded in season data
- [ ] Events include: kill switch activations, circuit breaker trips, rate limit violations
- [ ] Events are timestamped and include relevant data
- [ ] Security event log is included in season summary
- [ ] Empty security event array when no issues occur

**Implementation Evidence:**
- `types.ts` - `securityEvents: SecurityEvent[]` in `SeasonData`
- All security components publish events via EventBus

---

### US-20: Monitor Agent Activity

> As a **League Operator**, I want to **track when agents were last active**, so that I can identify inactive or stuck agents.

**Acceptance Criteria:**
- [ ] Agent stats include `lastActiveAt` timestamp
- [ ] Timestamp is updated on each agent action
- [ ] Timestamp is persisted in season data
- [ ] Inactive agents can be filtered/identified via queries

**Implementation Evidence:**
- `types.ts` - `AgentStats` includes `lastActiveAt: Date`

---

## Karen Validation Checklist

### Framework Completeness

- [x] **US-1**: ChampionshipManager runs multi-season tournaments with configurable parameters
- [x] **US-2**: AgentRegistry registers and persists agent profiles
- [x] **US-3**: SeasonConfig interface supports all required parameters
- [x] **US-4**: AnalyticsService generates ranked leaderboards
- [x] **US-5**: AgentStats accumulate across seasons with full metrics
- [x] **US-6**: Season summaries saved to `data/agent-league/leagues/agent-league-summary.json`
- [x] **US-7**: KillSwitch implements 4-level emergency stops (tool/prompt/agent/global)
- [x] **US-8**: CircuitBreaker implements 3-state pattern (CLOSED/OPEN/HALF_OPEN)
- [x] **US-9**: RateLimiter implements sliding window (60s window, 100 max requests)
- [x] **US-10**: EventBus implements pub-sub with multiple subscribers per event type
- [x] **US-11**: ConsoleLogger implements ILogging with info/warn/error/debug levels
- [x] **US-12**: ChampionshipManager.executeRound() is overridable for custom competitions
- [x] **US-13**: AgentProfile supports custom strategy and config fields
- [x] **US-14**: All classes use interface-based design with constructor injection
- [x] **US-15**: SeasonManager.saveSeason() persists to `data/agent-league/leagues/season-N.json`
- [x] **US-16**: run-league.ts resumes from `lastSeason + 1`
- [x] **US-17**: ChampionshipManager.advanceSeason() eliminates bottom N agents
- [x] **US-18**: ChampionshipManager.advanceSeason() promotes top N agents
- [x] **US-19**: securityEvents array in SeasonData records all security incidents
- [x] **US-20**: AgentStats.lastActiveAt tracks last activity timestamp

### Architecture Validation

- [x] **SOLID Principles**: Interface-based design, dependency injection, single responsibility
- [x] **Event-Driven**: EventBus decouples components, enables extensibility
- [x] **Clean Architecture**: No outward dependencies, domain independent of infrastructure
- [x] **State Machine**: CircuitBreaker implements proper state transitions
- [x] **Factory Pattern**: Components are injectable, swappable implementations
- [x] **Separation of Concerns**: Security, governance, analytics, persistence in separate layers

---

## Usage Examples

### Example 1: Run a 10-Season Tournament

```bash
npx tsx scripts/agent-league/run-league.ts
```

**Output**: Seasons 1-10 results in `data/agent-league/leagues/`

---

### Example 2: Custom Competition Logic

```typescript
class CustomChampionshipManager extends ChampionshipManager {
  async executeRound(season: SeasonData): Promise<void> {
    // Your custom competition logic here
    for (const agent of season.participants) {
      const result = await runYourCompetition(agent);
      agent.stats.wins += result.wins;
      agent.stats.losses += result.losses;
    }
  }
}
```

---

### Example 3: Subscribe to Events

```typescript
eventBus.subscribe('SEASON_COMPLETED', {
  handle: async (event) => {
    console.log('Season completed!', event.data);
    // Trigger custom logic
  }
});
```

---

## What This Framework Does NOT Do

This is a **tournament framework**, not a complete competition system. It provides:

✅ **Infrastructure**: Persistence, events, security, analytics
✅ **Mechanics**: Seasons, eliminations, promotions, leaderboards
✅ **Controls**: Kill switches, circuit breakers, rate limiting

❌ **Actual Competition Logic**: You must implement `executeRound()` with your specific competition (e.g., agents solving bounties, trading strategies, game AI)
❌ **Agent Implementation**: You must provide the agents that compete
❌ **Domain-Specific Rules**: You define what "winning" means for your use case

---

## License

Part of the Atlas ecosystem. See main Atlas LICENSE for details.
