import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ChannelModel, ConfirmChannel, ConsumeMessage, connect } from 'amqplib';
import {
  EVENT_HANDLERS,
  EventHandler,
  EventRoute,
} from './event-handler.interface';
import { MetricsService } from '../observability/metrics.service';

@Injectable()
export class RabbitmqService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RabbitmqService.name);
  private readonly rabbitMqUrl =
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private shuttingDown = false;
  private reconnecting = false;
  private processedPerInterval = 0;
  private readonly LOG_INTERVAL_MS = 60000;
  private intervalRef?: ReturnType<typeof setInterval>;
  private queueMetricsIntervalRef?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(EVENT_HANDLERS)
    private readonly handlers: EventHandler[],
    private readonly metrics: MetricsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.connectAndConsume();
    this.intervalRef = setInterval(
      () => this.logProcessedCount(),
      this.LOG_INTERVAL_MS,
    );
    this.queueMetricsIntervalRef = setInterval(
      () => void this.collectQueueMetrics(),
      Number(process.env.RABBITMQ_QUEUE_METRICS_INTERVAL_MS ?? 10000),
    );
    await this.collectQueueMetrics();
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    await this.channel?.close();
    await this.connection?.close();
    if (this.intervalRef) clearInterval(this.intervalRef);
    if (this.queueMetricsIntervalRef)
      clearInterval(this.queueMetricsIntervalRef);
  }

  private async connectAndConsume(): Promise<void> {
    while (!this.shuttingDown) {
      try {
        await this.connectRabbitMq();
        return;
      } catch (error) {
        this.logger.warn(
          `RabbitMQ connection failed, retrying in 5s: ${this.message(error)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async connectRabbitMq(): Promise<void> {
    this.connection = await connect(this.rabbitMqUrl);
    this.channel = await this.connection.createConfirmChannel();
    await this.channel.prefetch(Number(process.env.RABBITMQ_PREFETCH ?? 10));

    for (const handler of this.handlers) {
      await this.assertRoute(handler.rawRoute);
      await this.assertRoute(handler.processedRoute);
      await this.consume(handler);
    }

    this.connection.on('error', (error) => {
      this.logger.error(`RabbitMQ connection error: ${this.message(error)}`);
    });
    this.connection.on('close', () => {
      if (!this.shuttingDown) this.logger.warn('RabbitMQ connection closed');
      void this.reconnectAfterClose();
    });

    this.logger.log(
      `Consuming event sources: ${this.handlers.map((item) => item.name).join(', ')}`,
    );
  }

  private async assertRoute(route: EventRoute): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel is not initialized');
    await this.channel.assertExchange(route.exchange, 'topic', {
      durable: true,
    });
    await this.channel.assertQueue(route.queue, { durable: true });
    await this.channel.bindQueue(route.queue, route.exchange, route.routingKey);
  }

  private async consume(handler: EventHandler): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel is not initialized');
    await this.channel.consume(
      handler.rawRoute.queue,
      (message) => {
        if (message) void this.handleMessage(handler, message);
      },
      { noAck: false },
    );
  }

  private async handleMessage(
    handler: EventHandler,
    message: ConsumeMessage,
  ): Promise<void> {
    if (!this.channel) return;
    const stopTimer = this.metrics.startProcessingTimer(handler.name);

    try {
      const payload = this.parseMessage(message, handler.name);
      if (payload === null) {
        this.metrics.recordProcessedEvent(handler.name, 'invalid');
        this.channel.ack(message);
        return;
      }

      const processed = await handler.process(payload);
      if (processed === null) {
        this.metrics.recordProcessedEvent(handler.name, 'invalid');
        this.channel.ack(message);
        return;
      }

      await this.publish(handler.processedRoute, processed);
      this.channel.ack(message);
      this.processedPerInterval++;
      this.metrics.recordProcessedEvent(handler.name, 'success');
    } catch (error) {
      this.metrics.recordProcessedEvent(handler.name, 'error');
      this.logger.error(
        `Failed to process ${handler.name} message: ${this.message(error)}`,
      );
      this.channel.nack(message, false, true);
    } finally {
      stopTimer();
    }
  }

  private async collectQueueMetrics(): Promise<void> {
    if (!this.channel) return;

    try {
      for (const handler of this.handlers) {
        const queue = await this.channel.checkQueue(handler.rawRoute.queue);
        this.metrics.setQueueMessagesReady(
          handler.name,
          handler.rawRoute.queue,
          queue.messageCount,
        );
      }
    } catch (error) {
      if (!this.shuttingDown) {
        this.logger.warn(
          `Failed to collect queue metrics: ${this.message(error)}`,
        );
      }
    }
  }

  private parseMessage(message: ConsumeMessage, source: string): unknown {
    try {
      return JSON.parse(message.content.toString()) as unknown;
    } catch (error) {
      this.logger.warn(
        `Discarding invalid ${source} JSON: ${this.message(error)}`,
      );
      return null;
    }
  }

  private publish(route: EventRoute, payload: unknown): Promise<void> {
    if (!this.channel) {
      return Promise.reject(new Error('RabbitMQ channel is not initialized'));
    }

    return new Promise((resolve, reject) => {
      this.channel?.publish(
        route.exchange,
        route.routingKey,
        Buffer.from(JSON.stringify(payload)),
        {
          contentType: 'application/json',
          deliveryMode: 2,
          timestamp: Date.now(),
        },
        (error: Error | null) => (error ? reject(error) : resolve()),
      );
    });
  }

  private async reconnectAfterClose(): Promise<void> {
    if (this.shuttingDown || this.reconnecting) return;
    this.reconnecting = true;
    this.channel = undefined;
    this.connection = undefined;
    try {
      await this.connectAndConsume();
    } finally {
      this.reconnecting = false;
    }
  }

  private logProcessedCount(): void {
    this.logger.log({
      message: 'info.processed_count',
      processedCount: this.processedPerInterval,
      eventsPerSecond:
        this.processedPerInterval / (this.LOG_INTERVAL_MS / 1000),
    });
    this.processedPerInterval = 0;
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
