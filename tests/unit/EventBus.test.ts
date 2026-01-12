import { describe, expect, it, vi, expectTypeOf } from "vitest";
import EventBus from "../../scripts/events/EventBus";
import type { ChampionshipEvent } from "../../scripts/events/types";

const testLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const roundStartedEvent = (): Extract<ChampionshipEvent, { type: "ROUND_STARTED" }> => ({
  type: "ROUND_STARTED",
  timestamp: new Date(),
  data: { round: 1, seed: 42 },
});

describe("Typed EventBus", () => {
  it("dispatches events to handlers with the correct payload", async () => {
    const bus = new EventBus<ChampionshipEvent>(testLogger);
    const handler = { handle: vi.fn() };

    bus.subscribe("ROUND_STARTED", handler);
    await bus.publish(roundStartedEvent());

    expect(handler.handle).toHaveBeenCalledTimes(1);
    const callArg = handler.handle.mock.calls[0][0];
    expect(callArg.data.round).toBe(1);
    expect(callArg.data.seed).toBe(42);
  });

  it("does not call handlers registered for other event types", async () => {
    const bus = new EventBus<ChampionshipEvent>(testLogger);
    const startedHandler = { handle: vi.fn() };
    const completedHandler = { handle: vi.fn() };

    bus.subscribe("ROUND_STARTED", startedHandler);
    bus.subscribe("ROUND_COMPLETED", completedHandler);

    await bus.publish(roundStartedEvent());

    expect(startedHandler.handle).toHaveBeenCalledTimes(1);
    expect(completedHandler.handle).not.toHaveBeenCalled();
  });

  it("enforces compile-time typing for handlers and payloads", () => {
    const bus = new EventBus<ChampionshipEvent>(testLogger);

    // Handler receives fully typed payload
    bus.subscribe("AGENT_REGISTERED", {
      handle(event) {
        expectTypeOf(event.data.agentId).toBeString();
        expectTypeOf(event.data.strategy).toMatchTypeOf<string>();
        // @ts-expect-error - agentRegistered payload has no winner field
        expectTypeOf(event.data.winner).toBeString();
      },
    });

    // @ts-expect-error - unknown event types should not be allowed
    bus.subscribe("UNKNOWN_EVENT", { handle: vi.fn() });

    // @ts-expect-error - payload missing required fields for ROUND_STARTED
    void bus.publish({
      type: "ROUND_STARTED",
      timestamp: new Date(),
      data: { seed: 1 },
    });
  });

  it("unsubscribes handlers and stops calling them", async () => {
    const bus = new EventBus<ChampionshipEvent>(testLogger);
    const handler = { handle: vi.fn() };

    bus.subscribe("ROUND_STARTED", handler);
    await bus.publish(roundStartedEvent());
    expect(handler.handle).toHaveBeenCalledTimes(1);

    bus.unsubscribe("ROUND_STARTED", handler);
    await bus.publish(roundStartedEvent());
    expect(handler.handle).toHaveBeenCalledTimes(1); // Still 1, not 2
  });

  it("handles handler errors gracefully and logs them", async () => {
    const bus = new EventBus<ChampionshipEvent>(testLogger);
    const errorHandler = {
      handle: vi.fn(() => {
        throw new Error("Handler error");
      }),
    };
    const successHandler = { handle: vi.fn() };

    bus.subscribe("ROUND_STARTED", errorHandler);
    bus.subscribe("ROUND_STARTED", successHandler);

    await bus.publish(roundStartedEvent());

    // Both handlers called
    expect(errorHandler.handle).toHaveBeenCalledTimes(1);
    expect(successHandler.handle).toHaveBeenCalledTimes(1);

    // Error logged
    expect(testLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Handler failed for event 'ROUND_STARTED'"),
      expect.objectContaining({
        error: expect.any(Error),
        event: roundStartedEvent(),
      })
    );
  });

  it("handles events with no registered handlers gracefully", async () => {
    const bus = new EventBus<ChampionshipEvent>(testLogger);

    // Should not throw when no handlers registered
    await expect(bus.publish(roundStartedEvent())).resolves.toBeUndefined();
  });

  it("calls multiple handlers in subscription order", async () => {
    const bus = new EventBus<ChampionshipEvent>(testLogger);
    const callOrder: string[] = [];

    const handler1 = {
      handle: vi.fn(async () => {
        callOrder.push("handler1");
      }),
    };
    const handler2 = {
      handle: vi.fn(async () => {
        callOrder.push("handler2");
      }),
    };
    const handler3 = {
      handle: vi.fn(async () => {
        callOrder.push("handler3");
      }),
    };

    bus.subscribe("ROUND_STARTED", handler1);
    bus.subscribe("ROUND_STARTED", handler2);
    bus.subscribe("ROUND_STARTED", handler3);

    await bus.publish(roundStartedEvent());

    expect(callOrder).toEqual(["handler1", "handler2", "handler3"]);
  });
});
