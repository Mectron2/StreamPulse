import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { RabbitmqService } from './rabbitmq.service';

@Module({
  imports: [EventsModule],
  providers: [RabbitmqService],
})
export class RabbitmqModule {}
