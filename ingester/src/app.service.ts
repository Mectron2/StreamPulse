import {
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
  Observable,
  retry,
  Subscriber,
  Subscription,
  timer,
} from 'rxjs';

type WikimediaRecentChange = Record<string, unknown>;

@Injectable()
export class AppService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AppService.name);
  private readonly recentChangesUrl =
    'https://stream.wikimedia.org/v2/stream/recentchange';
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

    this.recentChangesSubscription = this.createRecentChangesStream()
      .pipe(
        mergeMap((event) => from(this.publishRecentChange(event)), 10),
        retry({
          delay: (error: unknown, retryCount: number) => {
            this.logger.warn(
              `Wikimedia stream disconnected, reconnecting in 5s (attempt ${retryCount}): ${this.getErrorMessage(error)}`,
            );

            return timer(5000);
          },
        }),
        catchError((error: unknown) => {
          this.logger.error(
            `Wikimedia stream stopped: ${this.getErrorMessage(error)}`,
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

  private createRecentChangesStream(): Observable<WikimediaRecentChange> {
    return new Observable<WikimediaRecentChange>((subscriber) => {
      const abortController = new AbortController();

      void this.readRecentChanges(abortController.signal, subscriber);

      return () => abortController.abort();
    });
  }

  private async readRecentChanges(
    signal: AbortSignal,
    subscriber: Subscriber<WikimediaRecentChange>,
  ): Promise<void> {
    try {
      const response = await fetch(this.recentChangesUrl, {
        headers: { Accept: 'text/event-stream' },
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Unexpected response ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!subscriber.closed) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        buffer = this.emitBufferedEvents(buffer, subscriber);
      }

      buffer += decoder.decode();
      this.emitBufferedEvents(`${buffer}\n\n`, subscriber);

      if (!subscriber.closed) {
        subscriber.complete();
      }
    } catch (error) {
      if (!signal.aborted && !subscriber.closed) {
        subscriber.error(error);
      }
    }
  }

  private emitBufferedEvents(
    buffer: string,
    subscriber: Subscriber<WikimediaRecentChange>,
  ): string {
    const normalizedBuffer = buffer.replace(/\r\n/g, '\n');
    const events = normalizedBuffer.split('\n\n');
    const remainingBuffer = events.pop() ?? '';

    for (const event of events) {
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');

      if (!data) {
        continue;
      }

      const parsedEvent = JSON.parse(data) as unknown;

      if (this.isRecord(parsedEvent)) {
        subscriber.next(parsedEvent);
      } else {
        this.logger.warn('Received non-object Wikimedia event');
      }
    }

    return remainingBuffer;
  }

  private isRecord(value: unknown): value is WikimediaRecentChange {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
      this.logger.error(
        `RabbitMQ connection error: ${this.getErrorMessage(error)}`,
      );
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

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
