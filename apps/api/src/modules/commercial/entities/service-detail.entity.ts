import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ChargeType } from '@iwana/shared';
import { CatalogItem } from './catalog-item.entity';

/**
 * Detalle específico de un ítem de tipo SERVICE.
 * Se relaciona 1:1 con catalog_items via item_id.
 */
@Entity({ name: 'service_details' })
export class ServiceDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'item_id' })
  itemId: string;

  @Column({ type: 'varchar', length: 20, name: 'charge_type' })
  chargeType: ChargeType;

  @OneToOne(() => CatalogItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: CatalogItem;
}
