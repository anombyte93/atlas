import { IEventBus, ILogger } from "../events/types";
import AgentRegistry from "./AgentRegistry";
import AnalyticsService from "./AnalyticsService";
import type { ExecutionResult } from "./AgentExecutionService";
import { AgentProfile, SeasonConfig, SeasonData, SeasonResult } from "./types";
import SeasonManager from "./SeasonManager";
import WorkerQueue, { type ExecutionJob, JobType } from "./WorkerQueue";

const EVENTS = {
  SEASON_STARTED: "championship.season.started",
  ROUND_EXECUTED: "championship.round.executed",
  SEASON_COMPLETED: "championship.season.completed",
} as const;

type ExecuteAgentFn = (
  agentId: string,
  bountyId: string,
  image: string,
  env: Record<string, string | number | undefined>
) => Promise<ExecutionResult>;

export class ChampionshipManager {
  private readonly analytics = new AnalyticsService();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly seasonManager: SeasonManager,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
    private readonly executeAgent: ExecuteAgentFn
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

  /**
   * Execute a single round with all agents running in parallel
   *
   * **Design Pattern: Fan-Out / Fan-In (Parallel Scatter-Gather)**
   *
   * **Academic Concepts:**
   * - Fork-Join Pattern: Split work into parallel tasks, then join results
   * - Map-Reduce: Map agents to jobs, reduce results to aggregated stats
   * - Semaphore Pattern: WorkerQueue limits concurrency (max 4 parallel agents)
   *
   * **Production Realities:**
   * - Docker containers are I/O bound (waiting for agent execution)
   * - Parallel execution dramatically speeds up rounds (4x faster with 4 workers)
   * - Partial failures OK (some agents fail, others succeed)
   * - Timeouts prevent stragglers from blocking entire round
   *
   * **AI Context:**
   * - LLM agents have variable execution times (seconds to minutes)
   * - No shared state between agents → safe to parallelize
   * - Race conditions avoided by updating stats atomically after all jobs complete
   *
   * **Performance:**
   * - OLD: Sequential (16 agents × 30s = 8 minutes)
   * - NEW: Parallel (16 agents ÷ 4 workers × 30s = 2 minutes)
   * - Speedup: ~4x (limited by maxConcurrency)
   */
  async executeRound(season: SeasonData): Promise<void> {
    season.analytics.totalRounds += 1;

    const dockerImage = process.env.DOCKER_IMAGE;
    if (!dockerImage) {
      throw new Error("DOCKER_IMAGE environment variable is required for agent execution");
    }

    const bountyId = "test-bounty-1";

    // STEP 1: Fan-Out - Create jobs for all agents
    const jobs: ExecutionJob[] = season.participants.map((agent) => ({
      id: `round-${season.analytics.totalRounds}-agent-${agent.id}`,
      type: JobType.EXECUTION_JOB,
      agentId: agent.id,
      bountyId,
      dockerImage,
      env: {
        BOUNTY_ID: bountyId,
        AGENT_NAME: agent.id,
      },
      round: season.analytics.totalRounds,
    }));

    this.logger.info("Starting round execution", {
      round: season.analytics.totalRounds,
      agentCount: jobs.length,
      parallelism: 4, // WorkerQueue default maxConcurrency
    });

    // STEP 2: Execute all jobs in parallel using WorkerQueue
    const workerQueue = new WorkerQueue(
      this.executeAgent,
      this.logger,
      {
        maxConcurrency: 4, // Run 4 agents at a time
        defaultTimeoutMs: 5 * 60 * 1000, // 5 minutes per agent
        roundTimeoutMs: 30 * 60 * 1000, // 30 minutes total
      }
    );

    const results = await workerQueue.submitAll(jobs);

    this.logger.info("Round execution completed", {
      round: season.analytics.totalRounds,
      completedJobs: results.size,
      totalJobs: jobs.length,
    });

    // STEP 3: Fan-In - Aggregate results and update stats atomically
    for (const agent of season.participants) {
      const job = jobs.find((j) => j.agentId === agent.id);
      const jobResult = job ? results.get(job.id) : undefined;

      let result: ExecutionResult;
      if (jobResult) {
        result = jobResult.result;
      } else {
        // Job not found in results - treat as failure
        this.logger.error("Agent execution result missing", {
          agentId: agent.id,
          bountyId,
        });
        result = {
          success: false,
          stdout: "",
          stderr: "Execution result not found",
          executionTimeMs: 0,
        };
      }

      if (!result.success) {
        this.logger.warn("Agent execution reported failure", {
          agentId: agent.id,
          bountyId,
          exitCode: result.exitCode,
          stderr: result.stderr,
        });
      }

      // Update stats atomically (no race conditions - we're in a single-threaded loop)
      const wins = (agent.stats.wins ?? 0) + (result.success ? 1 : 0);
      const losses = (agent.stats.losses ?? 0) + (result.success ? 0 : 1);
      const total = wins + losses;
      const accuracy = total > 0 ? Number((wins / total).toFixed(3)) : 0;

      agent.stats = {
        ...agent.stats,
        wins,
        losses,
        accuracy,
        totalChallenges: (agent.stats.totalChallenges ?? 0) + 1,
        lastActiveAt: new Date(),
      };

      season.analytics.totalChallenges += 1;
    }
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
