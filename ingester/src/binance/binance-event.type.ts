export interface BinanceAggregateTrade {
  readonly e: 'aggTrade';
  readonly E: number;
  readonly s: string;
  readonly a: number;
  readonly p: string;
  readonly q: string;
  readonly f: number;
  readonly l: number;
  readonly T: number;
  readonly m: boolean;
  readonly M: boolean;
}
