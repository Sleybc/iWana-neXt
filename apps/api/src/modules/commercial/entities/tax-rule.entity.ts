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
import { CustomerSegment, TaxType } from '@iwana/shared';
import { TaxClassification } from './tax-classification.entity';

/**
 * Regla tributaria configurable por el administrador del tenant.
 * Permite definir tasas de IVA, retención e ICA según:
 * - segmento de cliente
 * - rango de estrato socioeconómico
 * - municipio (código DANE)
 *
 * Vigente desde valid_from hasta valid_to (null = sin vencimiento).
 * Las tasas deben ser configurables por UI: no hardcodear aquí.
 */
@Entity({ name: 'tax_rules' })
@Index('idx_tax_rules_lookup', ['tenantId', 'taxClassificationId', 'isActive'])
export class TaxRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'tax_classification_id' })
  taxClassificationId: string;

  // null = aplica a cualquier segmento
  @Column({ type: 'varchar', length: 30, name: 'customer_segment', nullable: true })
  customerSegment: CustomerSegment | null;

  // Estrato socioeconómico mínimo y máximo del suscriptor (1-6, null = sin restricción)
  @Column({ type: 'integer', name: 'estrato_min', nullable: true })
  estratoMin: number | null;

  @Column({ type: 'integer', name: 'estrato_max', nullable: true })
  estratoMax: number | null;

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

  @ManyToOne(() => TaxClassification)
  @JoinColumn({ name: 'tax_classification_id' })
  taxClassification: TaxClassification;
}
