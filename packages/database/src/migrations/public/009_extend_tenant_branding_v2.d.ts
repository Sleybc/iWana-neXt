import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 009 — Extiende branding del tenant con slots híbridos URL/asset.
 *
 * Agrega favicon y fondos de login, además de referencias opcionales a
 * `public.media_assets` para soportar uploads propios sin perder compatibilidad
 * con URLs HTTPS externas.
 */
export declare class ExtendTenantBrandingV21746164500000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=009_extend_tenant_branding_v2.d.ts.map