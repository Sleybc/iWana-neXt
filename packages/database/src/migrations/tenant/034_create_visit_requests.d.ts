import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 034: crea la tabla visit_requests en el schema de tenant.
 *
 * VisitRequest captura solicitudes operativas antes de convertirse en Work Orders
 * y Schedule Events. Mantiene el contexto de origen, ventana temporal solicitada,
 * vinculos con entidades de negocio (expediente, subscriber, ticket, contract)
 * y el flujo de estados desde PENDING hasta SCHEDULED | CANCELLED | REJECTED.
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explicito)
 * Reversible: si — down() elimina la tabla y el indice.
 *
 * Referencias: ADR-037, HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6.2
 */
export declare class CreateVisitRequests1700000000034 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=034_create_visit_requests.d.ts.map