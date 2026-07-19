import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ChannelModel, ConfirmChannel, connect } from 'amqplib';
import {
  catchError,
  EMPTY,
  from,
  merge,
  mergeMap,
  repeat,
  retry,
  Subscription,
  timer,
} from 'rxjs';
import EventSource, {
  EVENT_SOURCES,
  SourceEvent,
} from './event-source.interface';
import { getErrorMessage } from './utils/misc';

@Injectable()
export class AppService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(
    @Inject(EVENT_SOURCES)
    private readonly eventSources: EventSource[],
  ) {}

  private readonly logger = new Logger(AppService.name);
  private readonly rabbitMqUrl =
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
  private eventsSubscription?: Subscription;
  private rabbitMqConnection?: ChannelModel;
  private rabbitMqChannel?: ConfirmChannel;
  private readonly routeSetup = new Map<string, Promise<void>>();
  private publishedPerInterval = 0;
  private readonly LOG_INTERVAL_MS = 60000;
  private intervalRef?: ReturnType<typeof setInterval>;

  async onApplicationBootstrap(): Promise<void> {
    await this.connectRabbitMq();
    this.intervalRef = setInterval(
      () => this.logPublishedCount(),
      this.LOG_INTERVAL_MS,
    );

    const sourceStreams = this.eventSources.map((source) =>
      source.connect().pipe(
        retry({
          delay: (error: unknown, retryCount: number) => {
            this.logger.warn(
              `${source.name} stream disconnected, reconnecting in 5s (attempt ${retryCount}): ${getErrorMessage(error)}`,
            );

            return timer(5000);
          },
        }),
        repeat({ delay: 5000 }),
      ),
    );

    this.eventsSubscription = merge(...sourceStreams)
      .pipe(
        mergeMap((event) => from(this.publishEvent(event)), 10),
        catchError((error: unknown) => {
          this.logger.error(
            `Event pipeline stopped: ${getErrorMessage(error)}`,
          );

          return EMPTY;
        }),
      )
      .subscribe();
  }

  async onApplicationShutdown(): Promise<void> {
    this.eventsSubscription?.unsubscribe();

    await this.rabbitMqChannel?.close();
    await this.rabbitMqConnection?.close();
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
    }
  }

  private async connectRabbitMq(): Promise<void> {
    this.rabbitMqConnection = await connect(this.rabbitMqUrl);
    this.rabbitMqChannel = await this.rabbitMqConnection.createConfirmChannel();

    this.rabbitMqConnection.on('error', (error) => {
      this.logger.error(`RabbitMQ connection error: ${getErrorMessage(error)}`);
    });
    this.rabbitMqConnection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed');
    });

    this.logger.log('Connected to RabbitMQ');
  }

  private async publishEvent(event: SourceEvent): Promise<void> {
    if (!this.rabbitMqChannel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    const exchange = event.source;
    const routingKey = event.type;
    const queue = `${event.source}.${event.type}`;

    await this.ensureRoute(exchange, queue, routingKey);

    const payload = Buffer.from(JSON.stringify(event.data));

    return new Promise((resolve, reject) => {
      this.rabbitMqChannel?.publish(
        exchange,
        routingKey,
        payload,
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

          this.publishedPerInterval++;
          resolve();
        },
      );
    });
  }

  private ensureRoute(
    exchange: string,
    queue: string,
    routingKey: string,
  ): Promise<void> {
    const routeKey = `${exchange}:${queue}:${routingKey}`;
    const existingSetup = this.routeSetup.get(routeKey);

    if (existingSetup) {
      return existingSetup;
    }

    const setup = this.setupRoute(exchange, queue, routingKey).catch(
      (error) => {
        this.routeSetup.delete(routeKey);
        throw error;
      },
    );

    this.routeSetup.set(routeKey, setup);
    return setup;
  }

  private async setupRoute(
    exchange: string,
    queue: string,
    routingKey: string,
  ): Promise<void> {
    if (!this.rabbitMqChannel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    await this.rabbitMqChannel.assertExchange(exchange, 'topic', {
      durable: true,
    });
    await this.rabbitMqChannel.assertQueue(queue, { durable: true });
    await this.rabbitMqChannel.bindQueue(queue, exchange, routingKey);
  }

  private logPublishedCount(): void {
    this.logger.log({
      message: 'info.published_count',
      publishedCount: this.publishedPerInterval,
      eventsPerSecond:
        this.publishedPerInterval / (this.LOG_INTERVAL_MS / 1000),
    });
    this.publishedPerInterval = 0;
  }
}
