import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 010 — Branding propio de la consola de plataforma.
 *
 * Crea un registro singleton en public.platform_branding_settings para que
 * apps/web tenga identidad visual persistente e independiente de tenants.
 */
export declare class CreatePlatformBrandingSettings1746164700000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=010_create_platform_branding_settings.d.ts.map