import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 004 — Reemplaza display_name por first_name + last_name en platform_users.
 *
 * Decisión de diseño: se prefieren campos semánticos separados a un nombre compuesto
 * para facilitar ordenamiento, búsqueda y presentación contextual en la UI.
 */
export declare class ReplaceDisplayNameWithFirstLastName1742300000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=004_replace_display_name_with_first_last_name.d.ts.map