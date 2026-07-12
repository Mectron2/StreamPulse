import { firstValueFrom } from 'rxjs';
import { BinanceSource } from './binance-source';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.OPEN;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  readonly close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSING;
  });

  constructor(url: string | URL) {
    this.url = String(url);
    MockWebSocket.instances.push(this);
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe('BinanceSource', () => {
  const originalWebSocket = global.WebSocket;
  const originalUrl = process.env.BINANCE_WS_URL;

  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    delete process.env.BINANCE_WS_URL;
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;

    if (originalUrl === undefined) {
      delete process.env.BINANCE_WS_URL;
    } else {
      process.env.BINANCE_WS_URL = originalUrl;
    }
  });

  it('normalizes an aggregate trade into a source event', async () => {
    const eventPromise = firstValueFrom(new BinanceSource().connect());
    const socket = MockWebSocket.instances[0];
    const trade = {
      e: 'aggTrade',
      E: 1720000000001,
      s: 'BTCUSDT',
      a: 12345,
      p: '60000.10',
      q: '0.002',
      f: 100,
      l: 101,
      T: 1720000000000,
      m: false,
      M: true,
    };

    socket.emitMessage(JSON.stringify(trade));

    await expect(eventPromise).resolves.toMatchObject({
      source: 'binance',
      type: 'aggTrade',
      occurredAt: new Date(trade.T).toISOString(),
      externalId: '12345',
      data: trade,
    });
    expect(socket.url).toBe(
      'wss://data-stream.binance.vision/ws/btcusdt@aggTrade',
    );
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['invalid JSON', '{invalid'],
    ['missing required fields', JSON.stringify({ e: 'aggTrade', a: 1 })],
  ])('rejects %s', async (_case, payload) => {
    const eventPromise = firstValueFrom(new BinanceSource().connect());
    const socket = MockWebSocket.instances[0];

    socket.emitMessage(payload);

    await expect(eventPromise).rejects.toBeInstanceOf(Error);
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('closes the WebSocket when unsubscribed', () => {
    const subscription = new BinanceSource().connect().subscribe();
    const socket = MockWebSocket.instances[0];

    subscription.unsubscribe();

    expect(socket.close).toHaveBeenCalledTimes(1);
  });
});
