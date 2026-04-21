import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tabla puente entre TaxRule (CommercialModule) y TaxDefinition (TaxationModule).
 * La FK hacia tax_definitions es lógica (sin constraint físico) para respetar
 * el boundary entre bounded contexts.
 *
 * treatment: tratamiento tributario aplicado a la combinación regla+impuesto.
 * rateOverride: sobreescribe la tasa base del catálogo (null = usar baseRate de TaxDefinition).
 * priority: permite ordenar múltiples aplicaciones de la misma regla.
 *
 * Ref: HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum §4, ADR-031 §D5, migración 023
 */
@Entity({ name: 'tax_rule_applications' })
@Index('idx_tax_rule_applications_lookup', ['tenantId', 'taxRuleId', 'isActive'])
export class TaxRuleApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  /** FK lógica a tax_rules (CommercialModule — misma bounded context). */
  @Column({ type: 'uuid', name: 'tax_rule_id' })
  taxRuleId: string;

  /** FK lógica cross-module hacia tax_definitions (TaxationModule — solo ID, sin join). */
  @Column({ type: 'uuid', name: 'tax_definition_id' })
  taxDefinitionId: string;

  /** Tratamiento tributario: STANDARD | EXEMPT | EXCLUDED | FIXED. */
  @Column({ type: 'varchar', length: 20, name: 'treatment' })
  treatment: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';

  /**
   * Override de tasa porcentual.
   * null = usar baseRate de TaxDefinition en TaxationModule.
   */
  @Column({ type: 'numeric', precision: 5, scale: 2, name: 'rate_override', nullable: true })
  rateOverride: string | null;

  @Column({ type: 'smallint', name: 'priority', default: 0 })
  priority: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
