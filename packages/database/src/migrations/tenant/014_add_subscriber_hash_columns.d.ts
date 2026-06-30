import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 014: Agregar columnas hash para búsqueda determinista sin descifrar.
 *
 * Permite buscar suscriptores por documento, email y teléfono sin necesidad
 * de descifrar todos los registros en memoria.
 *
 * - document_number_hash: SHA-256 del número de documento en texto plano
 * - email_hash: SHA-256 del email en texto plano
 * - phone_hash: SHA-256 del teléfono en texto plano
 *
 * Estos hashes se generan al crear/actualizar el subscriber y se usan
 * para búsquedas deterministas con índices B-tree.
 */
export declare class AddSubscriberHashColumns1700000000014 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=014_add_subscriber_hash_columns.d.ts.map