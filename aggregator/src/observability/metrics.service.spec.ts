import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('renders aggregator business metrics in Prometheus format', async () => {
    const metrics = new MetricsService();
    const stopProcessing = metrics.startProcessingTimer('wikimedia');
    const stopPersistence = metrics.startPersistenceTimer('wikimedia');

    metrics.recordProcessedEvent('wikimedia', 'success');
    metrics.setQueueMessagesReady('wikimedia', 'wikimedia.recentchange', 7);
    metrics.recordRedisRead('hit');
    metrics.recordRedisWrite('success');
    metrics.setRedisAvailable(true);
    stopPersistence();
    stopProcessing();

    const output = await metrics.render();

    expect(output).toContain(
      'streampulse_aggregator_events_processed_total{source="wikimedia",status="success"} 1',
    );
    expect(output).toContain(
      'streampulse_aggregator_rabbitmq_queue_messages_ready{source="wikimedia",queue="wikimedia.recentchange"} 7',
    );
    expect(output).toContain(
      'streampulse_aggregator_redis_cache_reads_total{result="hit"} 1',
    );
    expect(output).toContain('streampulse_aggregator_redis_cache_available 1');
  });
});
