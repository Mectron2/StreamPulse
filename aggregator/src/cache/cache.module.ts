import { Global, Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { RedisCacheService } from './redis-cache.service';

@Global()
@Module({
  controllers: [DashboardController],
  providers: [RedisCacheService],
  exports: [RedisCacheService],
})
export class CacheModule {}
