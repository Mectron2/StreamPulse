import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  getHealth(): { status: string; service: string } {
    return {
      status: 'ok',
      service: 'aggregator',
    };
  }
}
