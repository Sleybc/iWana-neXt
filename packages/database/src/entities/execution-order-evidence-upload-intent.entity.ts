import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Estados persistibles del intento de upload de evidencia.
 *
 * Son un SUPERCONJUNTO de los cuatro estados del recibo público
 * (`EvidenceAssetReceipt.status` en `@iwana/shared`): añaden las dos fases que
 * el intento vive ANTES de que Media/Assets exista como asset — ADR-068 §48,
 * "MOD11 crea un upload-intent tenant-aware con `intentId`; Media/Assets genera
 * `mediaAssetId`".
 *
 * - `PENDING`  — clave reservada, binario aún no subido (`mediaAssetId` nulo).
 * - `FAILED`   — la subida a Media falló definitivamente (`mediaAssetId` nulo).
 *
 * Ninguno de los dos alcanza el contrato público: `toEvidenceAssetReceipt`
 * rechaza con 409 cualquier intento sin `mediaAssetId`, y ambos lo tienen nulo
 * por construcción. El CHECK de la tabla debe aceptar los seis.
 */
export const EXECUTION_ORDER_EVIDENCE_UPLOAD_INTENT_STATUSES = [
  'PENDING',
  'PENDING_ANALYSIS',
  'AVAILABLE',
  'REJECTED',
  'EXPIRED',
  'FAILED',
] as const;

export type ExecutionOrderEvidenceUploadIntentStatus =
  (typeof EXECUTION_ORDER_EVIDENCE_UPLOAD_INTENT_STATUSES)[number];

/**
 * Intento durable de subida de asset de evidencia.
 *
 * ADR-068: MOD11 conserva el intento de upload en el schema del tenant.
 * El binario y metadata técnica viven en Media/Assets (public.media_assets).
 * Este registro permite:
 * - Autorizar polling por intentId sin exponer mediaAssetIds ajenos.
 * - Reconciliar assets de Media con intents pendientes.
 * - Trazar quién inició la subida y cuándo vence.
 */
@Index('idx_execution_order_evidence_upload_intents_order', ['executionOrderId', 'createdAt'])
@Index('idx_execution_order_evidence_upload_intents_media_asset', ['tenantId', 'mediaAssetId'])
@Entity({ name: 'execution_order_evidence_upload_intents' })
export class ExecutionOrderEvidenceUploadIntent {
  /** UUID que actúa como intentId público del recibo. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'execution_order_id', type: 'uuid' })
  executionOrderId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Media asset vinculado; puede ser null mientras se crea el registro en Media. */
  @Column({ name: 'media_asset_id', type: 'uuid', nullable: true })
  mediaAssetId: string | null;

  /** Estado del intento; ver {@link EXECUTION_ORDER_EVIDENCE_UPLOAD_INTENT_STATUSES}. */
  @Column({ name: 'status', type: 'varchar', length: 32 })
  status: ExecutionOrderEvidenceUploadIntentStatus;

  /** Vencimiento del intento no reclamado. */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
