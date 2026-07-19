import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { WikimediaSource } from './wikimedia/wikimedia-source';
import EventSource, { EVENT_SOURCES } from './event-source.interface';
import { BinanceSource } from './binance/binance-source';

const eventSourceProviders = [WikimediaSource, BinanceSource];

@Module({
  imports: [],
  providers: [
    AppService,
    ...eventSourceProviders,
    {
      provide: EVENT_SOURCES,
      useFactory: (...sources: EventSource[]): EventSource[] => sources,
      inject: eventSourceProviders,
    },
  ],
  exports: [EVENT_SOURCES],
})
export class AppModule {}
