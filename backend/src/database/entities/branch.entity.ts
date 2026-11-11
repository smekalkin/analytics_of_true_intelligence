import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Company } from './company.entity';

@Entity('branches')
export class Branch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @ManyToOne(() => Company, (company) => company.branches, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 100 })
  city: string;

  @Column({ length: 300 })
  address: string;

  /** Идентификатор локации во внешнем геосервисе; NULL — филиал не подключён к синхронизации. */
  @Column({ name: 'external_id', type: 'varchar', length: 64, nullable: true, unique: true })
  externalId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
