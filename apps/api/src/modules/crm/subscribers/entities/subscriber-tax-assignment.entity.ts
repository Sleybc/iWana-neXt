import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TaxAssignmentRateSource, TaxAssignmentStatus, TaxTreatment } from '@iwana/shared';
import { SubscriberTaxProfile } from './subscriber-tax-profile.entity';

/**
 * Asignación de un tributo específico al suscriptor.
 *
 * Cada fila representa un tributo del catálogo (TaxDefinition) aplicado
 * al cliente con su tasa efectiva, tratamiento y estado de confirmación.
 *
 * taxDefinitionId es una FK lógica a tax_definitions del tenant.
 * No se usa FK física para respetar el boundary entre módulos (ADR-029 §D4):
 * la coherencia se garantiza en la capa de servicio.
 *
 * Ref: spec-2026-04-22 §7.2, §7.3, BT-TAXMVP-01
 */
@Entity({ name: 'subscriber_tax_assignments' })
@Index('idx_sta_profile_id', ['profileId'])
@Index('idx_sta_tenant_definition', ['tenantId', 'taxDefinitionId'])
@Index('uq_sta_profile_definition', ['profileId', 'taxDefinitionId'], { unique: true })
export class SubscriberTaxAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Multi-tenant ──
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'profile_id' })
  profileId: string;

  @ManyToOne(() => SubscriberTaxProfile, (p) => p.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile: SubscriberTaxProfile;

  /**
   * FK lógica a tax_definitions (TaxationModule).
   * No se cruza con la entidad TypeORM de Taxation para respetar boundaries.
   */
  @Column({ type: 'uuid', name: 'tax_definition_id' })
  taxDefinitionId: string;

  /**
   * Snapshot del nombre del tributo al momento de la asignación.
   * Evita depender de JOIN a tax_definitions en lecturas frecuentes.
   */
  @Column({ type: 'varchar', length: 120, name: 'tax_name_snapshot' })
  taxNameSnapshot: string;

  /**
   * Tasa efectiva aplicada al cliente.
   * - null: tributo sin tasa numérica (p.ej. exención total).
   * - Valor: porcentaje con hasta 4 decimales.
   */
  @Column({ type: 'numeric', precision: 7, scale: 4, name: 'effective_rate', nullable: true })
  effectiveRate: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'rate_source',
    default: TaxAssignmentRateSource.CATALOG,
  })
  rateSource: TaxAssignmentRateSource;

  /**
   * Tratamiento tributario efectivo: STANDARD | EXEMPT | EXCLUDED | FIXED.
   * Puede diferir del tratamiento base del catálogo cuando facturación ajusta manualmente.
   */
  @Column({ type: 'varchar', length: 20, name: 'treatment', nullable: true })
  treatment: TaxTreatment | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: TaxAssignmentStatus.SUGGESTED,
  })
  status: TaxAssignmentStatus;

  /**
   * Motivo auditable de la asignación o ajuste.
   * Ejemplo: "Estrato 2 — IVA exento", "Ajuste manual por exención especial".
   */
  @Column({ type: 'varchar', length: 300, name: 'reason', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
