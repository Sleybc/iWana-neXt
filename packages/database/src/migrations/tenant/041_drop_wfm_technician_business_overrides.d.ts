import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * ADR-041 — Retiro de Excepciones por tecnico de WFM.
 * up:   elimina la tabla wfm_technician_business_overrides y sus indices.
 * down: recrea la estructura original para rollback controlado.
 */
export declare class DropWfmTechnicianBusinessOverrides1748566800000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=041_drop_wfm_technician_business_overrides.d.ts.map