import { BadRequestException } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

describe('EventsController', () => {
  const findProcessedEvents = jest.fn();
  const controller = new EventsController({
    findProcessedEvents,
  } as unknown as EventsService);

  beforeEach(() => findProcessedEvents.mockReset());

  it('uses the default page size', async () => {
    findProcessedEvents.mockResolvedValue({ items: [], nextCursor: null });
    await controller.findAll();
    expect(findProcessedEvents).toHaveBeenCalledWith(50, undefined);
  });

  it('decodes a cursor', async () => {
    findProcessedEvents.mockResolvedValue({ items: [], nextCursor: null });
    const cursor = Buffer.from(
      JSON.stringify({ timestamp: '2026-07-11T12:00:00.000Z', id: '42' }),
    ).toString('base64url');
    await controller.findAll('25', cursor);
    expect(findProcessedEvents).toHaveBeenCalledWith(25, {
      timestamp: new Date('2026-07-11T12:00:00.000Z'),
      id: '42',
    });
  });

  it.each(['0', '101', '1.5', 'abc'])('rejects invalid limit %s', (limit) => {
    expect(() => controller.findAll(limit)).toThrow(BadRequestException);
  });

  it('rejects an invalid cursor', () => {
    expect(() => controller.findAll(undefined, 'invalid')).toThrow(
      BadRequestException,
    );
  });
});
