import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExpedienteRecord } from '../../expedientes/entities/expediente-record.entity';

@Entity({ name: 'sales_attributions' })
@Index('idx_sales_attr_tenant_expediente', ['tenantId', 'expedienteId'])
@Index('idx_sales_attr_actor', ['tenantId', 'actorId'])
export class SalesAttribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'expediente_id' })
  expedienteId: string;

  @Column({ type: 'varchar', length: 30, name: 'attribution_role', default: 'ORIGINATOR' })
  attributionRole: string;

  @Column({ type: 'uuid', name: 'actor_id' })
  actorId: string;

  @Column({ type: 'varchar', length: 30, name: 'actor_role' })
  actorRole: string;

  @Column({ type: 'varchar', length: 160, name: 'actor_name' })
  actorName: string;

  @Column({ type: 'varchar', length: 30, name: 'acquisition_channel' })
  acquisitionChannel: string;

  @Column({ type: 'varchar', length: 500, name: 'notes', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamptz', name: 'attributed_at' })
  attributedAt: Date;

  @Column({ type: 'uuid', name: 'attributed_by' })
  attributedBy: string;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', name: 'revoked_by', nullable: true })
  revokedBy: string | null;

  @Column({ type: 'varchar', length: 255, name: 'revoked_reason', nullable: true })
  revokedReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ExpedienteRecord, (expediente) => expediente.salesAttributions)
  @JoinColumn({ name: 'expediente_id' })
  expediente: ExpedienteRecord;
}
