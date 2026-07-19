import { Response } from 'express';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  it('returns metrics with the Prometheus content type', async () => {
    const metrics = {
      contentType: 'text/plain; version=0.0.4; charset=utf-8',
      render: jest.fn().mockResolvedValue('# metrics'),
    } as unknown as MetricsService;
    const responseType = jest.fn();
    const response = { type: responseType } as unknown as Response;

    await expect(
      new MetricsController(metrics).getMetrics(response),
    ).resolves.toBe('# metrics');
    expect(responseType).toHaveBeenCalledWith(metrics.contentType);
  });
});
