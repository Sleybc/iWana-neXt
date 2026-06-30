import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 027: Agrega additional_service_ids a expediente_records.
 *
 * up():
 *   - Agrega columna `additional_service_ids` JSONB con default `[]` en expediente_records.
 *     Almacena los IDs de servicios adicionales del catálogo seleccionados para el expediente.
 *     Espeja la columna existing `additional_product_ids` — mismo patrón.
 *
 * down() (reversible):
 *   - Elimina la columna `additional_service_ids` de expediente_records.
 */
export declare class AddAdditionalServiceIdsToExpediente1700000000027 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=027_add_additional_service_ids_to_expediente.d.ts.map