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
  mergeMap,
  retry,
  Subscription,
  timer,
} from 'rxjs';
import { EVENT_SOURCE } from './event-source.interface';
import EventSource from './event-source.interface';
import { getErrorMessage } from './utils/misc';
import { WikimediaRecentChange } from './wikimedia/wikimedia-event.type';

@Injectable()
export class AppService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(
    @Inject(EVENT_SOURCE)
    private readonly eventSource: EventSource<WikimediaRecentChange>,
  ) {}

  private readonly logger = new Logger(AppService.name);
  private readonly rabbitMqUrl =
    process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
  private readonly rabbitMqExchange =
    process.env.RABBITMQ_EXCHANGE ?? 'wikimedia';
  private readonly rabbitMqQueue =
    process.env.RABBITMQ_QUEUE ?? 'wikimedia.recentchange';
  private readonly rabbitMqRoutingKey =
    process.env.RABBITMQ_ROUTING_KEY ?? 'recentchange';

  private recentChangesSubscription?: Subscription;
  private rabbitMqConnection?: ChannelModel;
  private rabbitMqChannel?: ConfirmChannel;
  private publishedPerInterval = 0;
  private readonly LOG_INTERVAL_MS = 60000;
  private intervalRef?: ReturnType<typeof setInterval>;

  async onApplicationBootstrap(): Promise<void> {
    await this.connectRabbitMq();
    this.intervalRef = setInterval(
      () => this.logPublishedCount(),
      this.LOG_INTERVAL_MS,
    );

    this.recentChangesSubscription = this.eventSource
      .connect()
      .pipe(
        mergeMap((event) => from(this.publishRecentChange(event)), 10),
        retry({
          delay: (error: unknown, retryCount: number) => {
            this.logger.warn(
              `Wikimedia stream disconnected, reconnecting in 5s (attempt ${retryCount}): ${getErrorMessage(error)}`,
            );

            return timer(5000);
          },
        }),
        catchError((error: unknown) => {
          this.logger.error(
            `Wikimedia stream stopped: ${getErrorMessage(error)}`,
          );

          return EMPTY;
        }),
      )
      .subscribe();
  }

  async onApplicationShutdown(): Promise<void> {
    this.recentChangesSubscription?.unsubscribe();

    await this.rabbitMqChannel?.close();
    await this.rabbitMqConnection?.close();
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
    }
  }

  private async connectRabbitMq(): Promise<void> {
    this.rabbitMqConnection = await connect(this.rabbitMqUrl);
    this.rabbitMqChannel = await this.rabbitMqConnection.createConfirmChannel();

    await this.rabbitMqChannel.assertExchange(this.rabbitMqExchange, 'topic', {
      durable: true,
    });
    await this.rabbitMqChannel.assertQueue(this.rabbitMqQueue, {
      durable: true,
    });
    await this.rabbitMqChannel.bindQueue(
      this.rabbitMqQueue,
      this.rabbitMqExchange,
      this.rabbitMqRoutingKey,
    );

    this.rabbitMqConnection.on('error', (error) => {
      this.logger.error(`RabbitMQ connection error: ${getErrorMessage(error)}`);
    });
    this.rabbitMqConnection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed');
    });

    this.logger.log(
      `Connected to RabbitMQ exchange "${this.rabbitMqExchange}", queue "${this.rabbitMqQueue}"`,
    );
  }

  private publishRecentChange(event: WikimediaRecentChange): Promise<void> {
    if (!this.rabbitMqChannel) {
      return Promise.reject(new Error('RabbitMQ channel is not initialized'));
    }

    const payload = Buffer.from(JSON.stringify(event));

    return new Promise((resolve, reject) => {
      this.rabbitMqChannel?.publish(
        this.rabbitMqExchange,
        this.rabbitMqRoutingKey,
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
