import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JurisdictionLevel, TaxCategory, TaxContext, TaxOrigin, TaxTreatment } from '@iwana/shared';

/**
 * Entidad de catálogo de impuestos por tenant.
 * Sin prefijo de schema — cada tenant tiene su propia copia en su schema.
 * El search_path se establece por transacción mediante runInTenantSchema().
 * Ref: HLD-MOD07 §3, §4
 */
@Entity({ name: 'tax_definitions' })
@Index('idx_tax_definitions_context_active', ['context', 'isActive'])
@Index('idx_tax_definitions_category', ['category'])
export class TaxDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'code', type: 'varchar', length: 32, unique: true })
  code: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'category', type: 'varchar', length: 20, enum: TaxCategory })
  category: TaxCategory;

  @Column({
    name: 'jurisdiction_level',
    type: 'varchar',
    length: 20,
    enum: JurisdictionLevel,
  })
  jurisdictionLevel: JurisdictionLevel;

  @Column({ name: 'municipality_code', type: 'varchar', length: 8, nullable: true })
  municipalityCode: string | null;

  @Column({ name: 'base_rate', type: 'numeric', precision: 7, scale: 4, nullable: true })
  baseRate: number | null;

  @Column({ name: 'treatment', type: 'varchar', length: 20, enum: TaxTreatment })
  treatment: TaxTreatment;

  @Column({ name: 'context', type: 'varchar', length: 10, enum: TaxContext })
  context: TaxContext;

  @Column({
    name: 'origin',
    type: 'varchar',
    length: 10,
    enum: TaxOrigin,
    default: TaxOrigin.CUSTOM,
  })
  origin: TaxOrigin;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
