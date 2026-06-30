import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migracion 045: crea el esquema del Modulo Ejecucion Operativa / Tareas (MOD11) Fase 01.
 * - Tipos ENUM para tipo, estado, prioridad, origen, destinatario, responsable y modo de ejecucion.
 * - Tabla operational_tasks con responsable activo y destinatario explicito.
 * - Tabla task_timeline_events (append-only).
 * - Tabla task_assignment_history (handoff).
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explicito)
 * Reversible: si — down() elimina tablas, indices y tipos ENUM en orden inverso.
 *
 * Referencias: ADR-046, HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0, PRD-MOD11
 */
export declare class CreateTasksModule0450000000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=045_create_tasks_module.d.ts.map