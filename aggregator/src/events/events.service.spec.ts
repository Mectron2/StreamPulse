import { Repository } from 'typeorm';
import { EventsService } from './events.service';
import { ProcessedEventEntity } from './processed-event.entity';
import { RedisCacheService } from '../cache/redis-cache.service';
import { MetricsService } from '../observability/metrics.service';

describe('EventsService', () => {
  const recordProcessedEvent = jest.fn().mockResolvedValue(undefined);
  const cache = { recordProcessedEvent } as unknown as RedisCacheService;
  const stopPersistenceTimer = jest.fn();
  const metrics = {
    startPersistenceTimer: jest.fn(() => stopPersistenceTimer),
  } as unknown as MetricsService;

  beforeEach(() => {
    recordProcessedEvent.mockClear();
    stopPersistenceTimer.mockClear();
  });

  it('saves processed event and returns it', async () => {
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const repository = {
      save: saveMock,
    } as unknown as Repository<ProcessedEventEntity>;
    const service = new EventsService(repository, cache, metrics);

    const result = await service.processAndSave({
      id: 1,
      timestamp: 1783425600,
      wiki: 'wikidatawiki',
      domain: 'www.wikidata.org',
      type: 'new',
      namespace: 0,
      title: 'Q123',
      user: 'Example',
      length: {
        old: 0,
        new: 700,
      },
      comment: 'created item',
    });

    expect(saveMock).toHaveBeenCalledWith(result);
    expect(recordProcessedEvent).toHaveBeenCalledWith(result);
    expect(stopPersistenceTimer).toHaveBeenCalled();
    expect(result).toMatchObject({
      id: '1',
      project: 'wikidata',
      type: 'new',
      diffSize: 700,
      tags: ['new-page', 'article'],
      riskScore: 45,
      importanceScore: 80,
    });
  });

  it('returns a stable cursor and removes the look-ahead row', async () => {
    const rows = ['3', '2', '1'].map((id) => ({
      id,
      timestamp: new Date('2026-07-11T12:00:00.000Z'),
    }));
    const query = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    } as unknown as Repository<ProcessedEventEntity>;

    const result = await new EventsService(
      repository,
      cache,
      metrics,
    ).findProcessedEvents(2);

    expect(query.orderBy).toHaveBeenCalledWith('event.timestamp', 'DESC');
    expect(query.addOrderBy).toHaveBeenCalledWith('event.id', 'DESC');
    expect(query.take).toHaveBeenCalledWith(3);
    expect(result.items).toEqual(rows.slice(0, 2));
    expect(
      JSON.parse(Buffer.from(result.nextCursor!, 'base64url').toString('utf8')),
    ).toEqual({ timestamp: '2026-07-11T12:00:00.000Z', id: '2' });
  });

  it('returns no cursor on the final page', async () => {
    const query = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    } as unknown as Repository<ProcessedEventEntity>;
    await expect(
      new EventsService(repository, cache, metrics).findProcessedEvents(50),
    ).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
