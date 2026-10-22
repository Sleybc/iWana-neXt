import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('uq_sp_order_live', ['tenantId', 'executionOrderId'], {
  unique: true,
  where: '"status" <> \'RELEASED\'',
})
@Index('idx_sp_subscriber', ['tenantId', 'subscriberId'])
@Index('idx_sp_status', ['tenantId', 'status'])
@Entity({ name: 'service_provisionings' })
export class ServiceProvisioning {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'subscriber_id', type: 'uuid' })
  subscriberId: string;

  @Column({ name: 'expediente_id', type: 'uuid', nullable: true })
  expedienteId: string | null;

  @Column({ name: 'contract_id', type: 'uuid', nullable: true })
  contractId: string | null;

  @Column({ name: 'execution_order_id', type: 'uuid' })
  executionOrderId: string;

  @Column({ name: 'execution_order_number', type: 'varchar', length: 40 })
  executionOrderNumber: string;

  @Column({ name: 'router_id', type: 'uuid' })
  routerId: string;

  @Column({ name: 'ipv4_network_id', type: 'uuid' })
  ipv4NetworkId: string;

  @Column({ name: 'ip_assignment_id', type: 'uuid', nullable: true })
  ipAssignmentId: string | null;

  @Column({ name: 'control_method', type: 'varchar', length: 40 })
  controlMethod: string;

  @Column({ name: 'control_params', type: 'jsonb' })
  controlParams: Record<string, unknown>;

  @Column({ name: 'plan_id', type: 'uuid', nullable: true })
  planId: string | null;

  @Column({ name: 'download_mbps', type: 'integer', nullable: true })
  downloadMbps: number | null;

  @Column({ name: 'upload_mbps', type: 'integer', nullable: true })
  uploadMbps: number | null;

  @Column({ name: 'cpe_serial_number', type: 'varchar', length: 120, nullable: true })
  cpeSerialNumber: string | null;

  @Column({ name: 'cpe_mac_address', type: 'varchar', length: 17, nullable: true })
  cpeMacAddress: string | null;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'varchar', length: 16, default: 'NORMAL' })
  origin: string;

  @Column({ name: 'reserved_by', type: 'uuid', nullable: true })
  reservedBy: string | null;

  @Column({ name: 'reserved_at', type: 'timestamptz', nullable: true })
  reservedAt: Date | null;

  @Column({ name: 'certified_by', type: 'uuid', nullable: true })
  certifiedBy: string | null;

  @Column({ name: 'certified_at', type: 'timestamptz', nullable: true })
  certifiedAt: Date | null;

  @Column({ name: 'certification_evidence_id', type: 'uuid', nullable: true })
  certificationEvidenceId: string | null;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt: Date | null;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ name: 'release_reason', type: 'varchar', length: 32, nullable: true })
  releaseReason: string | null;

  @Column({ name: 'regularization_reason', type: 'text', nullable: true })
  regularizationReason: string | null;

  @Column({ name: 'regularized_by', type: 'uuid', nullable: true })
  regularizedBy: string | null;

  @Column({ name: 'regularized_at', type: 'timestamptz', nullable: true })
  regularizedAt: Date | null;

  @Column({ name: 'released_by', type: 'uuid', nullable: true })
  releasedBy: string | null;

  @Column({ name: 'failure_reason', type: 'varchar', length: 64, nullable: true })
  failureReason: string | null;

  @Column({
    name: 'commercial_activation_status',
    type: 'varchar',
    length: 24,
    default: 'NOT_APPLICABLE',
  })
  commercialActivationStatus: string;

  @Column({ name: 'commercial_activation_detail', type: 'varchar', length: 64, nullable: true })
  commercialActivationDetail: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'integer', default: 1 })
  version: number;
}
