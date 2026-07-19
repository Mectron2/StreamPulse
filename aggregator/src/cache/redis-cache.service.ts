import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { ProcessedBinanceTrade } from '../binance/binance-trade.type';
import { ProcessedEvent } from '../events/processed-event.type';
import {
  ActivityWindow,
  CacheableProcessedEvent,
  DashboardSnapshot,
} from './cache.types';

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ACTIVITY_TTL_SECONDS = 2 * 60 * 60;
const RECENT_TTL_SECONDS = 60 * 60;
const TOP_PAGES_TTL_SECONDS = 2 * 60 * 60;
const DEDUPLICATION_TTL_SECONDS = 2 * 60 * 60;
const RECENT_LIMIT = 100;

@Injectable()
export class RedisCacheService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: RedisClientType;
  private nextConnectionAttemptAt = 0;
  private connectionAttempt?: Promise<boolean>;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      socket: {
        connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 2000),
        reconnectStrategy: false,
      },
    });
    this.client.on('error', (error) => {
      this.logger.warn(`Redis error: ${this.message(error)}`);
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureReady();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isReady) {
      await this.client.quit();
    } else if (this.client.isOpen) {
      this.client.destroy();
    }
  }

  async recordProcessedEvent(event: CacheableProcessedEvent): Promise<void> {
    if (!(await this.ensureReady())) return;

    const now = Date.now();
    const eventIdentity = `${event.source}:${event.id}`;
    const deduplicationKey = `streampulse:dedup:${eventIdentity}`;

    try {
      const firstDelivery = await this.client.set(deduplicationKey, '1', {
        expiration: { type: 'EX', value: DEDUPLICATION_TTL_SECONDS },
        condition: 'NX',
      });
      if (firstDelivery === null) return;

      const activityKey = this.activityKey();
      const sourceActivityKey = this.activityKey(event.source);
      const recentKey = this.recentKey(event.source);
      const transaction = this.client.multi();

      transaction.zAdd(activityKey, { score: now, value: eventIdentity });
      transaction.zAdd(sourceActivityKey, {
        score: now,
        value: eventIdentity,
      });
      transaction.zRemRangeByScore(activityKey, 0, now - ONE_HOUR_MS);
      transaction.zRemRangeByScore(sourceActivityKey, 0, now - ONE_HOUR_MS);
      transaction.expire(activityKey, ACTIVITY_TTL_SECONDS);
      transaction.expire(sourceActivityKey, ACTIVITY_TTL_SECONDS);
      transaction.lPush(recentKey, JSON.stringify(event));
      transaction.lTrim(recentKey, 0, RECENT_LIMIT - 1);
      transaction.expire(recentKey, RECENT_TTL_SECONDS);

      if (event.source === 'wikimedia' && event.title) {
        const topPagesKey = this.topPagesKey(new Date(now));
        transaction.zIncrBy(
          topPagesKey,
          1,
          JSON.stringify({
            title: event.title,
            wiki: event.wiki,
            domain: event.domain,
          }),
        );
        transaction.expire(topPagesKey, TOP_PAGES_TTL_SECONDS);
      }

      await transaction.exec();
    } catch (error) {
      this.handleOperationError('update cache', error);
    }
  }

  async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    const empty = this.emptySnapshot();
    if (!(await this.ensureReady())) return empty;

    const now = Date.now();
    try {
      const [activity, wikimedia, binance, topPages, recentWiki, recentTrades] =
        await Promise.all([
          this.readActivity(this.activityKey(), now),
          this.readActivity(this.activityKey('wikimedia'), now),
          this.readActivity(this.activityKey('binance'), now),
          this.client.zRangeWithScores(this.topPagesKey(new Date(now)), 0, 4, {
            REV: true,
          }),
          this.client.lRange(this.recentKey('wikimedia'), 0, 49),
          this.client.lRange(this.recentKey('binance'), 0, 49),
        ]);

      return {
        cacheAvailable: true,
        generatedAt: new Date(now).toISOString(),
        activity: { ...activity, bySource: { wikimedia, binance } },
        topPages: topPages.flatMap(({ value, score }) => {
          const page = this.parseJson<{
            title: string;
            wiki: string;
            domain: string;
          }>(value);
          return page ? [{ ...page, changes: score }] : [];
        }),
        recent: {
          wikimedia: recentWiki.flatMap((value) => {
            const event = this.parseJson<ProcessedEvent>(value);
            return event ? [event] : [];
          }),
          binance: recentTrades.flatMap((value) => {
            const trade = this.parseJson<ProcessedBinanceTrade>(value);
            return trade ? [trade] : [];
          }),
        },
      };
    } catch (error) {
      this.handleOperationError('read dashboard cache', error);
      return empty;
    }
  }

  private async readActivity(
    key: string,
    now: number,
  ): Promise<ActivityWindow> {
    const [lastMinute, lastHour] = await Promise.all([
      this.client.zCount(key, now - ONE_MINUTE_MS, now),
      this.client.zCount(key, now - ONE_HOUR_MS, now),
    ]);
    return { lastMinute, lastHour };
  }

  private async ensureReady(): Promise<boolean> {
    if (this.client.isReady) return true;
    if (this.connectionAttempt) return this.connectionAttempt;
    if (Date.now() < this.nextConnectionAttemptAt) return false;

    this.connectionAttempt = this.connect();
    try {
      return await this.connectionAttempt;
    } finally {
      this.connectionAttempt = undefined;
    }
  }

  private async connect(): Promise<boolean> {
    try {
      if (this.client.isOpen) this.client.destroy();
      await this.client.connect();
      this.logger.log('Redis cache connected');
      return true;
    } catch (error) {
      this.nextConnectionAttemptAt = Date.now() + 5000;
      this.logger.warn(
        `Redis cache unavailable; PostgreSQL processing continues: ${this.message(error)}`,
      );
      return false;
    }
  }

  private handleOperationError(operation: string, error: unknown): void {
    this.nextConnectionAttemptAt = Date.now() + 5000;
    if (this.client.isOpen) this.client.destroy();
    this.logger.warn(`Failed to ${operation}: ${this.message(error)}`);
  }

  private activityKey(source?: 'wikimedia' | 'binance'): string {
    return `streampulse:activity:${source ?? 'all'}`;
  }

  private recentKey(source: 'wikimedia' | 'binance'): string {
    return `streampulse:recent:${source}`;
  }

  private topPagesKey(date: Date): string {
    const hour = date
      .toISOString()
      .slice(0, 13)
      .replaceAll('-', '')
      .replace('T', '');
    return `streampulse:top-pages:${hour}`;
  }

  private emptySnapshot(): DashboardSnapshot {
    const emptyActivity = { lastMinute: 0, lastHour: 0 };
    return {
      cacheAvailable: false,
      generatedAt: new Date().toISOString(),
      activity: {
        ...emptyActivity,
        bySource: {
          wikimedia: { ...emptyActivity },
          binance: { ...emptyActivity },
        },
      },
      topPages: [],
      recent: { wikimedia: [], binance: [] },
    };
  }

  private parseJson<T>(value: string): T | null {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
