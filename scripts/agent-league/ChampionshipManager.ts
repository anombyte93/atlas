import { IEventBus, ILogger } from "../events/types";
import AgentRegistry from "./AgentRegistry";
import AnalyticsService from "./AnalyticsService";
import { AgentProfile, SeasonConfig, SeasonData, SeasonResult } from "./types";
import SeasonManager from "./SeasonManager";

const EVENTS = {
  SEASON_STARTED: "championship.season.started",
  ROUND_EXECUTED: "championship.round.executed",
  SEASON_COMPLETED: "championship.season.completed",
} as const;

export class ChampionshipManager {
  private readonly analytics = new AnalyticsService();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly seasonManager: SeasonManager,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger
  ) {}

  async runSeason(config: SeasonConfig): Promise<SeasonResult> {
    const season = this.seasonManager.createSeason(config);
    season.participants = this.registry.getAllAgents().map((participant) => ({
      ...participant,
      stats: { ...participant.stats },
    }));

    await this.publish(EVENTS.SEASON_STARTED, { seasonNumber: season.seasonNumber, config });

    for (let round = 1; round <= config.roundsPerSeason; round += 1) {
      await this.executeRound(season);
      this.updateLeaderboard(season);
      await this.publish(EVENTS.ROUND_EXECUTED, { seasonNumber: season.seasonNumber, round });
    }

    this.seasonManager.endSeason(season);
    this.updateLeaderboard(season);

    const promoted = this.promoteTopAgents(season, config.promotionCount);
    const eliminated = this.getBottomAgents(season, config.eliminationCount);
    this.eliminateBottomAgents(season, config.eliminationCount);

    await this.seasonManager.saveSeason(season);
    await this.publish(EVENTS.SEASON_COMPLETED, {
      seasonNumber: season.seasonNumber,
      promoted: promoted.map((p) => p.id),
      eliminated: eliminated.map((e) => e.id),
    });

    this.logger.info(`Season ${season.seasonNumber} completed`);
    return { season, promoted, eliminated };
  }

  async executeRound(season: SeasonData): Promise<void> {
    // Placeholder round execution logic; integrate challenge engine externally.
    season.analytics.totalRounds += 1;
    season.analytics.totalChallenges += season.participants.length;
    season.participants = season.participants.map((agent) => {
      const totalChallenges = (agent.stats.totalChallenges ?? 0) + 1;
      return {
        ...agent,
        stats: {
          ...agent.stats,
          totalChallenges,
          lastActiveAt: new Date(),
        },
      };
    });
  }

  updateLeaderboard(season: SeasonData): void {
    season.leaderboard = this.analytics.calculateStandings(season);

    const accuracySum = season.participants.reduce((sum, agent) => {
      const accuracy = agent.stats.accuracy ?? 0;
      return sum + accuracy;
    }, 0);

    const avgAccuracy =
      season.participants.length > 0 ? accuracySum / season.participants.length : 0;

    season.analytics.avgAccuracy = avgAccuracy;
    season.analytics.topPerformer = season.leaderboard[0]?.agentId;
  }

  promoteTopAgents(season: SeasonData, count: number): AgentProfile[] {
    if (count <= 0) return [];
    const topEntries = season.leaderboard.slice(0, count);
    return topEntries
      .map((entry) => season.participants.find((p) => p.id === entry.agentId))
      .filter((p): p is AgentProfile => Boolean(p));
  }

  eliminateBottomAgents(season: SeasonData, count: number): void {
    if (count <= 0) return;
    const bottom = season.leaderboard.slice(-count);
    const ids = new Set(bottom.map((entry) => entry.agentId));

    season.participants = season.participants.filter((agent) => !ids.has(agent.id));
    bottom.forEach((entry) => this.registry.eliminateAgent(entry.agentId));
    this.updateLeaderboard(season);
  }

  private getBottomAgents(season: SeasonData, count: number): AgentProfile[] {
    if (count <= 0) return [];
    const bottomEntries = season.leaderboard.slice(-count);
    return bottomEntries
      .map((entry) => season.participants.find((p) => p.id === entry.agentId))
      .filter((p): p is AgentProfile => Boolean(p));
  }

  private async publish(type: string, data: Record<string, unknown>): Promise<void> {
    await this.eventBus.publish({
      type,
      timestamp: new Date(),
      data,
    });
  }
}

export default ChampionshipManager;
