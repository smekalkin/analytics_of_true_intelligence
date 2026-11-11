import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from './branch.entity';
import { numericTransformer } from './numeric.transformer';

/** Ежедневный срез показателей филиала на геосервисах. Одна строка на (филиал, дата). */
@Entity('daily_metrics')
@Unique('daily_metrics_branch_date_uq', ['branchId', 'date'])
export class DailyMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'branch_id', type: 'int' })
  branchId: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  /** YYYY-MM-DD */
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 0 })
  views: number;

  @Column({ name: 'website_clicks', type: 'int', default: 0 })
  websiteClicks: number;

  @Column({ type: 'int', default: 0 })
  calls: number;

  @Column({ type: 'int', default: 0 })
  routes: number;

  /** Рейтинг карточки на конец дня (1.00–5.00). */
  @Column({ type: 'numeric', precision: 3, scale: 2, nullable: true, transformer: numericTransformer })
  rating: number | null;

  /** Количество новых отзывов за день. */
  @Column({ name: 'reviews_count', type: 'int', default: 0 })
  reviewsCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
