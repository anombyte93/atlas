import fs from "fs/promises";
import { readdirSync } from "fs";
import path from "path";
import { ILogger } from "../events/types";
import {
  AgentProfile,
  LeaderboardEntry,
  SeasonAnalytics,
  SeasonConfig,
  SeasonData,
  SecurityEvent,
} from "./types";

export class SeasonManager {
  private readonly seasonsDir: string;
  private lastSeasonNumber = 0;

  constructor(private readonly logger?: ILogger) {
    this.seasonsDir = path.resolve(process.cwd(), "data/championship/seasons");
  }

  createSeason(config: SeasonConfig): SeasonData {
    this.primeLastSeasonNumber();
    const seasonNumber = ++this.lastSeasonNumber;
    const season: SeasonData = {
      seasonNumber,
      startDate: new Date(),
      participants: [],
      leaderboard: [],
      analytics: this.createEmptyAnalytics(),
      securityEvents: [],
    };

    this.logger?.info?.(`Season ${seasonNumber} created`, { config });
    return season;
  }

  endSeason(season: SeasonData): void {
    season.endDate = new Date();
    this.logger?.info?.(`Season ${season.seasonNumber} ended`);
  }

  async saveSeason(season: SeasonData): Promise<void> {
    await fs.mkdir(this.seasonsDir, { recursive: true });
    const filePath = this.buildSeasonPath(season.seasonNumber);
    const serializable = this.serializeSeason(season);
    await fs.writeFile(filePath, JSON.stringify(serializable, null, 2), "utf-8");
    this.logger?.info?.(`Season ${season.seasonNumber} saved`, { filePath });
  }

  async loadSeason(seasonNumber: number): Promise<SeasonData | null> {
    const filePath = this.buildSeasonPath(seasonNumber);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);
      const season = this.deserializeSeason(parsed);
      this.lastSeasonNumber = Math.max(this.lastSeasonNumber, season.seasonNumber);
      return season;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      this.logger?.error?.(`Failed to load season ${seasonNumber}`, { error });
      throw error;
    }
  }

  async getLatestSeason(): Promise<SeasonData | null> {
    try {
      const files = await fs.readdir(this.seasonsDir);
      const seasonFiles = files.filter((f) => f.startsWith("season-") && f.endsWith(".json"));
      if (seasonFiles.length === 0) return null;

      const numbers = seasonFiles
        .map((f) => Number(f.replace(/season-(\d+)\.json/, "$1")))
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => b - a);

      const latestNumber = numbers[0];
      return this.loadSeason(latestNumber);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      this.logger?.error?.("Failed to read seasons directory", { error });
      throw error;
    }
  }

  private createEmptyAnalytics(): SeasonAnalytics {
    return {
      totalRounds: 0,
      totalChallenges: 0,
      avgAccuracy: 0,
      topPerformer: undefined,
    };
  }

  private buildSeasonPath(seasonNumber: number): string {
    return path.join(this.seasonsDir, `season-${seasonNumber}.json`);
  }

  private primeLastSeasonNumber(): void {
    if (this.lastSeasonNumber > 0) return;
    try {
      const files = readdirSync(this.seasonsDir);
      const numbers = files
        .filter((f) => f.startsWith("season-") && f.endsWith(".json"))
        .map((f) => Number(f.replace(/season-(\d+)\.json/, "$1")))
        .filter((n) => !Number.isNaN(n));

      if (numbers.length > 0) {
        this.lastSeasonNumber = Math.max(...numbers);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger?.warn?.("Unable to prime season counter", { error });
      }
    }
  }

  private serializeSeason(season: SeasonData): unknown {
    return {
      ...season,
      startDate: season.startDate.toISOString(),
      endDate: season.endDate ? season.endDate.toISOString() : undefined,
      participants: season.participants.map((participant) => ({
        ...participant,
        stats: {
          ...participant.stats,
          lastActiveAt: participant.stats.lastActiveAt
            ? participant.stats.lastActiveAt.toISOString()
            : undefined,
        },
      })),
      leaderboard: season.leaderboard,
      analytics: season.analytics,
      securityEvents: season.securityEvents.map((event) => ({
        ...event,
        timestamp: event.timestamp.toISOString(),
      })),
    };
  }

  private deserializeSeason(raw: any): SeasonData {
    const participants: AgentProfile[] = (raw.participants ?? []).map((p: any) => ({
      ...p,
      stats: {
        ...p.stats,
        lastActiveAt: p.stats?.lastActiveAt ? new Date(p.stats.lastActiveAt) : undefined,
      },
    }));

    const leaderboard: LeaderboardEntry[] = raw.leaderboard ?? [];

    const analytics: SeasonAnalytics = raw.analytics ?? this.createEmptyAnalytics();

    const securityEvents: SecurityEvent[] = (raw.securityEvents ?? []).map((event: any) => ({
      ...event,
      timestamp: new Date(event.timestamp),
    }));

    return {
      seasonNumber: raw.seasonNumber,
      startDate: new Date(raw.startDate),
      endDate: raw.endDate ? new Date(raw.endDate) : undefined,
      participants,
      leaderboard,
      analytics,
      securityEvents,
    };
  }
}

export default SeasonManager;
