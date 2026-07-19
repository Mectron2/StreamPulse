import { Controller, Get } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service';

@Controller('internal/dashboard')
export class DashboardController {
  constructor(private readonly cache: RedisCacheService) {}

  @Get()
  getDashboard() {
    return this.cache.getDashboardSnapshot();
  }
}
