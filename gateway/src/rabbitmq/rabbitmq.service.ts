import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Channel, ChannelModel, ConsumeMessage, connect } from 'amqplib';
import { LiveGateway } from '../live/live.gateway';

@Injectable()
export class RabbitmqService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RabbitmqService.name);
  private readonly rabbitMqUrl =
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
  private readonly routes = [
    {
      exchange: process.env.RABBITMQ_EXCHANGE ?? 'wikimedia',
      queue:
        process.env.RABBITMQ_PROCESSED_QUEUE ??
        'wikimedia.recentchange.processed',
      routingKey:
        process.env.RABBITMQ_PROCESSED_ROUTING_KEY ?? 'recentchange.processed',
    },
    {
      exchange: process.env.RABBITMQ_BINANCE_EXCHANGE ?? 'binance',
      queue:
        process.env.RABBITMQ_BINANCE_PROCESSED_QUEUE ??
        'binance.aggTrade.processed',
      routingKey:
        process.env.RABBITMQ_BINANCE_PROCESSED_ROUTING_KEY ??
        'aggTrade.processed',
    },
  ];
  private connection?: ChannelModel;
  private channel?: Channel;
  private shuttingDown = false;
  private reconnecting = false;

  constructor(private readonly liveGateway: LiveGateway) {}

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
        await this.consume();
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
    this.channel = await this.connection.createChannel();
    for (const route of this.routes) {
      await this.channel.assertExchange(route.exchange, 'topic', {
        durable: true,
      });
      await this.channel.assertQueue(route.queue, { durable: true });
      await this.channel.bindQueue(
        route.queue,
        route.exchange,
        route.routingKey,
      );
    }
    await this.channel.prefetch(Number(process.env.RABBITMQ_PREFETCH ?? 10));

    this.connection.on('error', (error) => {
      this.logger.error(`RabbitMQ connection error: ${this.message(error)}`);
    });
    this.connection.on('close', () => {
      if (!this.shuttingDown) this.logger.warn('RabbitMQ connection closed');
      void this.reconnectAfterClose();
    });
    this.logger.log(
      `Consuming processed events from queues: ${this.routes.map((route) => route.queue).join(', ')}`,
    );
  }

  private async consume(): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel is not initialized');
    for (const route of this.routes) {
      await this.channel.consume(
        route.queue,
        (message) => {
          if (message) this.handleMessage(message);
        },
        { noAck: false },
      );
    }
  }

  private handleMessage(message: ConsumeMessage): void {
    if (!this.channel) return;
    let event: unknown;
    try {
      event = JSON.parse(message.content.toString()) as unknown;
      if (typeof event !== 'object' || event === null || Array.isArray(event)) {
        throw new Error('Payload is not an object');
      }
    } catch (error) {
      this.logger.warn(
        `Discarding invalid processed event: ${this.message(error)}`,
      );
      this.channel.ack(message);
      return;
    }

    try {
      this.liveGateway.emitProcessedEvent(event);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error(
        `Failed to broadcast processed event: ${this.message(error)}`,
      );
      this.channel.nack(message, false, true);
    }
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

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
