import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 024: vincula Subscribers con Parties (MOD08) — backfill idempotente.
 *
 * UP:
 *   1. Extiende party.document_number a VARCHAR(500) para acomodar valores cifrados PII
 *      (AES-256-GCM: iv:authTag:ciphertext en hex, ~78+ chars para documentos cortos).
 *   2. Añade subscribers.party_id UUID NULL.
 *   3. Crea índice idx_subscribers_party_id en (tenant_id, party_id) WHERE NOT NULL.
 *   4. Script PL/pgSQL idempotente: por cada subscriber sin party_id crea
 *      Party + PartyRole(CUSTOMER) y actualiza el vínculo en subscribers.
 *      Si un subscriber individual falla, continúa con los demás (no aborta).
 *
 * DOWN:
 *   - Elimina índice idx_subscribers_party_id.
 *   - Elimina columna party_id de subscribers.
 *   - No revierte datos creados en las tablas party/party_role (migración aditiva).
 *
 * Ref: HLD-MOD05-PARTIES-DEPENDENCY-v2.1-addendum §4, ADR-030, FASE 5
 */
export class BackfillSubscribersPartyId1700000000024 implements MigrationInterface {
  name = 'BackfillSubscribersPartyId1700000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extender document_number en party para acomodar valores cifrados PII
    await queryRunner.query(`
      ALTER TABLE party ALTER COLUMN document_number TYPE VARCHAR(500)
    `);

    // Añadir columna party_id en subscribers
    await queryRunner.query(`
      ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS party_id UUID NULL
    `);

    // Índice parcial: solo filas con party_id asignado
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscribers_party_id
        ON subscribers(tenant_id, party_id)
        WHERE party_id IS NOT NULL
    `);

    // Backfill idempotente: crear Party + PartyRole(CUSTOMER) por cada subscriber sin party_id
    await queryRunner.query(`
      DO $$
      DECLARE
        sub             RECORD;
        new_party_id    UUID;
        party_type_val  party_type;
        doc_type_val    document_type_party;
        doc_number_val  VARCHAR(500);
        display_name_val VARCHAR(160);
        legal_name_val  VARCHAR(200);
        valid_from_val  TIMESTAMPTZ;
        processed       INTEGER := 0;
        errors          INTEGER := 0;
      BEGIN
        FOR sub IN
          SELECT * FROM subscribers WHERE party_id IS NULL AND deleted_at IS NULL
        LOOP
          BEGIN
            -- Determinar party_type según personType (ADR-025)
            party_type_val := CASE
              WHEN sub.person_type = 'NATURAL' THEN 'NATURAL'::party_type
              ELSE 'ORGANIZATION'::party_type
            END;

            -- Mapear document_type de CRM (DocumentType) a Parties (DocumentTypeParty)
            doc_type_val := CASE sub.document_type
              WHEN 'CC'          THEN 'CC'::document_type_party
              WHEN 'CE'          THEN 'CE'::document_type_party
              WHEN 'NIT'         THEN 'NIT'::document_type_party
              WHEN 'NIT_PERSONA' THEN 'NIT'::document_type_party
              WHEN 'PASAPORTE'   THEN 'PASAPORTE'::document_type_party
              WHEN 'TI'          THEN 'TI'::document_type_party
              WHEN 'RUT'         THEN 'RUT'::document_type_party
              ELSE CASE
                WHEN party_type_val = 'NATURAL' THEN 'CC'::document_type_party
                ELSE 'NIT'::document_type_party
              END
            END;

            -- Número de documento: cifrado si existe, placeholder único si no hay PII
            doc_number_val := COALESCE(
              sub.document_number_encrypted,
              'BACKFILL-ANON-' || sub.id::text
            );

            -- displayName desde nombre o razón social (ADR-030 D1)
            display_name_val := LEFT(COALESCE(
              CASE
                WHEN sub.first_name IS NOT NULL AND sub.last_name IS NOT NULL
                  THEN sub.first_name || ' ' || sub.last_name
                WHEN sub.first_name IS NOT NULL
                  THEN sub.first_name
                ELSE NULL
              END,
              sub.business_name,
              sub.commercial_name,
              'Sin nombre'
            ), 160);

            -- legalName: razón social o nombre completo como fallback
            legal_name_val := LEFT(COALESCE(
              sub.business_name,
              sub.commercial_name,
              CASE
                WHEN sub.first_name IS NOT NULL AND sub.last_name IS NOT NULL
                  THEN sub.first_name || ' ' || sub.last_name
                ELSE NULL
              END
            ), 200);

            -- valid_from para party_role: fecha de activación o creación
            valid_from_val := COALESCE(sub.activated_at, sub.created_at, NOW());

            -- Crear Party
            INSERT INTO party (
              party_type,
              document_type,
              document_number,
              display_name,
              legal_name,
              status,
              created_at,
              updated_at
            ) VALUES (
              party_type_val,
              doc_type_val,
              doc_number_val,
              display_name_val,
              legal_name_val,
              'ACTIVE'::party_status,
              NOW(),
              NOW()
            ) RETURNING id INTO new_party_id;

            -- Crear PartyRole(CUSTOMER)
            INSERT INTO party_role (
              party_id,
              role,
              status,
              valid_from,
              created_at,
              updated_at
            ) VALUES (
              new_party_id,
              'CUSTOMER'::party_role_type,
              'ACTIVE'::party_role_status,
              valid_from_val,
              NOW(),
              NOW()
            );

            -- Vincular subscriber con el Party creado
            UPDATE subscribers SET party_id = new_party_id WHERE id = sub.id;

            processed := processed + 1;

          EXCEPTION WHEN OTHERS THEN
            -- Registrar error y continuar: no abortar todo el backfill por un subscriber
            errors := errors + 1;
            RAISE NOTICE '[Migración 024] Error procesando subscriber %: %', sub.id, SQLERRM;
          END;
        END LOOP;

        RAISE NOTICE '[Migración 024] Backfill completado: % procesados, % errores', processed, errors;
      END;
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índice primero
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_party_id`);
    // Eliminar columna (no revertir datos en party/party_role — migración aditiva)
    await queryRunner.query(`ALTER TABLE subscribers DROP COLUMN IF EXISTS party_id`);
  }
}
