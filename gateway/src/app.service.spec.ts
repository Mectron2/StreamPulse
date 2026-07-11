import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { AppService } from './app.service';

describe('AppService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('proxies event history query parameters', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    });
    const result = await new AppService().getEvents('25', 'cursor-value');
    expect(result).toEqual({ items: [], nextCursor: null });
    const [url, options] = (global.fetch as jest.MockedFunction<typeof fetch>)
      .mock.calls[0];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).search).toBe('?limit=25&cursor=cursor-value');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('preserves aggregator validation errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({ message: 'cursor is invalid' }),
    });
    await expect(new AppService().getEvents()).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('maps network failures to bad gateway', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(new AppService().getEvents()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
