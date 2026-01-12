import type { SolverStrategy } from "../agent-league/types";

export type EventType = string;

export interface IEvent<TPayload = unknown> {
  type: EventType;
  timestamp: Date;
  data: TPayload;
}

export interface RoundResult {
  round: number;
  winner?: string;
  standings?: Record<string, number>;
  metadata?: Record<string, unknown>;
}

// Discriminated union for all championship events
export type ChampionshipEvent =
  | (IEvent<{ agentId: string; strategy: SolverStrategy }> & { type: "AGENT_REGISTERED" })
  | (IEvent<{ round: number; seed: number }> & { type: "ROUND_STARTED" })
  | (IEvent<{ round: number; results: RoundResult }> & { type: "ROUND_COMPLETED" })
  | (IEvent<{ seasonNumber: number; winner: string }> & { type: "SEASON_ENDED" })
  | (IEvent<{ agentId: string; reason: string }> & { type: "AGENT_TERMINATED" });

export type ChampionshipEventType = ChampionshipEvent["type"];

export interface IEventHandler<TEvent extends IEvent = IEvent> {
  handle(event: TEvent): Promise<void> | void;
}

export interface IEventBus<TEvents extends { type: EventType } = IEvent> {
  subscribe<TEventType extends TEvents["type"]>(
    type: TEventType,
    handler: IEventHandler<Extract<TEvents, { type: TEventType }>>
  ): void;
  unsubscribe<TEventType extends TEvents["type"]>(
    type: TEventType,
    handler: IEventHandler<Extract<TEvents, { type: TEventType }>>
  ): void;
  publish<TEvent extends Extract<TEvents, { type: TEvents["type"] }>>(event: TEvent): Promise<void>;
}

export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug?(message: string, meta?: Record<string, unknown>): void;
}
