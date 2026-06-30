import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DiscountType } from '@iwana/shared';

/**
 * Combo de ítems del catálogo con descuento asociado.
 * La composición (qué ítems incluye) se almacena en catalog_bundle_items.
 */
@Entity({ name: 'catalog_bundles' })
@Index('idx_catalog_bundles_tenant_active', ['tenantId', 'isActive'])
export class CatalogBundle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, name: 'discount_type' })
  discountType: DiscountType;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'discount_value' })
  discountValue: string;

  @Column({ type: 'timestamptz', name: 'valid_from', default: () => 'now()' })
  validFrom: Date;

  @Column({ type: 'timestamptz', name: 'valid_to', nullable: true })
  validTo: Date | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
