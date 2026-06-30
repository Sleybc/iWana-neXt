import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuoteStatus } from '../../enums/quote-status.enum';

@Entity({ name: 'quotes' })
@Index('idx_quotes_tenant_status', ['tenantId', 'status'])
@Index('idx_quotes_opportunity', ['opportunityId'])
@Index('idx_quotes_expediente', ['expedienteId'])
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'opportunity_id', nullable: true })
  opportunityId: string | null;

  @Column({ type: 'uuid', name: 'expediente_id', nullable: true })
  expedienteId: string | null;

  @Column({ type: 'uuid', name: 'subscriber_id', nullable: true })
  subscriberId: string | null;

  @Column({ type: 'varchar', length: 120, name: 'plan_id' })
  planId: string;

  @Column({ type: 'jsonb', name: 'plan_snapshot_json' })
  planSnapshotJson: Record<string, unknown>;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'monthly_amount' })
  monthlyAmount: string;

  @Column({ type: 'enum', enum: QuoteStatus, name: 'status', default: QuoteStatus.DRAFT })
  status: QuoteStatus;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
