export interface IRateLimiter {
  checkLimit(agentId: string, action: string): boolean;
  recordAction(agentId: string, action: string): void;
  getRemainingQuota(agentId: string, action: string): number;
}

export class SlidingWindowRateLimiter implements IRateLimiter {
  private static readonly WINDOW_SIZE_MS = 60_000; // 1 minute sliding window
  private static readonly MAX_REQUESTS = 100;

  private readonly actionLog: Map<string, Map<string, number[]>> = new Map();

  public checkLimit(agentId: string, action: string): boolean {
    const now = Date.now();
    const timestamps = this.pruneOldEntries(agentId, action, now);

    return timestamps.length < SlidingWindowRateLimiter.MAX_REQUESTS;
  }

  public recordAction(agentId: string, action: string): void {
    const now = Date.now();
    const timestamps = this.pruneOldEntries(agentId, action, now);

    timestamps.push(now);
    this.getOrCreateActionMap(agentId).set(action, timestamps);
  }

  public getRemainingQuota(agentId: string, action: string): number {
    const now = Date.now();
    const timestamps = this.pruneOldEntries(agentId, action, now);

    return Math.max(
      0,
      SlidingWindowRateLimiter.MAX_REQUESTS - timestamps.length,
    );
  }

  private pruneOldEntries(agentId: string, action: string, now: number): number[] {
    const threshold = now - SlidingWindowRateLimiter.WINDOW_SIZE_MS;
    const actionMap = this.getOrCreateActionMap(agentId);
    const timestamps = actionMap.get(action) ?? [];
    const filteredTimestamps = timestamps.filter((timestamp) => timestamp >= threshold);

    actionMap.set(action, filteredTimestamps);
    return filteredTimestamps;
  }

  private getOrCreateActionMap(agentId: string): Map<string, number[]> {
    let actionMap = this.actionLog.get(agentId);

    if (!actionMap) {
      actionMap = new Map<string, number[]>();
      this.actionLog.set(agentId, actionMap);
    }

    return actionMap;
  }
}
