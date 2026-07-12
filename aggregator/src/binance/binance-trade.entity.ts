import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'processed_binance_trades' })
export class BinanceTradeEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id!: string;

  @Column({ type: 'varchar', length: 32, default: 'binance' })
  source!: 'binance';

  @Column({ type: 'varchar', length: 32, default: 'aggTrade' })
  type!: 'aggTrade';

  @Column({ type: 'bigint' })
  aggregateTradeId!: string;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @Column({ type: 'varchar', length: 32 })
  symbol!: string;

  @Column({ type: 'numeric', precision: 30, scale: 10 })
  price!: string;

  @Column({ type: 'numeric', precision: 30, scale: 10 })
  quantity!: string;

  @Column({ type: 'numeric', precision: 40, scale: 20 })
  quoteQuantity!: string;

  @Column({ type: 'varchar', length: 4 })
  side!: 'buy' | 'sell';

  @Column({ type: 'boolean' })
  buyerIsMaker!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
