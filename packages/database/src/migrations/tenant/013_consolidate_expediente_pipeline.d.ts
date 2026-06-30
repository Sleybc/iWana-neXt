import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 013: Consolidar pipeline de expediente de 12 a 8 estados.
 *
 * Estados eliminados (ADR-026):
 * - CONTACTADO → mapear a PRECALIFICADO
 * - PENDIENTE_DATOS → mapear a PRECALIFICADO
 * - VIABLE_COMERCIALMENTE → mapear a VALIDANDO_COBERTURA
 * - PENDIENTE_DECISION → mapear a EN_COTIZACION
 *
 * Esta migración NO elimina los valores del enum de PostgreSQL inmediatamente.
 * Se deja para una migración posterior después de verificar que no hay
 * referencias pendientes en producción.
 */
export declare class ConsolidateExpedientePipeline1700000000013 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=013_consolidate_expediente_pipeline.d.ts.map