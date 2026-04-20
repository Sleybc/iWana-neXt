import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CatalogItemType } from '@iwana/shared';
import { TaxClassification } from './tax-classification.entity';

/**
 * Tabla base del catálogo comercial (Class Table Inheritance manual).
 * El discriminante 'type' indica si es PLAN, PRODUCT o SERVICE.
 * El detalle específico por tipo se almacena en tablas de extensión
 * (plan_details, product_details, service_details) con FK a esta tabla.
 */
@Entity({ name: 'catalog_items' })
@Index('idx_catalog_items_tenant_type_active', ['tenantId', 'type', 'isActive'])
@Index('idx_catalog_items_tenant_name', ['tenantId', 'isActive', 'name'])
export class CatalogItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20 })
  type: CatalogItemType;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'uuid', name: 'tax_classification_id', nullable: true })
  taxClassificationId: string | null;

  @Column({ type: 'boolean', name: 'retention_applicable', default: false })
  retentionApplicable: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;

  @ManyToOne(() => TaxClassification, { nullable: true, eager: false })
  @JoinColumn({ name: 'tax_classification_id' })
  taxClassification: TaxClassification | null;
}
