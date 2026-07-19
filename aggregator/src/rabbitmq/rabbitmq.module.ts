import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { RabbitmqService } from './rabbitmq.service';
import { BinanceModule } from '../binance/binance.module';
import { WikimediaEventHandler } from '../events/wikimedia-event.handler';
import { BinanceEventHandler } from '../binance/binance-event.handler';
import { EVENT_HANDLERS, EventHandler } from './event-handler.interface';

@Module({
  imports: [EventsModule, BinanceModule],
  providers: [
    RabbitmqService,
    {
      provide: EVENT_HANDLERS,
      useFactory: (
        wikimedia: WikimediaEventHandler,
        binance: BinanceEventHandler,
      ): EventHandler[] => [wikimedia, binance],
      inject: [WikimediaEventHandler, BinanceEventHandler],
    },
  ],
})
export class RabbitmqModule {}
