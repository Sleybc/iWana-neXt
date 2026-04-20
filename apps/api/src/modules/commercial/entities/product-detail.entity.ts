import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProductCategory } from '@iwana/shared';
import { CatalogItem } from './catalog-item.entity';

/**
 * Detalle específico de un ítem de tipo PRODUCT.
 * Se relaciona 1:1 con catalog_items via item_id.
 */
@Entity({ name: 'product_details' })
export class ProductDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'item_id' })
  itemId: string;

  @Column({ type: 'boolean', name: 'is_loan', default: false })
  isLoan: boolean;

  @Column({ type: 'boolean', name: 'requires_inventory', default: false })
  requiresInventory: boolean;

  @Column({ type: 'varchar', length: 50 })
  category: ProductCategory;

  @OneToOne(() => CatalogItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: CatalogItem;
}
