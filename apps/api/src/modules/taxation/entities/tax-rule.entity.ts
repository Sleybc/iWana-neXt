import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CustomerSegment, TaxType } from '@iwana/shared';

/**
 * Regla tributaria configurable por el administrador del tenant.
 * Permite definir tasas de IVA, retención e ICA según:
 * - segmento de cliente
 * - rango de estrato socioeconómico (stratum_from/stratum_to — modelo vigente)
 * - municipio (código DANE)
 *
 * Vigente desde valid_from hasta valid_to (null = sin vencimiento).
 * Las tasas deben ser configurables por UI: no hardcodear aquí.
 *
 * Nota: la columna tax_classification_id persiste en DB (relación histórica)
 * pero la FK fue eliminada en migration 025 junto con la tabla tax_classifications.
 */
@Entity({ name: 'tax_rules' })
@Index('idx_tax_rules_lookup', ['tenantId', 'taxClassificationId', 'isActive'])
export class TaxRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'tax_classification_id', nullable: true })
  taxClassificationId: string | null;

  // null = aplica a cualquier segmento
  @Column({ type: 'varchar', length: 30, name: 'customer_segment', nullable: true })
  customerSegment: CustomerSegment | null;

  // Código DANE del municipio; null = aplica a todos los municipios
  @Column({ type: 'varchar', length: 10, name: 'municipality_code', nullable: true })
  municipalityCode: string | null;

  @Column({ type: 'varchar', length: 20, name: 'tax_type' })
  taxType: TaxType;

  @Column({ type: 'numeric', precision: 5, scale: 2, name: 'rate_percentage' })
  ratePercentage: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', name: 'valid_from', default: () => 'now()' })
  validFrom: Date;

  @Column({ type: 'timestamptz', name: 'valid_to', nullable: true })
  validTo: Date | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Estrato socioeconómico mínimo y máximo del nuevo modelo (1-6, null = sin restricción)
  @Column({ type: 'smallint', name: 'stratum_from', nullable: true })
  stratumFrom: number | null;

  @Column({ type: 'smallint', name: 'stratum_to', nullable: true })
  stratumTo: number | null;

  // Mayor número = mayor precedencia al resolver solapamientos entre reglas
  @Column({ type: 'smallint', name: 'priority', default: 0 })
  priority: number;
}
