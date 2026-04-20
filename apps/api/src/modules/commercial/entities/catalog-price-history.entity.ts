import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CustomerSegment } from '@iwana/shared';
import { CatalogItem } from './catalog-item.entity';

/**
 * Historial inmutable de precios — SCD Tipo 2.
 * Nunca se hace UPDATE sobre registros existentes.
 * Para cambiar un precio: cerrar el registro anterior (valid_to + is_current=false)
 * e insertar uno nuevo (valid_from=NOW, is_current=true).
 *
 * El UNIQUE INDEX parcial (item_id, customer_segment) WHERE is_current = true
 * garantiza un único precio vigente por ítem/segmento en la DB.
 */
@Entity({ name: 'catalog_price_history' })
@Index('idx_price_history_item_from', ['itemId', 'validFrom'])
export class CatalogPriceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'item_id' })
  itemId: string;

  @Column({ type: 'varchar', length: 30, name: 'customer_segment' })
  customerSegment: CustomerSegment;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'base_price' })
  basePrice: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'installation_fee',
    default: '0',
  })
  installationFee: string;

  @Column({ type: 'timestamptz', name: 'valid_from', default: () => 'now()' })
  validFrom: Date;

  @Column({ type: 'timestamptz', name: 'valid_to', nullable: true })
  validTo: Date | null;

  @Column({ type: 'boolean', name: 'is_current', default: true })
  isCurrent: boolean;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => CatalogItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: CatalogItem;
}
