import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ImportPromotionAndSubscriberDocuments1990000000199 } from './199_import_promotion_and_subscriber_documents';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './runner';

/**
 * Migración 199 — promoción de la importación UISP y soportes del suscriptor (ADR-110 D3,
 * D5–D7, D13) en PostgreSQL real, con la cadena completa de `TENANT_MIGRATIONS`.
 *
 * Cubre: CHECK e índice único parcial de `subscriber_documents`, historial `IMPORTADO` del ciclo
 * de vida acoplado a su motivo, PDF externo solo en `IMPORTADO`, trigger que reserva a la
 * promoción las aplicaciones a documentos importados, y down/up con su guarda destructiva.
 */
const SCHEMA = `tenant_uisp_199_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const ACTOR_ID = randomUUID();
const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const INTEGRATION_DATABASE_NAME = /^(test|iwana_it_[a-z0-9_]+)$/u;
const databaseAllowed = INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '');
const describeWithDb = dbAvailable && databaseAllowed ? describe : describe.skip;

jest.setTimeout(900_000);

describeWithDb(
  'Migración 199 — promoción UISP y soportes del suscriptor en PostgreSQL real',
  () => {
    let dataSource: DataSource | undefined;
    let runner: QueryRunner | undefined;
    const m199 = new ImportPromotionAndSubscriberDocuments1990000000199();
    let subscriberId = '';
    let contractId = '';
    const batchId = randomUUID();
    const SHA = 'a'.repeat(64);

    function qr(): QueryRunner {
      if (!runner) throw new Error('QueryRunner no inicializado.');
      return runner;
    }

    async function sqlstateOf(sql: string, params: unknown[] = []): Promise<string> {
      await qr().query('SAVEPOINT sp_199');
      try {
        await qr().query(sql, params);
      } catch (error) {
        await qr().query('ROLLBACK TO SAVEPOINT sp_199');
        return (error as { code?: string }).code ?? 'sin-codigo';
      }
      await qr().query('RELEASE SAVEPOINT sp_199');
      return 'aceptado';
    }

    const insertSupport = `INSERT INTO subscriber_documents
      (tenant_id, subscriber_id, kind, content_type, size_bytes, sha256, storage_key, origin,
       external_id, import_batch_id)
    VALUES ($1, $2, $3, 'application/pdf', 10, $4, 'tenant/x.pdf', $5, $6, $7)`;

    const lifecycle = (source: string, reason: string) =>
      sqlstateOf(
        `INSERT INTO crm_lifecycle_changes (tenant_id, entity_type, entity_id, subscriber_id,
         from_status, to_status, reason_code, source, batch_id, actor_id)
       VALUES ($1, 'CONTRACT', $2, $3, 'ACTIVE', 'SUSPENDED', $4, $5, $6, $7)`,
        [TENANT_ID, contractId, subscriberId, reason, source, batchId, ACTOR_ID],
      );

    async function document(status: string, pdfKey: string | null): Promise<string> {
      const id = randomUUID();
      await qr().query(
        `INSERT INTO billing_documents (id, tenant_id, period_id, contract_id, subscriber_id, status,
         external_number, due_date, subtotal, tax_total, total, external_id, import_batch_id,
         external_pdf_key)
       VALUES ($1, $2, NULL, $3, $4, $5, 'UISP-1', '2026-01-15', 100, 0, 100, $6, $7, $8)`,
        [
          id,
          TENANT_ID,
          contractId,
          subscriberId,
          status,
          `uisp:invoice:${id.slice(0, 8)}`,
          batchId,
          pdfKey,
        ],
      );
      return id;
    }

    async function payment(imported: boolean): Promise<string> {
      const id = randomUUID();
      await qr().query(
        `INSERT INTO billing_payments (id, tenant_id, subscriber_id, method, amount, paid_at,
         idempotency_key, created_by, external_id, import_batch_id)
       VALUES ($1, $2, $3, 'EFECTIVO', 50, '2026-01-20', $4, $5, $6, $7)`,
        [
          id,
          TENANT_ID,
          subscriberId,
          `k-${id}`,
          ACTOR_ID,
          imported ? `uisp:payment:${id.slice(0, 8)}` : null,
          imported ? batchId : null,
        ],
      );
      return id;
    }

    const allocate = (paymentId: string, documentId: string) =>
      sqlstateOf(
        `INSERT INTO billing_payment_allocations (tenant_id, payment_id, document_id, amount)
       VALUES ($1, $2, $3, 10)`,
        [TENANT_ID, paymentId, documentId],
      );

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
      await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
      await dataSource.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Promoción UISP sintética', $2, $3, 'INACTIVE', $4)`,
        [TENANT_ID, SCHEMA.replaceAll('_', '-'), SCHEMA, `${SCHEMA}@invalid.example`],
      );
      const tenantDataSource = createTenantDataSource(dataSource, SCHEMA);
      await tenantDataSource.initialize();
      try {
        await applyTenantMigrationsInOrder(tenantDataSource);
      } finally {
        await tenantDataSource.destroy();
      }
      runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.query(`SET search_path TO "${SCHEMA}"`);
      await runner.startTransaction();
      subscriberId = randomUUID();
      await runner.query(
        `INSERT INTO subscribers
        (id, tenant_id, status, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, vat_treatment,
         address, created_by)
       VALUES ($1, $2, 'PROSPECT', 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado',
               'Titular', 'Sintético', 3, 'STANDARD', 'Dirección sintética', $3)`,
        [subscriberId, TENANT_ID, ACTOR_ID],
      );
      contractId = randomUUID();
      await runner.query(
        `INSERT INTO contracts (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json)
       VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb)`,
        [contractId, TENANT_ID, subscriberId],
      );
    });

    afterAll(async () => {
      delete process.env[DESTRUCTIVE];
      try {
        if (runner && !runner.isReleased) {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
          await runner.release();
        }
      } finally {
        if (dataSource?.isInitialized) {
          await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
          await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [TENANT_ID]);
          await dataSource.destroy();
        }
      }
    });

    it('soporte importado: exige external_id y lote, tipo y origen cerrados, único por tenant', async () => {
      const external = `uisp:document:${randomBytes(4).toString('hex')}`;
      expect(
        await sqlstateOf(insertSupport, [
          TENANT_ID,
          subscriberId,
          'PDF',
          SHA,
          'IMPORTADO',
          external,
          batchId,
        ]),
      ).toBe('aceptado');
      expect(
        await sqlstateOf(insertSupport, [
          TENANT_ID,
          subscriberId,
          'PDF',
          SHA,
          'IMPORTADO',
          external,
          batchId,
        ]),
      ).toBe('23505');
      expect(
        await sqlstateOf(insertSupport, [
          TENANT_ID,
          subscriberId,
          'PDF',
          SHA,
          'IMPORTADO',
          null,
          null,
        ]),
      ).toBe('23514');
      expect(
        await sqlstateOf(insertSupport, [
          TENANT_ID,
          subscriberId,
          'ZIP',
          SHA,
          'IMPORTADO',
          'uisp:document:z',
          batchId,
        ]),
      ).toBe('23514');
      expect(
        await sqlstateOf(insertSupport, [
          TENANT_ID,
          subscriberId,
          'PDF',
          SHA,
          'MANUAL',
          null,
          null,
        ]),
      ).toBe('23514');
      expect(
        await sqlstateOf(insertSupport, [
          TENANT_ID,
          subscriberId,
          'PDF',
          'xyz',
          'IMPORTADO',
          'uisp:document:y',
          batchId,
        ]),
      ).toBe('23514');
      // El soporte impide borrar al suscriptor (RESTRICT): la reversión los retira antes.
      expect(await sqlstateOf(`DELETE FROM subscribers WHERE id = $1`, [subscriberId])).toBe(
        '23001',
      );
    });

    it('historial: IMPORTADO solo con HISTORICO_IMPORTADO y viceversa; los motivos previos siguen', async () => {
      expect(await lifecycle('IMPORTADO', 'HISTORICO_IMPORTADO')).toBe('aceptado');
      expect(await lifecycle('IMPORTADO', 'MORA')).toBe('23514');
      expect(await lifecycle('MANUAL', 'HISTORICO_IMPORTADO')).toBe('23514');
      expect(await lifecycle('MANUAL', 'MORA')).toBe('aceptado');
    });

    it('PDF externo solo en IMPORTADO', async () => {
      await document('IMPORTADO', 'tenant/billing-imported/x.pdf');
      expect(
        await sqlstateOf(
          `UPDATE billing_documents SET external_pdf_key = 'x.pdf'
          WHERE status <> 'IMPORTADO' AND id IN (SELECT id FROM billing_documents LIMIT 0)`,
        ),
      ).toBe('aceptado');
      const [check] = (await qr().query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'chk_billing_documents_external_pdf_imported'
          AND connamespace = current_schema()::regnamespace`,
      )) as Array<{ def: string }>;
      expect(check?.def).toContain("'IMPORTADO'");
    });

    it('aplicación a un IMPORTADO: el pago importado solo desde la promoción; el propio sí (D14, 200)', async () => {
      const documentId = await document('IMPORTADO', null);
      const imported = await payment(true);
      const own = await payment(false);
      expect(await allocate(imported, documentId)).toBe('23514');
      // ADR-110 D14 (migración 200): la deuda importada es cobrable con pagos de iWana.
      expect(await allocate(own, documentId)).toBe('aceptado');
      await qr().query(`SET LOCAL iwana.import_promotion = 'on'`);
      expect(await allocate(imported, documentId)).toBe('aceptado');
      await qr().query(`SET LOCAL iwana.import_promotion = 'off'`);
      // Un pago importado sí puede aplicarse a un documento propio: el trigger no lo toca.
      const [period] = (await qr().query(
        `INSERT INTO billing_periods (tenant_id, contract_id, subscriber_id, period_start,
         period_end, covered_start, generation_date, due_date, effective_policy)
       VALUES ($1, $2, $3, '2026-02-01', '2026-02-28', '2026-02-01', '2026-02-01', '2026-02-15',
               '{}'::jsonb) RETURNING id`,
        [TENANT_ID, contractId, subscriberId],
      )) as Array<{ id: string }>;
      const issued = randomUUID();
      await qr().query(
        `INSERT INTO billing_documents (id, tenant_id, period_id, contract_id, subscriber_id, status,
         number, issue_date, due_date, subtotal, tax_total, total)
       VALUES ($1, $2, $3, $4, $5, 'EMITIDO', 'DC-000001', '2026-02-01', '2026-02-15', 100, 0, 100)`,
        [issued, TENANT_ID, period!.id, contractId, subscriberId],
      );
      expect(await allocate(imported, issued)).toBe('aceptado');
    });

    it('down se bloquea con datos; con la bandera retira todo y up lo repone', async () => {
      await expect(m199.down(qr())).rejects.toThrow(/Migración 199/u);
      process.env[DESTRUCTIVE] = 'true';
      try {
        await qr().query(`DELETE FROM subscriber_documents`);
        await qr().query(`UPDATE billing_documents SET external_pdf_key = NULL`);
        await m199.down(qr());
      } finally {
        delete process.env[DESTRUCTIVE];
      }
      const [state] = (await qr().query(
        `SELECT to_regclass('subscriber_documents') IS NULL AS no_table,
              (SELECT COUNT(*)::int FROM crm_lifecycle_changes WHERE source = 'IMPORTADO') AS imported,
              (SELECT COUNT(*)::int FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'migration_batches'
                  AND column_name IN ('promotion','reconciliation','promoted_by')) AS batch_columns,
              (SELECT COUNT(*)::int FROM pg_trigger
                WHERE tgname = 'billing_payment_allocations_import_guard') AS triggers`,
      )) as Array<{ no_table: boolean; imported: number; batch_columns: number; triggers: number }>;
      expect(state).toMatchObject({ no_table: true, imported: 0, batch_columns: 0 });
      expect(await lifecycle('IMPORTADO', 'HISTORICO_IMPORTADO')).toBe('23514');

      await m199.up(qr());
      expect(await lifecycle('IMPORTADO', 'HISTORICO_IMPORTADO')).toBe('aceptado');
      await m199.down(qr()).catch(() => undefined);
    });
  },
);
