import { EventType, IEvent, IEventBus, IEventHandler, ILogger } from "./types";

/**
 * Simple in-memory event bus that dispatches events to subscribed handlers.
 * Uses WeakRef to prevent memory leaks from garbage collected handlers.
 */
export class EventBus<TEvents extends { type: EventType } = IEvent> implements IEventBus<TEvents> {
  // WeakRef-based tracking prevents retaining handlers that have been garbage collected.
  private readonly handlerDisposables: Map<EventType, Set<WeakRef<IEventHandler<TEvents>>>> = new Map();

  constructor(private readonly logger: ILogger) {}

  subscribe<TEventType extends TEvents["type"]>(
    type: TEventType,
    handler: IEventHandler<Extract<TEvents, { type: TEventType }>>
  ): void {
    const handlersForType =
      this.handlerDisposables.get(type) ?? new Set<WeakRef<IEventHandler<Extract<TEvents, { type: TEventType }>>>>();
    handlersForType.add(new WeakRef(handler as unknown as IEventHandler<TEvents>));
    this.handlerDisposables.set(type, handlersForType as Set<WeakRef<IEventHandler<TEvents>>>);

    // Trigger cleanup to prevent dead WeakRef accumulation
    this.cleanupDeadHandlers();
  }

  unsubscribe<TEventType extends TEvents["type"]>(
    type: TEventType,
    handler: IEventHandler<Extract<TEvents, { type: TEventType }>>
  ): void {
    const handlersForType = this.handlerDisposables.get(type);
    if (!handlersForType) return;

    for (const ref of Array.from(handlersForType)) {
      const target = ref.deref();
      if (!target) {
        handlersForType.delete(ref);
        continue;
      }

      if (target === (handler as unknown as IEventHandler<TEvents>)) {
        handlersForType.delete(ref);
      }
    }

    if (handlersForType.size === 0) {
      this.handlerDisposables.delete(type);
    }

    // Trigger cleanup to prevent dead WeakRef accumulation
    this.cleanupDeadHandlers();
  }

  async publish<TEvent extends Extract<TEvents, { type: TEvents["type"] }>>(event: TEvent): Promise<void> {
    // Cleanup dead handlers before dispatching
    this.cleanupDeadHandlers();

    const handlersForType = this.handlerDisposables.get(event.type);
    if (!handlersForType || handlersForType.size === 0) return;

    const executions = Array.from(handlersForType).flatMap((ref) => {
      const handler = ref.deref();
      if (!handler) {
        handlersForType.delete(ref);
        return [] as Promise<void>[];
      }

      return [
        (async () => {
          try {
            await handler.handle(event as Extract<TEvents, { type: EventType }>);
          } catch (error) {
            this.logger.error(`Handler failed for event '${event.type}'`, {
              error,
              event,
            });
          }
        })(),
      ];
    });

    if (handlersForType.size === 0) {
      this.handlerDisposables.delete(event.type);
    }

    await Promise.allSettled(executions);
  }

  dispose(): void {
    this.handlerDisposables.clear();
  }

  private cleanupDeadHandlers(): void {
    for (const [type, handlersForType] of Array.from(this.handlerDisposables.entries())) {
      for (const ref of Array.from(handlersForType)) {
        if (!ref.deref()) {
          handlersForType.delete(ref);
        }
      }

      if (handlersForType.size === 0) {
        this.handlerDisposables.delete(type);
      }
    }
  }
}

export default EventBus;
