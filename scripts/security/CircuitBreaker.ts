import { IEvent, IEventBus } from "../events/types";

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface ICircuitBreaker {
  check(agentId: string): boolean;
  recordSuccess(agentId: string): void;
  recordFailure(agentId: string): void;
  getState(agentId: string): CircuitState;
}

export const CIRCUIT_OPENED_EVENT = "CIRCUIT_OPENED";
export const CIRCUIT_CLOSED_EVENT = "CIRCUIT_CLOSED";

const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT_MS = 60_000;
const HALF_OPEN_MAX_CALLS = 3;

export class StateCircuitBreaker implements ICircuitBreaker {
  private readonly state = new Map<string, CircuitState>();
  private readonly failureCount = new Map<string, number>();
  private readonly lastFailureTime = new Map<string, number>();
  private readonly halfOpenSuccessCount = new Map<string, number>();

  constructor(private readonly eventBus: IEventBus) {}

  check(agentId: string): boolean {
    const currentState = this.getState(agentId);

    if (currentState === CircuitState.OPEN) {
      const lastFailure = this.lastFailureTime.get(agentId) ?? 0;
      const elapsed = Date.now() - lastFailure;

      if (elapsed >= RESET_TIMEOUT_MS) {
        this.transitionToHalfOpen(agentId);
      } else {
        return false;
      }
    }

    // Allow calls when CLOSED or HALF_OPEN
    return true;
  }

  recordSuccess(agentId: string): void {
    const currentState = this.getState(agentId);

    if (currentState === CircuitState.HALF_OPEN) {
      const successes = (this.halfOpenSuccessCount.get(agentId) ?? 0) + 1;
      this.halfOpenSuccessCount.set(agentId, successes);

      if (successes >= HALF_OPEN_MAX_CALLS) {
        this.resetAgent(agentId);
        this.transitionToClosed(agentId);
      }

      return;
    }

    // For CLOSED (or any unexpected) just reset counters
    this.resetAgent(agentId);
  }

  recordFailure(agentId: string): void {
    const now = Date.now();
    const currentState = this.getState(agentId);

    if (currentState === CircuitState.HALF_OPEN) {
      this.failureCount.set(agentId, FAILURE_THRESHOLD); // mark as hit threshold
      this.lastFailureTime.set(agentId, now);
      this.halfOpenSuccessCount.set(agentId, 0);
      this.transitionToOpen(agentId);
      return;
    }

    const failures = (this.failureCount.get(agentId) ?? 0) + 1;
    this.failureCount.set(agentId, failures);
    this.lastFailureTime.set(agentId, now);

    if (currentState === CircuitState.CLOSED && failures >= FAILURE_THRESHOLD) {
      this.transitionToOpen(agentId);
    }
  }

  getState(agentId: string): CircuitState {
    return this.state.get(agentId) ?? CircuitState.CLOSED;
  }

  private transitionToOpen(agentId: string): void {
    this.state.set(agentId, CircuitState.OPEN);
    this.halfOpenSuccessCount.set(agentId, 0);
    void this.eventBus.publish(this.buildEvent(CIRCUIT_OPENED_EVENT, { agentId }));
  }

  private transitionToHalfOpen(agentId: string): void {
    this.state.set(agentId, CircuitState.HALF_OPEN);
    this.halfOpenSuccessCount.set(agentId, 0);
    // No event specified for HALF_OPEN transitions
  }

  private transitionToClosed(agentId: string): void {
    this.state.set(agentId, CircuitState.CLOSED);
    this.resetAgent(agentId);
    void this.eventBus.publish(this.buildEvent(CIRCUIT_CLOSED_EVENT, { agentId }));
  }

  private resetAgent(agentId: string): void {
    this.failureCount.set(agentId, 0);
    this.lastFailureTime.set(agentId, 0);
    this.halfOpenSuccessCount.set(agentId, 0);
  }

  private buildEvent<TData>(type: string, data: TData): IEvent<TData> {
    return {
      type,
      timestamp: new Date(),
      data,
    };
  }
}

export default StateCircuitBreaker;
