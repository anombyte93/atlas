# Agent League

A **reusable competitive AI agent simulation framework** for the Atlas ecosystem.

## What It Is

Agent League is a **general-purpose tournament engine** for running competitive simulations between AI agents. It provides:

- **Multi-season tournaments** with elimination and promotion
- **Performance tracking** and analytics
- **Fair-play enforcement** (rate limiting, circuit breakers)
- **Security controls** (kill switches, emergency shutdown)
- **Event-driven architecture** for extensibility

## What It's NOT

- **NOT tied to Atlas Coin** - This is a separate, reusable framework
- **NOT a bounty system** - It's for competition and evolution
- **NOT specific to any domain** - Works with any competitive scenario

## Use Cases

Use Agent League wherever you need competitive agent simulations:

| Use Case | Description |
|---------|-------------|
| **Agent Evolution** | Test and evolve agent strategies before deployment |
| **R&D Testing** | Sandbox for comparing agent implementations |
| **Tournaments** | Run leagues, ladders, or elimination brackets |
| **Performance Testing** | Benchmark agents under competitive conditions |

## Quick Start

```bash
# Run a 10-season simulation
npx tsx scripts/agent-league/run-league.ts

# Results saved to:
# - data/agent-league/leagues/season-N.json
# - data/agent-league/leagues/agent-league-summary.json
```

## Architecture

```
agent-league/
├── types.ts                 # Core type definitions
├── AgentRegistry.ts        # Agent profile management
├── SeasonManager.ts        # Season persistence
├── ChampionshipManager.ts  # Tournament orchestration
├── AnalyticsService.ts     # Rankings and reporting
└── run-league.ts           # Example runner

events/                     # Shared event system
├── types.ts
├── EventBus.ts
└── ConsoleLogger.ts

security/                   # Fair-play controls
├── KillSwitch.ts          # 4-level emergency stops
└── CircuitBreaker.ts      # Failure containment

governance/                 # Fair-play rules
└── RateLimiter.ts         # Per-agent rate limits
```

## Extending Agent League

### Custom Competition Logic

Create your own competition by implementing `executeRound`:

```typescript
// In your runner
class CustomChampionshipManager extends ChampionshipManager {
  async executeRound(season: SeasonData): Promise<void> {
    // Your competition logic here
    for (const agent of season.participants) {
      const result = await runYourCompetition(agent);
      agent.stats.wins += result.wins;
      agent.stats.losses += result.losses;
    }
  }
}
```

### Custom Agent Strategies

Define your own agent types:

```typescript
interface MyAgentStrategy {
  type: 'neural' | 'rule-based' | 'hybrid';
  config: MyConfig;
}

const myAgent: AgentProfile = {
  id: 'my-agent-1',
  strategy: 'neural',
  config: { model: 'gpt-4', temperature: 0.7 },
  stats: { wins: 0, losses: 0, draws: 0, score: 0, accuracy: 0 }
};
```

### Custom Events

Subscribe to championship events:

```typescript
eventBus.subscribe('SEASON_COMPLETED', {
  handle: async (event) => {
    console.log('Season completed!', event.data);
    // Trigger your custom logic
  }
});
```

## Configuration

```typescript
const SEASON_CONFIG: SeasonConfig = {
  roundsPerSeason: 20,      // Rounds per season
  challengeCount: 10,       // Challenges per round
  eliminationCount: 2,      # Agents eliminated per season
  promotionCount: 3,        # Agents recognized/advanced
};
```

## Output Format

```json
{
  "seasonNumber": 1,
  "startDate": "2026-01-12T08:29:24.729Z",
  "endDate": "2026-01-12T08:29:24.731Z",
  "participants": [...],
  "leaderboard": [
    {
      "agentId": "agent-25",
      "rank": 1,
      "score": 56,
      "wins": 19,
      "losses": 1
    }
  ],
  "analytics": {
    "totalRounds": 20,
    "totalChallenges": 200,
    "avgAccuracy": 0.723,
    "topPerformer": "agent-25"
  }
}
```

## Integration Examples

### With Atlas Coin

Find best agents before submitting to bounties:

```typescript
// 1. Run agent-league to identify top performers
const champions = await runAgentLeague();

// 2. Use those agents for real bounty work
for (const agent of champions) {
  await submitToBounty(agent.id, bountyId);
}
```

### With Trading Systems

Evolve trading strategies:

```typescript
// Agents compete on simulated trading performance
const tradingLeague = new AgentLeague({
  competition: 'trading-simulation',
  metric: 'roi',
  timeframe: '1d'
});
```

### With Game AI

Evolve game-playing agents:

```typescript
// Agents compete on win rates
const chessLeague = new AgentLeague({
  competition: 'chess',
  metric: 'win-rate',
  gamesPerSeason: 50
});
```

## License

Part of the Atlas ecosystem. See main Atlas LICENSE for details.
