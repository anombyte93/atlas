import { EventType, IEvent, IEventBus, IEventHandler, ILogger } from "./types";

/**
 * Simple in-memory event bus that dispatches events to subscribed handlers.
 */
export class EventBus<TEvents extends { type: EventType } = IEvent> implements IEventBus<TEvents> {
  private readonly handlers: Map<EventType, Set<IEventHandler<TEvents>>> = new Map();

  constructor(private readonly logger: ILogger) {}

  subscribe<TEventType extends TEvents["type"]>(
    type: TEventType,
    handler: IEventHandler<Extract<TEvents, { type: TEventType }>>
  ): void {
    const handlersForType =
      this.handlers.get(type) ?? new Set<IEventHandler<Extract<TEvents, { type: TEventType }>>>();
    handlersForType.add(handler as unknown as IEventHandler<TEvents>);
    this.handlers.set(type, handlersForType as Set<IEventHandler<TEvents>>);
  }

  unsubscribe<TEventType extends TEvents["type"]>(
    type: TEventType,
    handler: IEventHandler<Extract<TEvents, { type: TEventType }>>
  ): void {
    const handlersForType = this.handlers.get(type);
    if (!handlersForType) return;

    handlersForType.delete(handler as unknown as IEventHandler<TEvents>);
    if (handlersForType.size === 0) {
      this.handlers.delete(type);
    }
  }

  async publish<TEvent extends Extract<TEvents, { type: TEvents["type"] }>>(event: TEvent): Promise<void> {
    const handlersForType = this.handlers.get(event.type);
    if (!handlersForType || handlersForType.size === 0) return;

    const executions = Array.from(handlersForType).map(async (handler) => {
      try {
        await handler.handle(event as Extract<TEvents, { type: EventType }>);
      } catch (error) {
        this.logger.error(`Handler failed for event '${event.type}'`, {
          error,
          event,
        });
      }
    });

    await Promise.allSettled(executions);
  }
}

export default EventBus;
