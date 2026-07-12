import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { ProcessedEventEntity } from './processed-event.entity';
import { EventsController } from './events.controller';
import { WikimediaEventHandler } from './wikimedia-event.handler';

@Module({
  imports: [TypeOrmModule.forFeature([ProcessedEventEntity])],
  controllers: [EventsController],
  providers: [EventsService, WikimediaEventHandler],
  exports: [EventsService, WikimediaEventHandler],
})
export class EventsModule {}
