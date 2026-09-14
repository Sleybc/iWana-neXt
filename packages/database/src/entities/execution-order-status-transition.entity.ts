import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ExecutionOrderStatus } from '@iwana/shared';

/**
 * Asiento de transición de estado de la OT de ejecución (MOD11, ADR-089 §D1).
 *
 * Un asiento por cada cambio de estado: estado de origen, estado de destino,
 * instante, actor y motivo cuando lo haya, en ámbito de tenant. Réplica del
 * modelo `StatusChange` del expediente (`apps/api/src/modules/crm/expedientes/
 * entities/status-change.entity.ts`), adaptado a la OT:
 * - Sin `ManyToOne`: las tablas hijas de MOD11 (actividades, consumos,
 *   evidencias) no declaran relaciones TypeORM y la migración no crea FK;
 *   el vínculo es lógico por `execution_order_id` + `tenant_id`.
 * - Sin `metadataJson`: el motivo estructurado viaja en `reason` (código o
 *   nota recortada a 255); los payloads de comando ya viven en el outbox
 *   y la finalidad de este registro no los justifica (ADR-067 §3).
 * - Sin duraciones calculadas (ADR-089 §D2/R5): el tiempo bloqueado y el
 *   total se derivan ordenando por `changed_at`; persistirlos congelaría
 *   la política de cómputo en el dato.
 *
 * El registro es inmutable por convención de servicio: ningún código
 * productivo edita ni borra asientos; la corrección es aditiva (B2).
 *
 * Adenda B1c (spec §4.3, ADR-089 §D3): `correctionOfId` referencia al asiento
 * corregido. Vínculo LÓGICO sin FK —misma convención que `executionOrderId`—:
 * la tabla vive por schema de tenant y una FK no aporta integridad
 * cross-schema; la inmutabilidad la sostiene el servicio, no la base.
 * NULL = asiento original, nunca corrección.
 */
@Index('idx_execution_order_transitions_order', ['tenantId', 'executionOrderId'])
@Index('idx_execution_order_transitions_order_changed_at', [
  'tenantId',
  'executionOrderId',
  'changedAt',
])
@Entity({ name: 'execution_order_status_transitions' })
export class ExecutionOrderStatusTransition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'execution_order_id', type: 'uuid' })
  executionOrderId: string;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: ExecutionOrderStatus,
    enumName: 'execution_order_status',
  })
  fromStatus: ExecutionOrderStatus;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: ExecutionOrderStatus,
    enumName: 'execution_order_status',
  })
  toStatus: ExecutionOrderStatus;

  @Column({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;

  /**
   * Actor del asiento. Anulable desde la migración 134 (retención MOD11,
   * dictamen B3 exigencia 3, spec §4.3):
   * - UUID real = asiento vigente con autoría.
   * - `00000000-0000-0000-0000-000000000000` (centinela) = anonimizado por
   *   vencimiento (24 meses post-cierre); irreversible.
   * - NULL = nunca se registró (reservado a vías futuras; la purga nunca
   *   escribe NULL ni toca filas NULL, CA-07).
   *
   * La escritura T1 sigue exigiendo actor siempre (el servicio no acepta
   * ausente); la nulabilidad es mecanismo de retención, no permiso de omisión.
   */
  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedBy: string | null;

  @Column({ name: 'reason', type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @Column({ name: 'correction_of_id', type: 'uuid', nullable: true })
  correctionOfId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
