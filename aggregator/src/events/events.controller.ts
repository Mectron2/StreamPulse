import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { EventsService } from './events.service';

type EventCursor = { timestamp: Date; id: string };

@Controller('internal/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findAll(
    @Query('limit') limitValue?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.eventsService.findProcessedEvents(
      this.parseLimit(limitValue),
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

  private parseCursor(value: string): EventCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as unknown;
      if (!this.isCursorPayload(parsed)) throw new Error('Invalid payload');
      const timestamp = new Date(parsed.timestamp);
      if (Number.isNaN(timestamp.getTime()))
        throw new Error('Invalid timestamp');
      return { timestamp, id: parsed.id };
    } catch {
      throw new BadRequestException('cursor is invalid');
    }
  }

  private isCursorPayload(
    value: unknown,
  ): value is { timestamp: string; id: string } {
    const record = value as Record<string, unknown> | null;
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof record?.timestamp === 'string' &&
      typeof record.id === 'string' &&
      record.id !== ''
    );
  }
}
