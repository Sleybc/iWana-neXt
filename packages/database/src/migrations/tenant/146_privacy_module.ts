import { addColombiaBusinessDays } from '@iwana/shared';
import { MigrationInterface, QueryRunner } from 'typeorm';

interface LegacyArcoRequest {
  id: string;
  request_type: string;
  status: string;
  created_at: Date | string;
  resolved_at: Date | string | null;
  party_id: string | null;
}

interface BackfillCount {
  total: number;
  resolved: number;
  unresolved: number;
}

const LEGACY_ARCO_TYPE_MAP: Record<string, { kind: string; right: string; days: number }> = {
  ACCESS: { kind: 'CONSULTA', right: 'CONOCER', days: 10 },
  RECTIFICATION: { kind: 'RECLAMO', right: 'RECTIFICAR', days: 15 },
  DELETION: { kind: 'RECLAMO', right: 'SUPRIMIR', days: 15 },
  PORTABILITY: { kind: 'CONSULTA', right: 'CONOCER', days: 10 },
};

function civilDateInBogota(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Migración 146 — modelo tenant de protección de datos y backfill legado.
 *
 * C-PRIV-DDL v1.1 (ADR-094 D2, D3, D4 y D7). El aislamiento es por schema del
 * tenant: todas las tablas y consultas usan el search_path del QueryRunner.
 * Los orígenes heredados se conservan y el backfill registra solo contadores,
 * nunca valores de los titulares.
 */
export class PrivacyModule1460000000000 implements MigrationInterface {
  name = 'PrivacyModule1460000000000';

  private async relationExists(queryRunner: QueryRunner, relation: string): Promise<boolean> {
    const rows = (await queryRunner.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [
      relation,
    ])) as Array<{ present: boolean }>;
    return rows[0]?.present === true;
  }

  private async countBackfill(
    queryRunner: QueryRunner,
    sourceRefPrefix: string,
    total: number,
    resolved: number,
  ): Promise<void> {
    const sourceLabel = sourceRefPrefix.replace(/:$/u, '');
    const inserted = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM data_authorizations WHERE source_ref LIKE $1`,
      [`${sourceRefPrefix}%`],
    )) as Array<{ total: number }>;
    const insertedCount = inserted[0]?.total ?? 0;
    console.info(
      `[146] backfill ${sourceLabel}: origen=${total} resueltos=${resolved} ` +
        `no_resueltos=${Math.max(total - resolved, 0)} filas_destino=${insertedCount}`,
    );
  }

  private async backfillConsentRecords(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.relationExists(queryRunner, 'consent_records'))) {
      console.info('[146] backfill consent_records: origen no disponible; 0 filas revisadas');
      return;
    }

    const totals = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE mapped.purpose IS NOT NULL AND mapped.party_id IS NOT NULL)::int AS resolved
      FROM (
        SELECT c.id,
               CASE c.consent_type
                 WHEN 'TRATAMIENTO_DATOS' THEN 'TRATAMIENTO_CONTRACTUAL'
                 WHEN 'CONTACTO_OPERATIVO' THEN 'TRATAMIENTO_CONTRACTUAL'
                 WHEN 'CONTACTO_COMERCIAL' THEN 'CONTACTO_COMERCIAL'
                 ELSE NULL
               END AS purpose,
               COALESCE(
                 (SELECT s.party_id FROM subscribers s
                  WHERE s.expediente_id = c.expediente_id AND s.party_id IS NOT NULL
                  ORDER BY s.id LIMIT 1),
                 (SELECT s.party_id FROM subscribers s
                  WHERE s.id = c.prospect_id AND s.party_id IS NOT NULL
                  ORDER BY s.id LIMIT 1)
               ) AS party_id
        FROM consent_records c
      ) mapped
    `)) as Array<BackfillCount>;
    const total = totals[0]?.total ?? 0;
    const resolved = totals[0]?.resolved ?? 0;

    await queryRunner.query(`
      WITH mapped AS (
        SELECT c.*,
               CASE c.consent_type
                 WHEN 'TRATAMIENTO_DATOS' THEN 'TRATAMIENTO_CONTRACTUAL'
                 WHEN 'CONTACTO_OPERATIVO' THEN 'TRATAMIENTO_CONTRACTUAL'
                 WHEN 'CONTACTO_COMERCIAL' THEN 'CONTACTO_COMERCIAL'
                 ELSE NULL
               END AS mapped_purpose,
               COALESCE(
                 (SELECT s.party_id FROM subscribers s
                  WHERE s.expediente_id = c.expediente_id AND s.party_id IS NOT NULL
                  ORDER BY s.id LIMIT 1),
                 (SELECT s.party_id FROM subscribers s
                  WHERE s.id = c.prospect_id AND s.party_id IS NOT NULL
                  ORDER BY s.id LIMIT 1)
               ) AS mapped_party_id,
               (SELECT e.contact_preference FROM expediente_records e WHERE e.id = c.expediente_id) AS contact_preference
        FROM consent_records c
      ), grants AS (
        INSERT INTO data_authorizations
          (id, party_id, purpose, kind, granted, channel, evidence_media_id, legal_text_id,
           ip, user_agent, captured_by, captured_at, source_ref)
        SELECT md5('privacy-146:consent_records:' || id::text || ':grant')::uuid,
               mapped_party_id, mapped_purpose, 'LEGACY_IMPORT',
               COALESCE(accepted, status IN ('ACEPTADO', 'ACCEPTED', 'ACTIVE', 'GRANTED')),
               channel,
               CASE WHEN evidence_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    THEN evidence_ref::uuid ELSE NULL END,
               (SELECT id FROM legal_texts WHERE type = 'AUTORIZACION' AND version = mapped.legal_text_version LIMIT 1),
               NULL, NULL, NULL, obtained_at,
               'consent_records:' || id::text || ':GRANT:' || jsonb_build_object(
                 'legacy_type', consent_type,
                 'legacy_status', status,
                 'legal_text_version', legal_text_version,
                 'contact_preference', contact_preference
               )::text
        FROM mapped
        WHERE mapped_party_id IS NOT NULL AND mapped_purpose IS NOT NULL
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      ), revocations AS (
        INSERT INTO data_authorizations
          (id, party_id, purpose, kind, granted, channel, evidence_media_id, legal_text_id,
           ip, user_agent, captured_by, captured_at, source_ref)
        SELECT md5('privacy-146:consent_records:' || id::text || ':revocation')::uuid,
               mapped_party_id, mapped_purpose, 'REVOCATION', false, channel, NULL,
               (SELECT id FROM legal_texts WHERE type = 'AUTORIZACION' AND version = mapped.legal_text_version LIMIT 1),
               NULL, NULL, revoked_by, revoked_at,
               'consent_records:' || id::text || ':REVOCATION:' || jsonb_build_object(
                 'legacy_reason', revoked_reason,
                 'legacy_status', status,
                 'contact_preference', contact_preference
               )::text
        FROM mapped
        WHERE mapped_party_id IS NOT NULL AND mapped_purpose IS NOT NULL AND revoked_at IS NOT NULL
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      )
      SELECT (SELECT COUNT(*) FROM grants)::int AS grants,
             (SELECT COUNT(*) FROM revocations)::int AS revocations
    `);

    await this.countBackfill(queryRunner, 'consent_records:', total, resolved);

    const rows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS unresolved
      FROM consent_records c
      WHERE (c.consent_type NOT IN ('TRATAMIENTO_DATOS', 'CONTACTO_OPERATIVO', 'CONTACTO_COMERCIAL')
             OR c.consent_type IS NULL)
         OR NOT EXISTS (
           SELECT 1 FROM subscribers s
           WHERE s.party_id IS NOT NULL
             AND (s.expediente_id = c.expediente_id OR s.id = c.prospect_id)
         )
    `)) as Array<{ unresolved: number }>;
    const unresolved = rows[0]?.unresolved ?? 0;
    console.info(
      `[146] backfill consent_records: no_resueltos_revisados=${unresolved}; ` +
        'las filas fuente se conservaron para reconciliación',
    );
  }

  private async backfillSubscriberOrigin(
    queryRunner: QueryRunner,
    table: 'habeas_data_consents' | 'arco_requests',
    sourceLabel: string,
  ): Promise<void> {
    if (!(await this.relationExists(queryRunner, table))) {
      console.info(`[146] backfill ${sourceLabel}: origen no disponible; 0 filas revisadas`);
      return;
    }

    if (table === 'habeas_data_consents') {
      const counts = (await queryRunner.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE s.party_id IS NOT NULL)::int AS resolved
        FROM habeas_data_consents c
        LEFT JOIN subscribers s ON s.id = c.subscriber_id
      `)) as Array<BackfillCount>;
      const total = counts[0]?.total ?? 0;
      const resolved = counts[0]?.resolved ?? 0;

      await queryRunner.query(`
        INSERT INTO data_authorizations
          (id, party_id, purpose, kind, granted, channel, evidence_media_id, legal_text_id,
           ip, user_agent, captured_by, captured_at, source_ref)
        SELECT md5('privacy-146:habeas_data_consents:' || c.id::text || ':grant')::uuid,
               s.party_id, 'TRATAMIENTO_CONTRACTUAL', 'LEGACY_IMPORT', c.accepted,
               c.channel, NULL,
               (SELECT id FROM legal_texts WHERE type = 'AUTORIZACION' AND version = c.legal_text_version LIMIT 1),
               NULL, NULL, NULL, c.created_at,
               'habeas_data_consents:' || c.id::text || ':GRANT:' ||
                 jsonb_build_object('legacy_legal_text_version', c.legal_text_version)::text
        FROM habeas_data_consents c
        JOIN subscribers s ON s.id = c.subscriber_id AND s.party_id IS NOT NULL
        ON CONFLICT (id) DO NOTHING
      `);

      await this.countBackfill(queryRunner, 'habeas_data_consents:', total, resolved);
      return;
    }

    const legacyRequests = (await queryRunner.query(`
      SELECT r.id::text AS id,
             r.subscriber_id::text AS subscriber_id,
             r.request_type::text AS request_type,
             r.status::text AS status,
             r.created_at,
             r.resolved_at,
             s.party_id::text AS party_id
      FROM arco_requests r
      LEFT JOIN subscribers s ON s.id = r.subscriber_id
      ORDER BY r.created_at, r.id
    `)) as LegacyArcoRequest[];

    let resolved = 0;
    let inserted = 0;
    let unrecognizedKinds = 0;
    for (const request of legacyRequests) {
      const mapped = LEGACY_ARCO_TYPE_MAP[request.request_type];
      if (!mapped) {
        unrecognizedKinds += 1;
        continue;
      }

      const dueAt = addColombiaBusinessDays(civilDateInBogota(request.created_at), mapped.days);
      const mappedStatus: Record<string, string> = {
        PENDING: 'RADICADA',
        COMPLETED: 'RESUELTA',
        REJECTED: 'NO_PROCEDENTE',
      };
      const status = mappedStatus[request.status] ?? 'RADICADA';
      const legalBasis =
        request.request_type === 'PORTABILITY'
          ? 'Migración heredada; PORTABILITY se conserva como consulta de conocimiento.'
          : `Migración heredada; estado original=${request.status}.`;

      await queryRunner.query(
        `INSERT INTO data_subject_requests
           (id, party_id, requester_document_hmac, requester_kind, kind, "right", status,
           received_at, complete_at, due_at, extended_until, info_required_at, desist_at,
           response_text, response_channel, resolved_at, resolved_by, transferred_to, legal_basis)
         VALUES
          (md5('privacy-146:arco_requests:' || $1 || ':request')::uuid, $2, NULL, 'TITULAR',
           $3, $4, $5, $6, $8, $7::date, NULL, NULL, NULL, NULL, NULL,
           $8, NULL, NULL, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          request.id,
          request.party_id,
          mapped.kind,
          mapped.right,
          status,
          request.created_at,
          dueAt,
          request.resolved_at,
          legalBasis,
        ],
      );
      await queryRunner.query(
        `INSERT INTO data_subject_request_events
          (id, request_id, from_status, to_status, actor_id, reason, occurred_at)
         VALUES
          (md5('privacy-146:arco_requests:' || $1 || ':event')::uuid,
           md5('privacy-146:arco_requests:' || $1 || ':request')::uuid,
           NULL, $2, NULL, 'Importación histórica desde arco_requests', $3)
         ON CONFLICT (id) DO NOTHING`,
        [request.id, status, request.created_at],
      );
      inserted += 1;
      if (request.party_id) resolved += 1;
    }

    console.info(
      `[146] backfill arco_requests: origen=${legacyRequests.length} resueltos=${resolved} ` +
        `no_resueltos=${legacyRequests.length - resolved} tipo_no_reconocido=${unrecognizedKinds} ` +
        `solicitudes_destino=${inserted}`,
    );
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS legal_texts (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        type text NOT NULL,
        version text NOT NULL,
        sha256 char(64) NOT NULL,
        content text NOT NULL,
        published_at timestamptz NOT NULL,
        url text,
        CONSTRAINT pk_legal_texts PRIMARY KEY (id),
        CONSTRAINT ck_legal_texts_type CHECK (type IN ('POLITICA_TRATAMIENTO', 'AVISO_PRIVACIDAD', 'AUTORIZACION')),
        CONSTRAINT uq_legal_texts_type_version UNIQUE (type, version),
        CONSTRAINT ck_legal_texts_sha256 CHECK (sha256 ~ '^[0-9a-f]{64}$')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_authorizations (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        party_id uuid NOT NULL REFERENCES party(id) ON DELETE RESTRICT,
        purpose text NOT NULL,
        kind text NOT NULL,
        granted boolean NOT NULL,
        channel text NOT NULL,
        evidence_media_id uuid,
        legal_text_id uuid REFERENCES legal_texts(id) ON DELETE RESTRICT,
        ip inet,
        user_agent text,
        captured_by uuid,
        captured_at timestamptz NOT NULL DEFAULT now(),
        source_ref text,
        CONSTRAINT pk_data_authorizations PRIMARY KEY (id),
        CONSTRAINT ck_data_authorizations_purpose CHECK (purpose IN ('TRATAMIENTO_CONTRACTUAL', 'CONTACTO_COMERCIAL', 'REPORTE_CENTRALES_RIESGO', 'DATOS_BIOMETRICOS')),
        CONSTRAINT ck_data_authorizations_kind CHECK (kind IN ('GRANT', 'REVOCATION', 'LEGACY_IMPORT'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_authorizations_party_purpose_captured
        ON data_authorizations (party_id, purpose, captured_at DESC)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_data_authorizations_source_ref
        ON data_authorizations (source_ref) WHERE source_ref IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_subject_requests (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        party_id uuid REFERENCES party(id) ON DELETE RESTRICT,
        requester_document_hmac text,
        requester_kind text NOT NULL,
        requester_name_encrypted varchar(500),
        requester_document_type varchar(20),
        requester_document_encrypted varchar(500),
        requester_contact_encrypted varchar(500),
        requester_evidence_media_id uuid,
        identity_verification_method varchar(30),
        identity_verified_at timestamptz,
        identity_verified_by uuid,
        kind text NOT NULL,
        "right" text NOT NULL,
        purpose text,
        status text NOT NULL,
        received_at timestamptz NOT NULL,
        complete_at timestamptz,
        due_at date NOT NULL,
        impersonation_complaint_due_at date,
        suspended_contract_ids uuid[] NOT NULL DEFAULT '{}',
        extended_until date,
        info_required_at timestamptz,
        desist_at date,
        response_text text,
        response_channel text,
        resolved_at timestamptz,
        resolved_by uuid,
        transferred_to varchar(200),
        disputed_contract_ids uuid[] NOT NULL DEFAULT '{}',
        legal_basis text,
        CONSTRAINT pk_data_subject_requests PRIMARY KEY (id),
        CONSTRAINT ck_data_subject_requests_requester_kind CHECK (requester_kind IN ('TITULAR', 'CAUSAHABIENTE', 'REPRESENTANTE', 'APODERADO')),
        CONSTRAINT ck_data_subject_requests_requester_document_type CHECK (requester_document_type IS NULL OR requester_document_type IN ('CC', 'CE', 'NIT', 'PASAPORTE', 'TI', 'RUT', 'OTHER')),
        CONSTRAINT ck_data_subject_requests_identity_method CHECK (identity_verification_method IS NULL OR identity_verification_method IN ('DOCUMENTO_PRESENCIAL', 'COPIA_DOCUMENTO', 'PODER_O_REPRESENTACION', 'DECLARACION_CAUSAHABIENTE')),
        CONSTRAINT ck_data_subject_requests_identity_verified_pair CHECK ((identity_verified_at IS NULL) = (identity_verified_by IS NULL)),
        CONSTRAINT ck_data_subject_requests_identity_method_verified CHECK (identity_verified_at IS NULL OR identity_verification_method IS NOT NULL),
        CONSTRAINT ck_data_subject_requests_verified_before_processing CHECK (status NOT IN ('EN_TRAMITE', 'PRORROGADA', 'RESUELTA') OR identity_verified_at IS NOT NULL),
        CONSTRAINT ck_data_subject_requests_non_legitimated_without_identity CHECK (status <> 'NO_PROCEDENTE' OR identity_verified_at IS NOT NULL OR (legal_basis IS NOT NULL AND legal_basis = 'SOLICITANTE_NO_LEGITIMADO')),
        CONSTRAINT ck_data_subject_requests_kind CHECK (kind IN ('CONSULTA', 'RECLAMO', 'SUPLANTACION')),
        CONSTRAINT ck_data_subject_requests_right CHECK ("right" IN ('CONOCER', 'ACTUALIZAR', 'RECTIFICAR', 'SUPRIMIR', 'REVOCAR', 'PRUEBA_AUTORIZACION', 'INCUMPLIMIENTO')),
        CONSTRAINT ck_data_subject_requests_purpose CHECK (purpose IS NULL OR purpose IN ('TRATAMIENTO_CONTRACTUAL', 'CONTACTO_COMERCIAL', 'REPORTE_CENTRALES_RIESGO', 'DATOS_BIOMETRICOS')),
        CONSTRAINT ck_data_subject_requests_revocation_purpose CHECK (("right" = 'REVOCAR' AND purpose IS NOT NULL) OR ("right" <> 'REVOCAR' AND purpose IS NULL)),
        CONSTRAINT ck_data_subject_requests_status CHECK (status IN ('RADICADA', 'INCOMPLETA', 'DESISTIDA', 'EN_TRAMITE', 'PRORROGADA', 'RESUELTA', 'NO_PROCEDENTE', 'TRASLADADA')),
        CONSTRAINT ck_data_subject_requests_impersonation_contracts_required CHECK (kind <> 'SUPLANTACION' OR (cardinality(disputed_contract_ids) >= 1 AND party_id IS NOT NULL AND identity_verified_at IS NOT NULL)),
        CONSTRAINT ck_data_subject_requests_no_disputed_contracts_without_impersonation CHECK (kind = 'SUPLANTACION' OR cardinality(disputed_contract_ids) = 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_subject_requests_status_due_at
        ON data_subject_requests (status, due_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_subject_requests_party_received_at
        ON data_subject_requests (party_id, received_at DESC) WHERE party_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_subject_request_tasks (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        request_id uuid NOT NULL REFERENCES data_subject_requests(id) ON DELETE RESTRICT,
        kind varchar(40) NOT NULL,
        due_at date NOT NULL,
        done_at timestamptz,
        done_by uuid,
        note text,
        CONSTRAINT pk_data_subject_request_tasks PRIMARY KEY (id),
        CONSTRAINT ck_data_subject_request_tasks_kind CHECK (kind IN ('SUSPENDER_COBRO_EXTERNO', 'ENTREGAR_COPIA_DOCUMENTOS')),
        CONSTRAINT ck_data_subject_request_tasks_done_pair CHECK ((done_at IS NULL) = (done_by IS NULL))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_subject_request_tasks_request_due
        ON data_subject_request_tasks (request_id, due_at)
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_prevent_request_task_reopen()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF OLD.done_at IS NOT NULL AND NEW.done_at IS DISTINCT FROM OLD.done_at THEN
          RAISE EXCEPTION 'La tarea de privacidad completada no se puede reabrir ni cambiar de fecha'
            USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_data_subject_request_tasks_no_reopen ON data_subject_request_tasks
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_data_subject_request_tasks_no_reopen
        BEFORE UPDATE OF done_at ON data_subject_request_tasks
        FOR EACH ROW EXECUTE FUNCTION privacy_prevent_request_task_reopen()
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS data_subject_request_events (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        request_id uuid NOT NULL REFERENCES data_subject_requests(id) ON DELETE RESTRICT,
        from_status text,
        to_status text NOT NULL,
        actor_id uuid,
        reason text,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_data_subject_request_events PRIMARY KEY (id),
        CONSTRAINT ck_data_subject_request_events_to_status CHECK (to_status IN ('RADICADA', 'INCOMPLETA', 'DESISTIDA', 'EN_TRAMITE', 'PRORROGADA', 'RESUELTA', 'NO_PROCEDENTE', 'TRASLADADA'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_subject_request_events_request
        ON data_subject_request_events (request_id, occurred_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS party_privacy_marks (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        party_id uuid NOT NULL REFERENCES party(id) ON DELETE RESTRICT,
        mark text NOT NULL,
        event text NOT NULL,
        request_id uuid REFERENCES data_subject_requests(id) ON DELETE RESTRICT,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        actor_id uuid,
        CONSTRAINT pk_party_privacy_marks PRIMARY KEY (id),
        CONSTRAINT ck_party_privacy_marks_mark CHECK (mark IN ('RECLAMO_EN_TRAMITE', 'VICTIMA_FALSEDAD_PERSONAL', 'DATOS_BLOQUEADOS')),
        CONSTRAINT ck_party_privacy_marks_event CHECK (event IN ('OPEN', 'CLOSE'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_party_privacy_marks_party_mark_occurred
        ON party_privacy_marks (party_id, mark, occurred_at DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS retention_policies (
        category text NOT NULL,
        years integer NOT NULL,
        start_event text NOT NULL,
        legal_basis text NOT NULL,
        is_legal_minimum boolean NOT NULL DEFAULT true,
        CONSTRAINT pk_retention_policies PRIMARY KEY (category),
        CONSTRAINT ck_retention_policies_years CHECK (years >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS privacy_incidents (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        detected_at timestamptz NOT NULL,
        description text NOT NULL,
        affected_categories text[] NOT NULL DEFAULT '{}',
        sic_report_due_at date NOT NULL,
        reported_at date,
        external_reference varchar(100),
        actor_id uuid,
        CONSTRAINT pk_privacy_incidents PRIMARY KEY (id),
        CONSTRAINT ck_privacy_incidents_reported_pair CHECK ((reported_at IS NULL) = (external_reference IS NULL))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_privacy_incidents_detected_at
        ON privacy_incidents (detected_at DESC)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_prevent_incident_report_rewrite()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'El reporte del incidente no se puede eliminar'
            USING ERRCODE = '55000';
        END IF;

        IF OLD.reported_at IS NOT NULL OR OLD.external_reference IS NOT NULL THEN
          RAISE EXCEPTION 'El reporte del incidente solo se puede fijar una vez'
            USING ERRCODE = '55000';
        END IF;

        IF NEW.reported_at IS NULL OR NEW.external_reference IS NULL THEN
          RAISE EXCEPTION 'El reporte requiere fecha y referencia externa'
            USING ERRCODE = '55000';
        END IF;

        IF (to_jsonb(NEW) - 'reported_at' - 'external_reference')
             IS DISTINCT FROM (to_jsonb(OLD) - 'reported_at' - 'external_reference') THEN
          RAISE EXCEPTION 'El reporte no puede modificar otros datos del incidente'
            USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_privacy_incidents_report_once ON privacy_incidents
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_privacy_incidents_report_once
        BEFORE UPDATE OR DELETE ON privacy_incidents
        FOR EACH ROW EXECUTE FUNCTION privacy_prevent_incident_report_rewrite()
    `);

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
      DROP TRIGGER IF EXISTS trg_data_subject_requests_identity_immutable ON data_subject_requests
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_data_subject_requests_identity_immutable
        BEFORE UPDATE OF identity_verified_at, identity_verified_by,
          identity_verification_method, requester_evidence_media_id
        ON data_subject_requests
        FOR EACH ROW EXECUTE FUNCTION privacy_prevent_verified_identity_change()
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
    for (const table of [
      'legal_texts',
      'data_authorizations',
      'data_subject_request_events',
      'party_privacy_marks',
    ]) {
      await queryRunner.query(`
        DROP TRIGGER IF EXISTS trg_${table}_append_only ON ${table}
      `);
      await queryRunner.query(`
        CREATE TRIGGER trg_${table}_append_only
          BEFORE UPDATE OR DELETE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION privacy_reject_append_only_mutation()
      `);
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_prevent_retention_reduction()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      DECLARE
        minimum_years integer;
      BEGIN
        IF NEW.category <> OLD.category THEN
          RAISE EXCEPTION 'La categoría de retención no se puede cambiar';
        END IF;

        CASE OLD.category
          WHEN 'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR' THEN minimum_years := 5;
          WHEN 'FACTURACION_SOPORTES_CONTABLES' THEN minimum_years := 10;
          WHEN 'PROSPECTO_SIN_CONTRATO' THEN minimum_years := 2;
          WHEN 'SOPORTE_ESTRATO' THEN minimum_years := 10;
          WHEN 'AUTORIZACIONES_EVIDENCIA' THEN minimum_years := 5;
          WHEN 'LOGS_IP_CONEXION' THEN minimum_years := 0;
          ELSE minimum_years := OLD.years;
        END CASE;

        IF NEW.years < minimum_years THEN
          RAISE EXCEPTION 'El plazo de retención de % no puede ser menor de % años',
            OLD.category, minimum_years USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_retention_policies_minimum ON retention_policies
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_retention_policies_minimum
        BEFORE UPDATE OF years, category ON retention_policies
        FOR EACH ROW EXECUTE FUNCTION privacy_prevent_retention_reduction()
    `);

    await queryRunner.query(`
      INSERT INTO retention_policies (category, years, start_event, legal_basis, is_legal_minimum)
      VALUES
        ('IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR', 5, 'TERMINACION_ULTIMO_CONTRATO', 'ADR-094 D7, H9', true),
        ('FACTURACION_SOPORTES_CONTABLES', 10, 'ULTIMO_ASIENTO_O_DOCUMENTO', 'ADR-094 D7, H10', true),
        ('PROSPECTO_SIN_CONTRATO', 2, 'DESCARTE', 'ADR-094 D7; Decreto 1377 de 2013, artículo 11, compilado en el DUR 1074; decisión CTO 2026-10-14 (24 meses)', true),
        ('SOPORTE_ESTRATO', 10, 'ULTIMO_DOCUMENTO_FACTURADO', 'ADR-094 D7; mismo plazo de la facturación beneficiada, H10', true),
        ('AUTORIZACIONES_EVIDENCIA', 5, 'SUPRESION_DEL_ULTIMO_DATO_DEL_TITULAR', 'ADR-094 D7; mientras exista cualquier dato del titular y cinco años adicionales', true),
        ('LOGS_IP_CONEXION', 0, 'PENDIENTE_DICTAMEN_JURIDICO', 'ADR-094 D7, H13; plazo pendiente de dictamen', false)
      ON CONFLICT (category) DO UPDATE
        SET years = GREATEST(retention_policies.years, EXCLUDED.years),
            is_legal_minimum = EXCLUDED.is_legal_minimum
    `);

    await this.backfillConsentRecords(queryRunner);
    await this.backfillSubscriberOrigin(
      queryRunner,
      'habeas_data_consents',
      'habeas_data_consents',
    );
    await this.backfillSubscriberOrigin(queryRunner, 'arco_requests', 'arco_requests');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_privacy_incidents_report_once ON privacy_incidents`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS privacy_prevent_incident_report_rewrite()`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_data_subject_requests_identity_immutable ON data_subject_requests`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS privacy_prevent_verified_identity_change()`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_retention_policies_minimum ON retention_policies`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS privacy_prevent_retention_reduction()`);
    await queryRunner.query(`DROP TABLE IF EXISTS privacy_incidents`);
    await queryRunner.query(`DROP TABLE IF EXISTS retention_policies`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_data_subject_request_tasks_no_reopen ON data_subject_request_tasks`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS data_subject_request_tasks`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS privacy_prevent_request_task_reopen()`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_party_privacy_marks_append_only ON party_privacy_marks`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS party_privacy_marks`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_data_subject_request_events_append_only ON data_subject_request_events`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS data_subject_request_events`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_data_subject_requests_party_received_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_data_subject_requests_status_due_at`);
    await queryRunner.query(`DROP TABLE IF EXISTS data_subject_requests`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_data_authorizations_source_ref`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_data_authorizations_party_purpose_captured`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_data_authorizations_append_only ON data_authorizations`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS data_authorizations`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_legal_texts_append_only ON legal_texts`);
    await queryRunner.query(`DROP TABLE IF EXISTS legal_texts`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS privacy_reject_append_only_mutation()`);
  }
}
