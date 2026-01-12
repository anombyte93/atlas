import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventStore } from "../../scripts/events/EventStore";
import { EventBus } from "../../scripts/events/EventBus";
import { ConsoleLogger } from "../../scripts/events/ConsoleLogger";
import type { IEvent } from "../../scripts/events/types";
import fs from "fs";
import path from "path";
import os from "os";

describe("EventStore", () => {
  let tempDir: string;
  let eventBus: EventBus;
  let store: EventStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-store-"));
    const logger = new ConsoleLogger(false);
    eventBus = new EventBus(logger);
    store = new EventStore({ storeDir: tempDir, eventBus });
  });

  afterEach(async () => {
    await store.clear();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("append", () => {
    it("should append event and return ID", async () => {
      const event: IEvent = {
        type: "TEST_EVENT",
        timestamp: new Date(),
        data: { round: 1, message: "test" },
      };

      const id = await store.append(event);

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(store.getAllEvents()).toHaveLength(1);
    });

    it("should persist events to disk", async () => {
      const event: IEvent = {
        type: "TEST_EVENT",
        timestamp: new Date(),
        data: { round: 1 },
      };

      await store.append(event);

      const filepath = path.join(tempDir, "events.jsonl");
      expect(fs.existsSync(filepath)).toBe(true);

      const content = fs.readFileSync(filepath, "utf-8");
      expect(content).toContain("TEST_EVENT");
    });

    it("should publish to event bus when configured", async () => {
      const publishSpy = vi.spyOn(eventBus, "publish").mockResolvedValue();

      const event: IEvent = {
        type: "TEST_EVENT",
        timestamp: new Date(),
        data: { round: 1 },
      };

      await store.append(event);

      expect(publishSpy).toHaveBeenCalledWith(event);
    });
  });

  describe("getEventsForRound", () => {
    it("should filter events by round number", async () => {
      await store.append({
        type: "ROUND_EVENT",
        timestamp: new Date(),
        data: { round: 1 },
      });
      await store.append({
        type: "ROUND_EVENT",
        timestamp: new Date(),
        data: { round: 2 },
      });
      await store.append({
        type: "OTHER_EVENT",
        timestamp: new Date(),
        data: { seasonNumber: 1 },
      });

      const round1Events = await store.getEventsForRound(1);
      expect(round1Events).toHaveLength(1);
      expect(round1Events[0].data).toEqual({ round: 1 });

      const round2Events = await store.getEventsForRound(2);
      expect(round2Events).toHaveLength(1);
      expect(round2Events[0].data).toEqual({ round: 2 });
    });
  });

  describe("getEventsForSeason", () => {
    it("should filter events by season number", async () => {
      await store.append({
        type: "SEASON_EVENT",
        timestamp: new Date(),
        data: { seasonNumber: 1 },
      });
      await store.append({
        type: "SEASON_EVENT",
        timestamp: new Date(),
        data: { seasonNumber: 2 },
      });

      const season1Events = await store.getEventsForSeason(1);
      expect(season1Events).toHaveLength(1);
    });
  });

  describe("load", () => {
    it("should load existing events from disk", async () => {
      // Create and save events
      await store.append({
        type: "PERSISTED_EVENT",
        timestamp: new Date(),
        data: { round: 1 },
      });

      // Create new store instance
      const newStore = new EventStore({ storeDir: tempDir });
      await newStore.load();

      expect(newStore.getAllEvents()).toHaveLength(1);
      expect(newStore.getAllEvents()[0].type).toBe("PERSISTED_EVENT");
    });

    it("should start empty when file does not exist", async () => {
      // Create new store instance without prior events
      const newStore = new EventStore({ storeDir: tempDir });
      await newStore.load();

      expect(newStore.getAllEvents()).toHaveLength(0);
    });

    it("should handle corrupt event file gracefully", async () => {
      // Write corrupt data to event file
      const filepath = path.join(tempDir, "events.jsonl");
      fs.writeFileSync(filepath, "corrupt json data {not valid");

      // Create new store instance
      const newStore = new EventStore({ storeDir: tempDir });

      // Should not throw, but will have empty events
      await expect(newStore.load()).resolves.toBeUndefined();
      expect(newStore.getAllEvents()).toHaveLength(0);
    });
  });

  describe("replay", () => {
    it("should throw error when replaying without event bus", async () => {
      // Create store without event bus
      const storeWithoutBus = new EventStore({ storeDir: tempDir });

      await storeWithoutBus.append({
        type: "TEST_EVENT",
        timestamp: new Date(),
        data: { round: 1 },
      });

      // Should throw when trying to replay without event bus
      await expect(storeWithoutBus.replay()).rejects.toThrow("no event bus configured");
    });

    it("should include events without round field when replaying from specific round", async () => {
      const publishSpy = vi.spyOn(eventBus, "publish").mockResolvedValue();

      await store.append({
        type: "EVENT_WITHOUT_ROUND",
        timestamp: new Date(),
        data: { value: "no-round" },
      });
      await store.append({
        type: "ROUND_EVENT",
        timestamp: new Date(),
        data: { round: 5 },
      });

      publishSpy.mockClear();

      await store.replay(5);

      // Both events should be replayed (event without round is included)
      expect(publishSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("clear", () => {
    it("should remove all events", async () => {
      await store.append({
        type: "TEST_EVENT",
        timestamp: new Date(),
        data: { round: 1 },
      });

      expect(store.getAllEvents()).toHaveLength(1);

      await store.clear();

      expect(store.getAllEvents()).toHaveLength(0);
    });
  });
});
