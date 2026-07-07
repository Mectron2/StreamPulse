import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ChannelModel, ConfirmChannel, ConsumeMessage, connect } from 'amqplib';
import { EventsService } from '../events/events.service';
import { WikimediaRecentChange } from '../events/wikimedia-recent-change.type';

@Injectable()
export class RabbitmqService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RabbitmqService.name);
  private readonly rabbitMqUrl =
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
  private readonly exchange = process.env.RABBITMQ_EXCHANGE ?? 'wikimedia';
  private readonly rawQueue =
    process.env.RABBITMQ_RAW_QUEUE ?? 'wikimedia.recentchange';
  private readonly rawRoutingKey =
    process.env.RABBITMQ_RAW_ROUTING_KEY ?? 'recentchange';
  private readonly processedQueue =
    process.env.RABBITMQ_PROCESSED_QUEUE ?? 'wikimedia.recentchange.processed';
  private readonly processedRoutingKey =
    process.env.RABBITMQ_PROCESSED_ROUTING_KEY ?? 'recentchange.processed';

  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private shuttingDown = false;
  private reconnecting = false;

  constructor(private readonly eventsService: EventsService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.connectAndConsume();
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;

    await this.channel?.close();
    await this.connection?.close();
  }

  private async connectAndConsume(): Promise<void> {
    while (!this.shuttingDown) {
      try {
        await this.connectRabbitMq();
        await this.consumeRawEvents();
        return;
      } catch (error) {
        this.logger.warn(
          `RabbitMQ connection failed, retrying in 5s: ${this.getErrorMessage(error)}`,
        );
        await this.delay(5000);
      }
    }
  }

  private async connectRabbitMq(): Promise<void> {
    this.connection = await connect(this.rabbitMqUrl);
    this.channel = await this.connection.createConfirmChannel();

    await this.channel.assertExchange(this.exchange, 'topic', {
      durable: true,
    });
    await this.channel.assertQueue(this.rawQueue, {
      durable: true,
    });
    await this.channel.bindQueue(
      this.rawQueue,
      this.exchange,
      this.rawRoutingKey,
    );
    await this.channel.assertQueue(this.processedQueue, {
      durable: true,
    });
    await this.channel.bindQueue(
      this.processedQueue,
      this.exchange,
      this.processedRoutingKey,
    );
    await this.channel.prefetch(Number(process.env.RABBITMQ_PREFETCH ?? 10));

    this.connection.on('error', (error) => {
      this.logger.error(
        `RabbitMQ connection error: ${this.getErrorMessage(error)}`,
      );
    });
    this.connection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed');
      void this.reconnectAfterClose();
    });

    this.logger.log(
      `Connected to RabbitMQ queue "${this.rawQueue}", publishing "${this.processedRoutingKey}"`,
    );
  }

  private async consumeRawEvents(): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    await this.channel.consume(
      this.rawQueue,
      (message) => {
        if (!message) return;

        void this.handleMessage(message);
      },
      { noAck: false },
    );
  }

  private async handleMessage(message: ConsumeMessage): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    try {
      const rawEvent = this.parseMessage(message);

      if (!rawEvent) {
        this.channel.ack(message);
        return;
      }

      const processedEvent = await this.eventsService.processAndSave(rawEvent);

      await this.publishProcessedEvent(processedEvent);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error(
        `Failed to process RabbitMQ message: ${this.getErrorMessage(error)}`,
      );
      this.channel.nack(message, false, true);
    }
  }

  private parseMessage(message: ConsumeMessage): WikimediaRecentChange | null {
    try {
      const parsed = JSON.parse(message.content.toString()) as unknown;

      if (this.isRecord(parsed)) {
        return parsed;
      }

      this.logger.warn('Received non-object Wikimedia event');
      return null;
    } catch (error) {
      this.logger.warn(
        `Received invalid JSON from RabbitMQ: ${this.getErrorMessage(error)}`,
      );
      return null;
    }
  }

  private publishProcessedEvent(payload: unknown): Promise<void> {
    if (!this.channel) {
      return Promise.reject(new Error('RabbitMQ channel is not initialized'));
    }

    return new Promise((resolve, reject) => {
      this.channel?.publish(
        this.exchange,
        this.processedRoutingKey,
        Buffer.from(JSON.stringify(payload)),
        {
          contentType: 'application/json',
          deliveryMode: 2,
          timestamp: Date.now(),
        },
        (error: Error | null) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        },
      );
    });
  }

  private async reconnectAfterClose(): Promise<void> {
    if (this.shuttingDown || this.reconnecting) {
      return;
    }

    this.reconnecting = true;
    this.channel = undefined;
    this.connection = undefined;

    try {
      await this.connectAndConsume();
    } finally {
      this.reconnecting = false;
    }
  }

  private isRecord(value: unknown): value is WikimediaRecentChange {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
