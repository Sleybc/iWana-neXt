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
import { CustomerSegment, DiscountType, PromotionScope } from '@iwana/shared';
import { CatalogBundle } from './catalog-bundle.entity';
import { CatalogItem } from './catalog-item.entity';

/**
 * Promoción temporal del catálogo con control de vigencia y límite de usos.
 * El code es único por tenant (constraint UNIQUE en DB).
 * Cuando current_uses alcanza max_uses, la promoción se desactiva automáticamente.
 */
@Entity({ name: 'catalog_promotions' })
@Index('idx_catalog_promotions_tenant_active', ['tenantId', 'isActive'])
@Index('idx_catalog_promotions_code', ['tenantId', 'code'])
export class CatalogPromotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, name: 'discount_type' })
  discountType: DiscountType;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'discount_value' })
  discountValue: string;

  @Column({ type: 'varchar', length: 20, name: 'applies_to' })
  appliesTo: PromotionScope;

  @Column({ type: 'uuid', name: 'target_item_id', nullable: true })
  targetItemId: string | null;

  @Column({ type: 'uuid', name: 'target_bundle_id', nullable: true })
  targetBundleId: string | null;

  // Segmentos de cliente elegibles; null = aplica a todos
  @Column({ type: 'varchar', array: true, name: 'target_segments', nullable: true })
  targetSegments: CustomerSegment[] | null;

  @Column({ type: 'integer', name: 'max_uses', nullable: true })
  maxUses: number | null;

  @Column({ type: 'integer', name: 'current_uses', default: 0 })
  currentUses: number;

  @Column({ type: 'timestamptz', name: 'valid_from' })
  validFrom: Date;

  @Column({ type: 'timestamptz', name: 'valid_to' })
  validTo: Date;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => CatalogItem, { nullable: true })
  @JoinColumn({ name: 'target_item_id' })
  targetItem: CatalogItem | null;

  @ManyToOne(() => CatalogBundle, { nullable: true })
  @JoinColumn({ name: 'target_bundle_id' })
  targetBundle: CatalogBundle | null;
}
