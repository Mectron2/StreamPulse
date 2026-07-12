import { Injectable, Logger } from '@nestjs/common';
import { EventHandler } from '../rabbitmq/event-handler.interface';
import { BinanceAggregateTrade } from './binance-trade.type';
import { BinanceTradesService } from './binance-trades.service';

@Injectable()
export class BinanceEventHandler implements EventHandler {
  readonly name = 'binance';
  readonly rawRoute = {
    exchange: process.env.RABBITMQ_BINANCE_EXCHANGE ?? 'binance',
    queue: process.env.RABBITMQ_BINANCE_RAW_QUEUE ?? 'binance.aggTrade',
    routingKey: process.env.RABBITMQ_BINANCE_RAW_ROUTING_KEY ?? 'aggTrade',
  };
  readonly processedRoute = {
    exchange: this.rawRoute.exchange,
    queue:
      process.env.RABBITMQ_BINANCE_PROCESSED_QUEUE ??
      'binance.aggTrade.processed',
    routingKey:
      process.env.RABBITMQ_BINANCE_PROCESSED_ROUTING_KEY ??
      'aggTrade.processed',
  };

  private readonly logger = new Logger(BinanceEventHandler.name);

  constructor(private readonly tradesService: BinanceTradesService) {}

  process(payload: unknown) {
    if (!this.isAggregateTrade(payload)) {
      this.logger.warn('Discarding invalid Binance aggTrade event');
      return Promise.resolve(null);
    }

    return this.tradesService.processAndSave(payload);
  }

  private isAggregateTrade(value: unknown): value is BinanceAggregateTrade {
    const trade = value as Record<string, unknown> | null;
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      trade?.e === 'aggTrade' &&
      typeof trade.E === 'number' &&
      typeof trade.s === 'string' &&
      typeof trade.a === 'number' &&
      typeof trade.p === 'string' &&
      typeof trade.q === 'string' &&
      typeof trade.f === 'number' &&
      typeof trade.l === 'number' &&
      typeof trade.T === 'number' &&
      typeof trade.m === 'boolean' &&
      typeof trade.M === 'boolean'
    );
  }
}
