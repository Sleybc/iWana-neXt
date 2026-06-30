import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migracion 048: endurece status de bajas de inventario con enum PostgreSQL tipado.
 */
export declare class HardenInventoryWriteOffStatus0480000000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=048_harden_inventory_write_off_status.d.ts.map