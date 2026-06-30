import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 006 — Soft-delete de tenants y alineación de teléfono.
 *
 * Evita borrado físico inmediato de empresas desde plataforma. El schema tenant
 * queda retenido para recuperación/auditoría y una purga operativa posterior.
 */
export declare class SoftDeleteTenantsAndPhoneLength1742400000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=006_soft_delete_tenants_and_phone_length.d.ts.map