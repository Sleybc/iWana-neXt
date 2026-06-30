import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 028: Crea el módulo CRM — tablas de cotizaciones y contratos.
 *
 * Tablas creadas:
 * - quotes: cotizaciones del proceso comercial (vinculadas a oportunidades/expedientes)
 * - contracts: contratos/servicios contratados por el subscriber
 *
 * Tipos ENUM creados:
 * - quote_status_enum: DRAFT | SENT | APPROVED | REJECTED | EXPIRED
 * - contract_status_enum: DRAFT | ACTIVE | SUSPENDED | TERMINATED
 *   (ARCHIVED se agrega en migración 029)
 *
 * Schema: tenant (search_path resuelto por runInTenantSchema — sin prefijo explícito)
 * Reversible: sí
 */
export declare class CreateCrmQuotesAndContracts1700000000028 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=028_create_crm_quotes_and_contracts.d.ts.map