import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 011 — Metadata pública de branding por tenant.
 *
 * Extiende `public.tenants` con campos textuales de identidad visual
 * para el portal empresarial (producto, superficie, título y descripción).
 *
 * Las columnas son nullable para permitir defaults efectivos en el servicio,
 * sin necesidad de backfill destructivo.
 */
export declare class AddTenantBrandingMetadata1746164800000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=011_add_tenant_branding_metadata.d.ts.map