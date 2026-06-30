import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 030: crea el esquema del Módulo WFM / Programación (MOD09) Fase 1.
 * - Tipos ENUM para trabajo, estado de agenda, estado de OT, prioridad, origen y disponibilidad.
 * - Tabla schedule_events: agenda operativa con vinculos cross-module por ID logico.
 * - Tabla work_orders: orden operativa ligera con code unico por tenant.
 * - Tabla work_order_tasks: tareas internas de una Work Order.
 * - Tabla schedule_reschedule_logs: historial append-only de reagendamientos.
 * - Tabla technician_availability: bloqueos y disponibilidad puntual por tecnico.
 * - Indices exigidos por el spec para consultas de agenda por rango, tecnico y vinculo.
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explicito)
 * Reversible: si — down() elimina tablas, indices y tipos ENUM en orden inverso.
 *
 * Referencias: ADR-037, HLD-MOD09-PROGRAMACION-WFM-v1.0 §4, SPEC-MOD09 §6
 */
export declare class CreateWfmModule1700000000030 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=030_create_wfm_module.d.ts.map