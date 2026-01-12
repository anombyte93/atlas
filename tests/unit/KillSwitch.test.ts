import { describe, expect, it, vi } from "vitest";
import InMemoryKillSwitch, {
  AGENT_TERMINATED_EVENT,
  PROMPT_REVOKED_EVENT,
  TOOL_DISABLED_EVENT,
} from "../../scripts/security/KillSwitch";

const createEventBusMock = () => ({
  publish: vi.fn().mockResolvedValue(undefined),
});

describe("InMemoryKillSwitch", () => {
  it("disables a tool and emits TOOL_DISABLED event", async () => {
    const eventBus = createEventBusMock();
    const killSwitch = new InMemoryKillSwitch(eventBus);

    killSwitch.disableTool("tool-1");

    expect(killSwitch.isToolDisabled("tool-1")).toBe(true);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: TOOL_DISABLED_EVENT,
        data: { toolId: "tool-1" },
      })
    );
  });

  it("revokes a prompt with TTL and restores access after expiry", async () => {
    vi.useFakeTimers();
    const eventBus = createEventBusMock();
    const killSwitch = new InMemoryKillSwitch(eventBus);

    killSwitch.revokePrompt("agent-1", 1_000);

    expect(killSwitch.isPromptRevoked("agent-1")).toBe(true);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PROMPT_REVOKED_EVENT,
        data: { agentId: "agent-1", ttlMs: 1_000 },
      })
    );

    vi.advanceTimersByTime(1_001);
    expect(killSwitch.isPromptRevoked("agent-1")).toBe(false);
    vi.useRealTimers();
  });

  it("terminates an agent and records the termination", async () => {
    const eventBus = createEventBusMock();
    const killSwitch = new InMemoryKillSwitch(eventBus);

    killSwitch.terminateAgent("agent-42");

    expect(killSwitch.isAgentTerminated("agent-42")).toBe(true);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AGENT_TERMINATED_EVENT,
        data: { agentId: "agent-42" },
      })
    );
  });
});
