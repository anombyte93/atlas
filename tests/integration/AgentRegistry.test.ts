import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentRegistry from "../../scripts/agent-league/AgentRegistry";
import type { AgentProfile } from "../../scripts/agent-league/types";

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const createEventBus = () => ({
  publish: vi.fn().mockResolvedValue(undefined),
});

describe("AgentRegistry integration", () => {
  let registry: AgentRegistry;
  let logger: ReturnType<typeof createLogger>;
  let eventBus: ReturnType<typeof createEventBus>;
  let agent: AgentProfile;

  beforeEach(() => {
    logger = createLogger();
    eventBus = createEventBus();
    registry = new AgentRegistry(eventBus as any, logger);
    agent = {
      id: "agent-1",
      strategy: "search",
      config: { name: "Test Agent" },
      stats: { wins: 0, losses: 0, draws: 0 },
    };
  });

  it("registers agents and allows lookups while emitting registration events", async () => {
    registry.registerAgent(agent);

    expect(registry.getAgent(agent.id)).toEqual(agent);
    expect(registry.getAllAgents()).toHaveLength(1);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "championship.agent.registered",
        data: { profile: agent },
      })
    );
  });

  it("updates stats and publishes updates", async () => {
    registry.registerAgent(agent);
    registry.updateAgentStats(agent.id, { wins: 3, losses: 1 });

    const updated = registry.getAgent(agent.id);
    expect(updated?.stats.wins).toBe(3);
    expect(updated?.stats.losses).toBe(1);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "championship.agent.updated",
        data: { agentId: agent.id, stats: expect.objectContaining({ wins: 3, losses: 1 }) },
      })
    );
  });

  it("eliminates an agent and emits elimination events", async () => {
    registry.registerAgent(agent);
    registry.eliminateAgent(agent.id);

    expect(registry.getAgent(agent.id)).toBeUndefined();
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "championship.agent.eliminated",
        data: { agentId: agent.id },
      })
    );
  });
});
