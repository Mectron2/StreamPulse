import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('events')
  getEvents(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.appService.getEvents(limit, cursor);
  }
}
