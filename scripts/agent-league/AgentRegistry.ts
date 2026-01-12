import { IEventBus, ILogger } from "../events/types";
import { AgentProfile, AgentStats } from "./types";

const EVENTS = {
  AGENT_REGISTERED: "championship.agent.registered",
  AGENT_UPDATED: "championship.agent.updated",
  AGENT_ELIMINATED: "championship.agent.eliminated",
} as const;

export class AgentRegistry {
  private readonly agents = new Map<string, AgentProfile>();

  constructor(
    private readonly eventBus?: IEventBus,
    private readonly logger?: ILogger
  ) {}

  registerAgent(profile: AgentProfile): void {
    this.agents.set(profile.id, profile);
    this.logger?.info?.(`Registered agent ${profile.id}`);
    this.publish(EVENTS.AGENT_REGISTERED, { profile });
  }

  getAgent(id: string): AgentProfile | undefined {
    return this.agents.get(id);
  }

  getAllAgents(): AgentProfile[] {
    return Array.from(this.agents.values());
  }

  updateAgentStats(id: string, stats: Partial<AgentStats>): void {
    const agent = this.agents.get(id);
    if (!agent) {
      this.logger?.warn?.(`Attempted to update unknown agent ${id}`);
      return;
    }

    agent.stats = { ...agent.stats, ...stats };
    this.logger?.debug?.(`Updated stats for agent ${id}`, { stats: agent.stats });
    this.publish(EVENTS.AGENT_UPDATED, { agentId: id, stats: agent.stats });
  }

  eliminateAgent(id: string): void {
    const removed = this.agents.get(id);
    this.agents.delete(id);
    if (removed) {
      this.publish(EVENTS.AGENT_ELIMINATED, { agentId: id });
      this.logger?.info?.(`Eliminated agent ${id}`);
    }
  }

  private publish(type: string, data: Record<string, unknown>): void {
    if (!this.eventBus) return;

    void this.eventBus.publish({
      type,
      timestamp: new Date(),
      data,
    });
  }
}

export default AgentRegistry;
