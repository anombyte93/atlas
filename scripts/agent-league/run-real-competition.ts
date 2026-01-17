import { promises as fs } from "fs";
import * as path from "path";

import ConsoleLogger from "../events/ConsoleLogger";
import EventBus from "../events/EventBus";
import AgentRegistry from "./AgentRegistry";
import AnalyticsService from "./AnalyticsService";
import ChampionshipManager from "./ChampionshipManager";
import SeasonManager from "./SeasonManager";
import { AgentProfile, SeasonConfig, SolverStrategy, SeasonData, SecurityEvent } from "./types";
import AgentExecutionService, { ExecutionResult } from "./AgentExecutionService";
import { AtlasCoinClient, Bounty, BountyEvidence, BountySubmission, VerificationResult } from "./AtlasCoinClient";
import { EvidenceParser } from "./EvidenceParser";

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

const ATLAS_COIN_API_URL = process.env.ATLAS_COIN_API_URL ?? "http://localhost:3000";
const ATLAS_COIN_AUTH_TOKEN = process.env.ATLAS_COIN_AUTH_TOKEN;
const DOCKER_IMAGE = process.env.DOCKER_IMAGE;

const logger = new ConsoleLogger(true);
const eventBus = new EventBus(logger);
const registry = new AgentRegistry(eventBus, logger);
const seasonManager = new SeasonManager(logger);
const analytics = new AnalyticsService();
const executor = new AgentExecutionService(eventBus, logger);

if (!DOCKER_IMAGE) {
  throw new Error("DOCKER_IMAGE environment variable is required for real competition");
}

const atlasClient = new AtlasCoinClient({
  baseUrl: ATLAS_COIN_API_URL,
  token: ATLAS_COIN_AUTH_TOKEN,
});
const evidenceParser = new EvidenceParser();

let nextAgentIndex = 11;

const randomChoice = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

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

class RealChampionshipManager extends ChampionshipManager {
  constructor(
    private readonly execService: AgentExecutionService,
    private readonly client: AtlasCoinClient,
    private readonly parser: EvidenceParser,
    private readonly logger: ConsoleLogger,
    registry: AgentRegistry,
    seasonManager: SeasonManager,
    eventBus: EventBus
  ) {
    super(registry, seasonManager, eventBus, logger, (agentId, bountyId, image, env) =>
      execService.executeAgent(agentId, bountyId, process.cwd(), { image, env })
    );
  }

  async executeRound(season: SeasonData): Promise<void> {
    season.analytics.totalRounds += 1;

    const openBounties = await this.fetchOpenBounties();
    if (openBounties.length === 0) {
      this.logWarn("No open bounties available; skipping round");
      return;
    }

    const assignments = season.participants.map((agent, index) => ({
      agent,
      bounty: openBounties[index % openBounties.length],
    }));

    for (const { agent, bounty } of assignments) {
      const result = await this.executeBountyRound(agent, bounty, season);
      this.updateStats(agent, result);
      season.analytics.totalChallenges += 1;
    }
  }

  private async executeBountyRound(agent: AgentProfile, bounty: Bounty, season: SeasonData): Promise<boolean> {
    try {
      const execResult = await this.runAgent(agent, bounty);
      const parseResult = this.parser.parseFromOutput(execResult.stdout, execResult.stderr);
      const evidence = parseResult.evidence;

      const submission = this.buildSubmission(agent, evidence, bounty);
      await this.submitWithRetry(bounty.id, submission);
      await this.client.verifyBounty(bounty.id, evidence);

      const verification = await this.pollVerificationResult(bounty.id);

      if (verification.passed) {
        await this.client.settleBounty(bounty.id).catch((error) => {
          this.logWarn("Settlement failed; continuing", { bountyId: bounty.id, error: String(error) });
        });
      }

      return verification.passed;
    } catch (error) {
      this.logError("Bounty execution failed", { agentId: agent.id, bountyId: bounty.id, error });
      this.recordSecurityEvent(season, {
        type: "agent.execution.failed",
        agentId: agent.id,
        timestamp: new Date(),
        details: { bountyId: bounty.id, error: String(error) },
      });
      return false;
    }
  }

  private async runAgent(agent: AgentProfile, bounty: Bounty): Promise<ExecutionResult> {
    try {
      const execResult = await this.execService.executeAgent(agent.id, bounty.id, process.cwd(), {
        image: DOCKER_IMAGE,
        env: {
          ATLAS_COIN_API_URL,
          ATLAS_COIN_AUTH_TOKEN,
          BOUNTY_ID: bounty.id,
          AGENT_NAME: agent.id,
        },
      });

      if (!execResult.success) {
        this.logWarn("Agent execution did not succeed", {
          agentId: agent.id,
          bountyId: bounty.id,
          exitCode: execResult.exitCode,
        });
      }
      return execResult;
    } catch (error) {
      // propagate to caller for loss handling
      throw error;
    }
  }

  private buildSubmission(agent: AgentProfile, evidence: BountyEvidence, bounty: Bounty): BountySubmission {
    return {
      claimant: agent.id,
      stakeAmount: bounty.escrowAmount ?? 0,
      evidence,
    };
  }

  private async submitWithRetry(bountyId: string, submission: BountySubmission): Promise<void> {
    const maxAttempts = 5;
    const baseDelay = 500;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.client.submitBounty(bountyId, submission, {
          idempotencyKey: `${bountyId}-${submission.claimant}-${attempt}`,
        });
        return;
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        this.logWarn("Submission failed; retrying", { bountyId, attempt, delay, error: String(error) });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async pollVerificationResult(bountyId: string): Promise<VerificationResult> {
    const maxAttempts = 10;
    const delayMs = 2_000;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const bounty = await this.client.getBounty(bountyId);
        if ((bounty as any).verified === true || bounty.status === "verified") {
          return { passed: true, reason: "verified", timestamp: Date.now() };
        }
        if (bounty.status === "failed" || bounty.status === "rejected") {
          return { passed: false, reason: bounty.status, timestamp: Date.now() };
        }
      } catch (error) {
        this.logWarn("Verification poll failed", { bountyId, attempt, error: String(error) });
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return { passed: false, reason: "verification_timeout", timestamp: Date.now() };
  }

  private updateStats(agent: AgentProfile, passed: boolean): void {
    const wins = (agent.stats.wins ?? 0) + (passed ? 1 : 0);
    const losses = (agent.stats.losses ?? 0) + (passed ? 0 : 1);
    const total = wins + losses;
    const accuracy = total > 0 ? Number((wins / total).toFixed(3)) : 0;

    agent.stats = {
      ...agent.stats,
      wins,
      losses,
      totalChallenges: (agent.stats.totalChallenges ?? 0) + 1,
      accuracy,
      lastActiveAt: new Date(),
    };
  }

  private async fetchOpenBounties(): Promise<Bounty[]> {
    try {
      const url = `${ATLAS_COIN_API_URL.replace(/\/$/, "")}/api/bounties?status=open`;
      const response = await fetch(url, {
        headers: this.buildAuthHeaders(),
      });
      if (!response.ok) {
        this.logWarn("Failed to fetch open bounties", { status: response.status, statusText: response.statusText });
        return [];
      }
      const json = (await response.json()) as { bounties?: Bounty[] } | Bounty[];
      if (Array.isArray(json)) return json;
      if (Array.isArray(json.bounties)) return json.bounties;
      return [];
    } catch (error) {
      this.logError("Error fetching open bounties", { error: String(error) });
      return [];
    }
  }

  private buildAuthHeaders(): HeadersInit {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (ATLAS_COIN_AUTH_TOKEN) headers.Authorization = `Bearer ${ATLAS_COIN_AUTH_TOKEN}`;
    return headers;
  }

  private logWarn(message: string, meta?: Record<string, unknown>): void {
    this.logger?.warn?.(message, meta);
  }

  private logError(message: string, meta?: Record<string, unknown>): void {
    this.logger?.error?.(message, meta);
  }

  private recordSecurityEvent(season: SeasonData, event: SecurityEvent): void {
    season.securityEvents.push(event);
  }
}

async function run(): Promise<void> {
  logger.info("Starting real agent-league competition...");
  seedInitialAgents();

  const championshipManager = new RealChampionshipManager(
    executor,
    atlasClient,
    evidenceParser,
    logger,
    registry,
    seasonManager,
    eventBus
  );

  const seasonReports: ReturnType<typeof analytics.generateSeasonReport>[] = [];

  for (let seasonIndex = 1; seasonIndex <= LEAGUES_TO_RUN; seasonIndex += 1) {
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
  logger.info("Real competition complete.");
}

run().catch((error) => {
  logger.error("Agent-league competition failed", { error });
  process.exit(1);
});
