import { describe, expect, it, vi } from "vitest";
import { SlidingWindowRateLimiter } from "../../scripts/governance/RateLimiter";

const AGENT = "agent-1";
const ACTION = "submit";

describe("SlidingWindowRateLimiter", () => {
  it("blocks requests that exceed the window quota", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-12T00:00:00.000Z"));

    const limiter = new SlidingWindowRateLimiter();

    for (let i = 0; i < 100; i += 1) {
      expect(limiter.checkLimit(AGENT, ACTION)).toBe(true);
      limiter.recordAction(AGENT, ACTION);
    }

    expect(limiter.checkLimit(AGENT, ACTION)).toBe(false);
    expect(limiter.getRemainingQuota(AGENT, ACTION)).toBe(0);

    vi.useRealTimers();
  });

  it("allows requests after the sliding window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-12T00:00:00.000Z"));

    const limiter = new SlidingWindowRateLimiter();

    for (let i = 0; i < 100; i += 1) {
      limiter.recordAction(AGENT, ACTION);
    }

    // Move past the 60s window to prune old entries
    vi.advanceTimersByTime(60_000 + 1);

    expect(limiter.checkLimit(AGENT, ACTION)).toBe(true);
    expect(limiter.getRemainingQuota(AGENT, ACTION)).toBe(100);

    vi.useRealTimers();
  });
});
