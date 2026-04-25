import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OpportunityStage } from '../../enums/opportunity-stage.enum';

@Entity({ name: 'opportunities' })
@Index('idx_opportunities_tenant_stage', ['tenantId', 'stage'])
@Index('idx_opportunities_lead', ['leadId'])
export class Opportunity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'lead_id', nullable: true })
  leadId: string | null;

  @Column({ type: 'uuid', name: 'subscriber_id', nullable: true })
  subscriberId: string | null;

  @Column({ type: 'varchar', length: 180, name: 'title' })
  title: string;

  @Column({
    type: 'enum',
    enum: OpportunityStage,
    name: 'stage',
    default: OpportunityStage.DISCOVERY,
  })
  stage: OpportunityStage;

  @Column({ type: 'int', name: 'probability', default: 0 })
  probability: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'estimated_amount', nullable: true })
  estimatedAmount: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
