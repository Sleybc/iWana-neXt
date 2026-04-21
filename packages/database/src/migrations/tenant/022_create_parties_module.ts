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
export class CreatePartiesModule1700000000022 implements MigrationInterface {
  name = 'CreatePartiesModule1700000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tipos ENUM
    await queryRunner.query(`
      CREATE TYPE party_type AS ENUM ('NATURAL', 'ORGANIZATION')
    `);

    await queryRunner.query(`
      CREATE TYPE document_type_party AS ENUM ('CC', 'CE', 'NIT', 'PASAPORTE', 'TI', 'RUT', 'OTHER')
    `);

    await queryRunner.query(`
      CREATE TYPE party_status AS ENUM ('ACTIVE', 'INACTIVE', 'MERGED')
    `);

    await queryRunner.query(`
      CREATE TYPE party_role_type AS ENUM ('CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'CONTRACTOR', 'SALES_AGENT')
    `);

    await queryRunner.query(`
      CREATE TYPE party_role_status AS ENUM ('ACTIVE', 'INACTIVE')
    `);

    await queryRunner.query(`
      CREATE TYPE party_contact_type AS ENUM ('EMAIL', 'PHONE', 'ADDRESS')
    `);

    // Tabla party: registro central de personas naturales y jurídicas
    await queryRunner.query(`
      CREATE TABLE party (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        party_type party_type NOT NULL,
        document_type document_type_party NOT NULL,
        document_number VARCHAR(32) NOT NULL,
        verification_digit VARCHAR(2),
        display_name VARCHAR(160) NOT NULL,
        legal_name VARCHAR(200),
        birth_date DATE,
        incorporation_date DATE,
        status party_status NOT NULL DEFAULT 'ACTIVE',
        merged_into_party_id UUID REFERENCES party(id),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      )
    `);

    // Índice único parcial: documento activo (evita duplicados de documento para parties activos no fusionados)
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_party_document_active
        ON party(document_type, document_number)
        WHERE deleted_at IS NULL AND status != 'MERGED'
    `);

    // Tabla party_contact: múltiples contactos por party (email, teléfono, dirección)
    await queryRunner.query(`
      CREATE TABLE party_contact (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        party_id UUID NOT NULL REFERENCES party(id) ON DELETE CASCADE,
        type party_contact_type NOT NULL,
        value VARCHAR(255) NOT NULL,
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        verified_at TIMESTAMPTZ,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Índice único parcial: solo un contacto primario por tipo por party
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_party_contact_primary
        ON party_contact(party_id, type)
        WHERE is_primary = TRUE
    `);

    // Tabla party_role: roles asignados a parties (cliente, proveedor, empleado, etc.)
    await queryRunner.query(`
      CREATE TABLE party_role (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        party_id UUID NOT NULL REFERENCES party(id) ON DELETE CASCADE,
        role party_role_type NOT NULL,
        status party_role_status NOT NULL DEFAULT 'ACTIVE',
        valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        valid_to TIMESTAMPTZ,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Índice único parcial: solo un rol activo del mismo tipo por party
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_party_role_active
        ON party_role(party_id, role)
        WHERE status = 'ACTIVE'
    `);

    // Añadir party_id a users (nullable en v1 — vinculación futura)
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN party_id UUID REFERENCES party(id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS party_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS party_role`);
    await queryRunner.query(`DROP TABLE IF EXISTS party_contact`);
    await queryRunner.query(`DROP TABLE IF EXISTS party`);
    await queryRunner.query(`DROP TYPE IF EXISTS party_contact_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS party_role_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS party_role_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS party_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS document_type_party`);
    await queryRunner.query(`DROP TYPE IF EXISTS party_type`);
  }
}
