import { EventType } from "../events/types";

export type SolverStrategy = "search" | "planning" | "reactive" | "hybrid" | string;

export interface AgentConfig {
  name: string;
  description?: string;
  capabilities?: string[];
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentStats {
  wins: number;
  losses: number;
  draws?: number;
  score?: number;
  accuracy?: number;
  totalChallenges?: number;
  averageResponseTimeMs?: number;
  lastActiveAt?: Date;
}

export interface AgentProfile {
  id: string;
  strategy: SolverStrategy;
  config: AgentConfig;
  stats: AgentStats;
}

export interface LeaderboardEntry {
  agentId: string;
  rank: number;
  score: number;
  wins: number;
  losses: number;
}

export interface SeasonAnalytics {
  totalRounds: number;
  totalChallenges: number;
  avgAccuracy: number;
  topPerformer?: string;
}

export interface SecurityEvent {
  type: EventType;
  agentId: string;
  timestamp: Date;
  details?: Record<string, unknown> | string;
}

export interface SeasonData {
  seasonNumber: number;
  startDate: Date;
  endDate?: Date;
  participants: AgentProfile[];
  leaderboard: LeaderboardEntry[];
  analytics: SeasonAnalytics;
  securityEvents: SecurityEvent[];
}

export interface SeasonConfig {
  roundsPerSeason: number;
  challengeCount: number;
  eliminationCount: number;
  promotionCount: number;
}

export interface SeasonResult {
  season: SeasonData;
  promoted: AgentProfile[];
  eliminated: AgentProfile[];
}

export interface SeasonReport {
  season: SeasonData;
  standings: LeaderboardEntry[];
  analytics: SeasonAnalytics;
  generatedAt: Date;
}
