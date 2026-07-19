export interface EventRoute {
  readonly exchange: string;
  readonly queue: string;
  readonly routingKey: string;
}

export interface EventHandler {
  readonly name: 'wikimedia' | 'binance';
  readonly rawRoute: EventRoute;
  readonly processedRoute: EventRoute;
  process(payload: unknown): Promise<unknown>;
}

export const EVENT_HANDLERS = Symbol('EVENT_HANDLERS');
