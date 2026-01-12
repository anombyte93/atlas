import { IEvent, IEventBus } from "../events/types";

export const TOOL_DISABLED_EVENT = "TOOL_DISABLED";
export const PROMPT_REVOKED_EVENT = "PROMPT_REVOKED";
export const AGENT_TERMINATED_EVENT = "AGENT_TERMINATED";
export const EMERGENCY_SHUTDOWN_EVENT = "EMERGENCY_SHUTDOWN";

export interface IKillSwitch {
  disableTool(toolId: string): void;
  revokePrompt(agentId: string, ttlMs?: number): void;
  terminateAgent(agentId: string): void;
  emergencyShutdown(): void;
  isToolDisabled(toolId: string): boolean;
  isPromptRevoked(agentId: string): boolean;
  isAgentTerminated(agentId: string): boolean;
}

interface PromptRevocation {
  revoked: Date;
  ttl: number; // milliseconds
}

export class InMemoryKillSwitch implements IKillSwitch {
  private readonly disabledTools = new Set<string>();
  private readonly revokedPrompts = new Map<string, PromptRevocation>();
  private readonly terminatedAgents = new Map<string, Date>();
  private emergencyActive = false;

  constructor(private readonly eventBus: IEventBus) {}

  disableTool(toolId: string): void {
    this.disabledTools.add(toolId);
    void this.eventBus.publish(this.buildEvent(TOOL_DISABLED_EVENT, { toolId }));
  }

  revokePrompt(agentId: string, ttlMs?: number): void {
    const ttl = ttlMs ?? Number.POSITIVE_INFINITY;
    this.revokedPrompts.set(agentId, { revoked: new Date(), ttl });
    void this.eventBus.publish(
      this.buildEvent(PROMPT_REVOKED_EVENT, { agentId, ttlMs: ttlMs ?? null })
    );
  }

  terminateAgent(agentId: string): void {
    this.terminatedAgents.set(agentId, new Date());
    void this.eventBus.publish(
      this.buildEvent(AGENT_TERMINATED_EVENT, { agentId })
    );
  }

  emergencyShutdown(): void {
    this.emergencyActive = true;
    this.disabledTools.clear();
    void this.eventBus.publish(
      this.buildEvent(EMERGENCY_SHUTDOWN_EVENT, { triggeredAt: new Date() })
    );
  }

  isToolDisabled(toolId: string): boolean {
    return this.emergencyActive || this.disabledTools.has(toolId);
  }

  isPromptRevoked(agentId: string): boolean {
    const entry = this.revokedPrompts.get(agentId);
    if (!entry) return false;

    const now = Date.now();
    const expiresAt = entry.revoked.getTime() + entry.ttl;

    if (now >= expiresAt) {
      this.revokedPrompts.delete(agentId);
      return false;
    }

    return true;
  }

  isAgentTerminated(agentId: string): boolean {
    return this.terminatedAgents.has(agentId);
  }

  private buildEvent<TData>(type: string, data: TData): IEvent<TData> {
    return {
      type,
      timestamp: new Date(),
      data,
    };
  }
}

export default InMemoryKillSwitch;
