import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { PrivacyModule1460000000000 } from './146_privacy_module';
import { PrivacyLegalFormatsAndPurposes1660000000000 } from './166_privacy_legal_formats_and_purposes';

const SCHEMA = `tenant_privacy_${randomBytes(5).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 146: DB_NAME debe ser dbiw, test o iwana_it_*; solo se crean y limpian schemas efímeros.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

async function expectRejectedWrite(
  runner: QueryRunner,
  write: () => Promise<unknown>,
): Promise<void> {
  await runner.query('SAVEPOINT expected_rejection');
  try {
    await expect(write()).rejects.toThrow();
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT expected_rejection');
    await runner.query('RELEASE SAVEPOINT expected_rejection');
  }
}

async function countRows(runner: QueryRunner, table: string): Promise<number> {
  const rows = (await runner.query(`SELECT COUNT(*)::int AS count FROM ${table}`)) as Array<{
    count: number;
  }>;
  return rows[0]?.count ?? 0;
}

describeWithDb('Migración 146 — privacidad, backfill y triggers en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new PrivacyModule1460000000000();

  const partyId = randomUUID();
  const subscriberId = randomUUID();
  const expedienteId = randomUUID();
  const consentId = randomUUID();
  const unresolvedConsentId = randomUUID();
  const habeasConsentId = randomUUID();
  const unresolvedHabeasConsentId = randomUUID();
  const arcoRequestId = randomUUID();
  const unresolvedArcoRequestId = randomUUID();
  const evidenceId = randomUUID();

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? '',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SET LOCAL search_path TO "${SCHEMA}"`);

    await runner.query(`CREATE TABLE party (id uuid PRIMARY KEY)`);
    await runner.query(`
      CREATE TABLE subscribers (
        id uuid PRIMARY KEY,
        expediente_id uuid,
        party_id uuid
      )
    `);
    await runner.query(
      `CREATE TABLE expediente_records (id uuid PRIMARY KEY, contact_preference text)`,
    );
    await runner.query(`
      CREATE TABLE consent_records (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        expediente_id uuid NOT NULL,
        prospect_id uuid,
        consent_type text NOT NULL,
        status text NOT NULL,
        accepted boolean,
        channel text NOT NULL,
        obtained_at timestamptz NOT NULL,
        ip_address text,
        legal_text_version text NOT NULL,
        evidence_ref text,
        revoked_at timestamptz,
        revoked_reason text,
        revoked_by uuid,
        deleted_at timestamptz
      )
    `);
    await runner.query(`
      CREATE TABLE habeas_data_consents (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        subscriber_id uuid NOT NULL,
        accepted boolean NOT NULL,
        channel text NOT NULL,
        ip_address text,
        legal_text_version text NOT NULL,
        created_at timestamptz NOT NULL,
        deleted_at timestamptz
      )
    `);
    await runner.query(`
      CREATE TABLE arco_requests (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        subscriber_id uuid NOT NULL,
        request_type text NOT NULL,
        status text NOT NULL,
        description text,
        resolved_at timestamptz,
        created_at timestamptz NOT NULL
      )
    `);

    await runner.query(`INSERT INTO party (id) VALUES ($1)`, [partyId]);
    await runner.query(
      `INSERT INTO expediente_records (id, contact_preference) VALUES ($1, 'EMAIL')`,
      [expedienteId],
    );
    await runner.query(
      `INSERT INTO subscribers (id, expediente_id, party_id) VALUES ($1, $2, $3)`,
      [subscriberId, expedienteId, partyId],
    );
    await runner.query(
      `INSERT INTO consent_records
        (id, tenant_id, expediente_id, prospect_id, consent_type, status, accepted, channel,
         obtained_at, legal_text_version, evidence_ref, revoked_at, revoked_reason, revoked_by)
       VALUES ($1, $2, $3, $4, 'TRATAMIENTO_DATOS', 'ACEPTADO', true, 'WEB',
         '2026-03-30T16:00:00Z', 'v1', $5, '2026-04-04T15:00:00Z', 'RETIRO', $6)`,
      [consentId, randomUUID(), expedienteId, subscriberId, evidenceId, randomUUID()],
    );
    await runner.query(
      `INSERT INTO consent_records
        (id, tenant_id, expediente_id, prospect_id, consent_type, status, accepted, channel,
         obtained_at, legal_text_version)
       VALUES ($1, $2, $3, NULL, 'CONTACTO_COMERCIAL', 'ACEPTADO', true, 'WEB',
         '2026-03-30T16:00:00Z', 'v1')`,
      [unresolvedConsentId, randomUUID(), randomUUID()],
    );
    await runner.query(
      `INSERT INTO habeas_data_consents
        (id, tenant_id, subscriber_id, accepted, channel, legal_text_version, created_at)
       VALUES ($1, $2, $3, true, 'PORTAL', 'v1', '2026-03-30T16:00:00Z')`,
      [habeasConsentId, randomUUID(), subscriberId],
    );
    await runner.query(
      `INSERT INTO habeas_data_consents
        (id, tenant_id, subscriber_id, accepted, channel, legal_text_version, created_at)
       VALUES ($1, $2, $3, true, 'PORTAL', 'v1', '2026-03-30T16:00:00Z')`,
      [unresolvedHabeasConsentId, randomUUID(), randomUUID()],
    );
    await runner.query(
      `INSERT INTO arco_requests
        (id, tenant_id, subscriber_id, request_type, status, created_at)
       VALUES ($1, $2, $3, 'ACCESS', 'PENDING', '2026-04-01T04:30:00Z')`,
      [arcoRequestId, randomUUID(), subscriberId],
    );
    await runner.query(
      `INSERT INTO arco_requests
        (id, tenant_id, subscriber_id, request_type, status, created_at)
       VALUES ($1, $2, $3, 'PORTABILITY', 'PENDING', '2026-04-01T04:30:00Z')`,
      [unresolvedArcoRequestId, randomUUID(), randomUUID()],
    );
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        try {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
        } finally {
          await runner.release();
        }
      }
    } finally {
      if (dataSource?.isInitialized) {
        const cleanup = dataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        } finally {
          await cleanup.release();
          await dataSource.destroy();
        }
      }
    }
  });

  it('ejecuta up/down/up, preserva orígenes, resuelve y reporta faltantes e impide mutaciones', async () => {
    const active = requireRunner(runner);
    await migration.up(active);

    const privacyTables = (await active.query(`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('legal_texts', 'data_authorizations', 'data_subject_requests',
          'data_subject_request_events', 'data_subject_request_tasks', 'party_privacy_marks',
          'retention_policies', 'privacy_incidents')
    `)) as Array<{ count: number }>;
    expect(privacyTables[0]?.count).toBe(8);
    expect(await countRows(active, 'data_authorizations')).toBe(3);
    expect(await countRows(active, 'data_subject_requests')).toBe(2);
    expect(await countRows(active, 'data_subject_request_events')).toBe(2);

    const migratedConsent = (await active.query(
      `SELECT purpose, evidence_media_id, source_ref
       FROM data_authorizations
       WHERE source_ref LIKE $1`,
      [`consent_records:${consentId}:GRANT:%`],
    )) as Array<{ purpose: string; evidence_media_id: string; source_ref: string }>;
    expect(migratedConsent).toHaveLength(1);
    expect(migratedConsent[0]).toMatchObject({
      purpose: 'TRATAMIENTO_CONTRACTUAL',
      evidence_media_id: evidenceId,
    });
    expect(migratedConsent[0]?.source_ref).toContain('"EMAIL"');

    const migratedRequests = (await active.query(`
      SELECT id::text AS id, party_id::text AS party_id, "right", status, due_at::text AS due_at
      FROM data_subject_requests
      ORDER BY id
    `)) as Array<{
      id: string;
      party_id: string | null;
      right: string;
      status: string;
      due_at: string;
    }>;
    expect(migratedRequests).toHaveLength(2);
    expect(migratedRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          party_id: partyId,
          right: 'CONOCER',
          status: 'RADICADA',
          due_at: '2026-04-16',
        }),
        expect.objectContaining({
          party_id: null,
          right: 'CONOCER',
          status: 'RADICADA',
          due_at: '2026-04-16',
        }),
      ]),
    );
    const retention = (await active.query(
      `SELECT years FROM retention_policies WHERE category = 'PROSPECTO_SIN_CONTRATO'`,
    )) as Array<{ years: number }>;
    expect(retention[0]?.years).toBe(2);

    const legalTextId = randomUUID();
    await active.query(
      `INSERT INTO legal_texts (id, type, version, sha256, content, published_at)
       VALUES ($1, 'AUTORIZACION', 'fixture-v1', $2, 'Texto de fixture', now())`,
      [legalTextId, 'a'.repeat(64)],
    );
    const authorization = (await active.query(
      `SELECT id FROM data_authorizations WHERE source_ref LIKE $1 LIMIT 1`,
      [`consent_records:${consentId}:GRANT:%`],
    )) as Array<{ id: string }>;
    const event = (await active.query(
      `SELECT id FROM data_subject_request_events LIMIT 1`,
    )) as Array<{ id: string }>;
    const request = migratedRequests[0];
    if (!authorization[0] || !event[0] || !request) throw new Error('Fixture migrado incompleto.');

    const requestId = randomUUID();
    await active.query(
      `INSERT INTO data_subject_requests
        (id, party_id, requester_kind, requester_name_encrypted, requester_document_type,
         requester_document_encrypted, requester_contact_encrypted, requester_evidence_media_id,
         identity_verification_method, identity_verified_at, identity_verified_by, kind, "right",
         purpose, status, received_at, due_at, impersonation_complaint_due_at, suspended_contract_ids,
         disputed_contract_ids)
       VALUES ($1, $2, 'TITULAR', 'ciphertext-fixture-name', 'CC', 'ciphertext-fixture-document',
         'ciphertext-fixture-contact', $3, 'DOCUMENTO_PRESENCIAL', now(), $4, 'SUPLANTACION',
         'CONOCER', NULL, 'EN_TRAMITE', now(), CURRENT_DATE + 10, CURRENT_DATE + 20, $5, $6)`,
      [requestId, partyId, evidenceId, randomUUID(), [randomUUID()], [randomUUID()]],
    );
    const taskId = randomUUID();
    await active.query(
      `INSERT INTO data_subject_request_tasks (id, request_id, kind, due_at)
       VALUES ($1, $2, 'SUSPENDER_COBRO_EXTERNO', CURRENT_DATE)`,
      [taskId, requestId],
    );
    expect(await countRows(active, 'data_subject_request_tasks')).toBe(1);
    await active.query(
      `UPDATE data_subject_request_tasks
       SET done_at = now(), done_by = $2, note = 'Fixture de integración'
       WHERE id = $1`,
      [taskId, randomUUID()],
    );
    await expectRejectedWrite(active, () =>
      active.query(
        `UPDATE data_subject_request_tasks SET done_at = NULL, done_by = NULL WHERE id = $1`,
        [taskId],
      ),
    );
    await expectRejectedWrite(active, () =>
      active.query(
        `INSERT INTO data_subject_requests
          (party_id, requester_kind, kind, "right", status, received_at, due_at)
         VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'EN_TRAMITE', now(), CURRENT_DATE + 10)`,
        [partyId],
      ),
    );

    const markId = randomUUID();
    await active.query(
      `INSERT INTO party_privacy_marks (id, party_id, mark, event)
       VALUES ($1, $2, 'RECLAMO_EN_TRAMITE', 'OPEN')`,
      [markId, partyId],
    );

    const appendOnlyWrites: Array<[() => Promise<unknown>, () => Promise<unknown>]> = [
      [
        () =>
          active.query(`UPDATE legal_texts SET url = 'https://fixture.invalid' WHERE id = $1`, [
            legalTextId,
          ]),
        () => active.query(`DELETE FROM legal_texts WHERE id = $1`, [legalTextId]),
      ],
      [
        () =>
          active.query(`UPDATE data_authorizations SET channel = 'MUTATED' WHERE id = $1`, [
            authorization[0]?.id,
          ]),
        () => active.query(`DELETE FROM data_authorizations WHERE id = $1`, [authorization[0]?.id]),
      ],
      [
        () =>
          active.query(`UPDATE data_subject_request_events SET reason = 'MUTATED' WHERE id = $1`, [
            event[0]?.id,
          ]),
        () => active.query(`DELETE FROM data_subject_request_events WHERE id = $1`, [event[0]?.id]),
      ],
      [
        () =>
          active.query(`UPDATE party_privacy_marks SET event = 'CLOSE' WHERE id = $1`, [markId]),
        () => active.query(`DELETE FROM party_privacy_marks WHERE id = $1`, [markId]),
      ],
    ];
    for (const [update, remove] of appendOnlyWrites) {
      await expectRejectedWrite(active, update);
      await expectRejectedWrite(active, remove);
    }

    await active.query(
      `UPDATE retention_policies SET years = 3 WHERE category = 'PROSPECTO_SIN_CONTRATO'`,
    );
    await expectRejectedWrite(active, () =>
      active.query(
        `UPDATE retention_policies SET years = 1 WHERE category = 'PROSPECTO_SIN_CONTRATO'`,
      ),
    );
    await active.query(
      `UPDATE retention_policies SET years = 2 WHERE category = 'PROSPECTO_SIN_CONTRATO'`,
    );

    await migration.up(active);
    expect(await countRows(active, 'data_authorizations')).toBe(3);
    expect(await countRows(active, 'data_subject_requests')).toBe(3);
    expect(await countRows(active, 'data_subject_request_events')).toBe(2);

    await migration.down(active);
    for (const table of [
      'legal_texts',
      'data_authorizations',
      'data_subject_requests',
      'data_subject_request_events',
      'data_subject_request_tasks',
      'party_privacy_marks',
      'retention_policies',
      'privacy_incidents',
    ]) {
      const result = (await active.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [
        table,
      ])) as Array<{
        present: boolean;
      }>;
      expect(result[0]?.present).toBe(false);
    }
    for (const functionName of [
      'privacy_prevent_incident_report_rewrite()',
      'privacy_prevent_verified_identity_change()',
    ]) {
      const result = (await active.query(`SELECT to_regprocedure($1) IS NOT NULL AS present`, [
        functionName,
      ])) as Array<{ present: boolean }>;
      expect(result[0]?.present).toBe(false);
    }
    expect(await countRows(active, 'consent_records')).toBe(2);
    expect(await countRows(active, 'habeas_data_consents')).toBe(2);
    expect(await countRows(active, 'arco_requests')).toBe(2);

    await migration.up(active);
    expect(await countRows(active, 'data_authorizations')).toBe(3);
    expect(await countRows(active, 'data_subject_requests')).toBe(2);
  });

  it('166 conserva evidencia append-only y valida formato y finalidades en up/down/up', async () => {
    const active = requireRunner(runner);
    const next = new PrivacyLegalFormatsAndPurposes1660000000000();
    await active.query('SAVEPOINT migration_166');
    try {
      const rows = (await active.query(
        `INSERT INTO legal_texts (type, version, sha256, content, published_at)
        VALUES ('AUTORIZACION', '166-test', $1, 'texto sintético', now()) RETURNING id`,
        ['a'.repeat(64)],
      )) as Array<{ id: string }>;
      await next.up(active);
      const selected = (await active.query('SELECT format FROM legal_texts WHERE id = $1', [
        rows[0]?.id,
      ])) as Array<{ format: string }>;
      expect(selected[0]?.format).toBe('PLAIN');
      for (const sql of [
        'UPDATE legal_texts SET content = content WHERE id = $1',
        'DELETE FROM legal_texts WHERE id = $1',
      ]) {
        await active.query('SAVEPOINT blocked_write');
        try {
          await expect(active.query(sql, [rows[0]?.id])).rejects.toMatchObject({
            driverError: { code: '55000' },
          });
        } finally {
          await active.query('ROLLBACK TO SAVEPOINT blocked_write');
          await active.query('RELEASE SAVEPOINT blocked_write');
        }
      }
      await expectRejectedWrite(active, () =>
        active.query(
          `INSERT INTO legal_texts (type, version, sha256, content, published_at, format) VALUES ('AUTORIZACION', 'invalid', $1, 'x', now(), 'INVALID')`,
          ['a'.repeat(64)],
        ),
      );
      await expectRejectedWrite(active, () =>
        active.query(
          `INSERT INTO privacy_purpose_settings (purpose, enabled) VALUES ('INVALID', true)`,
        ),
      );
      expect(
        (
          await active.query(
            'SELECT count(*)::int AS count FROM privacy_purpose_settings WHERE enabled',
          )
        )[0].count,
      ).toBe(4);
      await next.down(active);
      await next.up(active);
    } finally {
      await active.query('ROLLBACK TO SAVEPOINT migration_166');
      await active.query('RELEASE SAVEPOINT migration_166');
    }
  });

  it('el CHECK de privacidad_incidents exige fecha y referencia en pareja', async () => {
    const active = requireRunner(runner);
    await expectRejectedWrite(active, () =>
      active.query(
        `INSERT INTO privacy_incidents
          (detected_at, description, sic_report_due_at, reported_at)
         VALUES (now(), 'Fixture sintético', CURRENT_DATE, CURRENT_DATE)`,
      ),
    );
    await expectRejectedWrite(active, () =>
      active.query(
        `INSERT INTO privacy_incidents
          (detected_at, description, sic_report_due_at, external_reference)
         VALUES (now(), 'Fixture sintético', CURRENT_DATE, 'RAD-PRUEBA-1')`,
      ),
    );
  });

  it('el trigger de reporte permite fijar una vez el par y rechaza edición y borrado', async () => {
    const active = requireRunner(runner);
    const rows = (await active.query(
      `INSERT INTO privacy_incidents (detected_at, description, sic_report_due_at)
       VALUES (now(), 'Fixture sintético', CURRENT_DATE) RETURNING id`,
    )) as Array<{ id: string }>;
    const incidentId = rows[0]?.id;
    if (!incidentId) throw new Error('No se creó el incidente de prueba.');

    await expectRejectedWrite(active, () =>
      active.query(
        `UPDATE privacy_incidents
         SET reported_at = CURRENT_DATE, external_reference = 'RAD-PRUEBA-1',
             description = 'Cambio no permitido'
         WHERE id = $1`,
        [incidentId],
      ),
    );
    await active.query(
      `UPDATE privacy_incidents
       SET reported_at = CURRENT_DATE, external_reference = 'RAD-PRUEBA-1'
       WHERE id = $1`,
      [incidentId],
    );
    await expectRejectedWrite(active, () =>
      active.query(
        `UPDATE privacy_incidents SET external_reference = 'RAD-PRUEBA-2' WHERE id = $1`,
        [incidentId],
      ),
    );
    await expectRejectedWrite(active, () =>
      active.query(`DELETE FROM privacy_incidents WHERE id = $1`, [incidentId]),
    );
  });

  it('el trigger congela la identidad una vez que queda verificada', async () => {
    const active = requireRunner(runner);
    const rows = (await active.query(
      `INSERT INTO data_subject_requests
        (party_id, requester_kind, requester_name_encrypted, requester_document_type,
         requester_document_encrypted, requester_contact_encrypted, kind, "right", status,
         received_at, due_at)
       VALUES ($1, 'TITULAR', 'cipher-name', 'CC', 'cipher-document', 'cipher-contact',
         'CONSULTA', 'CONOCER', 'RADICADA', now(), CURRENT_DATE + 10)
       RETURNING id`,
      [partyId],
    )) as Array<{ id: string }>;
    const requestId = rows[0]?.id;
    if (!requestId) throw new Error('No se creó la solicitud de prueba.');

    await active.query(
      `UPDATE data_subject_requests
       SET identity_verified_at = now(), identity_verified_by = $2,
           identity_verification_method = 'DOCUMENTO_PRESENCIAL',
           requester_evidence_media_id = $3
       WHERE id = $1`,
      [requestId, randomUUID(), evidenceId],
    );
    await expectRejectedWrite(active, () =>
      active.query(
        `UPDATE data_subject_requests
         SET identity_verification_method = 'COPIA_DOCUMENTO',
             requester_evidence_media_id = $2
         WHERE id = $1`,
        [requestId, randomUUID()],
      ),
    );
    await expectRejectedWrite(active, () =>
      active.query(
        `UPDATE data_subject_requests SET identity_verified_at = now() + interval '1 second'
         WHERE id = $1`,
        [requestId],
      ),
    );
    await expectRejectedWrite(active, () =>
      active.query(`UPDATE data_subject_requests SET identity_verified_by = $2 WHERE id = $1`, [
        requestId,
        randomUUID(),
      ]),
    );
  });

  it('el CHECK de suplantación exige Party, contratos impugnados e identidad verificada', async () => {
    const active = requireRunner(runner);
    await expectRejectedWrite(active, () =>
      active.query(
        `INSERT INTO data_subject_requests
          (party_id, requester_kind, identity_verification_method, identity_verified_at,
           identity_verified_by, kind, "right", status, received_at, due_at)
         VALUES ($1, 'TITULAR', 'DOCUMENTO_PRESENCIAL', now(), $2, 'SUPLANTACION',
           'CONOCER', 'RADICADA', now(), CURRENT_DATE + 10)`,
        [partyId, randomUUID()],
      ),
    );
    await expectRejectedWrite(active, () =>
      active.query(
        `INSERT INTO data_subject_requests
          (requester_kind, identity_verification_method, identity_verified_at,
           identity_verified_by, kind, "right", status, received_at, due_at,
           disputed_contract_ids)
         VALUES ('TITULAR', 'DOCUMENTO_PRESENCIAL', now(), $1, 'SUPLANTACION',
           'CONOCER', 'RADICADA', now(), CURRENT_DATE + 10, $2::uuid[])`,
        [randomUUID(), [randomUUID()]],
      ),
    );
    await expectRejectedWrite(active, () =>
      active.query(
        `INSERT INTO data_subject_requests
          (party_id, requester_kind, identity_verification_method, identity_verified_by,
           kind, "right", status, received_at, due_at, disputed_contract_ids)
         VALUES ($1, 'TITULAR', 'DOCUMENTO_PRESENCIAL', NULL, 'SUPLANTACION',
           'CONOCER', 'RADICADA', now(), CURRENT_DATE + 10, $2::uuid[])`,
        [partyId, [randomUUID()]],
      ),
    );
  });

  it('el CHECK impide contratos impugnados en solicitudes que no son suplantación', async () => {
    await expectRejectedWrite(requireRunner(runner), () =>
      requireRunner(runner).query(
        `INSERT INTO data_subject_requests
          (party_id, requester_kind, kind, "right", status, received_at, due_at,
           disputed_contract_ids)
         VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RADICADA', now(),
           CURRENT_DATE + 10, $2::uuid[])`,
        [partyId, [randomUUID()]],
      ),
    );
  });

  it('permite NO_PROCEDENTE sin identidad por falta de legitimación', async () => {
    await requireRunner(runner).query(
      `INSERT INTO data_subject_requests
        (requester_kind, kind, "right", status, received_at, due_at, legal_basis)
       VALUES ('TITULAR', 'CONSULTA', 'CONOCER', 'NO_PROCEDENTE', now(),
         CURRENT_DATE + 10, 'SOLICITANTE_NO_LEGITIMADO')`,
    );
  });

  it('rechaza NO_PROCEDENTE sin identidad con otro fundamento o sin fundamento', async () => {
    const active = requireRunner(runner);
    await expectRejectedWrite(active, () =>
      active.query(
        `INSERT INTO data_subject_requests
          (requester_kind, kind, "right", status, received_at, due_at, legal_basis)
         VALUES ('TITULAR', 'CONSULTA', 'CONOCER', 'NO_PROCEDENTE', now(),
           CURRENT_DATE + 10, 'DEBER_DE_CONSERVACION')`,
      ),
    );
    await expectRejectedWrite(active, () =>
      active.query(
        `INSERT INTO data_subject_requests
          (requester_kind, kind, "right", status, received_at, due_at)
         VALUES ('TITULAR', 'CONSULTA', 'CONOCER', 'NO_PROCEDENTE', now(),
           CURRENT_DATE + 10)`,
      ),
    );
  });

  it('permite TRASLADADA sin identidad verificada', async () => {
    await requireRunner(runner).query(
      `INSERT INTO data_subject_requests
        (requester_kind, kind, "right", status, received_at, due_at)
       VALUES ('TITULAR', 'CONSULTA', 'CONOCER', 'TRASLADADA', now(), CURRENT_DATE + 10)`,
    );
  });

  it('exige identidad verificada para RESUELTA', async () => {
    const active = requireRunner(runner);
    await expectRejectedWrite(active, () =>
      active.query(
        `INSERT INTO data_subject_requests
          (requester_kind, kind, "right", status, received_at, due_at)
         VALUES ('TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', now(), CURRENT_DATE + 10)`,
      ),
    );
  });
});
