import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'crm_lifecycle_changes' })
@Index('idx_lifecycle_subscriber', ['tenantId', 'subscriberId', 'changedAt'])
export class CrmLifecycleChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 16, name: 'entity_type' })
  entityType: 'SUBSCRIBER' | 'CONTRACT';

  @Column({ type: 'uuid', name: 'entity_id' })
  entityId: string;

  @Column({ type: 'uuid', name: 'subscriber_id' })
  subscriberId: string;

  @Column({ type: 'varchar', length: 30, name: 'from_status' })
  fromStatus: string;

  @Column({ type: 'varchar', length: 30, name: 'to_status' })
  toStatus: string;

  @Column({ type: 'varchar', length: 40, name: 'reason_code' })
  reasonCode: string;

  @Column({ type: 'text', name: 'note_encrypted', nullable: true })
  noteEncrypted: string | null;

  @Column({ type: 'boolean', name: 'contract_scope_explicit', default: false })
  contractScopeExplicit: boolean;

  @Column({ type: 'varchar', length: 16 })
  source: 'MANUAL' | 'SYSTEM' | 'BILLING';

  @Column({ type: 'uuid', name: 'batch_id' })
  batchId: string;

  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  actorId: string | null;

  @CreateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;
}
