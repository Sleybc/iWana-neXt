import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { MigrationImportTables1940000000194 } from './194_migration_import_tables';
import { SubscriberTags1950000000195 } from './195_subscriber_tags';
import { ImportExternalIdsCrmSupport1960000000196 } from './196_import_external_ids_crm_support';
import { BillingImportedDocuments1970000000197 } from './197_billing_imported_documents';
import { SeedMigrationImportPermission1980000000198 } from './198_seed_migration_import_permission';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './runner';

/**
 * Migraciones 194–198 — esquema de la importación desde UISP (ADR-110 D1–D5, D8, D10) en
 * PostgreSQL real. El schema se migra con la cadena completa de `TENANT_MIGRATIONS`, así que
 * las filas de prueba usan las tablas y tipos reales del DDL, no copias mínimas.
 *
 * Cubre: tipos de las columnas nuevas, CHECK de lotes, intermedias, equivalencias y
 * etiquetas, índices únicos parciales por `external_id`, forma de `IMPORTADO` y trigger
 * que impide emitirlo o anularlo, permiso `migration.import.manage`, y down/up de 198 a
 * 194 con sus guardas destructivas.
 */
const SCHEMA = `tenant_uisp_import_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const ACTOR_ID = randomUUID();
const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const PERMISSION = 'migration.import.manage';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const INTEGRATION_DATABASE_NAME = /^(test|iwana_it_[a-z0-9_]+)$/u;
const databaseAllowed = INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '');
const describeWithDb = dbAvailable && databaseAllowed ? describe : describe.skip;

if (dbAvailable && !databaseAllowed) {
  console.warn('[194-198] Suite omitida: DB_NAME debe ser test o iwana_it_*.');
}

jest.setTimeout(900_000);

describeWithDb('Migraciones 194–198 — esquema de importación UISP en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const m194 = new MigrationImportTables1940000000194();
  const m195 = new SubscriberTags1950000000195();
  const m196 = new ImportExternalIdsCrmSupport1960000000196();
  const m197 = new BillingImportedDocuments1970000000197();
  const m198 = new SeedMigrationImportPermission1980000000198();

  let subscriberId = '';
  let contractId = '';
  let periodId = '';
  const batchId = randomUUID();

  function qr(): QueryRunner {
    if (!runner) throw new Error('QueryRunner no inicializado.');
    return runner;
  }

  /** Ejecuta en un savepoint y devuelve el SQLSTATE, o «aceptado». */
  async function sqlstateOf(sql: string, params: unknown[] = []): Promise<string> {
    await qr().query('SAVEPOINT sp_import');
    try {
      await qr().query(sql, params);
    } catch (error) {
      await qr().query('ROLLBACK TO SAVEPOINT sp_import');
      return (error as { code?: string }).code ?? 'sin-codigo';
    }
    await qr().query('RELEASE SAVEPOINT sp_import');
    return 'aceptado';
  }

  async function destructive(work: () => Promise<void>): Promise<void> {
    process.env[DESTRUCTIVE] = 'true';
    try {
      await work();
    } finally {
      delete process.env[DESTRUCTIVE];
    }
  }

  async function column(table: string, name: string) {
    const rows = (await qr().query(
      `SELECT data_type, udt_name, character_maximum_length, is_nullable
         FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
      [table, name],
    )) as Array<{
      data_type: string;
      udt_name: string;
      character_maximum_length: number | null;
      is_nullable: 'YES' | 'NO';
    }>;
    return rows[0];
  }

  async function tableExists(name: string): Promise<boolean> {
    const rows = (await qr().query(`SELECT to_regclass($1) IS NOT NULL AS present`, [
      name,
    ])) as Array<{ present: boolean }>;
    return rows[0]?.present === true;
  }

  async function indexDefinition(name: string): Promise<string | null> {
    const rows = (await qr().query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1`,
      [name],
    )) as Array<{ indexdef: string }>;
    return rows[0]?.indexdef ?? null;
  }

  // Fila mínima válida en el esquema migrado: persona natural con datos fiscales.
  async function insertSubscriber(externalId: string | null): Promise<string> {
    const id = randomUUID();
    await qr().query(
      `INSERT INTO subscribers
        (id, tenant_id, status, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, vat_treatment,
         vat_responsibility, address, created_by, external_id)
       VALUES ($1, $2, 'ACTIVE', 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado',
               'Titular', 'Sintético', 3, 'STANDARD', 'RESPONSABLE', 'Dirección sintética', $3, $4)`,
      [id, TENANT_ID, ACTOR_ID, externalId],
    );
    return id;
  }

  const insertContractSql = `INSERT INTO contracts (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, external_id)
     VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb, $4)`;
  const insertTicketSql = `INSERT INTO support_tickets (id, tenant_id, ticket_number, type, requester_type, subject,
                                created_by_user_id, external_id)
     VALUES ($1, $2, $3, (enum_range(NULL::ticket_type))[1],
             (enum_range(NULL::ticket_requester_type))[1], 'Asunto sintético', $4, $5)`;
  const insertDocumentSql = `INSERT INTO billing_documents (id, tenant_id, period_id, contract_id, subscriber_id, status,
                                  number, external_number, due_date, subtotal, tax_total, total,
                                  external_id, import_batch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '2026-01-15', 100, 0, 100, $9, $10)`;
  const insertPaymentSql = `INSERT INTO billing_payments (id, tenant_id, subscriber_id, method, amount, paid_at,
                                 idempotency_key, created_by, external_id, import_batch_id)
     VALUES ($1, $2, $3, 'EFECTIVO', 50, '2026-01-20', $4, $5, $6, $7)`;

  function importedDocument(overrides: {
    status?: string;
    number?: string | null;
    externalNumber?: string | null;
    period?: string | null;
    externalId?: string | null;
    batch?: string | null;
  }): unknown[] {
    return [
      randomUUID(),
      TENANT_ID,
      overrides.period === undefined ? null : overrides.period,
      contractId,
      subscriberId,
      overrides.status ?? 'IMPORTADO',
      overrides.number ?? null,
      overrides.externalNumber === undefined ? 'UISP-0001' : overrides.externalNumber,
      overrides.externalId === undefined
        ? `uisp:invoice:${randomBytes(4).toString('hex')}`
        : overrides.externalId,
      overrides.batch === undefined ? batchId : overrides.batch,
    ];
  }

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
       VALUES ($1, 'Importación UISP sintética', $2, $3, 'INACTIVE', $4)`,
      [TENANT_ID, `${SCHEMA.replaceAll('_', '-')}`, SCHEMA, `${SCHEMA}@invalid.example`],
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

    subscriberId = await insertSubscriber(null);
    contractId = randomUUID();
    await runner.query(insertContractSql, [contractId, TENANT_ID, subscriberId, null]);
    periodId = randomUUID();
    await runner.query(
      `INSERT INTO billing_periods (id, tenant_id, contract_id, subscriber_id, period_start,
                                    period_end, covered_start, generation_date, due_date,
                                    effective_policy)
       VALUES ($1, $2, $3, $4, '2026-01-01', '2026-01-31', '2026-01-01', '2026-01-01',
               '2026-01-15', '{}'::jsonb)`,
      [periodId, TENANT_ID, contractId, subscriberId],
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

  describe('up: tipos reales de las columnas nuevas', () => {
    it.each([
      ['subscribers', 'import_batch_id', 'uuid', null],
      ['contracts', 'external_id', 'varchar', 160],
      ['contracts', 'import_batch_id', 'uuid', null],
      ['support_tickets', 'external_id', 'varchar', 160],
      ['support_tickets', 'import_batch_id', 'uuid', null],
      ['billing_documents', 'external_id', 'varchar', 160],
      ['billing_documents', 'external_number', 'varchar', 40],
      ['billing_documents', 'import_batch_id', 'uuid', null],
      ['billing_payments', 'external_id', 'varchar', 160],
      ['billing_payments', 'import_batch_id', 'uuid', null],
      ['migration_staging_records', 'payload_encrypted', 'text', null],
      ['subscriber_tag_assignments', 'import_batch_id', 'uuid', null],
    ])('%s.%s es %s nullable salvo la carga cifrada', async (table, name, udt, length) => {
      const found = await column(table, name);
      expect(found?.udt_name).toBe(udt);
      expect(found?.character_maximum_length ?? null).toBe(length);
      expect(found?.is_nullable).toBe(name === 'payload_encrypted' ? 'NO' : 'YES');
    });

    it('billing_documents.period_id deja de ser NOT NULL', async () => {
      expect((await column('billing_documents', 'period_id'))?.is_nullable).toBe('YES');
    });

    it.each([
      'subscribers',
      'contracts',
      'support_tickets',
      'billing_documents',
      'billing_payments',
    ])('índice único parcial por tenant en %s', async (table) => {
      const definition = await indexDefinition(`uq_${table}_external_id`);
      expect(definition).toContain('UNIQUE INDEX');
      expect(definition).toContain('(tenant_id, external_id)');
      expect(definition).toContain('WHERE (external_id IS NOT NULL)');
    });
  });

  describe('lotes, intermedias y equivalencias', () => {
    it('lote: fuente, estado y jsonb de conteos y rechazos validados', async () => {
      expect(
        await sqlstateOf(
          `INSERT INTO migration_batches (id, tenant_id, source, created_by, counts, rejections)
           VALUES ($1, $2, 'UISP_ZIP', $3, '{"SUSCRIPTOR": 1}', '{"SIN_EQUIVALENCIA": 2}')`,
          [batchId, TENANT_ID, ACTOR_ID],
        ),
      ).toBe('aceptado');
      const insert = `INSERT INTO migration_batches (tenant_id, source, status, created_by, counts)
                      VALUES ($1, $2, $3, $4, $5::jsonb)`;
      expect(await sqlstateOf(insert, [TENANT_ID, 'WISPHUB', 'SIMULADO', ACTOR_ID, '{}'])).toBe(
        '23514',
      );
      expect(await sqlstateOf(insert, [TENANT_ID, 'UISP_ZIP', 'EN_COLA', ACTOR_ID, '{}'])).toBe(
        '23514',
      );
      expect(await sqlstateOf(insert, [TENANT_ID, 'UISP_ZIP', 'SIMULADO', ACTOR_ID, '[]'])).toBe(
        '23514',
      );
      expect(await sqlstateOf(insert, [TENANT_ID, 'UISP_ZIP', 'REVERTIDO', ACTOR_ID, '{}'])).toBe(
        '23514',
      );
      const rows = (await qr().query(
        `SELECT status, (purge_after - created_at) = interval '30 days' AS window_30
           FROM migration_batches WHERE id = $1`,
        [batchId],
      )) as Array<{ status: string; window_30: boolean }>;
      expect(rows[0]).toEqual({ status: 'SIMULADO', window_30: true });
    });

    it('intermedia: external_id con forma uisp:<entidad>:<id>, rechazo con código y sin duplicar', async () => {
      const insert = `INSERT INTO migration_staging_records
                        (tenant_id, batch_id, entity, external_id, payload_encrypted, status, rejection_reason)
                      VALUES ($1, $2, $3, $4, $5, $6, $7)`;
      const ok = [
        TENANT_ID,
        batchId,
        'SUSCRIPTOR',
        'uisp:client:101',
        'iv:tag:cifrado',
        'VALIDO',
        null,
      ];
      expect(await sqlstateOf(insert, ok)).toBe('aceptado');
      expect(await sqlstateOf(insert, ok)).toBe('23505');
      expect(
        await sqlstateOf(insert, [
          TENANT_ID,
          batchId,
          'SUSCRIPTOR',
          'uisp:101',
          'x',
          'VALIDO',
          null,
        ]),
      ).toBe('23514');
      expect(
        await sqlstateOf(insert, [
          TENANT_ID,
          batchId,
          'SUSCRIPTOR',
          'uisp:client:Juan Pérez',
          'x',
          'VALIDO',
          null,
        ]),
      ).toBe('23514');
      expect(
        await sqlstateOf(insert, [
          TENANT_ID,
          batchId,
          'CLIENTE',
          'uisp:client:102',
          'x',
          'VALIDO',
          null,
        ]),
      ).toBe('23514');
      expect(
        await sqlstateOf(insert, [
          TENANT_ID,
          batchId,
          'PAGO',
          'uisp:payment:1',
          'x',
          'RECHAZADO',
          null,
        ]),
      ).toBe('23514');
      expect(
        await sqlstateOf(insert, [
          TENANT_ID,
          batchId,
          'PAGO',
          'uisp:payment:1',
          'x',
          'RECHAZADO',
          'motivo libre del titular',
        ]),
      ).toBe('23514');
      expect(
        await sqlstateOf(insert, [
          TENANT_ID,
          batchId,
          'PAGO',
          'uisp:payment:1',
          'x',
          'RECHAZADO',
          'METODO_SIN_EQUIVALENCIA',
        ]),
      ).toBe('aceptado');
      expect(
        await sqlstateOf(insert, [
          TENANT_ID,
          batchId,
          'PAGO',
          'uisp:payment:2',
          '',
          'VALIDO',
          null,
        ]),
      ).toBe('23514');
    });

    it('equivalencia: única por valor; solo etiquetas se descartan o van a nota', async () => {
      const insert = `INSERT INTO migration_mappings
                        (tenant_id, source_system, kind, external_value, action, target_ref, created_by)
                      VALUES ($1, 'UISP', $2, $3, $4, $5, $6)`;
      expect(
        await sqlstateOf(insert, [TENANT_ID, 'PLAN', '7', 'EQUIVALE', randomUUID(), ACTOR_ID]),
      ).toBe('aceptado');
      expect(
        await sqlstateOf(insert, [TENANT_ID, 'PLAN', '7', 'EQUIVALE', randomUUID(), ACTOR_ID]),
      ).toBe('23505');
      expect(await sqlstateOf(insert, [TENANT_ID, 'PLAN', '8', 'EQUIVALE', null, ACTOR_ID])).toBe(
        '23514',
      );
      expect(await sqlstateOf(insert, [TENANT_ID, 'PLAN', '9', 'DESCARTAR', null, ACTOR_ID])).toBe(
        '23514',
      );
      expect(
        await sqlstateOf(insert, [TENANT_ID, 'ETIQUETA', 'IVA', 'DESCARTAR', null, ACTOR_ID]),
      ).toBe('aceptado');
      expect(await sqlstateOf(insert, [TENANT_ID, 'ETIQUETA', 'VIP', 'NOTA', 'x', ACTOR_ID])).toBe(
        '23514',
      );
    });
  });

  describe('etiquetas manuales (D8)', () => {
    it('color hexadecimal, nombre único sin distinguir mayúsculas entre vigentes y asignación', async () => {
      const insert = `INSERT INTO subscriber_tags (id, tenant_id, name, color, created_by, deleted_at)
                      VALUES ($1, $2, $3, $4, $5, $6)`;
      const tagId = randomUUID();
      expect(
        await sqlstateOf(insert, [tagId, TENANT_ID, 'Cliente VIP', '#1A2b3C', ACTOR_ID, null]),
      ).toBe('aceptado');
      expect(
        await sqlstateOf(insert, [
          randomUUID(),
          TENANT_ID,
          ' cliente vip ',
          '#000000',
          ACTOR_ID,
          null,
        ]),
      ).toBe('23505');
      expect(
        await sqlstateOf(insert, [randomUUID(), TENANT_ID, 'Otra', 'rojo', ACTOR_ID, null]),
      ).toBe('23514');
      expect(
        await sqlstateOf(insert, [randomUUID(), TENANT_ID, '   ', '#000000', ACTOR_ID, null]),
      ).toBe('23514');
      expect(
        await sqlstateOf(insert, [
          randomUUID(),
          TENANT_ID,
          'cliente vip',
          '#000000',
          ACTOR_ID,
          '2026-11-01T00:00:00Z',
        ]),
      ).toBe('aceptado');

      const assign = `INSERT INTO subscriber_tag_assignments (tenant_id, subscriber_id, tag_id, import_batch_id)
                      VALUES ($1, $2, $3, $4)`;
      expect(await sqlstateOf(assign, [TENANT_ID, subscriberId, tagId, batchId])).toBe('aceptado');
      expect(await sqlstateOf(assign, [TENANT_ID, subscriberId, tagId, null])).toBe('23505');
      expect(await sqlstateOf(assign, [TENANT_ID, randomUUID(), tagId, null])).toBe('23503');
    });
  });

  describe('promoción idempotente por external_id (D3)', () => {
    it('suscriptor: un external_id por tenant; varios nulos conviven', async () => {
      await insertSubscriber('uisp:client:500');
      await qr().query('SAVEPOINT sp_sub');
      await expect(insertSubscriber('uisp:client:500')).rejects.toMatchObject({ code: '23505' });
      await qr().query('ROLLBACK TO SAVEPOINT sp_sub');
      await insertSubscriber(null);
    });

    it('contrato y ticket: un external_id por tenant', async () => {
      expect(
        await sqlstateOf(insertContractSql, [
          randomUUID(),
          TENANT_ID,
          subscriberId,
          'uisp:service:9',
        ]),
      ).toBe('aceptado');
      expect(
        await sqlstateOf(insertContractSql, [
          randomUUID(),
          TENANT_ID,
          subscriberId,
          'uisp:service:9',
        ]),
      ).toBe('23505');
      expect(
        await sqlstateOf(insertTicketSql, [
          randomUUID(),
          TENANT_ID,
          'TK-UISP-1',
          ACTOR_ID,
          'uisp:ticket:3',
        ]),
      ).toBe('aceptado');
      expect(
        await sqlstateOf(insertTicketSql, [
          randomUUID(),
          TENANT_ID,
          'TK-UISP-2',
          ACTOR_ID,
          'uisp:ticket:3',
        ]),
      ).toBe('23505');
    });

    it('pago: un external_id por tenant', async () => {
      const params = (key: string) => [
        randomUUID(),
        TENANT_ID,
        subscriberId,
        key,
        ACTOR_ID,
        'uisp:payment:77',
        batchId,
      ];
      expect(await sqlstateOf(insertPaymentSql, params('imp-1'))).toBe('aceptado');
      expect(await sqlstateOf(insertPaymentSql, params('imp-2'))).toBe('23505');
    });
  });

  describe('documento de cobro IMPORTADO (D5, CA-4)', () => {
    it('entra sin periodo, sin número iWana, con número externo, lote y external_id', async () => {
      expect(
        await sqlstateOf(insertDocumentSql, importedDocument({ externalId: 'uisp:invoice:1' })),
      ).toBe('aceptado');
      expect(
        await sqlstateOf(insertDocumentSql, importedDocument({ externalId: 'uisp:invoice:1' })),
      ).toBe('23505');
    });

    it.each([
      ['con número de la numeración iWana', { number: 'DC-000001' }],
      ['sin lote', { batch: null }],
      ['sin external_id', { externalId: null }],
    ])('rechaza un IMPORTADO %s', async (_label, overrides) => {
      expect(await sqlstateOf(insertDocumentSql, importedDocument(overrides))).toBe('23514');
    });

    it('un documento propio sigue exigiendo periodo y no acepta número externo', async () => {
      expect(
        await sqlstateOf(
          insertDocumentSql,
          importedDocument({
            status: 'BORRADOR',
            externalNumber: null,
            batch: null,
            externalId: null,
          }),
        ),
      ).toBe('23514');
      expect(
        await sqlstateOf(
          insertDocumentSql,
          importedDocument({ status: 'BORRADOR', period: periodId, batch: null, externalId: null }),
        ),
      ).toBe('23514');
      expect(
        await sqlstateOf(
          insertDocumentSql,
          importedDocument({
            status: 'BORRADOR',
            period: periodId,
            externalNumber: null,
            batch: null,
            externalId: null,
          }),
        ),
      ).toBe('aceptado');
    });

    it('el trigger impide emitir, anular o convertir en IMPORTADO; otras columnas y el borrado no', async () => {
      const imported = importedDocument({});
      await qr().query(insertDocumentSql, imported);
      const importedId = imported[0] as string;
      const draft = importedDocument({
        status: 'BORRADOR',
        period: periodId,
        externalNumber: null,
        batch: null,
        externalId: null,
      });
      await qr().query(`DELETE FROM billing_documents WHERE period_id = $1`, [periodId]);
      await qr().query(insertDocumentSql, draft);
      const draftId = draft[0] as string;

      for (const status of ['EMITIDO', 'ANULADO', 'BORRADOR']) {
        expect(
          await sqlstateOf(`UPDATE billing_documents SET status = $1 WHERE id = $2`, [
            status,
            importedId,
          ]),
        ).toBe('23514');
      }
      expect(
        await sqlstateOf(
          `UPDATE billing_documents SET status = 'IMPORTADO', import_batch_id = $1,
                  external_id = 'uisp:invoice:conv' WHERE id = $2`,
          [batchId, draftId],
        ),
      ).toBe('23514');
      expect(
        await sqlstateOf(`UPDATE billing_documents SET buyer_snapshot = NULL WHERE id = $1`, [
          importedId,
        ]),
      ).toBe('aceptado');
      expect(await sqlstateOf(`DELETE FROM billing_documents WHERE id = $1`, [importedId])).toBe(
        'aceptado',
      );
    });
  });

  describe('permiso migration.import.manage (198)', () => {
    it('está en el catálogo como ASSIGNABLE del módulo migration', async () => {
      const rows = (await qr().query(
        `SELECT module_key, action, availability, catalog_version, is_system, is_active
           FROM access_permission_catalog WHERE tenant_id = $1 AND permission_key = $2`,
        [TENANT_ID, PERMISSION],
      )) as Array<Record<string, unknown>>;
      expect(rows).toEqual([
        {
          module_key: 'migration',
          action: 'import.manage',
          availability: 'ASSIGNABLE',
          catalog_version: 'MOD00_ACCESS_V2',
          is_system: true,
          is_active: true,
        },
      ]);
    });

    it('solo la plantilla de Administración lo trae por defecto', async () => {
      await qr().query(
        `INSERT INTO access_profiles (id, tenant_id, name, description, base_role_constraint, is_system)
         VALUES ($1, $2, 'Administrador general', 'Plantilla sintética', 'ADMIN', true),
                ($3, $2, 'Acceso estándar Soporte', 'Plantilla sintética', 'SUPPORT', true)
         ON CONFLICT DO NOTHING`,
        [randomUUID(), TENANT_ID, randomUUID()],
      );
      await m198.up(qr());
      const rows = (await qr().query(
        `SELECT DISTINCT profile.base_role_constraint AS role
           FROM access_profile_permissions grant_row
           JOIN access_profiles profile ON profile.id = grant_row.profile_id
          WHERE grant_row.tenant_id = $1 AND grant_row.permission_key = $2`,
        [TENANT_ID, PERMISSION],
      )) as Array<{ role: string }>;
      expect(rows.map(({ role }) => role)).toEqual(['ADMIN']);
    });
  });

  describe('down/up de 198 a 194', () => {
    it('198 down retira catálogo y asignaciones; up los repone', async () => {
      await m198.down(qr());
      const count = async () =>
        (
          (await qr().query(
            `SELECT (SELECT COUNT(*) FROM access_permission_catalog WHERE permission_key = $1)::int
                  + (SELECT COUNT(*) FROM access_profile_permissions WHERE permission_key = $1)::int AS n`,
            [PERMISSION],
          )) as Array<{ n: number }>
        )[0]?.n ?? 0;
      expect(await count()).toBe(0);
      await m198.up(qr());
      expect(await count()).toBeGreaterThan(0);
    });

    it('197 down se bloquea con datos importados; con la bandera los borra y restaura la 173', async () => {
      await qr().query(insertDocumentSql, importedDocument({}));
      await expect(m197.down(qr())).rejects.toThrow(/Migración 197/u);
      await destructive(() => m197.down(qr()));
      expect(await column('billing_documents', 'external_id')).toBeUndefined();
      expect(await column('billing_payments', 'import_batch_id')).toBeUndefined();
      expect((await column('billing_documents', 'period_id'))?.is_nullable).toBe('NO');
      const imported = (await qr().query(
        `SELECT COUNT(*)::int AS n FROM billing_payments WHERE idempotency_key LIKE 'imp-%'`,
      )) as Array<{ n: number }>;
      expect(imported[0]?.n).toBe(0);
      expect(
        await sqlstateOf(
          `INSERT INTO billing_documents (tenant_id, period_id, contract_id, subscriber_id, status,
                                          due_date, subtotal, tax_total, total)
           VALUES ($1, $2, $3, $4, 'IMPORTADO', '2026-01-15', 1, 0, 1)`,
          [TENANT_ID, periodId, contractId, subscriberId],
        ),
      ).toBe('23514');
    });

    it('196 down se bloquea con datos importados; con la bandera retira columnas e índices', async () => {
      await expect(m196.down(qr())).rejects.toThrow(/Migración 196/u);
      await destructive(() => m196.down(qr()));
      expect(await column('contracts', 'external_id')).toBeUndefined();
      expect(await column('support_tickets', 'import_batch_id')).toBeUndefined();
      expect(await column('subscribers', 'import_batch_id')).toBeUndefined();
      expect((await column('subscribers', 'external_id'))?.udt_name).toBe('varchar');
      expect(await indexDefinition('uq_subscribers_external_id')).toBeNull();
    });

    it('195 y 194 down se bloquean con datos y con la bandera borran sus tablas', async () => {
      await expect(m195.down(qr())).rejects.toThrow(/Migración 195/u);
      await destructive(() => m195.down(qr()));
      expect(await tableExists('subscriber_tags')).toBe(false);
      expect(await tableExists('subscriber_tag_assignments')).toBe(false);

      await expect(m194.down(qr())).rejects.toThrow(/Migración 194/u);
      await destructive(() => m194.down(qr()));
      expect(await tableExists('migration_batches')).toBe(false);
      expect(await tableExists('migration_staging_records')).toBe(false);
      expect(await tableExists('migration_mappings')).toBe(false);
    });

    it('down sin datos no exige la bandera y up se reaplica completo', async () => {
      for (const migration of [m194, m195, m196, m197]) await migration.up(qr());
      for (const migration of [m197, m196, m195, m194]) await migration.down(qr());
      for (const migration of [m194, m195, m196, m197, m198]) await migration.up(qr());
      expect(await tableExists('migration_batches')).toBe(true);
      expect(await indexDefinition('uq_billing_documents_external_id')).toContain('UNIQUE');
      expect((await column('billing_documents', 'period_id'))?.is_nullable).toBe('YES');
    });
  });
});
