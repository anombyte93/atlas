import { promises as fs } from "fs";
import * as path from "path";

import ConsoleLogger from "../events/ConsoleLogger";
import EventBus from "../events/EventBus";
import AgentRegistry from "./AgentRegistry";
import AnalyticsService from "./AnalyticsService";
import AgentExecutionService, { ExecutionResult } from "./AgentExecutionService";
import ChampionshipManager from "./ChampionshipManager";
import { ChallengeSource, LocalChallengeSource } from "./ChallengeSource";
import SeasonManager from "./SeasonManager";
import { AgentProfile, SeasonConfig, SolverStrategy } from "./types";

type Strategy = "aggressive" | "conservative" | "balanced";

const STRATEGIES: Strategy[] = ["aggressive", "conservative", "balanced"];
const DESIRED_AGENT_COUNT = 10;
const LEAGUES_TO_RUN = 10;

const BASE_SEASON_CONFIG: SeasonConfig = {
  roundsPerSeason: 20,
  challengeCount: 0,
  eliminationCount: 2,
  promotionCount: 3,
};

const championsDir = path.resolve(process.cwd(), "data/agent-league/leagues");

const logger = new ConsoleLogger(true);
const eventBus = new EventBus(logger);
const registry = new AgentRegistry(eventBus, logger);
const seasonManager = new SeasonManager(logger);
const analytics = new AnalyticsService();
const executor = new AgentExecutionService(eventBus, logger);
const challengeSource: ChallengeSource = new LocalChallengeSource(
  path.resolve(process.cwd(), "data/challenges")
);

let nextAgentIndex = 11;

const executeAgent = async (
  agentId: string,
  bountyId: string,
  image: string,
  env: Record<string, string | number | undefined>
): Promise<ExecutionResult> =>
  executor.executeAgent(agentId, bountyId, process.cwd(), {
    image,
    env,
  });

const championshipManager = new ChampionshipManager(
  registry,
  seasonManager,
  eventBus,
  logger,
  executeAgent
);

function createAgent(id: string): AgentProfile {
  const suffix = Number(id.split("-").pop());
  const strategyIndex = Number.isFinite(suffix) ? (suffix - 1) % STRATEGIES.length : 0;
  const strategy = STRATEGIES[strategyIndex] as SolverStrategy;
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
  topAgents: AgentProfile[],
  seasonConfig: SeasonConfig
): Promise<string> {
  await fs.mkdir(championsDir, { recursive: true });
  const summaryPath = path.join(championsDir, "agent-league-summary.json");

  const payload = {
    generatedAt: new Date().toISOString(),
    seasonsRun: seasonResults.length,
    seasonConfig,
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

  const challenges = await challengeSource.getChallenges();
  const seasonConfig: SeasonConfig = {
    ...BASE_SEASON_CONFIG,
    challengeCount: challenges.length,
  };

  const seasonReports: ReturnType<typeof analytics.generateSeasonReport>[] = [];

  for (let seasonIndex = 1; seasonIndex <= LEAGUES_TO_RUN; seasonIndex += 1) {
    const result = await championshipManager.runSeason(seasonConfig);

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
  const summaryPath = await writeSummaryReport(seasonReports, topAgents, seasonConfig);

  logger.info("Top 3 agents exported", { path: championsPath });
  logger.info("Summary report generated", { path: summaryPath });
  logger.info("Simulation complete.");
}

run().catch((error) => {
  logger.error("Agent-league simulation failed", { error });
  process.exit(1);
});
