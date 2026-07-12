import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BinanceEventHandler } from './binance-event.handler';
import { BinanceTradeEntity } from './binance-trade.entity';
import { BinanceTradesController } from './binance-trades.controller';
import { BinanceTradesService } from './binance-trades.service';

@Module({
  imports: [TypeOrmModule.forFeature([BinanceTradeEntity])],
  controllers: [BinanceTradesController],
  providers: [BinanceTradesService, BinanceEventHandler],
  exports: [BinanceEventHandler],
})
export class BinanceModule {}
