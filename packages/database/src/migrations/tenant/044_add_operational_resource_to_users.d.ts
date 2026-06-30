import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Habilita la capacidad explícita de despacho operativo sobre users.
 *
 * Regla de negocio:
 * - cualquier usuario interno puede ser agendado
 * - solo los usuarios marcados como recurso operativo aparecen en despacho
 *
 * Backfill conservador:
 * - TECHNICIAN y CONTRACTOR quedan operativos por defecto
 * - el resto permanece en false hasta revisión administrativa
 */
export declare class AddOperationalResourceToUsers1749733200044 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=044_add_operational_resource_to_users.d.ts.map