import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentCircuitBreaker } from "../../scripts/security/CircuitBreakerWrapper";

describe("createAgentCircuitBreaker", () => {
  let breaker: ReturnType<typeof createAgentCircuitBreaker>;

  afterEach(() => {
    if (breaker) {
      breaker.shutdown();
    }
  });

  it("transitions CLOSED -> OPEN -> HALF_OPEN -> CLOSED", async () => {
    let shouldFail = true;
    const action = vi.fn(async () => {
      if (shouldFail) {
        throw new Error("boom");
      }
      return "ok";
    });

    breaker = createAgentCircuitBreaker("agent-1", action, undefined, {
      resetTimeout: 100,
      errorThresholdPercentage: 50,
    });

    const events: string[] = [];

    breaker.on("open", () => events.push("open"));
    breaker.on("halfOpen", () => events.push("halfOpen"));
    breaker.on("close", () => events.push("close"));

    // Trigger failures to open circuit
    const failures = Array.from({ length: 5 }, () => breaker.fire());
    await Promise.allSettled(failures);

    expect(events).toContain("open");
    expect(breaker.opened).toBe(true);

    // Wait for reset timeout (100ms) with safety margin
    await new Promise((resolve) => setTimeout(resolve, 200));
    shouldFail = false;

    // Next call should trigger half-open then close
    const result = await breaker.fire();

    expect(result).toBe("ok");
    expect(events).toEqual(["open", "halfOpen", "close"]);
    expect(breaker.closed).toBe(true);
  });
});
