import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 022: crea el esquema del Módulo Parties (MOD08).
 * - Tipos ENUM: party_type, document_type_party, party_status, party_role_type, party_role_status, party_contact_type.
 * - Tabla party: registro central de personas naturales y jurídicas con soporte para fusión.
 * - Tabla party_contact: múltiples contactos por party (email, teléfono, dirección).
 * - Tabla party_role: roles asignados a parties (cliente, proveedor, empleado, etc.).
 * - ALTER TABLE users ADD COLUMN party_id: vincula usuario con party (nullable en v1).
 * - Índices únicos parciales: documento activo, contacto primario por tipo, rol activo.
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explícito)
 * Reversible: sí — down() elimina tablas, índices y tipos ENUM.
 *
 * Referencias: HLD-MOD08-PARTIES-v1.0 §4, PROMPT-PARTIES-F2-v1.0 §2a
 */
export declare class CreatePartiesModule1700000000022 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=022_create_parties_module.d.ts.map