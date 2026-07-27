import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Index('idx_execution_order_evidence_order', ['executionOrderId', 'createdAt'])
@Index('uq_execution_order_evidence_tenant_media_asset', ['tenantId', 'mediaAssetId'], {
  unique: true,
})
@Entity({ name: 'execution_order_evidence' })
export class ExecutionOrderEvidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'execution_order_id', type: 'uuid' })
  executionOrderId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'evidence_type', type: 'varchar', length: 64 })
  evidenceType: string;

  /** DATA-P1-2: Vinculo con el asset de media validado. Unico por tenant. */
  @Column({ name: 'media_asset_id', type: 'uuid', nullable: true })
  mediaAssetId: string | null;

  /** Clave del requisito de plantilla que esta evidencia satisface. */
  @Column({ name: 'requirement_key', type: 'varchar', length: 64, nullable: true })
  requirementKey: string | null;

  @Column({ name: 'file_name', type: 'varchar', length: 200, nullable: true })
  fileName: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /**
   * Estado del asset vinculado: PENDING_ANALYSIS mientras Media lo analiza,
   * AVAILABLE cuando puede servirse, REJECTED o EXPIRED cuando no es válido.
   */
  @Column({ name: 'asset_status', type: 'varchar', length: 32, nullable: true })
  assetStatus: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
