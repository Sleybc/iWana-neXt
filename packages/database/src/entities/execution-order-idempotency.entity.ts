import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Index('uq_execution_order_idempotency_key', ['tenantId', 'operation', 'keyHmac'], { unique: true })
@Entity({ name: 'execution_order_idempotency_records' })
export class ExecutionOrderIdempotencyRecord {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ name: 'operation', type: 'varchar', length: 120 }) operation: string;
  @Column({ name: 'key_id', type: 'varchar', length: 40 }) keyId: string;
  @Column({ name: 'key_hmac', type: 'char', length: 64 }) keyHmac: string;
  @Column({ name: 'payload_hmac', type: 'char', length: 64 }) payloadHmac: string;
  @Column({ name: 'intent_id', type: 'uuid' }) intentId: string;
  @Column({ name: 'resource_ref', type: 'varchar', length: 160, nullable: true }) resourceRef:
    | string
    | null;
  /** Relación autoritativa con el intent de evidencia (FK ON DELETE RESTRICT, migración 100). */
  @Index('idx_execution_order_idempotency_evidence_intent', ['evidenceUploadIntentId'], {
    where: 'evidence_upload_intent_id IS NOT NULL',
  })
  @Column({ name: 'evidence_upload_intent_id', type: 'uuid', nullable: true })
  evidenceUploadIntentId: string | null;
  @Column({ name: 'result_code', type: 'varchar', length: 64, nullable: true }) resultCode:
    | string
    | null;
  @Column({ name: 'result_status', type: 'varchar', length: 32, default: 'PENDING' })
  resultStatus: string;
  @Column({ name: 'resource_version', type: 'integer', nullable: true }) resourceVersion:
    | number
    | null;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ name: 'tombstoned_at', type: 'timestamptz', nullable: true }) tombstonedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
