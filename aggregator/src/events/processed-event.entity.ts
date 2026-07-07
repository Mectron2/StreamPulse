import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { ProcessedEventType, WikimediaProject } from './processed-event.type';

@Entity({ name: 'processed_events' })
export class ProcessedEventEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id!: string;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @Column({ type: 'varchar', length: 64 })
  wiki!: string;

  @Column({ type: 'varchar', length: 255 })
  domain!: string;

  @Column({ type: 'varchar', length: 32 })
  project!: WikimediaProject;

  @Column({ type: 'varchar', length: 32 })
  type!: ProcessedEventType;

  @Column({ type: 'integer' })
  namespace!: number;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  titleUrl?: string;

  @Column({ type: 'text' })
  user!: string;

  @Column({ type: 'boolean' })
  isBot!: boolean;

  @Column({ type: 'boolean' })
  isMinor!: boolean;

  @Column({ type: 'boolean', nullable: true })
  isPatrolled?: boolean;

  @Column({ type: 'integer', nullable: true })
  oldLength?: number;

  @Column({ type: 'integer', nullable: true })
  newLength?: number;

  @Column({ type: 'integer' })
  diffSize!: number;

  @Column({ type: 'text' })
  comment!: string;

  @Column({ type: 'text', array: true, default: '{}' })
  tags!: string[];

  @Column({ type: 'integer' })
  riskScore!: number;

  @Column({ type: 'integer' })
  importanceScore!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
