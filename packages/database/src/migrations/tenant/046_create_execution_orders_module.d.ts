import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migracion 046: agrega OT de ejecucion enriquecida para MOD11 y refs logicas en WFM.
 * Mantiene separation of concerns: agenda en MOD09, ejecucion en MOD11.
 */
export declare class CreateExecutionOrdersModule0460000000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=046_create_execution_orders_module.d.ts.map