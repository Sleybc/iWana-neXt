import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migracion 002 — Extension de perfil para usuarios de plataforma.
 *
 * Agrega campos operativos de perfil en public.platform_users para habilitar
 * edicion de perfil y preferencias desde la UI administrativa.
 */
export declare class AddPlatformUserProfile1742100000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=002_add_platform_user_profile.d.ts.map