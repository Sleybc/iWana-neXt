import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migracion 007 — Ciclo de vida de eliminacion diferida y limites nullable.
 *
 * - `max_subscribers = NULL` representa sin limite.
 * - `max_subscribers = 0` queda reservado para bloquear nuevos suscriptores.
 * - `MARKED_FOR_DELETION` separa contrato inactivo de eliminacion diferida.
 */
export declare class TenantLifecyclePurgeAndNullableLimits1742400001000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=007_tenant_lifecycle_purge_and_nullable_limits.d.ts.map