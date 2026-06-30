import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CatalogBundle } from './catalog-bundle.entity';
import { CatalogItem } from './catalog-item.entity';

/**
 * Composición de un bundle: relaciona un bundle con los ítems que lo conforman.
 * La constraint UNIQUE (bundle_id, item_id) impide duplicados en DB.
 */
@Entity({ name: 'catalog_bundle_items' })
@Index('idx_catalog_bundle_items_bundle', ['bundleId'])
export class CatalogBundleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'bundle_id' })
  bundleId: string;

  @Column({ type: 'uuid', name: 'item_id' })
  itemId: string;

  // Si es false, el ítem es opcional dentro del bundle
  @Column({ type: 'boolean', name: 'is_required', default: true })
  isRequired: boolean;

  @Column({ type: 'integer', name: 'sort_order', default: 0 })
  sortOrder: number;

  @ManyToOne(() => CatalogBundle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bundle_id' })
  bundle: CatalogBundle;

  @ManyToOne(() => CatalogItem)
  @JoinColumn({ name: 'item_id' })
  item: CatalogItem;
}
