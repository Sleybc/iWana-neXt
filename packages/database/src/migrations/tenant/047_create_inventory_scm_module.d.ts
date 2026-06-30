import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migracion 047: crea entidades base de inventario y SCM para MOD12.
 * Scope: schema tenant, con integridad interna solo entre tablas MOD12.
 */
export declare class CreateInventoryScmModule0470000000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=047_create_inventory_scm_module.d.ts.map