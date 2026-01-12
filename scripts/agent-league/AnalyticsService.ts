import { AgentProfile, LeaderboardEntry, SeasonData, SeasonReport } from "./types";

export class AnalyticsService {
  calculateStandings(season: SeasonData): LeaderboardEntry[] {
    const standings = season.participants.map((agent) => {
      const wins = agent.stats.wins ?? 0;
      const losses = agent.stats.losses ?? 0;
      const draws = agent.stats.draws ?? 0;
      const explicitScore = agent.stats.score ?? null;
      const computedScore = wins * 3 + draws - losses;
      const score = explicitScore ?? computedScore;

      return {
        agentId: agent.id,
        rank: 0,
        score,
        wins,
        losses,
      } as LeaderboardEntry;
    });

    standings.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return a.agentId.localeCompare(b.agentId);
    });

    return standings.map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  generateSeasonReport(season: SeasonData): SeasonReport {
    const standings = this.calculateStandings(season);
    return {
      season,
      standings,
      analytics: season.analytics,
      generatedAt: new Date(),
    };
  }

  exportTopAgents(season: SeasonData, count: number): AgentProfile[] {
    const standings = this.calculateStandings(season);
    const topIds = standings.slice(0, count).map((entry) => entry.agentId);
    return topIds
      .map((id) => season.participants.find((agent) => agent.id === id))
      .filter((agent): agent is AgentProfile => Boolean(agent));
  }
}

export default AnalyticsService;
