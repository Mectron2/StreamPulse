import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { Brackets, Repository } from 'typeorm';
import { BinanceTradeEntity } from './binance-trade.entity';
import {
  BinanceAggregateTrade,
  ProcessedBinanceTrade,
} from './binance-trade.type';
import { RedisCacheService } from '../cache/redis-cache.service';

@Injectable()
export class BinanceTradesService {
  constructor(
    @InjectRepository(BinanceTradeEntity)
    private readonly repository: Repository<BinanceTradeEntity>,
    private readonly cache: RedisCacheService,
  ) {}

  async processAndSave(
    trade: BinanceAggregateTrade,
  ): Promise<ProcessedBinanceTrade> {
    const processed: ProcessedBinanceTrade = {
      source: 'binance',
      type: 'aggTrade',
      id: `${trade.s}:${trade.a}`,
      aggregateTradeId: String(trade.a),
      timestamp: new Date(trade.T),
      symbol: trade.s,
      price: trade.p,
      quantity: trade.q,
      quoteQuantity: new Decimal(trade.p).mul(trade.q).toFixed(),
      side: trade.m ? 'sell' : 'buy',
      buyerIsMaker: trade.m,
    };

    await this.repository.save(processed);
    await this.cache.recordProcessedEvent(processed);
    return processed;
  }

  async findTrades(
    limit: number,
    cursor?: { timestamp: Date; id: string },
  ): Promise<{ items: BinanceTradeEntity[]; nextCursor: string | null }> {
    const query = this.repository
      .createQueryBuilder('trade')
      .orderBy('trade.timestamp', 'DESC')
      .addOrderBy('trade.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      query.andWhere(
        new Brackets((where) => {
          where
            .where('trade.timestamp < :timestamp', {
              timestamp: cursor.timestamp,
            })
            .orWhere('trade.timestamp = :timestamp AND trade.id < :id', {
              timestamp: cursor.timestamp,
              id: cursor.id,
            });
        }),
      );
    }

    const results = await query.getMany();
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                timestamp: last.timestamp.toISOString(),
                id: last.id,
              }),
            ).toString('base64url')
          : null,
    };
  }
}
