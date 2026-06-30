import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 003 — Campos de empresa para tenants.
 *
 * Agrega columnas para datos legales, dirección y contacto en public.tenants.
 * Todos los campos son opcionales (nullable) — el provisioning inicial solo
 * requiere name, slug y contactEmail.
 *
 * Nota: country_code se nombra explícitamente distinto de "country" para
 * evitar colisión con el campo homónimo dentro del JSONB settings.
 */
export declare class AddTenantBusinessFields1742200000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=003_add_tenant_business_fields.d.ts.map