import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * MOD00 — Horario base empresa + Excepciones por fecha para Organization.
 *
 * Crea:
 * - organization_company_business_hours: horario semanal base a nivel empresa.
 * - organization_business_hours_exceptions: excepciones por fecha (festivos,
 *   cierres especiales, aperturas extraordinarias).
 *
 * Backfill:
 * - Si existe una sede primaria con horario configurado en
 *   organization_site_business_hours, copia esas filas al horario base empresa
 *   como punto de partida inicial.
 *
 * NO modifica organization_site_business_hours (pasa a semántica override-only).
 * NO toca wfm_site_business_hours (deprecado, limpieza en fase posterior).
 *
 * Reversible: DOWN elimina tablas creadas sin tocar datos existentes.
 */
export declare class Mod00HorarioBaseEmpresaExcepciones1748000000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=040_add_organization_company_hours_and_exceptions.d.ts.map