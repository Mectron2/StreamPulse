import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class AppService {
  private readonly aggregatorUrl =
    process.env.AGGREGATOR_URL ?? 'http://localhost:3001';
  private readonly timeoutMs = Number(
    process.env.AGGREGATOR_REQUEST_TIMEOUT_MS ?? 5000,
  );

  getHealth() {
    return { status: 'ok', service: 'gateway' };
  }

  async getEvents(limit?: string, cursor?: string): Promise<unknown> {
    const url = new URL('/internal/events', this.aggregatorUrl);
    if (limit !== undefined) url.searchParams.set('limit', limit);
    if (cursor !== undefined) url.searchParams.set('cursor', cursor);

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const body = (await response.json()) as unknown;
      if (response.status === 400) throw new BadRequestException(body);
      if (!response.ok)
        throw new BadGatewayException('Aggregator request failed');
      return body;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }
      throw new BadGatewayException('Aggregator is unavailable');
    }
  }
}
