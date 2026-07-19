import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { transformWikimediaEvent } from './event-transformer';
import { ProcessedEventEntity } from './processed-event.entity';
import { ProcessedEvent } from './processed-event.type';
import { WikimediaRecentChange } from './wikimedia-recent-change.type';
import { RedisCacheService } from '../cache/redis-cache.service';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(ProcessedEventEntity)
    private readonly processedEventsRepository: Repository<ProcessedEventEntity>,
    private readonly cache: RedisCacheService,
  ) {}

  async processAndSave(event: WikimediaRecentChange): Promise<ProcessedEvent> {
    const processedEvent = transformWikimediaEvent(event);

    await this.processedEventsRepository.save(processedEvent);
    await this.cache.recordProcessedEvent(processedEvent);

    return processedEvent;
  }

  async findProcessedEvents(
    limit: number,
    cursor?: { timestamp: Date; id: string },
  ): Promise<{ items: ProcessedEventEntity[]; nextCursor: string | null }> {
    const query = this.processedEventsRepository
      .createQueryBuilder('event')
      .orderBy('event.timestamp', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      query.andWhere(
        new Brackets((where) => {
          where
            .where('event.timestamp < :timestamp', {
              timestamp: cursor.timestamp,
            })
            .orWhere('event.timestamp = :timestamp AND event.id < :id', {
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
