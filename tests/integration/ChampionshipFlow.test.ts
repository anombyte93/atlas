import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import ChampionshipManager from "../../scripts/agent-league/ChampionshipManager";
import AgentRegistry from "../../scripts/agent-league/AgentRegistry";
import SeasonManager from "../../scripts/agent-league/SeasonManager";
import type { AgentProfile, SeasonConfig } from "../../scripts/agent-league/types";

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const createEventBus = () => ({
  publish: vi.fn().mockResolvedValue(undefined),
});

describe("Championship full season flow", () => {
  let tempDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let logger: ReturnType<typeof createLogger>;
  let eventBus: ReturnType<typeof createEventBus>;
  let registry: AgentRegistry;
  let seasonManager: SeasonManager;
  let manager: ChampionshipManager;

  const agentA: AgentProfile = {
    id: "alpha",
    strategy: "search",
    config: { name: "Alpha" },
    stats: { wins: 5, losses: 1, accuracy: 0.9 },
  };

  const agentB: AgentProfile = {
    id: "beta",
    strategy: "reactive",
    config: { name: "Beta" },
    stats: { wins: 1, losses: 5, accuracy: 0.4 },
  };

  const config: SeasonConfig = {
    roundsPerSeason: 2,
    challengeCount: 1,
    eliminationCount: 1,
    promotionCount: 1,
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-season-"));
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    logger = createLogger();
    eventBus = createEventBus();
    registry = new AgentRegistry(eventBus as any, logger);
    seasonManager = new SeasonManager(logger);
    manager = new ChampionshipManager(registry, seasonManager, eventBus as any, logger);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("runs a complete season, updates standings, and persists results", async () => {
    registry.registerAgent(agentA);
    registry.registerAgent(agentB);

    const result = await manager.runSeason(config);

    expect(result.season.seasonNumber).toBe(1);
    expect(result.season.analytics.totalRounds).toBe(config.roundsPerSeason);
    expect(result.season.analytics.totalChallenges).toBe(
      config.roundsPerSeason * 2
    );

    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].id).toBe(agentA.id);

    expect(result.eliminated).toHaveLength(1);
    expect(result.eliminated[0].id).toBe(agentB.id);

    // Registry reflects elimination
    expect(registry.getAgent(agentB.id)).toBeUndefined();
    expect(registry.getAgent(agentA.id)).toBeDefined();

    // Leaderboard updated after elimination
    expect(result.season.leaderboard[0]?.agentId).toBe(agentA.id);
    expect(result.season.participants).toHaveLength(1);

    // Events emitted for lifecycle (started, rounds, completed)
    expect(eventBus.publish).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "championship.season.started" })
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "championship.season.completed" })
    );

    // Season persistence occurs under mocked cwd
    const seasonPath = path.join(
      tempDir,
      "data",
      "championship",
      "seasons",
      "season-1.json"
    );
    expect(fs.existsSync(seasonPath)).toBe(true);
  });
});
