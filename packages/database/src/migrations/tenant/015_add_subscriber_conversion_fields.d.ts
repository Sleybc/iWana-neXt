import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 015: agrega trazabilidad de conversión Expediente -> Subscriber.
 * Incluye soporte para override manual auditado.
 */
export declare class AddSubscriberConversionFields1700000000015 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=015_add_subscriber_conversion_fields.d.ts.map