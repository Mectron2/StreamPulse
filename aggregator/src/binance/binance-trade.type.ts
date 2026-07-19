export interface BinanceAggregateTrade {
  e: 'aggTrade';
  E: number;
  s: string;
  a: number;
  p: string;
  q: string;
  f: number;
  l: number;
  T: number;
  m: boolean;
  M: boolean;
}

export interface ProcessedBinanceTrade {
  source: 'binance';
  type: 'aggTrade';
  id: string;
  aggregateTradeId: string;
  timestamp: Date;
  symbol: string;
  price: string;
  quantity: string;
  quoteQuantity: string;
  side: 'buy' | 'sell';
  buyerIsMaker: boolean;
}
