import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migracion 051: evoluciona inventory_items al catalogo maestro operativo de MOD12.
 */
export declare class ExpandInventoryItemMasterCatalog0510000000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=051_expand_inventory_item_master_catalog.d.ts.map