import { randomUUID } from 'node:crypto';
import { requestTaskKindSchema } from '@iwana/shared';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { TENANT_MIGRATIONS } from './runner';
import { PrivacyDenunciaOperador1720000000172 } from './172_privacy_denuncia_operador';

const enabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describePg = enabled ? describe : describe.skip;
if (enabled && !/^(dbiw|test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('La integración 172 requiere una base de pruebas aprobada.');
}
jest.setTimeout(900_000);

describePg('172 — tareas de denuncia y comunicación en PostgreSQL real', () => {
  const schema = `tenant_it172_${randomUUID().replaceAll('-', '')}`;
  const tenantId = randomUUID();
  const partyId = randomUUID();
  const migration = new PrivacyDenunciaOperador1720000000172();
  let ds: DataSource;
  let qr: QueryRunner;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    ds = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number(process.env['DB_PORT'] ?? 5432),
      ...credentials,
      database: process.env['DB_NAME'] ?? 'dbiw',
      synchronize: false,
      logging: false,
    });
    await ds.initialize();
    qr = ds.createQueryRunner();
    await qr.query(`CREATE SCHEMA "${schema}"`);
    await qr.query(
      `INSERT INTO public.tenants (id,name,slug,schema_name,contact_email,status)
       VALUES ($1,'Fixture denuncia',$2,$2,'fixture@invalid.example','INACTIVE')`,
      [tenantId, schema],
    );
    await qr.query(`SET search_path TO "${schema}", public`);

    const targetIndex = TENANT_MIGRATIONS.findIndex(
      (Migration) => new Migration().name === migration.name,
    );
    expect(targetIndex).toBeGreaterThan(0);
    for (const Migration of TENANT_MIGRATIONS.slice(0, targetIndex)) {
      await new Migration().up(qr);
    }

    await qr.query(
      `INSERT INTO party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', 'SYNTHETIC-172', 'Fixture denuncia')`,
      [partyId],
    );
  });

  afterAll(async () => {
    if (qr && !qr.isReleased) await qr.release();
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id=$1', [tenantId]);
      await ds.destroy();
    }
  });

  it('CA-DO-05: up → down → up, backfill abierto e idempotente; down protege filas nuevas', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await migration.up(qr);
      let constraint = (await qr.query(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'data_subject_request_tasks'::regclass
          AND conname = 'ck_data_subject_request_tasks_kind'
      `)) as Array<{ definition: string }>;
      expect(constraint[0]?.definition).toContain('FORMULAR_DENUNCIA_OPERADOR');
      expect(constraint[0]?.definition).toContain('COMUNICAR_PLAZO_DENUNCIA');

      await migration.down(qr);
      constraint = (await qr.query(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'data_subject_request_tasks'::regclass
          AND conname = 'ck_data_subject_request_tasks_kind'
      `)) as Array<{ definition: string }>;
      expect(constraint[0]?.definition).toContain('SUSPENDER_COBRO_EXTERNO');
      expect(constraint[0]?.definition).toContain('ENTREGAR_COPIA_DOCUMENTOS');
      expect(constraint[0]?.definition).not.toContain('FORMULAR_DENUNCIA_OPERADOR');

      await migration.up(qr);

      const openRequestIds = [randomUUID(), randomUUID()];
      const excludedRequestIds = [randomUUID(), randomUUID(), randomUUID()];
      const nonImpersonationRequestId = randomUUID();
      const receivedAt = '2026-11-03T14:00:00.000Z';
      const complaintDueAt = '2026-11-30';

      for (const [index, requestId] of openRequestIds.entries()) {
        await qr.query(
          `INSERT INTO data_subject_requests
            (id, party_id, requester_kind, identity_verification_method, identity_verified_at,
             identity_verified_by, kind, "right", status, received_at, due_at,
             impersonation_complaint_due_at, disputed_contract_ids)
           VALUES ($1, $2, 'TITULAR', 'DOCUMENTO_PRESENCIAL', now(), $3, 'SUPLANTACION',
             'CONOCER', $4, $5, CURRENT_DATE + 10, $6, $7::uuid[])`,
          [
            requestId,
            partyId,
            randomUUID(),
            index === 0 ? 'RADICADA' : 'EN_TRAMITE',
            receivedAt,
            complaintDueAt,
            [randomUUID()],
          ],
        );
      }
      await qr.query(
        `INSERT INTO data_subject_request_tasks (request_id, kind, due_at)
         VALUES ($1, 'SUSPENDER_COBRO_EXTERNO', $2::date)`,
        [openRequestIds[0], receivedAt],
      );

      for (const [index, requestId] of excludedRequestIds.entries()) {
        await qr.query(
          `INSERT INTO data_subject_requests
            (id, party_id, requester_kind, identity_verification_method, identity_verified_at,
             identity_verified_by, kind, "right", status, received_at, due_at,
             impersonation_complaint_due_at, disputed_contract_ids)
           VALUES ($1, $2, 'TITULAR', 'DOCUMENTO_PRESENCIAL', now(), $3, 'SUPLANTACION',
             'CONOCER', $4, $5, CURRENT_DATE + 10, $6, $7::uuid[])`,
          [
            requestId,
            partyId,
            randomUUID(),
            ['RESUELTA', 'NO_PROCEDENTE', 'TRASLADADA'][index],
            receivedAt,
            complaintDueAt,
            [randomUUID()],
          ],
        );
      }
      await qr.query(
        `INSERT INTO data_subject_requests
          (id, requester_kind, kind, "right", status, received_at, due_at)
         VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RADICADA', $2, CURRENT_DATE + 10)`,
        [nonImpersonationRequestId, receivedAt],
      );

      await migration.up(qr);
      expect(log).toHaveBeenCalledWith('[172] privacy denuncia backfill inserted=4');

      const tasks = (await qr.query(`
        SELECT request_id::text AS request_id, kind, due_at::text AS due_at
        FROM data_subject_request_tasks
        WHERE kind IN ('FORMULAR_DENUNCIA_OPERADOR', 'COMUNICAR_PLAZO_DENUNCIA')
        ORDER BY request_id, kind
      `)) as Array<{ request_id: string; kind: string; due_at: string }>;
      expect(tasks).toHaveLength(4);
      for (const requestId of openRequestIds) {
        expect(tasks).toEqual(
          expect.arrayContaining([
            { request_id: requestId, kind: 'FORMULAR_DENUNCIA_OPERADOR', due_at: complaintDueAt },
          ]),
        );
        const dates = (await qr.query(
          `SELECT received_at::date::text AS received_date
           FROM data_subject_requests WHERE id=$1`,
          [requestId],
        )) as Array<{ received_date: string }>;
        expect(tasks).toEqual(
          expect.arrayContaining([
            {
              request_id: requestId,
              kind: 'COMUNICAR_PLAZO_DENUNCIA',
              due_at: dates[0]?.received_date,
            },
          ]),
        );
      }
      for (const requestId of [...excludedRequestIds, nonImpersonationRequestId]) {
        expect(tasks.some((task) => task.request_id === requestId)).toBe(false);
      }

      log.mockClear();
      await migration.up(qr);
      expect(log).toHaveBeenCalledWith('[172] privacy denuncia backfill inserted=0');
      const afterRetry = (await qr.query(`
        SELECT COUNT(*)::int AS count
        FROM data_subject_request_tasks
        WHERE kind IN ('FORMULAR_DENUNCIA_OPERADOR', 'COMUNICAR_PLAZO_DENUNCIA')
      `)) as Array<{ count: number }>;
      expect(afterRetry[0]?.count).toBe(4);

      await expect(migration.down(qr)).rejects.toThrow(
        /existen 4 tareas nuevas; no se eliminó ninguna fila/u,
      );
      const retained = (await qr.query(`
        SELECT COUNT(*)::int AS count
        FROM data_subject_request_tasks
        WHERE kind IN ('FORMULAR_DENUNCIA_OPERADOR', 'COMUNICAR_PLAZO_DENUNCIA')
      `)) as Array<{ count: number }>;
      expect(retained[0]?.count).toBe(4);
      expect(log.mock.calls.flat().join(' ')).not.toMatch(/request|party|titular|document/iu);
    } finally {
      log.mockRestore();
    }
  });

  it('CA-DO-06: el CHECK de PostgreSQL tiene paridad exacta con requestTaskKindSchema', async () => {
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
  });
});
