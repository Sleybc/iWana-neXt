import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 012: Crear tabla subscribers con modelo de dos dimensiones.
 *
 * - personType (NATURAL | JURIDICA): dimensión fiscal
 * - customerSegment (6 segmentos ISP): dimensión de negocio
 * - vatTreatment y taxRegime calculados automáticamente
 * - PII cifrado con AES-256-GCM (mismo formato que expediente_records)
 * - Índices compuestos para consultas por tenant
 * - Constraint CHECK para campos obligatorios según personType
 */
export declare class AddSubscribersTable1700000000012 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=012_add_subscribers.d.ts.map