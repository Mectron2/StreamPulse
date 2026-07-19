import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async getMetrics(@Res({ passthrough: true }) response: Response) {
    response.type(this.metrics.contentType);
    return this.metrics.render();
  }
}
