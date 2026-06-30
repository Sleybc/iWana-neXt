import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 031: crea el esquema del Módulo Service Assurance / Mesa de Ayuda (MOD10) Fase 1.
 * - Tipos ENUM para estado de ticket, tipo, prioridad, tipo de solicitante, SLA y PQR.
 * - Tabla support_tickets con SLA, asignación y vínculo opcional a WFM.
 * - Tabla ticket_comments (internos y externos).
 * - Tabla ticket_timeline_events (append-only).
 * - Tabla ticket_sla_policies (políticas por tenant).
 * - Tabla ticket_pqr_records (plazos regulatorios CRC).
 * - Tabla ticket_work_order_links (referencia lógica a WFM).
 * - Índices de consulta por tenant, estado, asignado y tipo.
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explícito)
 * Reversible: sí — down() elimina tablas, índices y tipos ENUM en orden inverso.
 *
 * Referencias: ADR-038, HLD-MOD10-SERVICE-ASSURANCE-v1.0, PRD-MOD10
 */
export declare class CreateAssuranceModule1700000000031 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=031_create_assurance_module.d.ts.map