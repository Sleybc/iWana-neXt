import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 029: Extiende la tabla contracts para modelar servicios contratados.
 *
 * Cambios:
 * - quote_id pasa a ser nullable (contratos pueden crearse sin cotización previa).
 * - Nuevos campos: alias, dirección de instalación, segmento override,
 *   add-ons (productos y servicios), configuración de facturación.
 * - Nuevo índice por subscriber para listar servicios del cliente.
 * - El valor ARCHIVED se agrega al ENUM contract_status_enum.
 *
 * Schema: tenant (dinámico vía runInTenantSchema)
 * Reversible: sí
 */
export declare class ExtendContractsForServices1700000000029 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=029_extend_contracts_for_services.d.ts.map