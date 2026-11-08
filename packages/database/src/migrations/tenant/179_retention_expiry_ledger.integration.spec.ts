import { randomUUID } from 'node:crypto';
import { requestTaskKindSchema } from '@iwana/shared';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { TENANT_MIGRATIONS } from './runner';
import { RetentionExpiryLedger1790000000179 } from './179_retention_expiry_ledger';

const enabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describePg = enabled ? describe : describe.skip;
if (enabled && !/^(test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('La integración 179 requiere una base de pruebas aprobada (test o iwana_it_*).');
}
jest.setTimeout(900_000);

describePg('179 — ledger de vencimiento y minimización de solicitudes (H-EXP B1)', () => {
  const schema = `tenant_it179_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const tenantId = randomUUID();
  const migration = new RetentionExpiryLedger1790000000179();
  let ds: DataSource;
  let qr: QueryRunner;

  async function columnsOf(table: string): Promise<Set<string>> {
    const rows: Array<{ column_name: string }> = await qr.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2`,
      [schema, table],
    );
    return new Set(rows.map((row) => row.column_name));
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    ds = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number(process.env['DB_PORT'] ?? 5432),
      ...credentials,
      database: process.env['DB_NAME'] ?? 'test',
      synchronize: false,
      logging: false,
    });
    await ds.initialize();
    qr = ds.createQueryRunner();
    await qr.query(`CREATE SCHEMA "${schema}"`);
    await qr.query(
      `INSERT INTO public.tenants (id,name,slug,schema_name,contact_email,status)
       VALUES ($1,'Fixture 179',$2,$2,'k2a@invalid.example','INACTIVE')`,
      [tenantId, schema],
    );
    await qr.query(`SET search_path TO "${schema}", public`);
    const last = TENANT_MIGRATIONS.findIndex((M) => new M().name === migration.name);
    expect(last).toBeGreaterThan(0);
    for (const M of TENANT_MIGRATIONS.slice(0, last)) {
      await new M().up(qr);
    }
  });

  afterAll(async () => {
    if (qr && !qr.isReleased) await qr.release();
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id=$1', [tenantId]);
      await ds.destroy();
    }
  });

  it('up crea ledger, columnas de minimización y backfill determinista de closed_at', async () => {
    await migration.up(qr);
    // Reaplicación idempotente.
    await migration.up(qr);

    const requests = await columnsOf('data_subject_requests');
    for (const column of [
      'closed_at',
      'minimized_at',
      'retention_closed_at',
      'transfer_destination_kind',
      'transfer_destination_code',
      'transfer_destination_name',
    ]) {
      expect(requests.has(column)).toBe(true);
    }
    const runs = await columnsOf('privacy_retention_expiry_runs');
    for (const column of [
      'tipo',
      'target_id',
      'request_id',
      'eligible_on',
      'rules_version',
      'estado',
      'changed_rows',
      'reason_code',
      'started_at',
      'completed_at',
    ]) {
      expect(runs.has(column)).toBe(true);
    }
    // El motivo saneado del acto queda en el ledger con lista cerrada.
    // Fuente de verdad: RETENTION_EXPIRY_REASONS en
    // apps/api/src/modules/privacy/retention/retention-expiry.service.ts.
    const reasonCheck: Array<{ definition: string }> = await qr.query(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'privacy_retention_expiry_runs'::regclass
        AND conname = 'chk_retention_expiry_runs_reason_code'
    `);
    expect(reasonCheck).toHaveLength(1);
    const databaseReasons = Array.from(
      reasonCheck[0]?.definition.matchAll(/'([^']+)'/gu) ?? [],
      (match) => match[1],
    ).sort();
    expect(databaseReasons).toEqual(
      [
        'OPEN_CONTRACT',
        'CONTRACT_RETENTION',
        'FISCAL_RETENTION',
        'PQR_RETENTION',
        'PROSPECT_UNRECONCILED',
        'REQUEST_ACTIVE_HOLD',
        'REQUEST_CHANGED',
        'MARK_NOT_ACTIVE',
        'MISSING_REQUEST_CLOSURE',
        'MISSING_POLICY',
        'PORT_UNAVAILABLE',
        'UNRECONCILED_SCOPE',
        'ACTIVE_ACCOUNT',
        'SUPPLIER_LINKED',
        'TOO_MANY_CANDIDATES',
        'PARTICIPANT_ERROR',
        'RESIDUAL_MISMATCH',
        'CLASSIFICATION_INVALID',
        'SCHEMA_INCOMPATIBLE',
        'CONTRACT_UNRECONCILED',
        'FISCAL_UNRECONCILED',
      ].sort(),
    );

    // Unicidad por tipo, objetivo y versión de reglas.
    const target = randomUUID();
    await qr.query(
      `INSERT INTO privacy_retention_expiry_runs (tipo, target_id, eligible_on, rules_version, estado)
       VALUES ('TITULAR', $1, CURRENT_DATE, 1, 'COMPLETE')`,
      [target],
    );
    await expect(
      qr.query(
        `INSERT INTO privacy_retention_expiry_runs (tipo, target_id, eligible_on, rules_version, estado)
         VALUES ('TITULAR', $1, CURRENT_DATE, 1, 'COMPLETE')`,
        [target],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });

    // Backfill: TRASLADADA toma el evento de entrada terminal.
    const request = randomUUID();
    await qr.query(
      `INSERT INTO data_subject_requests (id, requester_kind, kind, "right", status, received_at, due_at)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'TRASLADADA', now(), CURRENT_DATE)`,
      [request],
    );
    await qr.query(
      `INSERT INTO data_subject_request_events (request_id, from_status, to_status, occurred_at)
       VALUES ($1, 'EN_TRAMITE', 'TRASLADADA', '2024-03-10T15:00:00Z')`,
      [request],
    );
    await migration.up(qr);
    const closed: Array<{ closed_at: Date | null }> = await qr.query(
      'SELECT closed_at FROM data_subject_requests WHERE id = $1',
      [request],
    );
    expect(closed[0]?.closed_at).toBeInstanceOf(Date);
  });

  it('la excepción de minimización del append-only es quirúrgica y reversible', async () => {
    const request = randomUUID();
    await qr.query(
      `INSERT INTO data_subject_requests (id, requester_kind, kind, "right", status, received_at, due_at,
        identity_verification_method, identity_verified_at, identity_verified_by)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', now(), CURRENT_DATE,
        'DOCUMENTO_PRESENCIAL', now(), $2)`,
      [request, randomUUID()],
    );
    const event = randomUUID();
    await qr.query(
      `INSERT INTO data_subject_request_events (id, request_id, from_status, to_status, reason)
       VALUES ($1, $2, 'EN_TRAMITE', 'RESUELTA', 'Nota libre sintética')`,
      [event, request],
    );
    // La anulación solo procede en la minimización (R1): fijar minimized_at
    // con estado terminal antes de anular el motivo libre.
    await qr.query(`UPDATE data_subject_requests SET minimized_at = now() WHERE id = $1`, [
      request,
    ]);
    // Solo anular el motivo pasa; mutarlo o tocar otra columna, no.
    await qr.query(`UPDATE data_subject_request_events SET reason = NULL WHERE id = $1`, [event]);
    await expect(
      qr.query(`UPDATE data_subject_request_events SET reason = 'MUTATED' WHERE id = $1`, [event]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(
      qr.query(
        `UPDATE data_subject_request_events SET reason = NULL, to_status = 'TRASLADADA' WHERE id = $1`,
        [event],
      ),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(
      qr.query(`DELETE FROM data_subject_request_events WHERE id = $1`, [event]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
  });

  it('la identidad verificada admite anular la evidencia pero no reescribirla', async () => {
    const request = randomUUID();
    const evidence = randomUUID();
    await qr.query(
      `INSERT INTO data_subject_requests (id, requester_kind, kind, "right", status, received_at, due_at,
        identity_verification_method, identity_verified_at, identity_verified_by,
        requester_evidence_media_id)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', now(), CURRENT_DATE,
        'DOCUMENTO_PRESENCIAL', now(), $2, $3)`,
      [request, randomUUID(), evidence],
    );
    await qr.query(`UPDATE data_subject_requests SET minimized_at = now() WHERE id = $1`, [
      request,
    ]);
    await qr.query(
      `UPDATE data_subject_requests SET requester_evidence_media_id = NULL WHERE id = $1`,
      [request],
    );
    await expect(
      qr.query(
        `UPDATE data_subject_requests SET identity_verification_method = 'COPIA_DOCUMENTO' WHERE id = $1`,
        [request],
      ),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
  });

  it('R1: anular reason exige solicitud minimizada y motivo no protegido', async () => {
    // Sin minimized_at la anulación se rechaza aunque el motivo sea libre.
    const plain = randomUUID();
    await qr.query(
      `INSERT INTO data_subject_requests (id, requester_kind, kind, "right", status, received_at, due_at,
        identity_verification_method, identity_verified_at, identity_verified_by)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', now(), CURRENT_DATE,
        'DOCUMENTO_PRESENCIAL', now(), $2)`,
      [plain, randomUUID()],
    );
    const plainEvent = randomUUID();
    await qr.query(
      `INSERT INTO data_subject_request_events (id, request_id, from_status, to_status, reason)
       VALUES ($1, $2, 'EN_TRAMITE', 'RESUELTA', 'Nota libre sintética')`,
      [plainEvent, plain],
    );
    await expect(
      qr.query(`UPDATE data_subject_request_events SET reason = NULL WHERE id = $1`, [plainEvent]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });

    // Minimizada pero con motivo protegido: se rechaza cada código de la lista cerrada.
    const guarded = randomUUID();
    await qr.query(
      `INSERT INTO data_subject_requests (id, requester_kind, kind, "right", status, received_at, due_at,
        identity_verification_method, identity_verified_at, identity_verified_by, minimized_at)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', now(), CURRENT_DATE,
        'DOCUMENTO_PRESENCIAL', now(), $2, now())`,
      [guarded, randomUUID()],
    );
    for (const reason of [
      'RESOLVE',
      'TRASLADO',
      'DESISTIMIENTO',
      'PRORROGA',
      'REAPERTURA',
      'TAREA_COMPLETADA:K2-sintetico',
    ]) {
      const event = randomUUID();
      await qr.query(
        `INSERT INTO data_subject_request_events (id, request_id, from_status, to_status, reason)
         VALUES ($1, $2, 'EN_TRAMITE', 'RESUELTA', $3)`,
        [event, guarded, reason],
      );
      await expect(
        qr.query(`UPDATE data_subject_request_events SET reason = NULL WHERE id = $1`, [event]),
      ).rejects.toMatchObject({ driverError: { code: '55000' } });
    }
  });

  it('R2: anular requester_evidence_media_id exige minimized_at', async () => {
    const request = randomUUID();
    await qr.query(
      `INSERT INTO data_subject_requests (id, requester_kind, kind, "right", status, received_at, due_at,
        identity_verification_method, identity_verified_at, identity_verified_by,
        requester_evidence_media_id)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', now(), CURRENT_DATE,
        'DOCUMENTO_PRESENCIAL', now(), $2, $3)`,
      [request, randomUUID(), randomUUID()],
    );
    await expect(
      qr.query(
        `UPDATE data_subject_requests SET requester_evidence_media_id = NULL WHERE id = $1`,
        [request],
      ),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
  });

  it('R3: minimized_at es monótono y exige estado terminal', async () => {
    // Fijarlo con estado no terminal se rechaza.
    const live = randomUUID();
    await qr.query(
      `INSERT INTO data_subject_requests (id, requester_kind, kind, "right", status, received_at, due_at,
        identity_verification_method, identity_verified_at, identity_verified_by)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'EN_TRAMITE', now(), CURRENT_DATE,
        'DOCUMENTO_PRESENCIAL', now(), $2)`,
      [live, randomUUID()],
    );
    await expect(
      qr.query(`UPDATE data_subject_requests SET minimized_at = now() WHERE id = $1`, [live]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });

    // Fijado válido y luego anular o cambiar se rechaza.
    const done = randomUUID();
    await qr.query(
      `INSERT INTO data_subject_requests (id, requester_kind, kind, "right", status, received_at, due_at,
        identity_verification_method, identity_verified_at, identity_verified_by)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', now(), CURRENT_DATE,
        'DOCUMENTO_PRESENCIAL', now(), $2)`,
      [done, randomUUID()],
    );
    await qr.query(`UPDATE data_subject_requests SET minimized_at = now() WHERE id = $1`, [done]);
    await expect(
      qr.query(`UPDATE data_subject_requests SET minimized_at = NULL WHERE id = $1`, [done]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(
      qr.query(
        `UPDATE data_subject_requests SET minimized_at = now() + interval '1 day' WHERE id = $1`,
        [done],
      ),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
  });

  it('R4: la fila minimizada solo cambia hacia NULL', async () => {
    const party = randomUUID();
    await qr.query(
      `INSERT INTO party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', 'sintetico', 'Titular sintético')`,
      [party],
    );
    const request = randomUUID();
    await qr.query(
      `INSERT INTO data_subject_requests (id, requester_kind, kind, "right", status, received_at, due_at,
        identity_verification_method, identity_verified_at, identity_verified_by,
        requester_name_encrypted, requester_document_hmac, response_text)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', now(), CURRENT_DATE,
        'DOCUMENTO_PRESENCIAL', now(), $2, 'sintetico', 'sintetico', 'Texto sintético')`,
      [request, randomUUID()],
    );
    await qr.query(`UPDATE data_subject_requests SET minimized_at = now() WHERE id = $1`, [
      request,
    ]);
    await expect(
      qr.query(`UPDATE data_subject_requests SET requester_name_encrypted = 'otro' WHERE id = $1`, [
        request,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(
      qr.query(`UPDATE data_subject_requests SET response_text = 'nuevo' WHERE id = $1`, [request]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(
      qr.query(`UPDATE data_subject_requests SET requester_document_hmac = 'otro' WHERE id = $1`, [
        request,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(
      qr.query(`UPDATE data_subject_requests SET party_id = $2 WHERE id = $1`, [request, party]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
  });

  it('el CHECK de tareas conserva la paridad con requestTaskKindSchema en la punta', async () => {
    const constraint = (await qr.query(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'data_subject_request_tasks'::regclass
        AND conname = 'ck_data_subject_request_tasks_kind'
    `)) as Array<{ definition: string }>;
    const databaseKinds = Array.from(
      constraint[0]?.definition.matchAll(/'([^']+)'/gu) ?? [],
      (match) => match[1],
    ).sort();
    expect(databaseKinds).toEqual([...requestTaskKindSchema.options].sort());
    expect(databaseKinds).toContain('CLASIFICAR_DESTINO_TRASLADO');
  });

  it('R4 cubre transferred_to, destinos, arrays de contratos y status (B2-R3 P2a)', async () => {
    const request = randomUUID();
    await qr.query(
      `INSERT INTO data_subject_requests (id, requester_kind, kind, "right", status, received_at, due_at,
        identity_verification_method, identity_verified_at, identity_verified_by,
        transferred_to, transfer_destination_kind, transfer_destination_code,
        transfer_destination_name, suspended_contract_ids, disputed_contract_ids)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'TRASLADADA', now(), CURRENT_DATE,
        'DOCUMENTO_PRESENCIAL', now(), $2,
        'texto libre heredado', 'INSTITUTION', 'ENTIDAD-001', 'Entidad pública',
        '{${request}}', '{}')`,
      [request, randomUUID()],
    );
    await qr.query(`UPDATE data_subject_requests SET minimized_at = now() WHERE id = $1`, [
      request,
    ]);
    // Texto libre y destinos no se reintroducen en fila minimizada.
    await expect(
      qr.query(`UPDATE data_subject_requests SET transferred_to = 'otro' WHERE id = $1`, [request]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(
      qr.query(
        `UPDATE data_subject_requests SET transfer_destination_code = 'OTRO' WHERE id = $1`,
        [request],
      ),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(
      qr.query(
        `UPDATE data_subject_requests SET transfer_destination_kind = 'PERSON' WHERE id = $1`,
        [request],
      ),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(
      qr.query(
        `UPDATE data_subject_requests SET transfer_destination_name = 'Otro' WHERE id = $1`,
        [request],
      ),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    // Arrays de contratos solo vuelven a '{}'.
    const other = randomUUID();
    await expect(
      qr.query(`UPDATE data_subject_requests SET suspended_contract_ids = $2 WHERE id = $1`, [
        request,
        `{${other}}`,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(
      qr.query(`UPDATE data_subject_requests SET disputed_contract_ids = $2 WHERE id = $1`, [
        request,
        `{${other}}`,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    // El estado terminal no se reabre tras minimizar.
    await expect(
      qr.query(`UPDATE data_subject_requests SET status = 'EN_TRAMITE' WHERE id = $1`, [request]),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    // Hacia NULL/'{}' sí pasa.
    await qr.query(`UPDATE data_subject_requests SET transferred_to = NULL WHERE id = $1`, [
      request,
    ]);
    await qr.query(`UPDATE data_subject_requests SET suspended_contract_ids = '{}' WHERE id = $1`, [
      request,
    ]);
  });

  it('P2b: TRUNCATE queda bloqueado en ledger, cursores y solicitudes', async () => {
    await expect(qr.query('TRUNCATE privacy_retention_expiry_runs')).rejects.toMatchObject({
      driverError: { code: '55000' },
    });
    await expect(qr.query('TRUNCATE privacy_retention_expiry_cursors')).rejects.toMatchObject({
      driverError: { code: '55000' },
    });
    // Con CASCADE el FK no se adelanta: la guardia de sentencia rechaza primero.
    await expect(qr.query('TRUNCATE data_subject_requests CASCADE')).rejects.toMatchObject({
      driverError: { code: '55000' },
    });
    await expect(qr.query('TRUNCATE data_subject_request_events')).rejects.toMatchObject({
      driverError: { code: '55000' },
    });
  });

  it('down falla con actos confirmados y revierte en limpio', async () => {
    await expect(migration.down(qr)).rejects.toThrow(/minimizaci|confirmado/i);
    await qr.query('DELETE FROM privacy_retention_expiry_runs');
    // R3 impide anular minimized_at por UPDATE y el append-only de la 146
    // rechaza DELETE de eventos: en este schema efímero se quitan primero
    // las guardias de sentencia propias de la 179 (down() también las quita
    // con IF EXISTS) y se trunca el paquete antes de revertir.
    await qr.query(
      'DROP TRIGGER IF EXISTS trg_privacy_retention_no_truncate ON data_subject_requests',
    );
    await qr.query(
      'DROP TRIGGER IF EXISTS trg_privacy_retention_no_truncate ON data_subject_request_events',
    );
    await qr.query('TRUNCATE data_subject_requests CASCADE');
    await migration.down(qr);
    const requests = await columnsOf('data_subject_requests');
    expect(requests.has('closed_at')).toBe(false);
    expect(requests.has('privacy_retention_expiry_runs')).toBe(false);
    await migration.up(qr);
    expect((await columnsOf('data_subject_requests')).has('closed_at')).toBe(true);
  });
});
