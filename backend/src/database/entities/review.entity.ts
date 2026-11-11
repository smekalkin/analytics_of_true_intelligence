import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Branch } from './branch.entity';

export enum ReviewStatus {
  New = 'new',
  InProgress = 'in_progress',
  Resolved = 'resolved',
}

export const REVIEW_SOURCES = ['yandex', '2gis', 'google'] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'branch_id', type: 'int' })
  branchId: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({ type: 'varchar', length: 32 })
  source: ReviewSource;

  @Column({ name: 'author_name', length: 200 })
  authorName: string;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'enum', enum: ReviewStatus, enumName: 'review_status', default: ReviewStatus.New })
  status: ReviewStatus;

  @Column({ type: 'text', nullable: true })
  reply: string | null;

  @Column({ name: 'published_at', type: 'timestamptz' })
  publishedAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
