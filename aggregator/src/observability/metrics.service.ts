import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

export type EventSource = 'wikimedia' | 'binance';
export type ProcessingStatus = 'success' | 'invalid' | 'error';
export type RedisReadResult = 'hit' | 'miss' | 'error';
export type RedisWriteResult = 'success' | 'duplicate' | 'error';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly processedEvents: Counter<'source' | 'status'>;
  private readonly processingDuration: Histogram<'source'>;
  private readonly persistenceDuration: Histogram<'source'>;
  private readonly queueMessagesReady: Gauge<'source' | 'queue'>;
  private readonly redisReads: Counter<'result'>;
  private readonly redisWrites: Counter<'result'>;
  private readonly redisAvailable: Gauge;

  constructor() {
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'streampulse_aggregator_',
    });

    this.processedEvents = new Counter({
      name: 'streampulse_aggregator_events_processed_total',
      help: 'Number of events handled by the aggregator.',
      labelNames: ['source', 'status'],
      registers: [this.registry],
    });
    this.processingDuration = new Histogram({
      name: 'streampulse_aggregator_event_processing_duration_seconds',
      help: 'Time from RabbitMQ delivery through processed-event publication.',
      labelNames: ['source'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
    this.persistenceDuration = new Histogram({
      name: 'streampulse_aggregator_persistence_duration_seconds',
      help: 'PostgreSQL persistence latency for processed events.',
      labelNames: ['source'],
      buckets: [0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });
    this.queueMessagesReady = new Gauge({
      name: 'streampulse_aggregator_rabbitmq_queue_messages_ready',
      help: 'RabbitMQ messages ready in an aggregator input queue.',
      labelNames: ['source', 'queue'],
      registers: [this.registry],
    });
    this.redisReads = new Counter({
      name: 'streampulse_aggregator_redis_cache_reads_total',
      help: 'Redis dashboard cache reads by result.',
      labelNames: ['result'],
      registers: [this.registry],
    });
    this.redisWrites = new Counter({
      name: 'streampulse_aggregator_redis_cache_writes_total',
      help: 'Redis processed-event cache writes by result.',
      labelNames: ['result'],
      registers: [this.registry],
    });
    this.redisAvailable = new Gauge({
      name: 'streampulse_aggregator_redis_cache_available',
      help: 'Whether the aggregator currently has a ready Redis connection.',
      registers: [this.registry],
    });
    this.redisAvailable.set(0);
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  startProcessingTimer(source: EventSource): () => void {
    const stop = this.processingDuration.startTimer({ source });
    return () => void stop();
  }

  startPersistenceTimer(source: EventSource): () => void {
    const stop = this.persistenceDuration.startTimer({ source });
    return () => void stop();
  }

  recordProcessedEvent(source: EventSource, status: ProcessingStatus): void {
    this.processedEvents.inc({ source, status });
  }

  setQueueMessagesReady(
    source: EventSource,
    queue: string,
    messages: number,
  ): void {
    this.queueMessagesReady.set({ source, queue }, messages);
  }

  recordRedisRead(result: RedisReadResult): void {
    this.redisReads.inc({ result });
  }

  recordRedisWrite(result: RedisWriteResult): void {
    this.redisWrites.inc({ result });
  }

  setRedisAvailable(available: boolean): void {
    this.redisAvailable.set(available ? 1 : 0);
  }
}
