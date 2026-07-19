import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import EventSource, { SourceEvent } from '../event-source.interface';
import { isRecord } from '../utils/misc';
import { BinanceAggregateTrade } from './binance-event.type';

@Injectable()
export class BinanceSource implements EventSource<BinanceAggregateTrade> {
  readonly name = 'binance';
  private readonly aggregateTradesUrl =
    process.env.BINANCE_WS_URL ??
    'wss://data-stream.binance.vision/ws/btcusdt@aggTrade';

  connect(): Observable<SourceEvent<BinanceAggregateTrade>> {
    return new Observable((subscriber) => {
      const socket = new WebSocket(this.aggregateTradesUrl);

      socket.onmessage = (message) => {
        try {
          const trade = this.parseAggregateTrade(message.data);

          subscriber.next({
            source: this.name,
            type: 'aggTrade',
            occurredAt: new Date(trade.T).toISOString(),
            ingestedAt: new Date().toISOString(),
            externalId: String(trade.a),
            data: trade,
          });
        } catch (error) {
          subscriber.error(error);
        }
      };

      socket.onerror = () => {
        subscriber.error(new Error('Binance WebSocket connection failed'));
      };

      socket.onclose = () => {
        subscriber.complete();
      };

      return () => {
        if (socket.readyState < WebSocket.CLOSING) {
          socket.close();
        }
      };
    });
  }

  private parseAggregateTrade(data: unknown): BinanceAggregateTrade {
    if (typeof data !== 'string') {
      throw new Error('Binance WebSocket returned a non-text message');
    }

    const value = JSON.parse(data) as unknown;

    if (!this.isAggregateTrade(value)) {
      throw new Error('Binance WebSocket returned an invalid aggTrade payload');
    }

    return value;
  }

  private isAggregateTrade(value: unknown): value is BinanceAggregateTrade {
    return (
      isRecord(value) &&
      value.e === 'aggTrade' &&
      typeof value.E === 'number' &&
      typeof value.s === 'string' &&
      typeof value.a === 'number' &&
      typeof value.p === 'string' &&
      typeof value.q === 'string' &&
      typeof value.f === 'number' &&
      typeof value.l === 'number' &&
      typeof value.T === 'number' &&
      typeof value.m === 'boolean' &&
      typeof value.M === 'boolean'
    );
  }
}
