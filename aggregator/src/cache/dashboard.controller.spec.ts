import { RedisCacheService } from './redis-cache.service';
import { DashboardController } from './dashboard.controller';

describe('DashboardController', () => {
  it('returns the Redis dashboard snapshot', async () => {
    const snapshot = {
      cacheAvailable: true,
      generatedAt: '2026-07-19T12:00:00.000Z',
      activity: {
        lastMinute: 3,
        lastHour: 10,
        bySource: {
          wikimedia: { lastMinute: 2, lastHour: 7 },
          binance: { lastMinute: 1, lastHour: 3 },
        },
      },
      topPages: [],
      recent: { wikimedia: [], binance: [] },
    };
    const cache = {
      getDashboardSnapshot: jest.fn().mockResolvedValue(snapshot),
    } as unknown as RedisCacheService;

    await expect(
      new DashboardController(cache).getDashboard(),
    ).resolves.toEqual(snapshot);
  });
});
