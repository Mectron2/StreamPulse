import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from './events/events.module';
import { ProcessedEventEntity } from './events/processed-event.entity';
import { HealthController } from './health/health.controller';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { BinanceModule } from './binance/binance.module';
import { BinanceTradeEntity } from './binance/binance-trade.entity';
import { CacheModule } from './cache/cache.module';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      username: process.env.POSTGRES_USER ?? 'stream_pulse',
      password: process.env.POSTGRES_PASSWORD ?? 'stream_pulse',
      database: process.env.POSTGRES_DB ?? 'stream_pulse',
      entities: [ProcessedEventEntity, BinanceTradeEntity],
      synchronize: (process.env.TYPEORM_SYNCHRONIZE ?? 'true') === 'true',
    }),
    ObservabilityModule,
    CacheModule,
    EventsModule,
    BinanceModule,
    RabbitmqModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
