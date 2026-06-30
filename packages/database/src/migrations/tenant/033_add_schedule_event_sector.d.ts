import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Agrega sector/vereda a la agenda WFM para recomendaciones territoriales.
 * El campo no es obligatorio para preservar eventos historicos y flujos manuales.
 */
export declare class AddScheduleEventSector1700000000033 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=033_add_schedule_event_sector.d.ts.map