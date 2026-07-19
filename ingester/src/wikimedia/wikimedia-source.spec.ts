import { firstValueFrom } from 'rxjs';
import { WikimediaSource } from './wikimedia-source';

describe('WikimediaSource', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes a Wikimedia SSE message into a source event', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          'data: {"id":42,"title":"Bridge","meta":{"dt":"2026-07-12T10:00:00.000Z"}}\n\n',
          { status: 200 },
        ),
      );

    const event = await firstValueFrom(new WikimediaSource().connect());

    expect(event).toMatchObject({
      source: 'wikimedia',
      type: 'recentchange',
      occurredAt: '2026-07-12T10:00:00.000Z',
      externalId: '42',
      data: {
        id: 42,
        title: 'Bridge',
      },
    });
    expect(Date.parse(event.ingestedAt)).not.toBeNaN();
  });

  it('rejects a non-object source payload', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('data: [1,2,3]\n\n', { status: 200 }));

    await expect(
      firstValueFrom(new WikimediaSource().connect()),
    ).rejects.toThrow('no elements in sequence');
  });
});
