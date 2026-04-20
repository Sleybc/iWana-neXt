import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Clasificación tributaria del catálogo comercial.
 * Ejemplos base: IVA_FULL (19%), IVA_EXEMPT (exento 0%), IVA_EXCLUDED (excluido).
 * El admin puede crear clasificaciones adicionales por UI sin cambiar código.
 * El code es único por tenant.
 */
@Entity({ name: 'tax_classifications' })
@Index('idx_tax_classifications_tenant_code', ['tenantId', 'code'])
export class TaxClassification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
