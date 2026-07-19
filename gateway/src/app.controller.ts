import { Controller, Get, Header, Query } from '@nestjs/common';
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

  @Get('dashboard')
  @Header('Cache-Control', 'public, max-age=2, stale-while-revalidate=5')
  getDashboard() {
    return this.appService.getDashboard();
  }

  @Get('binance/trades')
  getBinanceTrades(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.appService.getBinanceTrades(limit, cursor);
  }
}
