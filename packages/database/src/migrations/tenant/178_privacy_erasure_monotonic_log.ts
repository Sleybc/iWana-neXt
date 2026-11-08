import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 178 — trigger monótono y bitácora append-only de la supresión (H-1, D-H1-1 y D-H1-2).
 *
 * Reemplaza `titular_prevent_anonymized_mutation()` de la 169 con la rama monótona:
 * sin GUC igual que hoy; con GUC y fila no suprimida igual que hoy (primera
 * supresión); con GUC y fila suprimida solo acepta cambios hacia el estado
 * suprimido (NULL, marcador o contención jsonb) más columnas de control.
 * `DELETE` de fila suprimida siempre rechazado (CA-H1-03).
 *
 * Crea `privacy_erasure_mutation_log`. Su único escritor es la función de
 * trigger `privacy_erasure_log_mutation()` (`AFTER UPDATE`, `SECURITY DEFINER`,
 * dueño `iwana_migrator`, `search_path` fijo) sobre las tres tablas de la 169:
 * registra en el schema de la fila (`TG_TABLE_SCHEMA`) las mutaciones con GUC
 * sobre filas suprimidas, con columnas calculadas de OLD y NEW. No existe
 * función escritora invocable (D-H1-2, corrección 2026-11-08): el escritor
 * parametrizado de la primera entrega se elimina y las funciones nuevas no
 * tienen EXECUTE para PUBLIC. `iwana_app` sin INSERT/UPDATE/DELETE/TRUNCATE,
 * un trigger que rechaza UPDATE/DELETE y otro que rechaza todo INSERT que no
 * venga del trigger escritor (CA-H1-05). `down()` retira el trigger escritor,
 * restaura la función de la 169 y conserva la tabla (CA-H1-07).
 *
 * B1-R3 (2026-11-08, sec-eng P1-1, P2-1, P3-2): el trigger monótono, el escritor y
 * las guardias de la bitácora fijan `search_path = pg_catalog, pg_temp` (operadores y
 * funciones solo de pg_catalog; pg_temp nunca se busca para ellos y, listado al
 * final, tampoco gana en relaciones), y la consulta a `subscribers` se califica con
 * `TG_TABLE_SCHEMA`. Fija lo mismo en la 150 y la 170 con `ALTER FUNCTION`, añade
 * una guardia `BEFORE TRUNCATE` y rellena `contracts.anonymized_at` de los titulares
 * ya suprimidos. `down()` devuelve la 150 y la 170 a su estado previo y conserva la
 * tabla, sus guardias y el relleno.
 *
 * Nota de alcance (2026-11-07): la spec D-H1-1 menciona `1 para el estrato`;
 * tras la 177 el estrato suprimido es NULL (commit 74c3a984, ADR-104). El
 * trigger solo admite NULL para el estrato; la paridad CA-H1-04 compara contra
 * `CRM_RULES` vigentes (kind `null`), no contra el `1` histórico.
 */

export interface H1CatalogEntry {
  column: string;
  kind: 'null' | 'marker' | 'legacy-hash' | 'jsonb';
  marker?: string;
  notNullFallback?: 'marker' | 'encrypted-marker' | 'empty-json' | 'legacy-hash';
  notNull?: boolean;
}

const SUBSCRIBERS_CATALOG: H1CatalogEntry[] = [
  { column: 'document_type', kind: 'marker' },
  { column: 'document_number_encrypted', kind: 'null' },
  { column: 'document_number_hmac', kind: 'null' },
  { column: 'document_number_hash', kind: 'legacy-hash', marker: 'subscriber-document' },
  { column: 'email_hmac', kind: 'null' },
  { column: 'email_hash', kind: 'legacy-hash', marker: 'subscriber-email' },
  { column: 'phone_hmac', kind: 'null' },
  { column: 'phone_hash', kind: 'legacy-hash', marker: 'subscriber-phone' },
  { column: 'first_name', kind: 'marker' },
  { column: 'last_name', kind: 'marker' },
  { column: 'stratum', kind: 'null' },
  { column: 'birth_date', kind: 'null' },
  { column: 'nit', kind: 'marker' },
  { column: 'nit_verification_digit', kind: 'null' },
  { column: 'business_name', kind: 'marker' },
  { column: 'commercial_name', kind: 'null' },
  { column: 'legal_representative_id', kind: 'null' },
  { column: 'email_encrypted', kind: 'null', notNullFallback: 'encrypted-marker' },
  { column: 'phone_encrypted', kind: 'null', notNullFallback: 'encrypted-marker' },
  { column: 'alt_contact_name', kind: 'null' },
  { column: 'alt_contact_phone_encrypted', kind: 'null' },
  { column: 'whatsapp', kind: 'null' },
  { column: 'whatsapp_encrypted', kind: 'null' },
  { column: 'whatsapp_hmac', kind: 'null' },
  { column: 'address', kind: 'null', notNullFallback: 'marker', notNull: true },
  { column: 'neighborhood', kind: 'null' },
  { column: 'city', kind: 'null' },
  { column: 'department', kind: 'null' },
  { column: 'postal_code', kind: 'null' },
  { column: 'latitude', kind: 'null' },
  { column: 'longitude', kind: 'null' },
  { column: 'manual_override_reason', kind: 'null' },
  { column: 'external_id', kind: 'null' },
];

const EXPEDIENTE_CATALOG: H1CatalogEntry[] = [
  { column: 'full_name', kind: 'marker', notNull: true },
  { column: 'source', kind: 'marker', marker: 'OTRO', notNull: true },
  { column: 'document_type', kind: 'null' },
  { column: 'document_number_encrypted', kind: 'null', notNullFallback: 'encrypted-marker' },
  { column: 'document_number_hmac', kind: 'null' },
  { column: 'document_number_hash', kind: 'legacy-hash', marker: 'document' },
  { column: 'gender', kind: 'null' },
  { column: 'birth_date', kind: 'null' },
  { column: 'person_type', kind: 'null' },
  { column: 'company_name', kind: 'null' },
  { column: 'first_name', kind: 'null' },
  { column: 'last_name', kind: 'null' },
  { column: 'primary_contact_name', kind: 'null' },
  { column: 'primary_contact_role', kind: 'null' },
  { column: 'phone_primary_encrypted', kind: 'null' },
  { column: 'phone_secondary_encrypted', kind: 'null' },
  { column: 'email_primary_encrypted', kind: 'null' },
  { column: 'email_secondary', kind: 'null' },
  { column: 'alt_contact_name', kind: 'null' },
  { column: 'alt_contact_phone_encrypted', kind: 'null' },
  { column: 'contact_preference', kind: 'null' },
  { column: 'best_contact_time', kind: 'null' },
  { column: 'address', kind: 'null' },
  { column: 'municipality', kind: 'null' },
  { column: 'department', kind: 'null' },
  { column: 'postal_code', kind: 'null' },
  { column: 'stratum', kind: 'null' },
  { column: 'neighborhood', kind: 'null' },
  { column: 'zone_type', kind: 'null' },
  { column: 'latitude', kind: 'null' },
  { column: 'longitude', kind: 'null' },
  { column: 'access_references', kind: 'null' },
  { column: 'source_detail', kind: 'null' },
  { column: 'campaign', kind: 'null' },
  { column: 'estimated_budget', kind: 'null' },
  { column: 'commercial_notes', kind: 'null' },
  { column: 'technical_observations', kind: 'null' },
  { column: 'estimated_equipment', kind: 'null' },
  { column: 'identity_verified', kind: 'null' },
  { column: 'document_supports', kind: 'null', notNullFallback: 'empty-json' },
  { column: 'fiscal_name', kind: 'null' },
  { column: 'fiscal_document', kind: 'null' },
  { column: 'fiscal_document_encrypted', kind: 'null' },
  { column: 'fiscal_document_hmac', kind: 'null' },
  { column: 'fiscal_address', kind: 'null' },
  { column: 'rut_reference', kind: 'null' },
  { column: 'installation_address', kind: 'null' },
  { column: 'site_contact_name', kind: 'null' },
  { column: 'site_contact_phone_encrypted', kind: 'null' },
  { column: 'availability_window', kind: 'null' },
  { column: 'special_access_notes', kind: 'null' },
  { column: 'required_materials', kind: 'null' },
  { column: 'discard_reason', kind: 'null' },
  { column: 'last_reschedule_reason', kind: 'null' },
  { column: 'last_reschedule_notes', kind: 'null' },
  { column: 'conformity_evidence_ref', kind: 'null' },
];

const CONTRACTS_CATALOG: H1CatalogEntry[] = [
  { column: 'installation_city', kind: 'null' },
  { column: 'installation_department', kind: 'null' },
  { column: 'installation_stratum', kind: 'null' },
  { column: 'installation_address', kind: 'null' },
  { column: 'installation_postal_code', kind: 'null' },
  { column: 'installation_notes', kind: 'null' },
  { column: 'fiscal_name', kind: 'null' },
  { column: 'fiscal_document', kind: 'null' },
  { column: 'fiscal_document_encrypted', kind: 'null' },
  { column: 'fiscal_document_hmac', kind: 'null' },
  { column: 'fiscal_address', kind: 'null' },
  { column: 'alias', kind: 'marker' },
  { column: 'vat_snapshot', kind: 'jsonb' },
  { column: 'plan_snapshot_json', kind: 'jsonb', notNull: true },
];

/** Catálogo exportado para la prueba de paridad CA-H1-04 en `apps/api`. */
export const PRIVACY_H1_MONOTONIC_CATALOG: Record<string, H1CatalogEntry[]> = {
  subscribers: SUBSCRIBERS_CATALOG,
  expediente_records: EXPEDIENTE_CATALOG,
  contracts: CONTRACTS_CATALOG,
};

/** Tablas de la 169 con trigger monótono y trigger escritor de la bitácora. */
const LOGGED_TABLES = ['subscribers', 'expediente_records', 'contracts'] as const;
const LOG_TRIGGER = 'trg_privacy_erasure_log_mutation';

/** search_path fijo de las funciones del bloqueo y la bitácora (B1-R3, P1-1). */
const SAFE_SEARCH_PATH = 'search_path = pg_catalog, pg_temp';

/** Funciones de la 150 y la 170 que la 178 fija y el down devuelve a su estado previo. */
const PINNED_PRIOR_FUNCTIONS = [
  'titular_prevent_anonymization_rewrite()',
  'contract_preserve_retention_clock()',
] as const;

/** Escritor parametrizado de la primera entrega de B1 (falsificable, se retira). */
const LEGACY_WRITER_SIGNATURE =
  'privacy_log_erasure_mutation(text, text, uuid, text, text[], uuid)';

/** Cuerpo de la 169 para el `down()` (restaura y conserva la bitácora). */
const FUNCTION_169_BODY = `
      CREATE OR REPLACE FUNCTION titular_prevent_anonymized_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      DECLARE
        titular_is_anonymized boolean := false;
      BEGIN
        IF current_setting('iwana.titular_erasure', true) = 'on' THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;

        IF TG_TABLE_NAME = 'contracts' THEN
          IF OLD.subscriber_id IS NOT NULL THEN
            SELECT anonymized_at IS NOT NULL
              INTO titular_is_anonymized
              FROM subscribers
             WHERE id = OLD.subscriber_id;
          END IF;
          IF NOT COALESCE(titular_is_anonymized, false) THEN
            IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
            RETURN NEW;
          END IF;

          IF TG_OP = 'UPDATE'
             AND OLD.status::text = 'TERMINATED'
             AND NEW.status::text = 'ARCHIVED'
             AND (to_jsonb(NEW) - ARRAY['status', 'status_reason_code', 'status_changed_at', 'updated_at'])
                 IS NOT DISTINCT FROM
                 (to_jsonb(OLD) - ARRAY['status', 'status_reason_code', 'status_changed_at', 'updated_at']) THEN
            RETURN NEW;
          END IF;
        ELSIF OLD.anonymized_at IS NULL THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;

        RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
          USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
      END;
      $function$
`;

export class PrivacyErasureMonotonicLog1780000000178 implements MigrationInterface {
  name = 'PrivacyErasureMonotonicLog1780000000178';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS privacy_erasure_mutation_log (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        txid bigint NOT NULL,
        "session_user" text NOT NULL,
        table_name text NOT NULL CHECK (table_name IN ('subscribers', 'expediente_records', 'contracts')),
        row_id uuid NOT NULL,
        operation text NOT NULL CHECK (operation = 'UPDATE'),
        changed_columns text[] NOT NULL DEFAULT '{}',
        anonymized_request_id uuid NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_privacy_erasure_log_occurred
        ON privacy_erasure_mutation_log (occurred_at)
    `);

    // Único escritor: función de TRIGGER (no invocable fuera de un trigger, D-H1-2).
    // Corre como su dueño, con search_path fijo; el schema destino es siempre el
    // de la fila mutada (TG_TABLE_SCHEMA) y las columnas salen de OLD y NEW.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_erasure_log_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, pg_temp
      AS $logfn$
      DECLARE
        v_suppressed boolean := false;
        v_req uuid;
        v_changed text[];
      BEGIN
        IF TG_OP <> 'UPDATE'
           OR current_setting('iwana.titular_erasure', true) IS DISTINCT FROM 'on' THEN
          RETURN NULL;
        END IF;

        -- Misma definición de «fila suprimida» que el trigger monótono.
        IF TG_TABLE_NAME = 'contracts' THEN
          IF OLD.subscriber_id IS NOT NULL THEN
            EXECUTE format(
              'SELECT s.anonymized_at IS NOT NULL, s.anonymized_request_id FROM %I.subscribers s WHERE s.id = $1',
              TG_TABLE_SCHEMA
            ) INTO v_suppressed, v_req USING OLD.subscriber_id;
          END IF;
          v_suppressed := COALESCE(v_suppressed, false) OR OLD.anonymized_at IS NOT NULL;
        ELSIF TG_TABLE_NAME IN ('subscribers', 'expediente_records') THEN
          v_suppressed := OLD.anonymized_at IS NOT NULL;
          v_req := COALESCE(NEW.anonymized_request_id, OLD.anonymized_request_id);
        ELSE
          RETURN NULL;
        END IF;
        IF NOT v_suppressed THEN
          RETURN NULL;
        END IF;

        SELECT COALESCE(array_agg(s.k ORDER BY s.k), '{}'::text[]) INTO v_changed
          FROM (
            SELECT key, value FROM jsonb_each(to_jsonb(NEW))
            EXCEPT
            SELECT key, value FROM jsonb_each(to_jsonb(OLD))
          ) s(k, v);

        EXECUTE format(
          'INSERT INTO %I.privacy_erasure_mutation_log (txid, "session_user", table_name, row_id, operation, changed_columns, anonymized_request_id)
           VALUES (pg_current_xact_id()::text::bigint, session_user, $1, $2, $3, $4, $5)',
          TG_TABLE_SCHEMA
        ) USING TG_TABLE_NAME::text, OLD.id, TG_OP::text, v_changed, v_req;
        RETURN NULL;
      END;
      $logfn$
    `);

    // Guardia de inserción: solo el trigger escritor (dentro de otro trigger y
    // ejecutando como dueño de la tabla) puede insertar. Cubre a iwana_app aunque
    // un GRANT amplio posterior le devuelva INSERT sobre la tabla.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_erasure_mutation_log_writer_only()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $wguard$
      BEGIN
        IF pg_trigger_depth() < 2
           OR current_user IS DISTINCT FROM (
             SELECT pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID
           ) THEN
          RAISE EXCEPTION 'Solo el trigger de supresión escribe en la bitácora.'
            USING ERRCODE = '55000', HINT = 'PRIVACY_LOG_WRITER_ONLY';
        END IF;
        RETURN NEW;
      END;
      $wguard$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_privacy_erasure_mutation_log_writer_only ON privacy_erasure_mutation_log
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_privacy_erasure_mutation_log_writer_only
      BEFORE INSERT ON privacy_erasure_mutation_log
      FOR EACH ROW EXECUTE FUNCTION privacy_erasure_mutation_log_writer_only()
    `);

    // Guardia append-only de la bitácora.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_erasure_mutation_log_no_modify()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $guard$
      BEGIN
        RAISE EXCEPTION 'La bitácora de supresión es append-only.'
          USING ERRCODE = '55000', HINT = 'PRIVACY_LOG_APPEND_ONLY';
        RETURN NULL;
      END;
      $guard$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_privacy_erasure_mutation_log_no_modify ON privacy_erasure_mutation_log
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_privacy_erasure_mutation_log_no_modify
      BEFORE UPDATE OR DELETE ON privacy_erasure_mutation_log
      FOR EACH ROW EXECUTE FUNCTION privacy_erasure_mutation_log_no_modify()
    `);
    // P3-2: TRUNCATE no dispara triggers de fila; guardia por sentencia, también
    // frente al dueño de la tabla.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_privacy_erasure_mutation_log_no_truncate ON privacy_erasure_mutation_log
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_privacy_erasure_mutation_log_no_truncate
      BEFORE TRUNCATE ON privacy_erasure_mutation_log
      FOR EACH STATEMENT EXECUTE FUNCTION privacy_erasure_mutation_log_no_modify()
    `);

    // Sin escritura para iwana_app (defensivo si el rol aún no existe).
    await queryRunner.query(`
      DO $priv$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iwana_app') THEN
          EXECUTE 'REVOKE ALL ON TABLE privacy_erasure_mutation_log FROM PUBLIC';
          EXECUTE 'REVOKE ALL ON TABLE privacy_erasure_mutation_log FROM iwana_app';
          EXECUTE 'GRANT SELECT ON TABLE privacy_erasure_mutation_log TO iwana_app';
          EXECUTE 'REVOKE ALL ON SEQUENCE privacy_erasure_mutation_log_id_seq FROM PUBLIC';
          EXECUTE 'REVOKE ALL ON SEQUENCE privacy_erasure_mutation_log_id_seq FROM iwana_app';
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iwana_migrator') THEN
          EXECUTE 'ALTER TABLE privacy_erasure_mutation_log OWNER TO iwana_migrator';
          EXECUTE 'ALTER FUNCTION privacy_erasure_log_mutation() OWNER TO iwana_migrator';
          EXECUTE 'ALTER FUNCTION privacy_erasure_mutation_log_writer_only() OWNER TO iwana_migrator';
          EXECUTE 'ALTER FUNCTION privacy_erasure_mutation_log_no_modify() OWNER TO iwana_migrator';
          EXECUTE 'ALTER FUNCTION titular_prevent_anonymized_mutation() OWNER TO iwana_migrator';
        END IF;
      END;
      $priv$
    `);
    // Funciones nuevas sin EXECUTE para PUBLIC (D-H1-2). El disparo de un trigger
    // no comprueba EXECUTE; solo cierra la invocación directa.
    await queryRunner.query(`REVOKE ALL ON FUNCTION privacy_erasure_log_mutation() FROM PUBLIC`);
    await queryRunner.query(
      `REVOKE ALL ON FUNCTION privacy_erasure_mutation_log_writer_only() FROM PUBLIC`,
    );
    await queryRunner.query(
      `REVOKE ALL ON FUNCTION privacy_erasure_mutation_log_no_modify() FROM PUBLIC`,
    );

    // Trigger escritor sobre las tres tablas de la 169.
    for (const table of LOGGED_TABLES) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS ${LOG_TRIGGER} ON ${table}`);
      await queryRunner.query(`
        CREATE TRIGGER ${LOG_TRIGGER}
        AFTER UPDATE ON ${table}
        FOR EACH ROW
        WHEN (current_setting('iwana.titular_erasure', true) = 'on')
        EXECUTE FUNCTION privacy_erasure_log_mutation()
      `);
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION titular_prevent_anonymized_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $function$
      DECLARE
        titular_is_anonymized boolean := false;
        v_guc text;
      BEGIN
        -- search_path fijo (B1-R3, P1-1): operadores y funciones salen de pg_catalog y
        -- la tabla del suscriptor se califica con el schema de la fila, nunca pg_temp.
        -- Contratos: suprimida si el suscriptor lo está o si la propia fila está marcada (177).
        IF TG_TABLE_NAME = 'contracts' THEN
          IF OLD.subscriber_id IS NOT NULL THEN
            EXECUTE format(
              'SELECT s.anonymized_at IS NOT NULL FROM %I.subscribers s WHERE s.id = $1',
              TG_TABLE_SCHEMA
            ) INTO titular_is_anonymized USING OLD.subscriber_id;
          END IF;
          IF NOT COALESCE(titular_is_anonymized, false) THEN
            titular_is_anonymized := OLD.anonymized_at IS NOT NULL;
          END IF;
          IF NOT COALESCE(titular_is_anonymized, false) THEN
            IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
            RETURN NEW;
          END IF;

          IF TG_OP = 'UPDATE'
             AND OLD.status::text = 'TERMINATED'
             AND NEW.status::text = 'ARCHIVED'
             AND (to_jsonb(NEW) - ARRAY['status', 'status_reason_code', 'status_changed_at', 'updated_at'])
                 IS NOT DISTINCT FROM
                 (to_jsonb(OLD) - ARRAY['status', 'status_reason_code', 'status_changed_at', 'updated_at']) THEN
            RETURN NEW;
          END IF;
        ELSIF OLD.anonymized_at IS NULL THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;

        -- Fila suprimida, fuera del archivo: DELETE siempre rechazado.
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
            USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
        END IF;

        v_guc := current_setting('iwana.titular_erasure', true);
        IF v_guc IS DISTINCT FROM 'on' THEN
          RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
            USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
        END IF;

        -- Rama monótona con GUC sobre fila suprimida.
        IF TG_TABLE_NAME = 'subscribers' THEN
          IF NEW.anonymized_at IS DISTINCT FROM OLD.anonymized_at THEN
            IF NOT (OLD.anonymized_at IS NULL AND NEW.anonymized_at IS NOT NULL) THEN
              RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
                USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
            END IF;
          END IF;
          IF NEW.anonymized_request_id IS DISTINCT FROM OLD.anonymized_request_id THEN
            IF NOT (OLD.anonymized_request_id IS NULL AND NEW.anonymized_request_id IS NOT NULL) THEN
              RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
                USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
            END IF;
          END IF;
          IF NEW.document_type IS DISTINCT FROM OLD.document_type
             AND NEW.document_type IS NOT NULL AND NEW.document_type <> 'ANONIMIZADO' THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.document_number_encrypted IS DISTINCT FROM OLD.document_number_encrypted
             AND NEW.document_number_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.document_number_hmac IS DISTINCT FROM OLD.document_number_hmac
             AND NEW.document_number_hmac IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF (to_jsonb(NEW) ->> 'document_number_hash') IS DISTINCT FROM (to_jsonb(OLD) ->> 'document_number_hash')
             AND (to_jsonb(NEW) ->> 'document_number_hash') IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.email_hmac IS DISTINCT FROM OLD.email_hmac AND NEW.email_hmac IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF (to_jsonb(NEW) ->> 'email_hash') IS DISTINCT FROM (to_jsonb(OLD) ->> 'email_hash')
             AND (to_jsonb(NEW) ->> 'email_hash') IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.phone_hmac IS DISTINCT FROM OLD.phone_hmac AND NEW.phone_hmac IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF (to_jsonb(NEW) ->> 'phone_hash') IS DISTINCT FROM (to_jsonb(OLD) ->> 'phone_hash')
             AND (to_jsonb(NEW) ->> 'phone_hash') IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.first_name IS DISTINCT FROM OLD.first_name
             AND NEW.first_name IS NOT NULL AND NEW.first_name <> 'ANONIMIZADO' THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.last_name IS DISTINCT FROM OLD.last_name
             AND NEW.last_name IS NOT NULL AND NEW.last_name <> 'ANONIMIZADO' THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.stratum IS DISTINCT FROM OLD.stratum AND NEW.stratum IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.birth_date IS DISTINCT FROM OLD.birth_date AND NEW.birth_date IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.nit IS DISTINCT FROM OLD.nit
             AND NEW.nit IS NOT NULL AND NEW.nit <> 'ANONIMIZADO' THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.nit_verification_digit IS DISTINCT FROM OLD.nit_verification_digit
             AND NEW.nit_verification_digit IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.business_name IS DISTINCT FROM OLD.business_name
             AND NEW.business_name IS NOT NULL AND NEW.business_name <> 'ANONIMIZADO' THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.commercial_name IS DISTINCT FROM OLD.commercial_name AND NEW.commercial_name IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.legal_representative_id IS DISTINCT FROM OLD.legal_representative_id
             AND NEW.legal_representative_id IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.email_encrypted IS DISTINCT FROM OLD.email_encrypted AND NEW.email_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.phone_encrypted IS DISTINCT FROM OLD.phone_encrypted AND NEW.phone_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.alt_contact_name IS DISTINCT FROM OLD.alt_contact_name AND NEW.alt_contact_name IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.alt_contact_phone_encrypted IS DISTINCT FROM OLD.alt_contact_phone_encrypted
             AND NEW.alt_contact_phone_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.whatsapp IS DISTINCT FROM OLD.whatsapp AND NEW.whatsapp IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.whatsapp_encrypted IS DISTINCT FROM OLD.whatsapp_encrypted AND NEW.whatsapp_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.whatsapp_hmac IS DISTINCT FROM OLD.whatsapp_hmac AND NEW.whatsapp_hmac IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.address IS DISTINCT FROM OLD.address AND NEW.address <> 'ANONIMIZADO' THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.neighborhood IS DISTINCT FROM OLD.neighborhood AND NEW.neighborhood IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.city IS DISTINCT FROM OLD.city AND NEW.city IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.department IS DISTINCT FROM OLD.department AND NEW.department IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.postal_code IS DISTINCT FROM OLD.postal_code AND NEW.postal_code IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.latitude IS DISTINCT FROM OLD.latitude AND NEW.latitude IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.longitude IS DISTINCT FROM OLD.longitude AND NEW.longitude IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.manual_override_reason IS DISTINCT FROM OLD.manual_override_reason
             AND NEW.manual_override_reason IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.external_id IS DISTINCT FROM OLD.external_id AND NEW.external_id IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF (to_jsonb(NEW) - ARRAY['document_type', 'document_number_encrypted', 'document_number_hmac', 'document_number_hash', 'email_hmac', 'email_hash', 'phone_hmac', 'phone_hash', 'first_name', 'last_name', 'stratum', 'birth_date', 'nit', 'nit_verification_digit', 'business_name', 'commercial_name', 'legal_representative_id', 'email_encrypted', 'phone_encrypted', 'alt_contact_name', 'alt_contact_phone_encrypted', 'whatsapp', 'whatsapp_encrypted', 'whatsapp_hmac', 'address', 'neighborhood', 'city', 'department', 'postal_code', 'latitude', 'longitude', 'manual_override_reason', 'external_id', 'anonymized_at', 'anonymized_request_id', 'updated_at'])
              IS DISTINCT FROM
             (to_jsonb(OLD) - ARRAY['document_type', 'document_number_encrypted', 'document_number_hmac', 'document_number_hash', 'email_hmac', 'email_hash', 'phone_hmac', 'phone_hash', 'first_name', 'last_name', 'stratum', 'birth_date', 'nit', 'nit_verification_digit', 'business_name', 'commercial_name', 'legal_representative_id', 'email_encrypted', 'phone_encrypted', 'alt_contact_name', 'alt_contact_phone_encrypted', 'whatsapp', 'whatsapp_encrypted', 'whatsapp_hmac', 'address', 'neighborhood', 'city', 'department', 'postal_code', 'latitude', 'longitude', 'manual_override_reason', 'external_id', 'anonymized_at', 'anonymized_request_id', 'updated_at']) THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
        ELSIF TG_TABLE_NAME = 'expediente_records' THEN
          IF NEW.anonymized_at IS DISTINCT FROM OLD.anonymized_at THEN
            IF NOT (OLD.anonymized_at IS NULL AND NEW.anonymized_at IS NOT NULL) THEN
              RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
                USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
            END IF;
          END IF;
          IF NEW.anonymized_request_id IS DISTINCT FROM OLD.anonymized_request_id THEN
            IF NOT (OLD.anonymized_request_id IS NULL AND NEW.anonymized_request_id IS NOT NULL) THEN
              RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
                USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
            END IF;
          END IF;
          IF NEW.full_name IS DISTINCT FROM OLD.full_name AND NEW.full_name <> 'ANONIMIZADO' THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.source IS DISTINCT FROM OLD.source AND NEW.source <> 'OTRO' THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.document_type IS DISTINCT FROM OLD.document_type AND NEW.document_type IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.document_number_encrypted IS DISTINCT FROM OLD.document_number_encrypted
             AND NEW.document_number_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.document_number_hmac IS DISTINCT FROM OLD.document_number_hmac
             AND NEW.document_number_hmac IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF (to_jsonb(NEW) ->> 'document_number_hash') IS DISTINCT FROM (to_jsonb(OLD) ->> 'document_number_hash')
             AND (to_jsonb(NEW) ->> 'document_number_hash') IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.gender IS DISTINCT FROM OLD.gender AND NEW.gender IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.birth_date IS DISTINCT FROM OLD.birth_date AND NEW.birth_date IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.person_type IS DISTINCT FROM OLD.person_type AND NEW.person_type IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.company_name IS DISTINCT FROM OLD.company_name AND NEW.company_name IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.first_name IS DISTINCT FROM OLD.first_name AND NEW.first_name IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.last_name IS DISTINCT FROM OLD.last_name AND NEW.last_name IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.primary_contact_name IS DISTINCT FROM OLD.primary_contact_name
             AND NEW.primary_contact_name IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.primary_contact_role IS DISTINCT FROM OLD.primary_contact_role
             AND NEW.primary_contact_role IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.phone_primary_encrypted IS DISTINCT FROM OLD.phone_primary_encrypted
             AND NEW.phone_primary_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.phone_secondary_encrypted IS DISTINCT FROM OLD.phone_secondary_encrypted
             AND NEW.phone_secondary_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.email_primary_encrypted IS DISTINCT FROM OLD.email_primary_encrypted
             AND NEW.email_primary_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.email_secondary IS DISTINCT FROM OLD.email_secondary AND NEW.email_secondary IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.alt_contact_name IS DISTINCT FROM OLD.alt_contact_name AND NEW.alt_contact_name IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.alt_contact_phone_encrypted IS DISTINCT FROM OLD.alt_contact_phone_encrypted
             AND NEW.alt_contact_phone_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.contact_preference IS DISTINCT FROM OLD.contact_preference
             AND NEW.contact_preference IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.best_contact_time IS DISTINCT FROM OLD.best_contact_time
             AND NEW.best_contact_time IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.address IS DISTINCT FROM OLD.address AND NEW.address IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.municipality IS DISTINCT FROM OLD.municipality AND NEW.municipality IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.department IS DISTINCT FROM OLD.department AND NEW.department IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.postal_code IS DISTINCT FROM OLD.postal_code AND NEW.postal_code IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.stratum IS DISTINCT FROM OLD.stratum AND NEW.stratum IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.neighborhood IS DISTINCT FROM OLD.neighborhood AND NEW.neighborhood IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.zone_type IS DISTINCT FROM OLD.zone_type AND NEW.zone_type IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.latitude IS DISTINCT FROM OLD.latitude AND NEW.latitude IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.longitude IS DISTINCT FROM OLD.longitude AND NEW.longitude IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.access_references IS DISTINCT FROM OLD.access_references
             AND NEW.access_references IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.source_detail IS DISTINCT FROM OLD.source_detail AND NEW.source_detail IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.campaign IS DISTINCT FROM OLD.campaign AND NEW.campaign IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.estimated_budget IS DISTINCT FROM OLD.estimated_budget AND NEW.estimated_budget IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.commercial_notes IS DISTINCT FROM OLD.commercial_notes AND NEW.commercial_notes IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.technical_observations IS DISTINCT FROM OLD.technical_observations
             AND NEW.technical_observations IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.estimated_equipment IS DISTINCT FROM OLD.estimated_equipment
             AND NEW.estimated_equipment IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.identity_verified IS DISTINCT FROM OLD.identity_verified
             AND NEW.identity_verified IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.document_supports IS DISTINCT FROM OLD.document_supports THEN
            IF NEW.document_supports IS NOT NULL
               AND NEW.document_supports <> '{}'::jsonb
               AND NOT (OLD.document_supports @> NEW.document_supports) THEN
              RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
                USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
            END IF;
          END IF;
          IF NEW.fiscal_name IS DISTINCT FROM OLD.fiscal_name AND NEW.fiscal_name IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.fiscal_document IS DISTINCT FROM OLD.fiscal_document AND NEW.fiscal_document IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.fiscal_document_encrypted IS DISTINCT FROM OLD.fiscal_document_encrypted
             AND NEW.fiscal_document_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.fiscal_document_hmac IS DISTINCT FROM OLD.fiscal_document_hmac
             AND NEW.fiscal_document_hmac IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.fiscal_address IS DISTINCT FROM OLD.fiscal_address AND NEW.fiscal_address IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.rut_reference IS DISTINCT FROM OLD.rut_reference AND NEW.rut_reference IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.installation_address IS DISTINCT FROM OLD.installation_address
             AND NEW.installation_address IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.site_contact_name IS DISTINCT FROM OLD.site_contact_name
             AND NEW.site_contact_name IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.site_contact_phone_encrypted IS DISTINCT FROM OLD.site_contact_phone_encrypted
             AND NEW.site_contact_phone_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.availability_window IS DISTINCT FROM OLD.availability_window
             AND NEW.availability_window IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.special_access_notes IS DISTINCT FROM OLD.special_access_notes
             AND NEW.special_access_notes IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.required_materials IS DISTINCT FROM OLD.required_materials
             AND NEW.required_materials IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.discard_reason IS DISTINCT FROM OLD.discard_reason AND NEW.discard_reason IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.last_reschedule_reason IS DISTINCT FROM OLD.last_reschedule_reason
             AND NEW.last_reschedule_reason IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.last_reschedule_notes IS DISTINCT FROM OLD.last_reschedule_notes
             AND NEW.last_reschedule_notes IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.conformity_evidence_ref IS DISTINCT FROM OLD.conformity_evidence_ref
             AND NEW.conformity_evidence_ref IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF (to_jsonb(NEW) - ARRAY['full_name', 'source', 'document_type', 'document_number_encrypted', 'document_number_hmac', 'document_number_hash', 'gender', 'birth_date', 'person_type', 'company_name', 'first_name', 'last_name', 'primary_contact_name', 'primary_contact_role', 'phone_primary_encrypted', 'phone_secondary_encrypted', 'email_primary_encrypted', 'email_secondary', 'alt_contact_name', 'alt_contact_phone_encrypted', 'contact_preference', 'best_contact_time', 'address', 'municipality', 'department', 'postal_code', 'stratum', 'neighborhood', 'zone_type', 'latitude', 'longitude', 'access_references', 'source_detail', 'campaign', 'estimated_budget', 'commercial_notes', 'technical_observations', 'estimated_equipment', 'identity_verified', 'document_supports', 'fiscal_name', 'fiscal_document', 'fiscal_document_encrypted', 'fiscal_document_hmac', 'fiscal_address', 'rut_reference', 'installation_address', 'site_contact_name', 'site_contact_phone_encrypted', 'availability_window', 'special_access_notes', 'required_materials', 'discard_reason', 'last_reschedule_reason', 'last_reschedule_notes', 'conformity_evidence_ref', 'anonymized_at', 'anonymized_request_id', 'updated_at'])
              IS DISTINCT FROM
             (to_jsonb(OLD) - ARRAY['full_name', 'source', 'document_type', 'document_number_encrypted', 'document_number_hmac', 'document_number_hash', 'gender', 'birth_date', 'person_type', 'company_name', 'first_name', 'last_name', 'primary_contact_name', 'primary_contact_role', 'phone_primary_encrypted', 'phone_secondary_encrypted', 'email_primary_encrypted', 'email_secondary', 'alt_contact_name', 'alt_contact_phone_encrypted', 'contact_preference', 'best_contact_time', 'address', 'municipality', 'department', 'postal_code', 'stratum', 'neighborhood', 'zone_type', 'latitude', 'longitude', 'access_references', 'source_detail', 'campaign', 'estimated_budget', 'commercial_notes', 'technical_observations', 'estimated_equipment', 'identity_verified', 'document_supports', 'fiscal_name', 'fiscal_document', 'fiscal_document_encrypted', 'fiscal_document_hmac', 'fiscal_address', 'rut_reference', 'installation_address', 'site_contact_name', 'site_contact_phone_encrypted', 'availability_window', 'special_access_notes', 'required_materials', 'discard_reason', 'last_reschedule_reason', 'last_reschedule_notes', 'conformity_evidence_ref', 'anonymized_at', 'anonymized_request_id', 'updated_at']) THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
        ELSIF TG_TABLE_NAME = 'contracts' THEN
          IF NEW.anonymized_at IS DISTINCT FROM OLD.anonymized_at THEN
            IF NOT (OLD.anonymized_at IS NULL AND NEW.anonymized_at IS NOT NULL) THEN
              RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
                USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
            END IF;
          END IF;
          IF NEW.status IS DISTINCT FROM OLD.status
             OR NEW.status_reason_code IS DISTINCT FROM OLD.status_reason_code
             OR NEW.status_changed_at IS DISTINCT FROM OLD.status_changed_at THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.installation_city IS DISTINCT FROM OLD.installation_city
             AND NEW.installation_city IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.installation_department IS DISTINCT FROM OLD.installation_department
             AND NEW.installation_department IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.installation_stratum IS DISTINCT FROM OLD.installation_stratum
             AND NEW.installation_stratum IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.installation_address IS DISTINCT FROM OLD.installation_address
             AND NEW.installation_address IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.installation_postal_code IS DISTINCT FROM OLD.installation_postal_code
             AND NEW.installation_postal_code IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.installation_notes IS DISTINCT FROM OLD.installation_notes
             AND NEW.installation_notes IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.fiscal_name IS DISTINCT FROM OLD.fiscal_name AND NEW.fiscal_name IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.fiscal_document IS DISTINCT FROM OLD.fiscal_document AND NEW.fiscal_document IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.fiscal_document_encrypted IS DISTINCT FROM OLD.fiscal_document_encrypted
             AND NEW.fiscal_document_encrypted IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.fiscal_document_hmac IS DISTINCT FROM OLD.fiscal_document_hmac
             AND NEW.fiscal_document_hmac IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.fiscal_address IS DISTINCT FROM OLD.fiscal_address AND NEW.fiscal_address IS NOT NULL THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.alias IS DISTINCT FROM OLD.alias
             AND NEW.alias IS NOT NULL AND NEW.alias <> 'ANONIMIZADO' THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
          IF NEW.vat_snapshot IS DISTINCT FROM OLD.vat_snapshot THEN
            IF NEW.vat_snapshot IS NOT NULL
               AND NEW.vat_snapshot <> '{}'::jsonb
               AND NOT (OLD.vat_snapshot @> NEW.vat_snapshot) THEN
              RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
                USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
            END IF;
          END IF;
          IF NEW.plan_snapshot_json IS DISTINCT FROM OLD.plan_snapshot_json THEN
            IF NEW.plan_snapshot_json <> '{}'::jsonb
               AND NOT (OLD.plan_snapshot_json @> NEW.plan_snapshot_json) THEN
              RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
                USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
            END IF;
          END IF;
          IF (to_jsonb(NEW) - ARRAY['installation_city', 'installation_department', 'installation_stratum', 'installation_address', 'installation_postal_code', 'installation_notes', 'fiscal_name', 'fiscal_document', 'fiscal_document_encrypted', 'fiscal_document_hmac', 'fiscal_address', 'alias', 'vat_snapshot', 'plan_snapshot_json', 'anonymized_at', 'updated_at', 'status', 'status_reason_code', 'status_changed_at'])
              IS DISTINCT FROM
             (to_jsonb(OLD) - ARRAY['installation_city', 'installation_department', 'installation_stratum', 'installation_address', 'installation_postal_code', 'installation_notes', 'fiscal_name', 'fiscal_document', 'fiscal_document_encrypted', 'fiscal_document_hmac', 'fiscal_address', 'alias', 'vat_snapshot', 'plan_snapshot_json', 'anonymized_at', 'updated_at', 'status', 'status_reason_code', 'status_changed_at']) THEN
            RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
              USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
          END IF;
        ELSE
          RAISE EXCEPTION 'Tabla fuera del alcance del bloqueo.'
            USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
        END IF;

        -- La bitácora la escribe el trigger AFTER UPDATE (D-H1-2); un RAISE de
        -- aquí revierte la transacción y no deja entrada (CA-H1-01).
        RETURN NEW;
      END;
      $function$
    `);

    await queryRunner.query(`
      DO $priv2$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iwana_migrator') THEN
          EXECUTE 'ALTER FUNCTION titular_prevent_anonymized_mutation() OWNER TO iwana_migrator';
        END IF;
      END;
      $priv2$
    `);

    // Retira el escritor invocable de la primera entrega de B1 (corrección 2026-11-08).
    await queryRunner.query(`DROP FUNCTION IF EXISTS ${LEGACY_WRITER_SIGNATURE}`);

    // P1-1: la 150 y la 170 comparan con IS DISTINCT FROM / NOT IN y no leen tablas;
    // con search_path fijo dejan de depender del de quien dispara el trigger.
    for (const signature of PINNED_PRIOR_FUNCTIONS) {
      await queryRunner.query(`ALTER FUNCTION ${signature} SET ${SAFE_SEARCH_PATH}`);
    }

    // Relleno: contratos cuyo titular ya está suprimido llevan su propia marca (177),
    // para no depender solo de la consulta al suscriptor. `contracts` no tiene
    // anonymized_request_id. No usa el GUC: D-RER-6 y D-H1-4 lo reservan a los dos
    // escritores de la supresión (guarda `crm-blocked-mutations.arch.spec.ts`). El
    // trigger monótono de contratos se desactiva y reactiva dentro del mismo DO, así
    // que un fallo revierte las tres sentencias juntas y nada queda desactivado. Sin
    // GUC, la bitácora no registra el relleno; queda en el historial de migraciones.
    await queryRunner.query(`
      DO $backfill$
      BEGIN
        ALTER TABLE contracts DISABLE TRIGGER trg_contracts_prevent_anonymized_mutation;
        UPDATE contracts c
           SET anonymized_at = s.anonymized_at
          FROM subscribers s
         WHERE s.id = c.subscriber_id
           AND s.anonymized_at IS NOT NULL
           AND c.anonymized_at IS NULL;
        ALTER TABLE contracts ENABLE TRIGGER trg_contracts_prevent_anonymized_mutation;
      END;
      $backfill$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of LOGGED_TABLES) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS ${LOG_TRIGGER} ON ${table}`);
    }
    await queryRunner.query(`DROP FUNCTION IF EXISTS privacy_erasure_log_mutation()`);
    // CREATE OR REPLACE sin cláusula SET deja la 169 sin search_path, como estaba.
    await queryRunner.query(FUNCTION_169_BODY);
    for (const signature of PINNED_PRIOR_FUNCTIONS) {
      await queryRunner.query(`ALTER FUNCTION ${signature} RESET search_path`);
    }
    await queryRunner.query(`
      DO $priv$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iwana_migrator') THEN
          EXECUTE 'ALTER FUNCTION titular_prevent_anonymized_mutation() OWNER TO iwana_migrator';
        END IF;
      END;
      $priv$
    `);
  }
}
