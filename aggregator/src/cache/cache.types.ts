import { ProcessedBinanceTrade } from '../binance/binance-trade.type';
import { ProcessedEvent } from '../events/processed-event.type';

export type CacheableProcessedEvent = ProcessedEvent | ProcessedBinanceTrade;

export type ActivityWindow = {
  lastMinute: number;
  lastHour: number;
};

export type DashboardSnapshot = {
  cacheAvailable: boolean;
  generatedAt: string;
  activity: ActivityWindow & {
    bySource: {
      wikimedia: ActivityWindow;
      binance: ActivityWindow;
    };
  };
  topPages: Array<{
    title: string;
    wiki: string;
    domain: string;
    changes: number;
  }>;
  recent: {
    wikimedia: ProcessedEvent[];
    binance: ProcessedBinanceTrade[];
  };
};
