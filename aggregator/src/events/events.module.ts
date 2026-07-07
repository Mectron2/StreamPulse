import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { ProcessedEventEntity } from './processed-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProcessedEventEntity])],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
