import { Injectable, Logger } from '@nestjs/common';
import { EventHandler } from '../rabbitmq/event-handler.interface';
import { EventsService } from './events.service';
import { WikimediaRecentChange } from './wikimedia-recent-change.type';

@Injectable()
export class WikimediaEventHandler implements EventHandler {
  readonly name = 'wikimedia';
  readonly rawRoute = {
    exchange: process.env.RABBITMQ_EXCHANGE ?? 'wikimedia',
    queue: process.env.RABBITMQ_RAW_QUEUE ?? 'wikimedia.recentchange',
    routingKey: process.env.RABBITMQ_RAW_ROUTING_KEY ?? 'recentchange',
  };
  readonly processedRoute = {
    exchange: this.rawRoute.exchange,
    queue:
      process.env.RABBITMQ_PROCESSED_QUEUE ??
      'wikimedia.recentchange.processed',
    routingKey:
      process.env.RABBITMQ_PROCESSED_ROUTING_KEY ?? 'recentchange.processed',
  };

  private readonly logger = new Logger(WikimediaEventHandler.name);

  constructor(private readonly eventsService: EventsService) {}

  process(payload: unknown) {
    if (!this.isRecord(payload)) {
      this.logger.warn('Discarding invalid Wikimedia event');
      return Promise.resolve(null);
    }

    return this.eventsService.processAndSave(payload);
  }

  private isRecord(value: unknown): value is WikimediaRecentChange {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
