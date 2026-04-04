import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'habeas_data_consents' })
@Index('idx_habeas_consents_subscriber', ['subscriberId'])
@Index('idx_habeas_consents_tenant_created', ['tenantId', 'createdAt'])
export class HabeasDataConsent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'subscriber_id' })
  subscriberId: string;

  @Column({ type: 'boolean', name: 'accepted' })
  accepted: boolean;

  @Column({ type: 'varchar', length: 120, name: 'channel' })
  channel: string;

  @Column({ type: 'varchar', length: 64, name: 'ip_address', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', name: 'legal_text_version' })
  legalTextVersion: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
