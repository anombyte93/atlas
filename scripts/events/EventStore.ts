import { promises as fs } from "fs";
import * as path from "path";
import { IEvent, IEventBus } from "./types";

export interface StoredEvent {
  id: string;
  type: string;
  timestamp: number;
  data: unknown;
  causationId?: string;
}

export interface EventStoreOptions {
  storeDir: string;
  eventBus?: IEventBus;
}

/**
 * Event store for persisting and replaying championship events.
 * Provides immutable event log for debugging and audit trails.
 */
export class EventStore {
  private events: StoredEvent[] = [];
  private readonly options: EventStoreOptions;

  constructor(options: EventStoreOptions) {
    this.options = options;
  }

  /**
   * Append a new event to the store and persist to disk.
   */
  async append(event: IEvent, causationId?: string): Promise<string> {
    const storedEvent: StoredEvent = {
      id: crypto.randomUUID(),
      type: event.type,
      timestamp: event.timestamp.getTime(),
      data: event.data,
      causationId,
    };

    this.events.push(storedEvent);
    await this.persist(storedEvent);

    // Emit to event bus if provided
    if (this.options.eventBus) {
      await this.options.eventBus.publish(event);
    }

    return storedEvent.id;
  }

  /**
   * Get all events for a specific round number.
   */
  async getEventsForRound(round: number): Promise<StoredEvent[]> {
    return this.events.filter((e) => {
      const data = e.data as { round?: number };
      return data.round === round;
    });
  }

  /**
   * Get all events for a specific season number.
   */
  async getEventsForSeason(seasonNumber: number): Promise<StoredEvent[]> {
    return this.events.filter((e) => {
      const data = e.data as { seasonNumber?: number };
      return data.seasonNumber === seasonNumber;
    });
  }

  /**
   * Get all events (for debugging/replay).
   */
  getAllEvents(): StoredEvent[] {
    return [...this.events];
  }

  /**
   * Replay events from a specific round or from the beginning.
   * Re-publishes events to the event bus.
   */
  async replay(fromRound?: number): Promise<void> {
    let eventsToReplay = this.events;

    if (fromRound !== undefined) {
      eventsToReplay = this.events.filter((e) => {
        const data = e.data as { round?: number };
        return data.round === undefined || data.round >= fromRound;
      });
    }

    if (!this.options.eventBus) {
      throw new Error("Cannot replay: no event bus configured");
    }

    for (const storedEvent of eventsToReplay) {
      const event: IEvent = {
        type: storedEvent.type,
        timestamp: new Date(storedEvent.timestamp),
        data: storedEvent.data as never,
      };
      await this.options.eventBus.publish(event);
    }
  }

  /**
   * Load existing events from disk on startup.
   */
  async load(): Promise<void> {
    const filepath = this.getEventLogPath();

    try {
      const content = await fs.readFile(filepath, "utf-8");
      const lines = content.trim().split("\n");

      this.events = lines
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as StoredEvent);
    } catch (error) {
      // File doesn't exist yet - start fresh
      this.events = [];
    }
  }

  /**
   * Clear all events (for testing).
   */
  async clear(): Promise<void> {
    this.events = [];
    const filepath = this.getEventLogPath();

    try {
      await fs.unlink(filepath);
    } catch {
      // File doesn't exist - ignore
    }
  }

  /**
   * Persist a single event to disk (append-only).
   */
  private async persist(event: StoredEvent): Promise<void> {
    await fs.mkdir(this.options.storeDir, { recursive: true });
    const filepath = this.getEventLogPath();
    const line = JSON.stringify(event);
    await fs.appendFile(filepath, line + "\n");
  }

  /**
   * Get the path to the event log file.
   */
  private getEventLogPath(): string {
    return path.join(this.options.storeDir, "events.jsonl");
  }
}

export default EventStore;
