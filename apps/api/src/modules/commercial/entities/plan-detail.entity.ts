import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { InstallationRule, NetworkType, VatTreatment } from '@iwana/shared';
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

  @Column({ type: 'varchar', length: 10, name: 'network_type', default: 'FIXED' })
  networkType: NetworkType;

  @Column({ type: 'varchar', length: 100 })
  technology: string;

  @Column({
    type: 'varchar',
    length: 30,
    name: 'installation_rule',
    default: InstallationRule.ALWAYS,
  })
  installationRule: InstallationRule;

  /**
   * IVA del cargo de instalación del plan (migración 201, spec MOD14 2026-11-12 R2). El valor del
   * cargo vive en `catalog_price_history.installation_fee`; por defecto STANDARD 19 % (D2).
   */
  @Column({
    type: 'varchar',
    length: 10,
    name: 'installation_vat_treatment',
    default: VatTreatment.STANDARD,
  })
  installationVatTreatment: VatTreatment;

  @Column({
    type: 'varchar',
    length: 40,
    name: 'installation_vat_legal_basis',
    default: 'ET_468',
  })
  installationVatLegalBasis: string;

  @Column({ type: 'boolean', name: 'offers_permanence', default: false })
  offersPermanence: boolean;

  /** 1..12 si ofrece permanencia; NULL si no (CHECK en la 183). */
  @Column({ type: 'smallint', name: 'permanence_months', nullable: true })
  permanenceMonths: number | null;

  /** 0 < valor ≤ installation_fee vigente (validado en el servicio) si ofrece permanencia; NULL si no. */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'permanence_discounted_amount',
    nullable: true,
  })
  permanenceDiscountedAmount: string | null;

  @OneToOne(() => CatalogItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: CatalogItem;
}
