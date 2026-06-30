import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 005 — Añade columnas de branding a public.tenants.
 *
 * Agrega 4 URLs nullable (logo y sello en variantes claro/oscuro) y un booleano
 * show_tenant_name con default true. Todas las URLs son nullable para no romper
 * tenants existentes. Sin cambios destructivos.
 *
 * Diseño del branding: docs/plans/2026-03-17-branding-logo-sello-design.md
 */
export declare class AddTenantBrandingColumns1742350000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=005_add_tenant_branding_columns.d.ts.map