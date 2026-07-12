import { BinanceTradesService } from './binance-trades.service';
import { BinanceEventHandler } from './binance-event.handler';

describe('BinanceEventHandler', () => {
  const processAndSave = jest.fn();
  const handler = new BinanceEventHandler({
    processAndSave,
  } as unknown as BinanceTradesService);

  beforeEach(() => processAndSave.mockReset());

  it('delegates a valid aggTrade payload', async () => {
    const payload = {
      e: 'aggTrade',
      E: 1,
      s: 'BTCUSDT',
      a: 2,
      p: '10',
      q: '2',
      f: 1,
      l: 1,
      T: 1,
      m: false,
      M: true,
    };
    processAndSave.mockResolvedValue({ id: 'BTCUSDT:2' });

    await expect(handler.process(payload)).resolves.toEqual({
      id: 'BTCUSDT:2',
    });
    expect(processAndSave).toHaveBeenCalledWith(payload);
  });

  it('discards an invalid payload', async () => {
    await expect(handler.process({ e: 'aggTrade' })).resolves.toBeNull();
    expect(processAndSave).not.toHaveBeenCalled();
  });
});
