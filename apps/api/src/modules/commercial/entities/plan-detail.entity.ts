import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { InstallationRule } from '@iwana/shared';
import { CatalogItem } from './catalog-item.entity';

/**
 * Detalle específico de un ítem de tipo PLAN.
 * Se relaciona 1:1 con catalog_items via item_id.
 */
@Entity({ name: 'plan_details' })
export class PlanDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'item_id' })
  itemId: string;

  @Column({ type: 'integer', name: 'download_speed_mbps' })
  downloadSpeedMbps: number;

  @Column({ type: 'integer', name: 'upload_speed_mbps' })
  uploadSpeedMbps: number;

  @Column({ type: 'varchar', length: 100 })
  technology: string;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'installation_rule',
    default: InstallationRule.ALWAYS,
  })
  installationRule: InstallationRule;

  @OneToOne(() => CatalogItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: CatalogItem;
}
