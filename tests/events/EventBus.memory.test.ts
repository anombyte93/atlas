import { describe, it, expect } from 'vitest';
import { EventBus } from '../../scripts/events/EventBus';
import { IEventHandler, ILogger } from '../../scripts/events/types';

// Mock logger
const mockLogger: ILogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

describe('EventBus Memory Management', () => {
  it('should not accumulate dead WeakRefs after unsubscribe', async () => {
    const bus = new EventBus(mockLogger);
    const handlers: Array<{ handle: (event: any) => void }> = [];

    // Subscribe 100 handlers
    for (let i = 0; i < 100; i++) {
      const handler = { handle: async () => {} };
      handlers.push(handler);
      bus.subscribe('TEST', handler);
    }

    // Verify handlers are registered
    let handlerSet = (bus as any).handlerDisposables.get('TEST');
    expect(handlerSet?.size).toBe(100);

    // Unsubscribe all handlers
    for (const handler of handlers) {
      bus.unsubscribe('TEST', handler);
    }

    // After unsubscribe, the map entry should be removed (cleanupDeadHandlers is called)
    handlerSet = (bus as any).handlerDisposables.get('TEST');
    expect(handlerSet?.size || 0).toBe(0);
  });

  it('should not accumulate dead WeakRefs after subscribe with garbage collected handlers', async () => {
    const bus = new EventBus(mockLogger);

    // Subscribe 1000 handlers
    for (let i = 0; i < 1000; i++) {
      const handler = { handle: async () => {} };
      bus.subscribe('TEST', handler);
      // Allow handler to be garbage collected (no strong reference)
    }

    // Force cleanup by triggering another subscribe
    bus.subscribe('TEST', { handle: async () => {} });

    // The handler set should only contain the last handler (others were GC'd)
    const handlerSet = (bus as any).handlerDisposables.get('TEST');
    expect(handlerSet?.size || 0).toBeLessThanOrEqual(1);
  });

  it('should handle 10k subscribe/unsubscribe cycles without memory growth', async () => {
    const bus = new EventBus(mockLogger);
    const initialMemory = process.memoryUsage().heapUsed;

    // Perform 10k subscribe/unsubscribe cycles
    for (let i = 0; i < 10000; i++) {
      const handler = { handle: async () => {} };
      bus.subscribe('TEST', handler);
      bus.unsubscribe('TEST', handler);
    }

    // Force garbage collection if available (Node.js with --expose-gc)
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowthMB = (finalMemory - initialMemory) / (1024 * 1024);

    // Memory growth should be minimal (< 10MB for 10k operations)
    expect(memoryGrowthMB).toBeLessThan(10);
  });

  it('should cleanup dead handlers during publish', async () => {
    const bus = new EventBus(mockLogger);
    const handlers: Array<IEventHandler<any>> = [];

    // Subscribe 50 handlers
    for (let i = 0; i < 50; i++) {
      const handler = { handle: async () => {} };
      handlers.push(handler);
      bus.subscribe('TEST', handler);
    }

    // Let some handlers be garbage collected
    handlers.splice(0, 25);
    // Trigger publish which calls cleanupDeadHandlers
    await bus.publish({ type: 'TEST', timestamp: new Date(), data: {} });

    // After publish and cleanup, should only have live handlers
    // Note: This test is probabilistic as GC timing is not guaranteed
    const handlerSet = (bus as any).handlerDisposables.get('TEST');
    expect(handlerSet?.size || 0).toBeLessThanOrEqual(25);
  });

  it('should dispose all handlers correctly', async () => {
    const bus = new EventBus(mockLogger);

    // Subscribe multiple event types
    for (let i = 0; i < 10; i++) {
      bus.subscribe('EVENT_A', { handle: async () => {} });
      bus.subscribe('EVENT_B', { handle: async () => {} });
    }

    // Verify handlers are registered
    expect((bus as any).handlerDisposables.size).toBe(2);

    // Dispose
    bus.dispose();

    // All handlers should be cleared
    expect((bus as any).handlerDisposables.size).toBe(0);
  });

  it('should handle multiple event types independently', async () => {
    const bus = new EventBus(mockLogger);

    // Subscribe to different event types
    const handlersA = Array.from({ length: 10 }, (_, i) => ({
      handle: async () => {},
      eventType: 'A',
      index: i,
    }));
    const handlersB = Array.from({ length: 20 }, (_, i) => ({
      handle: async () => {},
      eventType: 'B',
      index: i,
    }));

    for (const h of handlersA) {
      bus.subscribe('EVENT_A', h);
    }
    for (const h of handlersB) {
      bus.subscribe('EVENT_B', h);
    }

    // Verify both event types have correct handler counts
    let setA = (bus as any).handlerDisposables.get('EVENT_A');
    let setB = (bus as any).handlerDisposables.get('EVENT_B');
    expect(setA?.size).toBe(10);
    expect(setB?.size).toBe(20);

    // Unsubscribe from EVENT_A only
    for (const h of handlersA) {
      bus.unsubscribe('EVENT_A', h);
    }

    setA = (bus as any).handlerDisposables.get('EVENT_A');
    setB = (bus as any).handlerDisposables.get('EVENT_B');
    expect(setA?.size || 0).toBe(0);
    expect(setB?.size).toBe(20); // EVENT_B should be unaffected
  });

  it('should handle publish to non-existent event type gracefully', async () => {
    const bus = new EventBus(mockLogger);

    // Should not throw, should just return immediately
    await expect(
      bus.publish({ type: 'NONEXISTENT', timestamp: new Date(), data: {} })
    ).resolves.toBeUndefined();
  });

  it('should handle unsubscribe from non-existent event type gracefully', async () => {
    const bus = new EventBus(mockLogger);

    // Should not throw
    expect(() => {
      bus.unsubscribe('NONEXISTENT', { handle: async () => {} });
    }).not.toThrow();
  });

  it('should handle empty subscribe/unsubscribe cycle', async () => {
    const bus = new EventBus(mockLogger);

    // Subscribe and immediately unsubscribe
    const handler = { handle: async () => {} };
    bus.subscribe('TEST', handler);
    bus.unsubscribe('TEST', handler);

    // Should have no handlers registered
    const handlerSet = (bus as any).handlerDisposables.get('TEST');
    expect(handlerSet?.size || 0).toBe(0);
  });

  it('should call all live handlers during publish', async () => {
    const bus = new EventBus(mockLogger);
    const callCounts: Record<string, number> = {};

    // Create handlers that track their calls
    const handlers = Array.from({ length: 5 }, (_, i) => ({
      handle: async () => {
        callCounts[`handler-${i}`] = (callCounts[`handler-${i}`] || 0) + 1;
      },
    }));

    for (const h of handlers) {
      bus.subscribe('TEST', h);
    }

    // Publish 10 events
    for (let i = 0; i < 10; i++) {
      await bus.publish({ type: 'TEST', timestamp: new Date(), data: {} });
    }

    // Each handler should have been called 10 times
    expect(Object.keys(callCounts).length).toBe(5);
    for (const count of Object.values(callCounts)) {
      expect(count).toBe(10);
    }
  });
});
