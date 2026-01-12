import CircuitBreaker from "opossum";
import { IEventBus } from "../events/types";

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
}

export interface CircuitBreakerState {
  agentId: string;
  state: "closed" | "open" | "halfOpen";
  stats: {
    failures: number;
    falls: number;
    rejects: number;
    successes: number;
    timeElapsed: number;
  };
}

export function createAgentCircuitBreaker<T>(
  agentId: string,
  execute: () => Promise<T>,
  eventBus?: IEventBus,
  options?: CircuitBreakerOptions
): CircuitBreaker<() => Promise<T>> {
  const breakerOptions = {
    timeout: options?.timeout ?? 5000,
    errorThresholdPercentage: options?.errorThresholdPercentage ?? 50,
    resetTimeout: options?.resetTimeout ?? 30000,
    rollingCountTimeout: options?.rollingCountTimeout ?? 10000,
    rollingCountBuckets: options?.rollingCountBuckets ?? 10,
  };

  const breaker = new CircuitBreaker(execute, breakerOptions);

  breaker.on("open", () => {
    const message = `[CIRCUIT BREAKER] Agent ${agentId} circuit OPENED - blocking calls`;
    console.error(message);
    eventBus?.publish({
      type: "CIRCUIT_OPENED",
      timestamp: new Date(),
      data: { agentId, state: "open", reason: "Error threshold exceeded" },
    } as never);
  });

  breaker.on("halfOpen", () => {
    const message = `[CIRCUIT BREAKER] Agent ${agentId} circuit HALF-OPEN - testing recovery`;
    console.warn(message);
    eventBus?.publish({
      type: "CIRCUIT_HALF_OPEN",
      timestamp: new Date(),
      data: { agentId, state: "halfOpen", reason: "Testing recovery" },
    } as never);
  });

  breaker.on("close", () => {
    const message = `[CIRCUIT BREAKER] Agent ${agentId} circuit CLOSED - normal operation`;
    console.info(message);
    eventBus?.publish({
      type: "CIRCUIT_CLOSED",
      timestamp: new Date(),
      data: { agentId, state: "closed", reason: "Recovery successful" },
    } as never);
  });

  return breaker;
}

export function getCircuitBreakerState(
  agentId: string,
  breaker: CircuitBreaker<() => Promise<unknown>>
): CircuitBreakerState {
  const stats = breaker.stats;
  return {
    agentId,
    state: breaker.opened ? "open" : breaker.halfOpen ? "halfOpen" : "closed",
    stats: {
      failures: stats.failures,
      falls: stats.fallbacks,
      rejects: stats.rejects,
      successes: stats.successes,
      timeElapsed: stats.latencyMean || 0,
    },
  };
}

export default createAgentCircuitBreaker;
