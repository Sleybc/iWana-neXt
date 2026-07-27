import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExecutionOrderTemplateVersion } from './execution-order-template-version.entity';

/**
 * Requisito declarativo de una versión de plantilla.
 *
 * Cada fila define una condición que debe cumplirse para cerrar la OT.
 * El evaluador usa `kind` para decidir qué subconjunto de `config` aplica.
 *
 * Schema declarativo, determinista. No contiene expresiones ejecutables
 * ni componentes arbitrarios (per spec UX §5).
 *
 * Kinds discriminados (contrato tipado @iwana/shared):
 * - FIELD:       campo de datos libre (TEXT, NUMBER, BOOLEAN, SELECT)
 * - ACTIVITY:    al menos una actividad del tipo especificado
 * - MEASUREMENT: medición registrada con valor
 * - EVIDENCE:    evidencia de tipo photo/document/signature vinculada
 * - MATERIAL:    item consumido de la categoría indicada
 * - COMPLIANCE:  artefacto de aceptación del cliente o política de cierre
 */
@Entity({ name: 'execution_order_template_requirements' })
export class ExecutionOrderTemplateRequirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'version_id', type: 'uuid' })
  versionId: string;

  /** Clave única dentro de la versión (e.g., "firma-cliente", "foto-cpe"). */
  @Column({ type: 'varchar', length: 64 })
  key: string;

  /** Etiqueta visible para el ejecutor. */
  @Column({ type: 'varchar', length: 200 })
  label: string;

  /** Si es obligatorio, el gate no deja cerrar sin él. */
  @Column({ type: 'boolean', default: true })
  required: boolean;

  /**
   * Tipo de requisito; determina cómo se evalúa.
   * FIELD | ACTIVITY | MEASUREMENT | EVIDENCE | MATERIAL | COMPLIANCE
   */
  @Column({ type: 'varchar', length: 20 })
  kind: 'FIELD' | 'ACTIVITY' | 'MEASUREMENT' | 'EVIDENCE' | 'MATERIAL' | 'COMPLIANCE';

  /**
   * Configuración específica del requisito según kind (JSONB).
   *
   * - FIELD:       { fieldType: 'TEXT'|'NUMBER'|'BOOLEAN'|'SELECT', options?: string[] }
   * - ACTIVITY:    { activityType: string }
   * - MEASUREMENT: { measurement: 'NUMBER'|'TEXT', unit?: string }
   * - EVIDENCE:    { evidenceType: 'PHOTO'|'DOCUMENT'|'SIGNATURE' }
   * - MATERIAL:    { itemCategory: string }
   * - COMPLIANCE:  { policyKey: string }
   */
  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, unknown> | null;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ExecutionOrderTemplateVersion, (version) => version.requirements, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'version_id' })
  version: ExecutionOrderTemplateVersion;
}
