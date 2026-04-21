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
@Index('uq_tax_definitions_code', ['code'], { unique: true })
@Index('idx_tax_definitions_context_active', ['context', 'isActive'])
@Index('idx_tax_definitions_category', ['category'])
export class TaxDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'code', type: 'varchar', length: 32 })
  code: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'category', type: 'varchar', length: 20 })
  category: TaxCategory;

  @Column({
    name: 'jurisdiction_level',
    type: 'varchar',
    length: 20,
  })
  jurisdictionLevel: JurisdictionLevel;

  @Column({ name: 'municipality_code', type: 'varchar', length: 8, nullable: true })
  municipalityCode: string | null;

  @Column({ name: 'base_rate', type: 'numeric', precision: 7, scale: 4, nullable: true })
  baseRate: string | null;

  @Column({ name: 'treatment', type: 'varchar', length: 20 })
  treatment: TaxTreatment;

  @Column({ name: 'context', type: 'varchar', length: 10 })
  context: TaxContext;

  @Column({
    name: 'origin',
    type: 'varchar',
    length: 10,
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
