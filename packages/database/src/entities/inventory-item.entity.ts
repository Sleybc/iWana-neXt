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
import { InventoryCategory } from './inventory-category.entity';
import {
  InventoryBarcodeType,
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
} from '@iwana/shared';

@Index('uq_inventory_items_tenant_sku', ['tenantId', 'sku'], { unique: true })
@Index('uq_inventory_items_tenant_barcode', ['tenantId', 'barcode'], {
  unique: true,
  where: 'barcode IS NOT NULL',
})
@Index('idx_inventory_items_tenant_category_status', ['tenantId', 'category', 'status'])
@Index('idx_inventory_items_tenant_category_id_status', ['tenantId', 'categoryId', 'status'])
@Index('idx_inventory_items_tenant_status_purchasable', ['tenantId', 'status', 'purchasable'])
@Index('idx_inventory_items_tenant_item_kind_status', ['tenantId', 'itemKind', 'status'])
@Index('idx_inventory_items_tenant_preferred_supplier', ['tenantId', 'preferredSupplierRefId'])
@Entity({ name: 'inventory_items' })
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 60 })
  sku: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  brand: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  model: string | null;

  @Column({
    name: 'item_kind',
    type: 'enum',
    enum: InventoryItemKind,
    enumName: 'inventory_item_kind',
    default: InventoryItemKind.STOCK,
  })
  itemKind: InventoryItemKind;

  @Column({
    type: 'enum',
    enum: InventoryItemCategory,
    enumName: 'inventory_item_category',
  })
  category: InventoryItemCategory;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => InventoryCategory, { nullable: false })
  @JoinColumn({ name: 'category_id' })
  inventoryCategory: InventoryCategory;

  @Column({
    name: 'tracking_mode',
    type: 'enum',
    enum: InventoryTrackingMode,
    enumName: 'inventory_tracking_mode',
  })
  trackingMode: InventoryTrackingMode;

  /**
   * Unidad base en la que se cuentan las existencias.
   *
   * Código del catálogo canónico de ADR-085 D1 (`INVENTORY_UNITS_OF_MEASURE` en
   * `@iwana/shared`; p. ej. UNIT, BOX, METER). La migración 122 normaliza los
   * literales legacy a estos códigos y el backend rechaza cualquier valor fuera
   * del catálogo. Se conserva varchar(32) NOT NULL: el código más largo
   * (KILOMETER, 9 caracteres) cabe con holgura y la reversibilidad con la
   * migración queda intacta.
   */
  @Column({ name: 'unit_of_measure', type: 'varchar', length: 32 })
  unitOfMeasure: string;

  @Column({ name: 'base_cost', type: 'numeric', precision: 14, scale: 2, default: 0 })
  baseCost: string;

  @Column({ name: 'minimum_stock', type: 'numeric', precision: 12, scale: 2, default: 0 })
  minimumStock: string;

  @Column({ default: true })
  purchasable: boolean;

  @Column({ name: 'inventory_controlled', default: true })
  inventoryControlled: boolean;

  @Column({ name: 'asset_controlled', default: false })
  assetControlled: boolean;

  @Column({ name: 'preferred_supplier_ref_id', type: 'uuid', nullable: true })
  preferredSupplierRefId: string | null;

  @Column({ name: 'supplier_sku', type: 'varchar', length: 80, nullable: true })
  supplierSku: string | null;

  /**
   * Unidad en la que se compra. Mismo catálogo canónico que la unidad base.
   *
   * Se conserva varchar(32) nullable: en F5a la unidad de compra sigue sin ser
   * establecible desde el portal (recorte ADR-085) y el factor de conversión no
   * se aplica (es F5b). La validación dimensional entre ambas unidades también
   * es F5b; aquí solo se exige pertenencia al catálogo cuando hay valor.
   */
  @Column({ name: 'purchase_unit_of_measure', type: 'varchar', length: 32, nullable: true })
  purchaseUnitOfMeasure: string | null;

  @Column({
    name: 'purchase_to_base_uom_factor',
    type: 'numeric',
    precision: 12,
    scale: 4,
    nullable: true,
  })
  purchaseToBaseUomFactor: string | null;

  @Column({ name: 'standard_cost', type: 'numeric', precision: 14, scale: 2, default: 0 })
  standardCost: string;

  @Column({ name: 'last_purchase_cost', type: 'numeric', precision: 14, scale: 2, nullable: true })
  lastPurchaseCost: string | null;

  @Column({ name: 'average_cost', type: 'numeric', precision: 14, scale: 2, default: 0 })
  averageCost: string;

  @Column({ name: 'reorder_point', type: 'numeric', precision: 12, scale: 2, default: 0 })
  reorderPoint: string;

  @Column({ name: 'target_stock', type: 'numeric', precision: 12, scale: 2, default: 0 })
  targetStock: string;

  @Column({ name: 'minimum_order_qty', type: 'numeric', precision: 12, scale: 2, nullable: true })
  minimumOrderQty: string | null;

  @Column({ name: 'order_multiple', type: 'numeric', precision: 12, scale: 2, nullable: true })
  orderMultiple: string | null;

  @Column({ name: 'lead_time_days', type: 'integer', nullable: true })
  leadTimeDays: number | null;

  @Column({ name: 'useful_life_months', type: 'integer', nullable: true })
  usefulLifeMonths: number | null;

  @Column({ name: 'commercial_reference_id', type: 'varchar', length: 160, nullable: true })
  commercialReferenceId: string | null;

  /**
   * Código de barras del artículo (MOD12 · F4 · PRD §11 delta v1.1).
   *
   * Opcional (regla 1), único por tenant cuando existe mediante el índice único
   * PARCIAL `uq_inventory_items_tenant_barcode (tenant_id, barcode)
   * WHERE barcode IS NOT NULL` (regla 2 — el DDL vive en la migración 123, con
   * el mismo patrón del índice parcial de preferred_supplier). Va SIEMPRE
   * acompañado de `barcode_type` (regla 3): uno sin el otro se rechaza en el
   * schema Zod. NO sustituye al SKU (regla 5, ADR-INV-SKU-COMPUESTO) y es
   * editable tras la creación (regla 6).
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  barcode: string | null;

  /** Formato declarado del código; ver `InventoryBarcodeType` (PRD §11 regla 3). */
  @Column({
    name: 'barcode_type',
    type: 'enum',
    enum: InventoryBarcodeType,
    enumName: 'inventory_barcode_type',
    nullable: true,
  })
  barcodeType: InventoryBarcodeType | null;

  @Column({
    type: 'enum',
    enum: InventoryItemStatus,
    enumName: 'inventory_item_status',
    default: InventoryItemStatus.ACTIVE,
  })
  status: InventoryItemStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
