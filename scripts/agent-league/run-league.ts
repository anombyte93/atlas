import { promises as fs } from "fs";
import * as path from "path";

import ConsoleLogger from "../events/ConsoleLogger";
import EventBus from "../events/EventBus";
import AgentRegistry from "./AgentRegistry";
import AnalyticsService from "./AnalyticsService";
import ChampionshipManager from "./ChampionshipManager";
import SeasonManager from "./SeasonManager";
import {
  AgentProfile,
  AgentStats,
  SeasonConfig,
  SolverStrategy,
} from "./types";

type Strategy = "aggressive" | "conservative" | "balanced";

const STRATEGIES: Strategy[] = ["aggressive", "conservative", "balanced"];
const DESIRED_AGENT_COUNT = 10;
const LEAGUES_TO_RUN = 10;

const SEASON_CONFIG: SeasonConfig = {
  roundsPerSeason: 20,
  challengeCount: 10,
  eliminationCount: 2,
  promotionCount: 3,
};

const championsDir = path.resolve(process.cwd(), "data/agent-league/leagues");

const logger = new ConsoleLogger(true);
const eventBus = new EventBus(logger);
const registry = new AgentRegistry(eventBus, logger);
const seasonManager = new SeasonManager(logger);
const championshipManager = new ChampionshipManager(registry, seasonManager, eventBus, logger);
const analytics = new AnalyticsService();

let nextAgentIndex = 11;

const randomChoice = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function createAgent(id: string): AgentProfile {
  const strategy = randomChoice(STRATEGIES) as SolverStrategy;
  return {
    id,
    strategy,
    config: { name: id },
    stats: {
      wins: 0,
      losses: 0,
      draws: 0,
      score: 0,
      accuracy: 0,
      totalChallenges: 0,
    },
  };
}

function seedInitialAgents(): void {
  for (let i = 1; i <= DESIRED_AGENT_COUNT; i += 1) {
    registry.registerAgent(createAgent(`agent-${i}`));
  }
}

function simulateSeasonStats(strategy: Strategy, seasonNumber: number): AgentStats {
  const momentum = Math.floor(seasonNumber / 3); // small lift as seasons progress

  const strategyProfile = {
    aggressive: { wins: [8, 16], losses: [4, 10], draws: [0, 3], accuracy: [0.55, 0.8] },
    conservative: { wins: [6, 13], losses: [2, 8], draws: [1, 6], accuracy: [0.65, 0.92] },
    balanced: { wins: [7, 14], losses: [3, 9], draws: [0, 4], accuracy: [0.6, 0.86] },
  } as const;

  const profile = strategyProfile[strategy];
  const wins = clamp(randomInt(profile.wins[0], profile.wins[1]) + momentum, 0, 20);
  const losses = clamp(randomInt(profile.losses[0], profile.losses[1]), 0, 20 - wins);
  const draws = clamp(randomInt(profile.draws[0], profile.draws[1]), 0, 20 - wins - losses);
  const score = wins * 3 + draws - losses;
  const accuracy = Number(
    (
      profile.accuracy[0] +
      Math.random() * (profile.accuracy[1] - profile.accuracy[0]) +
      momentum * 0.01
    ).toFixed(3)
  );

  return {
    wins,
    losses,
    draws,
    score,
    accuracy,
    totalChallenges: 0,
    averageResponseTimeMs: randomInt(180, 1200),
  };
}

function seedSeasonPerformance(seasonNumber: number): void {
  registry.getAllAgents().forEach((agent) => {
    const stats = simulateSeasonStats(agent.strategy as Strategy, seasonNumber);
    registry.updateAgentStats(agent.id, stats);
  });
}

function syncSeasonStatsToRegistry(seasonAgents: AgentProfile[]): void {
  seasonAgents.forEach((agent) => {
    registry.updateAgentStats(agent.id, agent.stats);
  });
}

function replenishRoster(): void {
  while (registry.getAllAgents().length < DESIRED_AGENT_COUNT) {
    registry.registerAgent(createAgent(`agent-${nextAgentIndex}`));
    nextAgentIndex += 1;
  }
}

async function exportChampions(topAgents: AgentProfile[], seasonNumber: number): Promise<string> {
  await fs.mkdir(championsDir, { recursive: true });
  const filePath = path.join(championsDir, `top-3-season-${seasonNumber}.json`);
  await fs.writeFile(
    filePath,
    JSON.stringify(
      topAgents.map((agent) => ({
        id: agent.id,
        strategy: agent.strategy,
        stats: agent.stats,
      })),
      null,
      2
    ),
    "utf-8"
  );
  return filePath;
}

async function writeSummaryReport(
  seasonResults: ReturnType<typeof analytics.generateSeasonReport>[],
  topAgents: AgentProfile[]
): Promise<string> {
  await fs.mkdir(championsDir, { recursive: true });
  const summaryPath = path.join(championsDir, "agent-league-summary.json");

  const payload = {
    generatedAt: new Date().toISOString(),
    seasonsRun: seasonResults.length,
    seasonConfig: SEASON_CONFIG,
    seasons: seasonResults.map((report) => ({
      seasonNumber: report.season.seasonNumber,
      participants: report.season.participants.length,
      topPerformer: report.analytics.topPerformer,
      leaderboardTop5: report.standings.slice(0, 5),
    })),
    finalTopAgents: topAgents.map((agent, index) => ({
      rank: index + 1,
      id: agent.id,
      strategy: agent.strategy,
      stats: agent.stats,
    })),
  };

  await fs.writeFile(summaryPath, JSON.stringify(payload, null, 2), "utf-8");
  return summaryPath;
}

async function run(): Promise<void> {
  logger.info("Starting agent-league series simulation...");
  seedInitialAgents();

  const seasonReports: ReturnType<typeof analytics.generateSeasonReport>[] = [];

  for (let seasonIndex = 1; seasonIndex <= LEAGUES_TO_RUN; seasonIndex += 1) {
    seedSeasonPerformance(seasonIndex);

    const result = await championshipManager.runSeason(SEASON_CONFIG);

    syncSeasonStatsToRegistry(result.season.participants);

    const report = analytics.generateSeasonReport(result.season);
    seasonReports.push(report);

    logger.info(`Season ${result.season.seasonNumber} standings:`);
    report.standings.slice(0, 5).forEach((entry) => {
      logger.info(`  #${entry.rank} ${entry.agentId} (score: ${entry.score})`);
    });

    replenishRoster();
  }

  const finalReport = seasonReports[seasonReports.length - 1];
  const topAgents = analytics.exportTopAgents(finalReport.season, 3);

  logger.info("Final standings:");
  finalReport.standings.forEach((entry) => {
    logger.info(`  #${entry.rank} ${entry.agentId} (score: ${entry.score})`);
  });

  const championsPath = await exportChampions(topAgents, finalReport.season.seasonNumber);
  const summaryPath = await writeSummaryReport(seasonReports, topAgents);

  logger.info("Top 3 agents exported", { path: championsPath });
  logger.info("Summary report generated", { path: summaryPath });
  logger.info("Simulation complete.");
}

run().catch((error) => {
  logger.error("Agent-league simulation failed", { error });
  process.exit(1);
});
