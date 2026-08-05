import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NonRealizationCauseCategory } from '@iwana/shared';

/**
 * Entidad NonRealizationCause — taxonomía de causa de no realización de visita.
 *
 * Schema por tenant (dinámico vía SET LOCAL search_path).
 * ADR-077 D1, MOD09-CICLO-VISITA F2.1.
 *
 * Define el comportamiento de cada causa:
 * - category: si consume intento (CUSTOMER) o no (OPERATIONAL, FORCE_MAJEURE)
 * - requiresEvidence: si el SLA solo se pausa con evidencia
 * - pausesSla: si la causa pausa el reloj de SLA
 * - closesWork: si la causa puede cerrar el trabajo al agotar intentos
 */
@Index('uq_non_realization_causes_tenant_code', ['tenantId', 'code'], { unique: true })
@Entity({ name: 'non_realization_causes' })
export class NonRealizationCause {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Código único por tenant — ej: CUSTOMER_ABSENT, ADDRESS_NOT_FOUND */
  @Column({ type: 'varchar', length: 50 })
  code: string;

  /** Etiqueta legible en español — ej: "Cliente ausente" */
  @Column({ type: 'varchar', length: 160 })
  label: string;

  @Column({ type: 'enum', enum: NonRealizationCauseCategory })
  category: NonRealizationCauseCategory;

  /** Si true, el SLA solo se pausa si hay evidencia adjunta */
  @Column({ name: 'requires_evidence', type: 'boolean', default: false })
  requiresEvidence: boolean;

  /** Si true, esta causa pausa el reloj de SLA */
  @Column({ name: 'pauses_sla', type: 'boolean', default: false })
  pausesSla: boolean;

  /** Si true, cierra el trabajo tras alcanzar el límite de intentos */
  @Column({ name: 'closes_work', type: 'boolean', default: false })
  closesWork: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
