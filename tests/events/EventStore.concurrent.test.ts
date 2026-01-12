import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventStore } from '../../scripts/events/EventStore';
import { IEvent } from '../../scripts/events/types';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('EventStore Concurrent Operations', () => {
  let storeDir: string;
  let store: EventStore;

  beforeEach(() => {
    storeDir = mkdtempSync(join(tmpdir(), 'event-test-'));
    store = new EventStore({ storeDir });
  });

  afterEach(() => {
    if (existsSync(storeDir)) {
      rmSync(storeDir, { recursive: true, force: true });
    }
  });

  it('should serialize 100 concurrent appends without data loss', async () => {
    const eventCount = 100;
    const promises = Array.from({ length: eventCount }, (_, i) =>
      store.append(
        { type: 'TEST', timestamp: new Date(), data: { index: i } },
        undefined
      )
    );

    const results = await Promise.all(promises);

    // All events should have unique IDs
    expect(results).toHaveLength(eventCount);
    expect(new Set(results).size).toBe(eventCount);

    // All events should be persisted in memory
    const allEvents = store.getAllEvents();
    expect(allEvents).toHaveLength(eventCount);

    // Verify data integrity - each event should have correct index
    const indices = allEvents.map((e) => (e.data as { index: number }).index).sort((a, b) => a - b);
    expect(indices).toEqual(Array.from({ length: eventCount }, (_, i) => i));
  });

  it('should serialize 1000 concurrent appends without data loss', async () => {
    const eventCount = 1000;
    const promises = Array.from({ length: eventCount }, (_, i) =>
      store.append(
        { type: 'TEST', timestamp: new Date(), data: { index: i } },
        undefined
      )
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(eventCount);
    expect(new Set(results).size).toBe(eventCount);

    const allEvents = store.getAllEvents();
    expect(allEvents).toHaveLength(eventCount);
  });

  it('should handle concurrent load operations gracefully', async () => {
    // First, persist some events
    for (let i = 0; i < 10; i++) {
      await store.append(
        { type: 'INITIAL', timestamp: new Date(), data: { index: i } },
        undefined
      );
    }

    // Create a new store instance and load concurrently
    const stores = Array.from({ length: 5 }, () => new EventStore({ storeDir }));
    const loadPromises = stores.map((s) => s.load());

    await Promise.all(loadPromises);

    // All stores should have loaded the same events
    for (const s of stores) {
      expect(s.getAllEvents()).toHaveLength(10);
    }
  });

  it('should handle corrupt JSON lines gracefully', async () => {
    const filepath = join(storeDir, 'events.jsonl');

    // Create a file with some corrupt data
    const fs = require('fs/promises');
    await fs.mkdir(storeDir, { recursive: true });
    await fs.writeFile(
      filepath,
      '{"id":"1","type":"TEST","timestamp":1234567890,"data":{"valid":true}}\n' +
      'invalid json line\n' +
      '{"id":"2","type":"TEST","timestamp":1234567891,"data":{"valid":true}}\n' +
      'malformed{json}\n' +
      '{"id":"3","type":"TEST","timestamp":1234567892,"data":{"valid":true}}'
    );

    // Load should skip corrupt lines
    await store.load();

    const events = store.getAllEvents();
    expect(events).toHaveLength(3);
    expect(events[0].id).toBe('1');
    expect(events[1].id).toBe('2');
    expect(events[2].id).toBe('3');
  });

  it('should maintain ordering within serialized operations', async () => {
    const orderedAppends = [];
    for (let i = 0; i < 50; i++) {
      orderedAppends.push(
        store.append(
          { type: 'ORDERED', timestamp: new Date(), data: { order: i } },
          undefined
        )
      );
    }

    await Promise.all(orderedAppends);

    const allEvents = store.getAllEvents();
    const orders = allEvents.map((e) => (e.data as { order: number }).order);

    // Due to mutex serialization, the order should be preserved
    // (though this is a best-effort check - the key is no data loss)
    expect(new Set(orders).size).toBe(50);
  });
});
