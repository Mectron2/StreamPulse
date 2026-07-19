import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { BinanceTradesService } from './binance-trades.service';

@Controller('internal/binance/trades')
export class BinanceTradesController {
  constructor(private readonly tradesService: BinanceTradesService) {}

  @Get()
  findAll(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.tradesService.findTrades(
      this.parseLimit(limit),
      cursor ? this.parseCursor(cursor) : undefined,
    );
  }

  private parseLimit(value?: string): number {
    if (value === undefined) return 50;
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 100',
      );
    }
    const limit = Number(value);
    if (limit < 1 || limit > 100) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 100',
      );
    }
    return limit;
  }

  private parseCursor(value: string): { timestamp: Date; id: string } {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      if (
        typeof parsed.timestamp !== 'string' ||
        typeof parsed.id !== 'string' ||
        parsed.id === ''
      ) {
        throw new Error('Invalid payload');
      }
      const timestamp = new Date(parsed.timestamp);
      if (Number.isNaN(timestamp.getTime())) throw new Error('Invalid date');
      return { timestamp, id: parsed.id };
    } catch {
      throw new BadRequestException('cursor is invalid');
    }
  }
}
