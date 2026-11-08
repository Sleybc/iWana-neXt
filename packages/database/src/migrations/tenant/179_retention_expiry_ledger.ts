import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 179 — ledger de vencimiento H-EXP y minimización de solicitudes (D-EXP-3).
 *
 * Schema tenant. Crea `privacy_retention_expiry_runs` (idempotencia por
 * tipo, objetivo y versión de reglas) y `privacy_retention_expiry_cursors`
 * (cursor persistido por corrida), agrega a `data_subject_requests`
 * `closed_at` (cierre verificable de TRASLADADA/DESISTIDA),
 * `minimized_at`/`retention_closed_at` (minimización del paquete) y la
 * clasificación de `transferred_to` (`transfer_destination_kind/code/name`),
 * con backfill determinista de `closed_at` desde el evento de entrada
 * terminal. La Fase 2 (autorizaciones, Media físico) queda fuera.
 *
 * B2-R (2026-11-08, H1/H2 del plan): la 179 no está publicada y se corrige
 * sin migración nueva. Anular `reason` exige solicitud ya minimizada y motivo
 * fuera de la lista cerrada del trigger (`RESOLVE`, `TRASLADO`,
 * `DESISTIMIENTO`, `PRORROGA`, `REAPERTURA`, `TAREA_COMPLETADA:%`); anular
 * `requester_evidence_media_id` exige `minimized_at` en la misma actualización
 * o ya presente; `minimized_at` es monótono y solo se fija con estado
 * terminal; la fila minimizada solo cambia hacia NULL. Funciones con
 * `search_path = pg_catalog, pg_temp` y consultas calificadas con
 * `TG_TABLE_SCHEMA`, como en la 178 (B1-R3). `down()` quita el trigger nuevo
 * y restaura las funciones de la 146 tal cual.
 *
 * B2-R2 (sin publicar): el ledger guarda `reason_code` con CHECK de lista
 * cerrada (los RetentionExpiryReason del servicio); `fail()` lo escribe y
 * un throw dentro del SAVEPOINT deja fila FAILED o ATTENTION_REQUIRED con
 * su código en lugar de perderse en el resumen en memoria.
 *
 * B2-R3 (sin publicar, plan §1.5): la lista cerrada suma
 * `CONTRACT_UNRECONCILED` y `FISCAL_UNRECONCILED`; R4 cubre además
 * `transferred_to`, `transfer_destination_*`, arrays de contratos y
 * `status`; guardia `BEFORE TRUNCATE` como la 178; el ledger del prospecto
 * guarda `request_id` NULL.
 *
 * B4-R2 (sin publicar, plan §1.8 B-3): sale `PROSPECT_HAS_CONTRACT`, que
 * ningún camino produce (el contrato sobrevenido de un prospecto lo bloquea
 * el plan de supresión como `UNRECONCILED_SCOPE`). `PROSPECT_UNRECONCILED` y
 * `MISSING_REQUEST_CLOSURE` quedan con productor real en el barrido.
 *
 * `down()` falla si hay actos confirmados (ledger COMPLETE o paquetes
 * minimizados); en limpio revierte la estructura. Nunca restaura datos.
 */
export class RetentionExpiryLedger1790000000179 implements MigrationInterface {
  name = 'RetentionExpiryLedger1790000000179';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS privacy_retention_expiry_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tipo text NOT NULL CHECK (tipo IN ('TITULAR', 'REQUEST')),
        target_id uuid NOT NULL,
        request_id uuid NULL,
        eligible_on date NOT NULL,
        rules_version integer NOT NULL DEFAULT 1,
        estado text NOT NULL DEFAULT 'PENDING'
          CHECK (estado IN ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'ATTENTION_REQUIRED')),
        changed_rows integer NOT NULL DEFAULT 0,
        reason_code text NULL,
        started_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz NULL,
        CONSTRAINT uq_retention_expiry_runs_target UNIQUE (tipo, target_id, rules_version)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE privacy_retention_expiry_runs
        DROP CONSTRAINT IF EXISTS chk_retention_expiry_runs_reason_code
    `);
    await queryRunner.query(`
      ALTER TABLE privacy_retention_expiry_runs
        ADD CONSTRAINT chk_retention_expiry_runs_reason_code
          CHECK (
            reason_code IS NULL
            OR reason_code IN ('OPEN_CONTRACT', 'CONTRACT_RETENTION', 'FISCAL_RETENTION',
              'PQR_RETENTION', 'PROSPECT_UNRECONCILED',
              'REQUEST_ACTIVE_HOLD', 'REQUEST_CHANGED', 'MARK_NOT_ACTIVE',
              'MISSING_REQUEST_CLOSURE', 'MISSING_POLICY', 'PORT_UNAVAILABLE',
              'UNRECONCILED_SCOPE', 'ACTIVE_ACCOUNT', 'SUPPLIER_LINKED',
              'TOO_MANY_CANDIDATES', 'PARTICIPANT_ERROR', 'RESIDUAL_MISMATCH',
              'CLASSIFICATION_INVALID', 'SCHEMA_INCOMPATIBLE',
              'CONTRACT_UNRECONCILED', 'FISCAL_UNRECONCILED')
          )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_retention_expiry_runs_open
        ON privacy_retention_expiry_runs (estado)
        WHERE estado <> 'COMPLETE'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_retention_expiry_runs_cursor
        ON privacy_retention_expiry_runs (eligible_on, target_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS privacy_retention_expiry_cursors (
        run_id uuid PRIMARY KEY,
        phase text NOT NULL CHECK (phase IN ('TITULAR', 'PROSPECTO', 'SOLICITUD')),
        last_eligible_on date NULL,
        last_id uuid NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE data_subject_requests
        ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL,
        ADD COLUMN IF NOT EXISTS minimized_at timestamptz NULL,
        ADD COLUMN IF NOT EXISTS retention_closed_at timestamptz NULL,
        ADD COLUMN IF NOT EXISTS transfer_destination_kind text NULL,
        ADD COLUMN IF NOT EXISTS transfer_destination_code text NULL,
        ADD COLUMN IF NOT EXISTS transfer_destination_name text NULL
    `);
    await queryRunner.query(`
      ALTER TABLE data_subject_requests
        DROP CONSTRAINT IF EXISTS chk_transfer_destination_kind
    `);
    await queryRunner.query(`
      ALTER TABLE data_subject_requests
        ADD CONSTRAINT chk_transfer_destination_kind
          CHECK (
            transfer_destination_kind IS NULL
            OR transfer_destination_kind IN ('INSTITUTION', 'PERSON', 'UNCLASSIFIED')
          )
    `);
    await queryRunner.query(`
      ALTER TABLE data_subject_requests
        DROP CONSTRAINT IF EXISTS chk_transfer_destination_institution
    `);
    await queryRunner.query(`
      ALTER TABLE data_subject_requests
        ADD CONSTRAINT chk_transfer_destination_institution
          CHECK (
            transfer_destination_kind IS DISTINCT FROM 'INSTITUTION'
            OR (transfer_destination_code IS NOT NULL AND transfer_destination_name IS NOT NULL)
          )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_subject_requests_pending_minimization
        ON data_subject_requests (status)
        WHERE minimized_at IS NULL
          AND status IN ('RESUELTA', 'NO_PROCEDENTE', 'TRASLADADA', 'DESISTIDA')
    `);

    // La tarea de clasificación de D-EXP-3 amplía el catálogo cerrado de la 172.
    await queryRunner.query(`
      ALTER TABLE data_subject_request_tasks
        DROP CONSTRAINT IF EXISTS ck_data_subject_request_tasks_kind
    `);
    await queryRunner.query(`
      ALTER TABLE data_subject_request_tasks
        ADD CONSTRAINT ck_data_subject_request_tasks_kind
          CHECK (kind IN ('SUSPENDER_COBRO_EXTERNO', 'ENTREGAR_COPIA_DOCUMENTOS',
            'FORMULAR_DENUNCIA_OPERADOR', 'COMUNICAR_PLAZO_DENUNCIA',
            'CLASIFICAR_DESTINO_TRASLADO'))
    `);

    // Backfill determinista: la entrada terminal más antigua al estado final.
    await queryRunner.query(`
      UPDATE data_subject_requests r
         SET closed_at = e.occurred_at
        FROM (
          SELECT DISTINCT ON (request_id) request_id, occurred_at
            FROM data_subject_request_events
           WHERE to_status IN ('TRASLADADA', 'DESISTIDA')
           ORDER BY request_id, occurred_at ASC
        ) e
       WHERE r.id = e.request_id
         AND r.status IN ('TRASLADADA', 'DESISTIDA')
         AND r.closed_at IS NULL
    `);

    // D-EXP-3 contra el trigger append-only de la 146: los eventos solo
    // admiten anular el motivo libre en la minimización (nada más cambia);
    // cualquier otro UPDATE o DELETE sigue rechazado. La lista cerrada de
    // códigos protegidos vive en el trigger (B2-R: R1); el servicio conserva
    // su propio filtro. search_path fijo y consulta calificada con
    // TG_TABLE_SCHEMA, como en la 178 (B1-R3).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_reject_append_only_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $function$
      DECLARE
        v_minimized_at timestamptz;
      BEGIN
        IF TG_TABLE_NAME = 'data_subject_request_events'
           AND TG_OP = 'UPDATE'
           AND NEW.reason IS NULL AND OLD.reason IS NOT NULL
           AND (to_jsonb(NEW) - 'reason') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'reason') THEN
          -- R1: anular el motivo solo en una solicitud ya minimizada y nunca
          -- para un código protegido (RESOLVE, TRASLADO, DESISTIMIENTO,
          -- PRORROGA, REAPERTURA, TAREA_COMPLETADA:%).
          IF OLD.reason IN ('RESOLVE', 'TRASLADO', 'DESISTIMIENTO', 'PRORROGA', 'REAPERTURA')
             OR OLD.reason LIKE 'TAREA_COMPLETADA:%' THEN
            RAISE EXCEPTION 'El motivo protegido de la solicitud no se puede anular.'
              USING ERRCODE = '55000';
          END IF;
          EXECUTE format(
            'SELECT r.minimized_at FROM %I.data_subject_requests r WHERE r.id = $1',
            TG_TABLE_SCHEMA
          ) INTO v_minimized_at USING OLD.request_id;
          IF v_minimized_at IS NULL THEN
            RAISE EXCEPTION 'El motivo de la solicitud solo se anula en la minimización.'
              USING ERRCODE = '55000';
          END IF;
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'La evidencia de privacidad es de solo anexar: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
          USING ERRCODE = '55000';
      END;
      $function$
    `);

    // D-EXP-3 contra el trigger de identidad de la 146: la evidencia puede
    // anularse solo en la minimización (misma actualización que fija
    // minimized_at o fila ya minimizada); reescribir lo verificado sigue
    // rechazado. search_path fijo, como en la 178 (B1-R3).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_prevent_verified_identity_change()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $function$
      BEGIN
        IF OLD.identity_verified_at IS NOT NULL AND (
          NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at OR
          NEW.identity_verified_by IS DISTINCT FROM OLD.identity_verified_by OR
          NEW.identity_verification_method IS DISTINCT FROM OLD.identity_verification_method OR
          (NEW.requester_evidence_media_id IS DISTINCT FROM OLD.requester_evidence_media_id
           AND NEW.requester_evidence_media_id IS NOT NULL)
        ) THEN
          RAISE EXCEPTION 'La identidad verificada de la solicitud no se puede cambiar'
            USING ERRCODE = '55000';
        END IF;
        -- R2: anular la evidencia exige minimized_at (fijado en la misma
        -- actualización o ya presente en la fila).
        IF OLD.identity_verified_at IS NOT NULL
           AND OLD.requester_evidence_media_id IS NOT NULL
           AND NEW.requester_evidence_media_id IS DISTINCT FROM OLD.requester_evidence_media_id
           AND NEW.requester_evidence_media_id IS NULL
           AND NEW.minimized_at IS NULL THEN
          RAISE EXCEPTION 'La evidencia de identidad solo se anula en la minimización.'
            USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
      END;
      $function$
    `);

    // R3 y R4 (B2-R): minimized_at monótono con estado terminal, y fila
    // minimizada solo hacia NULL en las columnas del paquete. No toca la
    // minimización real (OLD.minimized_at IS NULL): esa pasa con estado
    // terminal y el servicio anula el resto en la misma actualización.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_enforce_request_minimization()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $function$
      BEGIN
        -- R3: minimized_at no se anula ni se cambia, y solo se fija con
        -- estado terminal (RESUELTA, NO_PROCEDENTE, TRASLADADA, DESISTIDA).
        IF NEW.minimized_at IS DISTINCT FROM OLD.minimized_at THEN
          IF OLD.minimized_at IS NOT NULL OR NEW.minimized_at IS NULL THEN
            RAISE EXCEPTION 'minimized_at de la solicitud no se puede cambiar ni anular.'
              USING ERRCODE = '55000';
          END IF;
          IF NEW.status NOT IN ('RESUELTA', 'NO_PROCEDENTE', 'TRASLADADA', 'DESISTIDA') THEN
            RAISE EXCEPTION 'La minimización exige estado terminal de la solicitud.'
              USING ERRCODE = '55000';
          END IF;
        END IF;
        -- R4: en una fila minimizada las columnas del paquete solo cambian
        -- hacia NULL (no se reintroducen datos). B2-R3 P2a: también cubre
        -- transferred_to, transfer_destination_* (solo hacia NULL; la
        -- tripleta ya clasificada pasa al no cambiar), suspended/disputed
        -- (solo hacia '{}') y status (fijo tras minimized_at).
        IF OLD.minimized_at IS NOT NULL THEN
          IF (NEW.status IS DISTINCT FROM OLD.status) THEN
            RAISE EXCEPTION 'El estado de la solicitud minimizada no se reabre.'
              USING ERRCODE = '55000';
          END IF;
          IF (NEW.requester_name_encrypted IS DISTINCT FROM OLD.requester_name_encrypted
              AND NEW.requester_name_encrypted IS NOT NULL)
             OR (NEW.requester_document_type IS DISTINCT FROM OLD.requester_document_type
              AND NEW.requester_document_type IS NOT NULL)
             OR (NEW.requester_document_encrypted IS DISTINCT FROM OLD.requester_document_encrypted
              AND NEW.requester_document_encrypted IS NOT NULL)
             OR (NEW.requester_contact_encrypted IS DISTINCT FROM OLD.requester_contact_encrypted
              AND NEW.requester_contact_encrypted IS NOT NULL)
             OR (NEW.requester_document_hmac IS DISTINCT FROM OLD.requester_document_hmac
              AND NEW.requester_document_hmac IS NOT NULL)
             OR (NEW.requester_evidence_media_id IS DISTINCT FROM OLD.requester_evidence_media_id
              AND NEW.requester_evidence_media_id IS NOT NULL)
             OR (NEW.response_text IS DISTINCT FROM OLD.response_text
              AND NEW.response_text IS NOT NULL)
             OR (NEW.party_id IS DISTINCT FROM OLD.party_id
              AND NEW.party_id IS NOT NULL)
             OR (NEW.transferred_to IS DISTINCT FROM OLD.transferred_to
              AND NEW.transferred_to IS NOT NULL)
             OR (NEW.transfer_destination_kind IS DISTINCT FROM OLD.transfer_destination_kind
              AND NEW.transfer_destination_kind IS NOT NULL)
             OR (NEW.transfer_destination_code IS DISTINCT FROM OLD.transfer_destination_code
              AND NEW.transfer_destination_code IS NOT NULL)
             OR (NEW.transfer_destination_name IS DISTINCT FROM OLD.transfer_destination_name
              AND NEW.transfer_destination_name IS NOT NULL)
             OR (NEW.suspended_contract_ids IS DISTINCT FROM OLD.suspended_contract_ids
              AND NEW.suspended_contract_ids <> '{}')
             OR (NEW.disputed_contract_ids IS DISTINCT FROM OLD.disputed_contract_ids
              AND NEW.disputed_contract_ids <> '{}') THEN
            RAISE EXCEPTION 'La fila minimizada solo admite cambios hacia NULL.'
              USING ERRCODE = '55000';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_data_subject_requests_minimization_guard ON data_subject_requests
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_data_subject_requests_minimization_guard
      BEFORE UPDATE ON data_subject_requests
      FOR EACH ROW EXECUTE FUNCTION privacy_enforce_request_minimization()
    `);

    // P2b (B2-R3): TRUNCATE no dispara triggers de fila; guardia por
    // sentencia como la 178 en su bitácora, también frente al dueño.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_retention_expiry_no_truncate()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $guard$
      BEGIN
        RAISE EXCEPTION 'La evidencia de vencimiento de retención es append-only.'
          USING ERRCODE = '55000', HINT = 'PRIVACY_RETENTION_APPEND_ONLY';
        RETURN NULL;
      END;
      $guard$
    `);
    for (const table of [
      'privacy_retention_expiry_runs',
      'privacy_retention_expiry_cursors',
      'data_subject_requests',
      'data_subject_request_events',
    ]) {
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS trg_privacy_retention_no_truncate ON ${table}`,
      );
      await queryRunner.query(`
        CREATE TRIGGER trg_privacy_retention_no_truncate
        BEFORE TRUNCATE ON ${table}
        FOR EACH STATEMENT EXECUTE FUNCTION privacy_retention_expiry_no_truncate()
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const confirmed: Array<{ total: string }> = await queryRunner.query(`
      SELECT COUNT(*)::text AS total FROM (
        SELECT 1 FROM privacy_retention_expiry_runs WHERE estado = 'COMPLETE' LIMIT 1
      ) confirmed
    `);
    const minimized: Array<{ total: string }> = await queryRunner.query(`
      SELECT COUNT(*)::text AS total FROM (
        SELECT 1 FROM data_subject_requests WHERE minimized_at IS NOT NULL LIMIT 1
      ) minimized
    `);
    if (Number(confirmed[0]?.total ?? '0') > 0 || Number(minimized[0]?.total ?? '0') > 0) {
      throw new Error(
        'Rollback de RetentionExpiryLedger bloqueado: hay actos de vencimiento o ' +
          'minimización confirmados. La reversión no restaura datos eliminados.',
      );
    }
    await queryRunner.query('DROP TABLE IF EXISTS privacy_retention_expiry_cursors');
    await queryRunner.query('DROP TABLE IF EXISTS privacy_retention_expiry_runs');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_data_subject_requests_minimization_guard ON data_subject_requests',
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS privacy_enforce_request_minimization()');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_privacy_retention_no_truncate ON data_subject_request_events',
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_privacy_retention_no_truncate ON data_subject_requests',
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_privacy_retention_no_truncate ON privacy_retention_expiry_cursors',
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_privacy_retention_no_truncate ON privacy_retention_expiry_runs',
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS privacy_retention_expiry_no_truncate()');
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_prevent_verified_identity_change()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF OLD.identity_verified_at IS NOT NULL AND (
          NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at OR
          NEW.identity_verified_by IS DISTINCT FROM OLD.identity_verified_by OR
          NEW.identity_verification_method IS DISTINCT FROM OLD.identity_verification_method OR
          NEW.requester_evidence_media_id IS DISTINCT FROM OLD.requester_evidence_media_id
        ) THEN
          RAISE EXCEPTION 'La identidad verificada de la solicitud no se puede cambiar'
            USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_reject_append_only_mutation()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        RAISE EXCEPTION 'La evidencia de privacidad es de solo anexar: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
          USING ERRCODE = '55000';
      END;
      $function$
    `);
    await queryRunner.query(`
      ALTER TABLE data_subject_request_tasks
        DROP CONSTRAINT IF EXISTS ck_data_subject_request_tasks_kind
    `);
    await queryRunner.query(`
      ALTER TABLE data_subject_request_tasks
        ADD CONSTRAINT ck_data_subject_request_tasks_kind
          CHECK (kind IN ('SUSPENDER_COBRO_EXTERNO', 'ENTREGAR_COPIA_DOCUMENTOS',
            'FORMULAR_DENUNCIA_OPERADOR', 'COMUNICAR_PLAZO_DENUNCIA'))
    `);
    await queryRunner.query(`
      ALTER TABLE data_subject_requests
        DROP CONSTRAINT IF EXISTS chk_transfer_destination_institution,
        DROP CONSTRAINT IF EXISTS chk_transfer_destination_kind,
        DROP COLUMN IF EXISTS transfer_destination_name,
        DROP COLUMN IF EXISTS transfer_destination_code,
        DROP COLUMN IF EXISTS transfer_destination_kind,
        DROP COLUMN IF EXISTS retention_closed_at,
        DROP COLUMN IF EXISTS minimized_at,
        DROP COLUMN IF EXISTS closed_at
    `);
    await queryRunner.query('DROP INDEX IF EXISTS idx_data_subject_requests_pending_minimization');
  }
}
