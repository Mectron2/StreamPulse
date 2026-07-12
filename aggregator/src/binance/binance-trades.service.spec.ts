import { Repository } from 'typeorm';
import { BinanceTradeEntity } from './binance-trade.entity';
import { BinanceAggregateTrade } from './binance-trade.type';
import { BinanceTradesService } from './binance-trades.service';

describe('BinanceTradesService', () => {
  const save = jest.fn();
  const service = new BinanceTradesService({
    save,
  } as unknown as Repository<BinanceTradeEntity>);

  beforeEach(() => save.mockReset().mockResolvedValue(undefined));

  it('normalizes and stores an aggregate trade without losing precision', async () => {
    const raw: BinanceAggregateTrade = {
      e: 'aggTrade',
      E: 1720000000001,
      s: 'BTCUSDT',
      a: 12345,
      p: '60000.1234567890',
      q: '0.0001234567',
      f: 100,
      l: 101,
      T: 1720000000000,
      m: true,
      M: true,
    };

    const result = await service.processAndSave(raw);

    expect(result).toEqual({
      source: 'binance',
      type: 'aggTrade',
      id: 'BTCUSDT:12345',
      aggregateTradeId: '12345',
      timestamp: new Date(1720000000000),
      symbol: 'BTCUSDT',
      price: '60000.1234567890',
      quantity: '0.0001234567',
      quoteQuantity: '7.4074172415677625363',
      side: 'sell',
      buyerIsMaker: true,
    });
    expect(save).toHaveBeenCalledWith(result);
  });

  it('marks a trade as buy when the buyer is the taker', async () => {
    const raw = {
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
    } as const;

    await expect(service.processAndSave(raw)).resolves.toMatchObject({
      side: 'buy',
      quoteQuantity: '20',
    });
  });
});
