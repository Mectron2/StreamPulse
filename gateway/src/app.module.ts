import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LiveGateway } from './live/live.gateway';
import { RabbitmqService } from './rabbitmq/rabbitmq.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, LiveGateway, RabbitmqService],
})
export class AppModule {}
