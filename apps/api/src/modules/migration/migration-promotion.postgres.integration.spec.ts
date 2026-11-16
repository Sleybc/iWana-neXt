import { createHash, randomInt, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TenantContext, dataSourceOptions, isValidSchemaName, runInTenantSchema } from '@iwana/db';
import {
  MigrationBatchReportSchema,
  MigrationReconciliationReportSchema,
  MigrationRevertResultSchema,
  type MigrationPromoteJob,
} from '@iwana/shared';
import { AssuranceMigrationImportAdapter } from '../assurance/migration-adapters/assurance-migration-import.adapter';
import { BillingMigrationImportAdapter } from '../billing/migration-adapters/billing-migration-import.adapter';
import { CrmMigrationImportAdapter } from '../crm/migration-adapters/crm-migration-import.adapter';
import { CatalogItem } from '../commercial/entities/catalog-item.entity';
import { CatalogPriceHistory } from '../commercial/entities/catalog-price-history.entity';
import { PlanDetail } from '../commercial/entities/plan-detail.entity';
import { CommercialCatalogReadAdapter } from '../commercial/ports/commercial-catalog-read.adapter';
import { CrmMigrationTitularLookupAdapter } from '../crm/migration-adapters/crm-migration-titular-lookup.adapter';
import { SubscriberTagsService } from '../crm/subscribers/tags/subscriber-tags.service';
import { PartyWriteAdapter } from '../parties/adapters/party-write.adapter';
import { Party } from '../parties/entities/party.entity';
import { PartyContact } from '../parties/entities/party-contact.entity';
import { PartyRole } from '../parties/entities/party-role.entity';
import { TasksMigrationReferencesAdapter } from '../tasks/migration-adapters/tasks-migration-references.adapter';
import { MigrationBatchesService } from './migration-batches.service';
import { MigrationCrypto } from './migration-crypto';
import { MigrationPromotionService } from './migration-promotion.service';
import { MigrationRevertService } from './migration-revert.service';
import { MigrationSimulationService } from './migration-simulation.service';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadPiiAesGcmKeyPair,
} from '../../common/crypto/aes-gcm.util';
import { hmacPii, resolvePiiHashKey } from '../../common/crypto/pii-hash-key.util';
import { MigrationTitularErasureParticipant } from './privacy/migration-titular-erasure.participant';
import {
  SYNTHETIC_METHOD_ID,
  buildSyntheticUispZip,
  type UispFixtureOptions,
} from './test/uisp-zip.fixture';
import { UsersMigrationDirectoryAdapter } from '../users/migration-adapters/users-migration-directory.adapter';

/**
 * Bloque C contra PostgreSQL real (ADR-110 D3, D5–D7, D13; spec CA-2, CA-3, CA-4, CA-6): el
 * schema completo del tenant de pruebas (migraciones 001–199), los adaptadores reales de CRM,
 * Billing, Soporte, Parties y etiquetas, y la promoción, idempotencia, conciliación, guarda de
 * aplicaciones a IMPORTADO y reversión por lote con bloqueo.
 *
 * Storage y cola son dobles en memoria; el catálogo comercial devuelve un plan sintético.
 * Cada corrida usa ids de UISP, documentos y equivalencias aleatorios y limpia lo que crea.
 */
const integrationEnabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const tenantSlug = process.env['E2E_TENANT_SLUG'];
const describeDb = integrationEnabled && tenantSlug ? describe : describe.skip;

describeDb('Importación UISP — promoción, conciliación y reversión sobre PostgreSQL real', () => {
  let ds: DataSource;
  let tenantId: string;
  let schemaName: string;
  const actorId = randomUUID();
  const objects = new Map<string, Buffer>();
  const storage = {
    putObject: jest.fn(async (key: string, body: Buffer) => {
      objects.set(key, Buffer.from(body));
    }),
    getObject: jest.fn(async (key: string) => {
      const value = objects.get(key);
      if (!value) throw new Error('objeto ausente');
      return value;
    }),
    deleteObject: jest.fn(async (key: string) => {
      objects.delete(key);
    }),
  };
  const promoteJobs: MigrationPromoteJob[] = [];
  const queue = {
    add: jest.fn(async (name: string, payload: MigrationPromoteJob) => {
      if (name === 'promote-batch') promoteJobs.push(payload);
    }),
  };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '9a'.repeat(32),
    MFA_ENCRYPTION_KEY: '8b'.repeat(32),
    PII_HASH_KEY: '7c'.repeat(32),
    NODE_ENV: 'test',
  });
  const crypto = new MigrationCrypto(config);
  const decryptStored = (blob: Buffer) => crypto.decryptObject(blob);
  const planId = randomUUID();
  const catalog = {
    createSnapshot: jest.fn(async (_tenant: string, _schema: string, itemId: string) => {
      if (itemId !== planId) throw new Error('plan inexistente');
      return {
        planId,
        name: 'Plan sintético importado',
        downloadSpeed: 100,
        uploadSpeed: 50,
        technology: 'FTTH',
        monthlyPrice: 99,
        installationFee: 0,
        vatConcept: null,
        networkType: 'FTTH',
        snapshotAt: new Date('2026-11-12T00:00:00Z'),
      };
    }),
  };
  // Valores de UISP únicos por corrida: el tenant de pruebas es compartido.
  const run = randomInt(100_000, 900_000);
  const planA = run;
  const planB = run + 1;
  const tagExternal = run + 2;
  const methodId = randomUUID();
  const cycleDay = 15;
  let tagId: string;
  let batches: MigrationBatchesService;
  let simulation: MigrationSimulationService;
  let promotion: MigrationPromotionService;
  let reversion: MigrationRevertService;
  const createdBatches: string[] = [];

  const scope = () => ({ tenantId, schemaName });
  const sql = <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, params) as Promise<T[]>);
  const zipFile = (buffer: Buffer, name: string) => ({
    originalname: name,
    mimetype: 'application/zip',
    size: buffer.length,
    buffer,
  });
  const documentFor = (offset: number) => String(1_000_000_000 + run * 10 + offset);

  async function simulatedBatch(
    clientIds: number[],
    methods: string[] = [],
    extra: UispFixtureOptions = {},
  ): Promise<string> {
    const files = [];
    for (const [index, clientId] of clientIds.entries()) {
      files.push(
        zipFile(
          await buildSyntheticUispZip({
            clientId,
            document: documentFor(clientId - run * 10),
            planIds: [planA, planB],
            tagIds: [tagExternal],
            cycleDay,
            methodId: methods[index] ?? methodId,
            ...extra,
          }),
          `${clientId}.zip`,
        ),
      );
    }
    const summary = await batches.createBatch(scope(), files, actorId);
    createdBatches.push(summary.id);
    await expect(simulation.simulate(tenantId, summary.id)).resolves.toBe('SIMULADO');
    return summary.id;
  }

  async function promoteNow(batchId: string): Promise<string> {
    await promotion.requestPromotion(scope(), batchId, actorId);
    const job = promoteJobs.pop()!;
    expect(job).toEqual({ version: 1, tenantId, batchId, actorId });
    return promotion.promote(job.tenantId, job.batchId, job.actorId);
  }

  async function countsFor(batchId: string) {
    const [row] = await sql<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM subscribers WHERE import_batch_id = $1)::int AS subscribers,
         (SELECT COUNT(*) FROM contracts WHERE import_batch_id = $1)::int AS contracts,
         (SELECT COUNT(*) FROM crm_lifecycle_changes
           WHERE batch_id = $1 AND source = 'IMPORTADO')::int AS history,
         (SELECT COUNT(*) FROM billing_documents WHERE import_batch_id = $1)::int AS documents,
         (SELECT COUNT(*) FROM billing_document_lines l JOIN billing_documents d ON d.id = l.document_id
           WHERE d.import_batch_id = $1)::int AS lines,
         (SELECT COUNT(*) FROM billing_payments WHERE import_batch_id = $1)::int AS payments,
         (SELECT COUNT(*) FROM billing_payment_allocations a JOIN billing_payments p ON p.id = a.payment_id
           WHERE p.import_batch_id = $1)::int AS allocations,
         (SELECT COUNT(*) FROM support_tickets WHERE import_batch_id = $1)::int AS tickets,
         (SELECT COUNT(*) FROM subscriber_documents WHERE import_batch_id = $1)::int AS supports,
         (SELECT COUNT(*) FROM subscriber_tag_assignments WHERE import_batch_id = $1)::int AS tags`,
      [batchId],
    );
    return row!;
  }

  beforeAll(async () => {
    ds = new DataSource({
      ...dataSourceOptions,
      entities: [Party, PartyRole, PartyContact, CatalogItem, PlanDetail, CatalogPriceHistory],
      migrations: [],
      logging: false,
      extra: { max: 4, connectionTimeoutMillis: 5000 },
    });
    await ds.initialize();
    const [tenant] = (await ds.query(
      `SELECT id::text, schema_name FROM public.tenants WHERE slug = $1 AND status = 'ACTIVE'`,
      [tenantSlug],
    )) as Array<{ id: string; schema_name: string }>;
    if (!tenant || !isValidSchemaName(tenant.schema_name)) {
      throw new Error('El tenant de pruebas no existe o no está activo.');
    }
    tenantId = tenant.id;
    schemaName = tenant.schema_name;
    const [migrated] = (await ds.query(`SELECT to_regclass($1) IS NOT NULL AS ready`, [
      `"${schemaName}".subscriber_documents`,
    ])) as Array<{ ready: boolean }>;
    if (!migrated?.ready) throw new Error('El tenant de pruebas no tiene la migración 199.');

    const [tag] = await sql<{ id: string }>(
      `INSERT INTO subscriber_tags (tenant_id, name, color, created_by)
       VALUES ($1, $2, '#123456', $3) RETURNING id::text`,
      [tenantId, `Importada ${run}`, actorId],
    );
    tagId = tag!.id;
    const mapping = (kind: string, value: string, action: string, target: string | null) =>
      sql(
        `INSERT INTO migration_mappings
           (tenant_id, source_system, kind, external_value, action, target_ref, created_by)
         VALUES ($1, 'UISP', $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, source_system, kind, external_value) DO NOTHING`,
        [tenantId, kind, value, action, target, actorId],
      );
    await mapping('PLAN', String(planA), 'EQUIVALE', planId);
    await mapping('PLAN', String(planB), 'EQUIVALE', planId);
    await mapping('CICLO', String(cycleDay), 'EQUIVALE', String(cycleDay));
    await mapping('METODO_PAGO', methodId, 'EQUIVALE', 'EFECTIVO');
    await mapping('ETIQUETA', String(tagExternal), 'EQUIVALE', tagId);

    const crm = new CrmMigrationImportAdapter(
      config,
      new PartyWriteAdapter(config),
      catalog as never,
    );
    const billing = new BillingMigrationImportAdapter();
    const support = new AssuranceMigrationImportAdapter();
    const tags = new SubscriberTagsService(
      ds,
      audit as never,
      {
        activeMarks: jest.fn().mockResolvedValue({}),
      } as never,
    );
    const titularLookup = new CrmMigrationTitularLookupAdapter({
      activeMarks: jest.fn().mockResolvedValue({}),
    } as never);
    batches = new MigrationBatchesService(
      ds,
      storage as never,
      queue as never,
      crypto,
      audit as never,
    );
    simulation = new MigrationSimulationService(
      ds,
      storage as never,
      crypto,
      titularLookup,
      billing,
    );
    promotion = new MigrationPromotionService(
      ds,
      storage as never,
      queue as never,
      crypto,
      simulation,
      titularLookup,
      crm,
      billing,
      support,
      tags,
      audit as never,
      new UsersMigrationDirectoryAdapter(),
    );
    reversion = new MigrationRevertService(
      ds,
      storage as never,
      crm,
      billing,
      support,
      new TasksMigrationReferencesAdapter(),
      tags,
      audit as never,
    );
  });

  afterAll(async () => {
    if (!ds?.isInitialized) return;
    try {
      for (const batchId of [...createdBatches].reverse()) {
        await reversion.revert(scope(), batchId, actorId).catch(() => undefined);
      }
      await sql(`DELETE FROM migration_batches WHERE id = ANY($1::uuid[])`, [createdBatches]);
      await sql(
        `DELETE FROM migration_mappings
          WHERE tenant_id = $1 AND source_system = 'UISP'
            AND external_value = ANY($2::varchar[])`,
        [tenantId, [String(planA), String(planB), methodId, String(tagExternal)]],
      );
      await sql(`DELETE FROM subscriber_tags WHERE id = $1`, [tagId]);
      await sql(`DELETE FROM migration_mappings WHERE tenant_id = $1 AND created_by = $2`, [
        tenantId,
        actorId,
      ]);
    } finally {
      await ds.destroy();
    }
  });

  it('CA-6/CA-3: promueve el lote completo, concilia y deja los cobros como IMPORTADO', async () => {
    const clientId = run * 10 + 1;
    const batchId = await simulatedBatch([clientId]);
    await expect(promoteNow(batchId)).resolves.toBe('CONCILIADO');

    const report = MigrationBatchReportSchema.parse(await batches.getReport(scope(), batchId));
    expect(report.status).toBe('CONCILIADO');
    expect(report.promotion).toMatchObject({
      procesamiento: 'COMPLETADO',
      promovidos: {
        SUSCRIPTOR: 1,
        CONTRATO: 2,
        DOCUMENTO_COBRO: 3,
        PAGO: 2,
        TICKET: 2,
        SOPORTE_DOCUMENTAL: 2,
      },
      existentes: {},
      rechazados: {},
      etiquetasAsignadas: 1,
      periodosSuspension: 4,
      aplicaciones: 2,
    });
    expect(report.reconciliation).toMatchObject({
      resultado: 'CONCILIADO',
      titulares: 1,
      conciliados: 1,
      diferencias: [],
    });
    expect(await countsFor(batchId)).toEqual({
      subscribers: 1,
      contracts: 2,
      history: 4,
      documents: 3,
      lines: 3,
      payments: 2,
      allocations: 2,
      tickets: 2,
      supports: 2,
      tags: 1,
    });

    // Titular: documento cifrado + HMAC, party CUSTOMER; el estrato no fija IVA del contrato.
    const [subscriber] = await sql<Record<string, unknown>>(
      `SELECT s.document_number_encrypted, s.document_number_hmac, s.stratum, s.status,
              s.party_id, p.document_number_hmac AS party_hmac,
              (SELECT COUNT(*)::int FROM party_role r WHERE r.party_id = p.id AND r.role = 'CUSTOMER') AS roles
         FROM subscribers s LEFT JOIN party p ON p.id = s.party_id
        WHERE s.external_id = $1`,
      [`uisp:client:${clientId}`],
    );
    // PROSPECT: UISP no trae responsabilidad de IVA (ck_subscribers_fiscal_complete_when_active).
    expect(subscriber).toMatchObject({ status: 'PROSPECT', stratum: 3, roles: 1 });
    expect(subscriber!['document_number_hmac']).toBe(crypto.documentHmac(documentFor(1)));
    expect(String(subscriber!['document_number_encrypted'])).not.toContain(documentFor(1));

    // Contrato: plan congelado, estrato pendiente de evidencia y sin vat_snapshot (ADR-093).
    const contracts = await sql<Record<string, unknown>>(
      `SELECT status, billing_cycle_day, installation_stratum, stratum_evidence_media_id,
              vat_snapshot, plan_snapshot_json->>'importedFrom' AS imported_from
         FROM contracts WHERE import_batch_id = $1`,
      [batchId],
    );
    expect(contracts).toHaveLength(2);
    for (const contract of contracts) {
      expect(contract).toMatchObject({
        status: 'ACTIVE',
        billing_cycle_day: cycleDay,
        installation_stratum: 3,
        stratum_evidence_media_id: null,
        vat_snapshot: null,
        imported_from: 'UISP',
      });
    }

    // CA-4: ningún documento importado tiene número propio, periodo ni datos fiscales.
    const documents = await sql<Record<string, unknown>>(
      `SELECT status, number, period_id, external_number, external_pdf_key, buyer_snapshot
         FROM billing_documents WHERE import_batch_id = $1 ORDER BY external_number`,
      [batchId],
    );
    expect(documents.map((row) => row['status'])).toEqual(['IMPORTADO', 'IMPORTADO', 'IMPORTADO']);
    expect(documents.every((row) => row['number'] === null && row['period_id'] === null)).toBe(
      true,
    );
    expect(documents.map((row) => row['external_number'])).toEqual([
      'SINT-2023-1',
      'SINT-2023-2',
      'SINT-2023-3',
    ]);
    const pdfKeys = documents.map((row) => row['external_pdf_key']).filter(Boolean) as string[];
    expect(pdfKeys).toHaveLength(2);
    for (const key of pdfKeys) {
      // H1: en reposo cifrado (IWE1) con la clave PII; descifrado es el PDF de UISP.
      expect(key.startsWith(`${schemaName}/billing-imported/`)).toBe(true);
      const stored = objects.get(key)!;
      expect(stored.subarray(0, 4).toString('latin1')).toBe('IWE1');
      expect(decryptStored(stored).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }

    // Tickets: origen MIGRATION, número UISP-, comentario privado de UISP → interno.
    const tickets = await sql<Record<string, unknown>>(
      `SELECT t.ticket_number, t.source::text AS source, t.status::text AS status,
              (SELECT bool_and(c.is_internal) FROM ticket_comments c WHERE c.ticket_id = t.id) AS internal,
              (SELECT COUNT(*)::int FROM ticket_comments c WHERE c.ticket_id = t.id) AS comments
         FROM support_tickets t WHERE t.import_batch_id = $1 ORDER BY t.ticket_number`,
      [batchId],
    );
    expect(tickets).toEqual([
      expect.objectContaining({
        source: 'MIGRATION',
        status: 'PENDING_CUSTOMER',
        comments: 1,
        internal: true,
      }),
      expect.objectContaining({ source: 'MIGRATION', status: 'CLOSED', comments: 0 }),
    ]);
    expect(String(tickets[0]!['ticket_number'])).toMatch(/^UISP-\d+$/u);

    // Soportes: sin nombre de archivo; tipo por firma; archivo en storage.
    const supports = await sql<Record<string, unknown>>(
      `SELECT kind, content_type, origin, visibility, storage_key, sha256 FROM subscriber_documents
        WHERE import_batch_id = $1 ORDER BY kind`,
      [batchId],
    );
    expect(supports.map((row) => [row['kind'], row['content_type']])).toEqual([
      ['IMAGEN', 'image/jpeg'],
      ['PDF', 'application/pdf'],
    ]);
    for (const support of supports) {
      expect(support).toMatchObject({ origin: 'IMPORTADO', visibility: 'INTERNA' });
      expect(String(support['storage_key'])).not.toMatch(/contrato|fachada/u);
      const stored = objects.get(String(support['storage_key']))!;
      expect(stored.subarray(0, 4).toString('latin1')).toBe('IWE1');
      // H7: la huella se calcula sobre el contenido promovido.
      expect(createHash('sha256').update(decryptStored(stored)).digest('hex')).toBe(
        support['sha256'],
      );
    }
  });

  it('D3: repetir la promoción y reimportar el mismo ZIP no duplica nada', async () => {
    const clientId = run * 10 + 2;
    const first = await simulatedBatch([clientId]);
    await promoteNow(first);
    const before = await countsFor(first);

    // Reintento del job sobre el mismo lote (promoción interrumpida).
    await sql(
      `UPDATE migration_batches
          SET status = 'CARGADO', promotion = jsonb_set(promotion, '{procesamiento}', '"FALLIDO"'::jsonb),
              reconciled_at = NULL
        WHERE id = $1`,
      [first],
    );
    await expect(promoteNow(first)).resolves.toBe('CONCILIADO');
    expect(await countsFor(first)).toEqual(before);

    // Segundo lote con el mismo cliente: todo existe por external_id.
    const second = await simulatedBatch([clientId]);
    await expect(promoteNow(second)).resolves.toBe('CONCILIADO');
    const report = MigrationBatchReportSchema.parse(await batches.getReport(scope(), second));
    expect(report.counts.observaciones.YA_IMPORTADO).toBe(1);
    expect(report.promotion?.promovidos).toEqual({});
    expect(report.promotion?.existentes).toMatchObject({
      SUSCRIPTOR: 1,
      CONTRATO: 2,
      DOCUMENTO_COBRO: 3,
      PAGO: 2,
      TICKET: 2,
      SOPORTE_DOCUMENTAL: 2,
    });
    expect(await countsFor(second)).toEqual({
      subscribers: 0,
      contracts: 0,
      history: 0,
      documents: 0,
      lines: 0,
      payments: 0,
      allocations: 0,
      tickets: 0,
      supports: 0,
      tags: 0,
    });
    const [{ total }] = (await sql<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM subscribers WHERE external_id = $1`,
      [`uisp:client:${clientId}`],
    )) as [{ total: number }];
    expect(total).toBe(1);

    // La reversión del primero queda bloqueada mientras otro lote referencie... nada nuevo:
    // el segundo no creó filas, así que se revierte primero él y luego el primero.
    await expect(reversion.revert(scope(), second, actorId)).resolves.toMatchObject({
      status: 'REVERTIDO',
    });
  });

  it('D6: una diferencia deja el lote PROMOVIDO con el informe por titular', async () => {
    const clientId = run * 10 + 3;
    // Método de pago sin equivalencia: los pagos no se promueven y lo pagado no cuadra.
    const batchId = await simulatedBatch([clientId], [randomUUID()]);
    await expect(promoteNow(batchId)).resolves.toBe('PROMOVIDO');
    const report = MigrationBatchReportSchema.parse(await batches.getReport(scope(), batchId));
    expect(report.status).toBe('PROMOVIDO');
    const reconciliation = MigrationReconciliationReportSchema.parse(report.reconciliation);
    expect(reconciliation).toMatchObject({
      resultado: 'CON_DIFERENCIAS',
      titulares: 1,
      conciliados: 0,
    });
    expect(reconciliation.diferencias).toEqual([
      expect.objectContaining({
        externalId: `uisp:client:${clientId}`,
        facturado: { uisp: '240.00', iwana: '240.00' },
        pagado: { uisp: '160.00', iwana: '0.00' },
        saldo: { uisp: '80.00', iwana: '240.00' },
      }),
    ]);
    // Sin PII en el informe.
    expect(JSON.stringify(report)).not.toMatch(
      new RegExp(`${documentFor(3)}|Titular|Sintético`, 'u'),
    );
    // Reconciliar de nuevo es posible y no cambia el resultado.
    await expect(promotion.reconcile(scope(), batchId, actorId)).resolves.toMatchObject({
      resultado: 'CON_DIFERENCIAS',
    });
  });

  it('CA-4 + D14: un pago propio sí cubre deuda IMPORTADA; un pago importado solo desde la promoción', async () => {
    const [document] = await sql<{ id: string; subscriber_id: string }>(
      `SELECT id::text, subscriber_id::text FROM billing_documents
        WHERE status = 'IMPORTADO' AND tenant_id = $1 LIMIT 1`,
      [tenantId],
    );
    const [payment] = await sql<{ id: string }>(
      `INSERT INTO billing_payments (tenant_id, subscriber_id, method, amount, paid_at, idempotency_key, created_by)
       VALUES ($1, $2, 'EFECTIVO', 10, CURRENT_DATE, $3, $4) RETURNING id::text`,
      [tenantId, document!.subscriber_id, `it-import-guard-${run}`, actorId],
    );
    // ADR-110 D14 (migración 200): la deuda importada es cobrable con un pago de iWana.
    const [allocation] = await sql<{ id: string }>(
      `INSERT INTO billing_payment_allocations (tenant_id, payment_id, document_id, amount)
       VALUES ($1, $2, $3, 10) RETURNING id::text`,
      [tenantId, payment!.id, document!.id],
    );
    await sql(`DELETE FROM billing_payment_allocations WHERE id = $1`, [allocation!.id]);
    // Un pago importado sigue reservado a la promoción.
    const [importedPayment] = await sql<{ id: string }>(
      `SELECT id::text FROM billing_payments
        WHERE tenant_id = $1 AND import_batch_id IS NOT NULL LIMIT 1`,
      [tenantId],
    );
    await expect(
      sql(
        `INSERT INTO billing_payment_allocations (tenant_id, payment_id, document_id, amount)
         VALUES ($1, $2, $3, 0.01)`,
        [tenantId, importedPayment!.id, document!.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      sql(`UPDATE billing_documents SET status = 'EMITIDO' WHERE id = $1`, [document!.id]),
    ).rejects.toMatchObject({ code: '23514' });
    await sql(`DELETE FROM billing_payments WHERE id = $1`, [payment!.id]);
  });

  it('D7: la reversión se bloquea si algo posterior referencia el lote y luego retira todo', async () => {
    const clientId = run * 10 + 4;
    const batchId = await simulatedBatch([clientId]);
    await promoteNow(batchId);
    const [subscriber] = await sql<{ id: string; party_id: string }>(
      `SELECT id::text, party_id::text FROM subscribers WHERE import_batch_id = $1`,
      [batchId],
    );
    const pdfAndSupports = await sql<{ key: string }>(
      `SELECT external_pdf_key AS key FROM billing_documents
        WHERE import_batch_id = $1 AND external_pdf_key IS NOT NULL
       UNION ALL
       SELECT storage_key FROM subscriber_documents WHERE import_batch_id = $1`,
      [batchId],
    );
    expect(pdfAndSupports).toHaveLength(4);

    // Pago nuevo de iWana sobre el titular importado → bloqueo con motivo.
    const [payment] = await sql<{ id: string }>(
      `INSERT INTO billing_payments (tenant_id, subscriber_id, method, amount, paid_at, idempotency_key, created_by)
       VALUES ($1, $2, 'EFECTIVO', 5, CURRENT_DATE, $3, $4) RETURNING id::text`,
      [tenantId, subscriber!.id, `it-revert-block-${run}`, actorId],
    );
    await expect(reversion.revert(scope(), batchId, actorId)).rejects.toMatchObject({
      response: {
        code: 'MIGRATION_REVERT_BLOCKED',
        details: { blockers: [{ motivo: 'PAGO_POSTERIOR', cantidad: 1 }] },
      },
    });
    // Nada se tocó.
    expect((await countsFor(batchId)).subscribers).toBe(1);

    await sql(`DELETE FROM billing_payments WHERE id = $1`, [payment!.id]);
    const result = MigrationRevertResultSchema.parse(
      await reversion.revert(scope(), batchId, actorId),
    );
    expect(result).toEqual({
      id: batchId,
      status: 'REVERTIDO',
      retirados: {
        SUSCRIPTOR: 1,
        CONTRATO: 2,
        DOCUMENTO_COBRO: 3,
        PAGO: 2,
        TICKET: 2,
        SOPORTE_DOCUMENTAL: 2,
      },
      etiquetasRetiradas: 1,
    });
    expect(await countsFor(batchId)).toEqual({
      subscribers: 0,
      contracts: 0,
      history: 0,
      documents: 0,
      lines: 0,
      payments: 0,
      allocations: 0,
      tickets: 0,
      supports: 0,
      tags: 0,
    });
    const [{ parties }] = (await sql<{ parties: number }>(
      `SELECT COUNT(*)::int AS parties FROM party WHERE id = $1`,
      [subscriber!.party_id],
    )) as [{ parties: number }];
    expect(parties).toBe(0);
    for (const { key } of pdfAndSupports) expect(objects.has(key)).toBe(false);
    const report = await batches.getReport(scope(), batchId);
    expect(report.status).toBe('REVERTIDO');
  });

  /** Reescribe la carga cifrada de las intermedias de una entidad del lote. */
  async function mutateStaging(
    batchId: string,
    entity: string,
    mutate: (
      payload: { raw: Record<string, unknown>; source: Record<string, unknown> },
      index: number,
    ) => void,
  ): Promise<void> {
    const rows = await sql<{ id: string; payload_encrypted: string }>(
      `SELECT id::text, payload_encrypted FROM migration_staging_records
        WHERE batch_id = $1 AND entity = $2 ORDER BY external_id`,
      [batchId, entity],
    );
    for (const [index, row] of rows.entries()) {
      const payload = crypto.decryptPayload<{
        raw: Record<string, unknown>;
        source: Record<string, unknown>;
      }>(row.payload_encrypted);
      mutate(payload, index);
      await sql(`UPDATE migration_staging_records SET payload_encrypted = $2 WHERE id = $1`, [
        row.id,
        crypto.encryptPayload(payload),
      ]);
    }
  }

  async function rejectionsOf(batchId: string, entity: string) {
    return sql<{ rejection_reason: string; total: number }>(
      `SELECT rejection_reason, COUNT(*)::int AS total FROM migration_staging_records
        WHERE batch_id = $1 AND entity = $2 AND status = 'RECHAZADO'
        GROUP BY rejection_reason ORDER BY rejection_reason`,
      [batchId, entity],
    );
  }

  /**
   * Las pruebas de rechazo en promoción alteran las intermedias después de simular; la
   * revalidación previa a la primera promoción las regeneraría desde el ZIP, así que se omite
   * aquí para ejercitar las defensas propias de la promoción (como en un reintento).
   */
  const skipRestage = () =>
    jest.spyOn(simulation, 'restageForPromotion').mockResolvedValueOnce(false);

  it('rechazos de cobro: SIN_CONTRATO_ASOCIADO cuando ningún contrato del titular se promueve', async () => {
    const batchId = await simulatedBatch([run * 10 + 5]);
    await mutateStaging(batchId, 'CONTRATO', (payload) => {
      payload['raw']['servicePlanId'] = 987654321;
    });
    skipRestage();
    await promoteNow(batchId);
    expect(await rejectionsOf(batchId, 'CONTRATO')).toEqual([
      { rejection_reason: 'PLAN_SIN_EQUIVALENCIA', total: 2 },
    ]);
    expect(await rejectionsOf(batchId, 'DOCUMENTO_COBRO')).toEqual([
      { rejection_reason: 'SIN_CONTRATO_ASOCIADO', total: 3 },
    ]);
    expect(storage.putObject).not.toHaveBeenCalledWith(
      expect.stringContaining(`uisp_invoice_${(run * 10 + 5) * 100}`),
      expect.anything(),
      expect.anything(),
    );
  });

  it('rechazos de cobro: MONTO_O_FECHA_INVALIDOS y ARCHIVO_AUSENTE', async () => {
    const batchId = await simulatedBatch([run * 10 + 6]);
    await mutateStaging(batchId, 'DOCUMENTO_COBRO', (payload, index) => {
      if (index === 0) payload['raw']['total'] = -1;
      if (index === 1) payload['source']['pdfPath'] = 'invoices/no-existe.pdf';
    });
    skipRestage();
    await promoteNow(batchId);
    expect(await rejectionsOf(batchId, 'DOCUMENTO_COBRO')).toEqual([
      { rejection_reason: 'ARCHIVO_AUSENTE', total: 1 },
      { rejection_reason: 'MONTO_O_FECHA_INVALIDOS', total: 1 },
    ]);
  });

  it('H2: suprimir un titular borra sus intermedias y adelanta la purga; el otro titular queda', async () => {
    const batchId = await simulatedBatch([run * 10 + 7, run * 10 + 8]);
    await promoteNow(batchId);
    const [erased] = await sql<{ id: string; external_id: string }>(
      `SELECT promoted_entity_id::text AS id, external_id FROM migration_staging_records
        WHERE batch_id = $1 AND entity = 'SUSCRIPTOR' AND external_id LIKE $2`,
      [batchId, `%:${run * 10 + 7}`],
    );
    const before = await sql<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM migration_staging_records WHERE batch_id = $1`,
      [batchId],
    );
    const participant = new MigrationTitularErasureParticipant(config);
    const scopeErase = {
      partyId: null,
      subscriberIds: [erased!.id],
      expedienteIds: [],
      userIds: [],
    };
    const runErase = (mode: 'dry-run' | 'apply') =>
      TenantContext.run({ tenantId, schemaName, tenantSlug: tenantSlug! }, () =>
        runInTenantSchema(ds, schemaName, (qr) => participant.apply(scopeErase, qr, mode)),
      );
    const preview = await runErase('dry-run');
    const staging = preview.find((row) => row.table === 'migration_staging_records')!;
    // Titular + 2 contratos + 3 cobros + 2 pagos + 2 tickets + 2 soportes = 12 intermedias.
    expect(staging).toMatchObject({ selected: 12, changed: 0, residual: 12 });
    const applied = await runErase('apply');
    expect(applied.every((row) => row.residual === 0)).toBe(true);
    expect(applied.find((row) => row.table === 'migration_batches')).toMatchObject({ changed: 1 });
    const [after] = await sql<{ total: number; mine: number; due: boolean }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE external_id = $2)::int AS mine,
              (SELECT purge_after <= now() + interval '1 second' FROM migration_batches WHERE id = $1) AS due
         FROM migration_staging_records WHERE batch_id = $1`,
      [batchId, erased!.external_id],
    );
    expect(after).toMatchObject({ total: before[0]!.total - 12, mine: 0, due: true });
    expect((await runErase('apply')).every((row) => row.changed === 0)).toBe(true);
  });

  it('E2E R4.1: un lote de 3 ZIP del fixture por defecto promueve los 3 titulares', async () => {
    // Catálogo comercial REAL, como en el worker: sin TenantContext heredado del request, y un
    // plan creado como lo hace POST /commercial/catalog/plans más su precio RESIDENTIAL vigente.
    const realCatalog = new CommercialCatalogReadAdapter(ds);
    const doubleSnapshot = catalog.createSnapshot.getMockImplementation()!;
    let promotedBatch: string | undefined;
    catalog.createSnapshot.mockImplementation((...args: unknown[]) =>
      (realCatalog.createSnapshot as (...a: unknown[]) => Promise<never>)(...args),
    );
    const realPlanId = randomUUID();
    await sql(
      `INSERT INTO catalog_items (id, tenant_id, type, name, vat_concept, is_active)
       VALUES ($1, $2, 'PLAN', $3, 'INTERNET_ACCESS', true)`,
      [realPlanId, tenantId, `Plan QA importación ${run}`],
    );
    await sql(
      `INSERT INTO plan_details (item_id, download_speed_mbps, upload_speed_mbps, technology)
       VALUES ($1, 100, 50, 'FIBER')`,
      [realPlanId],
    );
    await sql(
      `INSERT INTO catalog_price_history
         (item_id, tenant_id, customer_segment, base_price, installation_fee, created_by)
       VALUES ($1, $2, 'RESIDENTIAL', 80000, 0, $3)`,
      [realPlanId, tenantId, actorId],
    );
    try {
      // Mismo escenario que e2e/tests/portal-importacion-uisp-live.spec.ts: CLIENT_IDS 9101–9103,
      // valores por defecto del fixture (planes 501/502, etiqueta 11, ciclo 5, método sintético).
      const clientIds = [9101, 9102, 9103];
      const existing = await sql(
        `SELECT 1 FROM subscribers WHERE external_id LIKE 'uisp:910_' LIMIT 1`,
      );
      expect(existing).toHaveLength(0);
      const mapping = (kind: string, value: string, target: string) =>
        sql(
          `INSERT INTO migration_mappings
           (tenant_id, source_system, kind, external_value, action, target_ref, created_by)
         VALUES ($1, 'UISP', $2, $3, 'EQUIVALE', $4, $5)`,
          [tenantId, kind, value, target, actorId],
        );
      const files = [];
      for (const [index, clientId] of clientIds.entries()) {
        files.push(
          zipFile(
            await buildSyntheticUispZip({
              clientId,
              document: `100000${clientId}`,
              lastName: `Sintético ${index + 1}`,
              stratum: '3',
            }),
            `cliente-${clientId}.zip`,
          ),
        );
      }
      const summary = await batches.createBatch(scope(), files, actorId);
      createdBatches.push(summary.id);
      promotedBatch = summary.id;
      await expect(simulation.simulate(tenantId, summary.id)).resolves.toBe('SIMULADO');
      // Como en el Portal: las equivalencias se resuelven DESPUÉS de simular (D4).
      const simulated = MigrationBatchReportSchema.parse(
        await batches.getReport(scope(), summary.id),
      );
      expect(simulated.counts.entidades.SUSCRIPTOR?.leidos).toBe(3);
      await mapping('PLAN', '501', realPlanId);
      await mapping('PLAN', '502', realPlanId);
      await mapping('ETIQUETA', '11', tagId);
      await mapping('METODO_PAGO', SYNTHETIC_METHOD_ID, 'EFECTIVO');
      await mapping('CICLO', '5', '1');
      await expect(promoteNow(summary.id)).resolves.toBe('CONCILIADO');
      const report = MigrationBatchReportSchema.parse(await batches.getReport(scope(), summary.id));
      expect(report.promotion).toMatchObject({
        promovidos: { SUSCRIPTOR: 3, CONTRATO: 6, DOCUMENTO_COBRO: 9, PAGO: 6 },
        rechazados: {},
      });
      expect(report.reconciliation).toMatchObject({ resultado: 'CONCILIADO', titulares: 3 });
    } finally {
      catalog.createSnapshot.mockImplementation(doubleSnapshot);
      if (promotedBatch) {
        await reversion.revert(scope(), promotedBatch, actorId).catch(() => undefined);
      }
      await sql(`DELETE FROM catalog_items WHERE id = $1`, [realPlanId]);
    }
  });

  it('contactos: un cliente de UISP con dos contactos conserva el principal y el alternativo', async () => {
    const clientId = run * 10 + 9;
    const altPhone = `311${run}`;
    const altEmail = `alterno-${run}@example.invalid`;
    const summary = await batches.createBatch(
      scope(),
      [
        zipFile(
          await buildSyntheticUispZip({
            clientId,
            document: documentFor(9),
            planIds: [planA, planB],
            tagIds: [tagExternal],
            cycleDay,
            methodId,
            extraContacts: [
              {
                email: altEmail,
                phone: altPhone,
                name: 'Contacto Sintético',
                types: [{ id: 2, name: 'General' }],
              },
            ],
          }),
          `${clientId}.zip`,
        ),
      ],
      actorId,
    );
    createdBatches.push(summary.id);
    await expect(simulation.simulate(tenantId, summary.id)).resolves.toBe('SIMULADO');
    const simulated = MigrationBatchReportSchema.parse(
      await batches.getReport(scope(), summary.id),
    );
    expect(simulated.counts.entidades.SUSCRIPTOR?.leidos).toBe(1);
    await expect(promoteNow(summary.id)).resolves.toBe('CONCILIADO');

    const { activeKey, previousKey } = loadPiiAesGcmKeyPair(config);
    const hashKey = resolvePiiHashKey(config);
    const [subscriber] = await sql<{
      party_id: string;
      phone_encrypted: string;
      phone_hmac: string;
      alt_contact_name: string | null;
      alt_contact_phone_encrypted: string | null;
    }>(
      `SELECT party_id::text, phone_encrypted, phone_hmac, alt_contact_name,
              alt_contact_phone_encrypted
         FROM subscribers WHERE import_batch_id = $1`,
      [summary.id],
    );
    expect(decryptAes256Gcm(subscriber!.phone_encrypted, activeKey, previousKey)).toBe(
      '3000000000',
    );
    expect(subscriber!.phone_hmac).toBe(hmacPii('3000000000', hashKey));
    expect(subscriber!.alt_contact_name).toBe('Contacto Sintético');
    expect(subscriber!.alt_contact_phone_encrypted).not.toContain(altPhone);
    expect(decryptAes256Gcm(subscriber!.alt_contact_phone_encrypted!, activeKey, previousKey)).toBe(
      altPhone,
    );

    const contacts = await sql<{
      type: string;
      value: string | null;
      value_encrypted: string;
      value_hmac: string;
      is_primary: boolean;
    }>(
      `SELECT type, value, value_encrypted, value_hmac, is_primary
         FROM party_contact WHERE party_id = $1 ORDER BY is_primary DESC, type, created_at`,
      [subscriber!.party_id],
    );
    const plain = contacts.map((row) => ({
      type: row.type,
      primary: row.is_primary,
      value: decryptAes256Gcm(row.value_encrypted, activeKey, previousKey),
      hmac: row.value_hmac,
      stored: row.value,
    }));
    expect(plain).toEqual([
      {
        type: 'EMAIL',
        primary: true,
        value: 'titular@example.invalid',
        hmac: hmacPii('titular@example.invalid', hashKey),
        stored: null,
      },
      {
        type: 'PHONE',
        primary: true,
        value: '3000000000',
        hmac: hmacPii('3000000000', hashKey),
        stored: null,
      },
      {
        type: 'EMAIL',
        primary: false,
        value: altEmail,
        hmac: hmacPii(altEmail, hashKey),
        stored: null,
      },
      {
        type: 'PHONE',
        primary: false,
        value: altPhone,
        hmac: hmacPii(altPhone, hashKey),
        stored: null,
      },
    ]);

    // La reversión retira el titular y su party, contactos incluidos.
    await expect(reversion.revert(scope(), summary.id, actorId)).resolves.toBeDefined();
    await expect(
      sql(`SELECT 1 FROM party_contact WHERE party_id = $1`, [subscriber!.party_id]),
    ).resolves.toHaveLength(0);
  });

  it('spec 2026-11-15 C: complementa un titular existente, concilia solo lo de UISP, reimporta y revierte', async () => {
    const clientId = run * 10 + 10;
    const document = documentFor(10);
    const ownPhone = `310${run}`;
    const altPhone = `312${run}`;
    const altEmail = `complemento-${run}@example.invalid`;
    const { activeKey, previousKey } = loadPiiAesGcmKeyPair(config);
    const hashKey = resolvePiiHashKey(config);
    const party = new PartyWriteAdapter(config);

    // Titular de iWana: teléfono propio, sin correo ni dirección; contrato ACTIVE y factura propia.
    const subscriberId = randomUUID();
    const partyId = await runInTenantSchema(ds, schemaName, async (qr) => {
      const ensured = await party.ensurePartyWithRole(
        {
          partyType: 'NATURAL' as never,
          documentType: 'CC' as never,
          documentNumber: document,
          displayName: 'Titular Propio',
        },
        'CUSTOMER' as never,
        { manager: qr.manager, actorUserId: actorId },
      );
      await qr.query(
        `INSERT INTO subscribers (
           id, tenant_id, party_id, person_type, customer_segment, document_type,
           document_number_encrypted, document_number_hmac, first_name, last_name, stratum,
           phone_encrypted, phone_hmac, vat_treatment, address, status, created_by)
         VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', $4, $5, 'Titular', 'Propio', 3,
           $6, $7, 'EXCLUDED', 'Sin dirección registrada', 'PROSPECT', $8)`,
        [
          subscriberId,
          tenantId,
          ensured.partyId,
          encryptAes256Gcm(document, activeKey),
          crypto.documentHmac(document),
          encryptAes256Gcm(ownPhone, activeKey),
          hmacPii(ownPhone, hashKey),
          actorId,
        ],
      );
      return ensured.partyId;
    });
    const ownContractId = randomUUID();
    await sql(
      `INSERT INTO contracts (id, tenant_id, subscriber_id, status, billing_cycle_day, start_date,
         plan_id, plan_snapshot_json)
       VALUES ($1, $2, $3, 'ACTIVE', $4, '2025-01-01', $5,
         '{"name":"Plan propio","monthlyPrice":"85000.00"}'::jsonb)`,
      [ownContractId, tenantId, subscriberId, cycleDay, planId],
    );
    const [period] = await sql<{ id: string }>(
      `INSERT INTO billing_periods (tenant_id, contract_id, subscriber_id, period_start, due_date,
         period_end, covered_start, generation_date, effective_policy)
       VALUES ($1, $2, $3, '2025-02-01', '2025-02-15', '2025-02-28', '2025-02-01', '2025-02-01',
         '{}'::jsonb) RETURNING id::text`,
      [tenantId, ownContractId, subscriberId],
    );
    const [ownDocument] = await sql<{ id: string }>(
      `INSERT INTO billing_documents (tenant_id, subscriber_id, contract_id, period_id, status,
         number, issue_date, due_date, subtotal, tax_total, total)
       VALUES ($1, $2, $3, $5, 'EMITIDO', $4, '2025-02-01', '2025-02-15', 85000, 0, 85000)
       RETURNING id::text`,
      [tenantId, subscriberId, ownContractId, `FE-IT-${run}`, period!.id],
    );
    await sql(
      `INSERT INTO migration_mappings
         (tenant_id, source_system, kind, external_value, action, target_ref, created_by)
       VALUES ($1, 'UISP', 'TITULAR', $2, 'EQUIVALE', $3, $4)`,
      [tenantId, String(clientId), subscriberId, actorId],
    );
    const zip = () =>
      buildSyntheticUispZip({
        clientId,
        document,
        planIds: [planA, planB],
        tagIds: [tagExternal],
        cycleDay,
        methodId,
        extraContacts: [{ email: altEmail, phone: altPhone, name: 'Contacto Sintético' }],
      });
    const snapshot = async () =>
      (
        await sql<Record<string, unknown>>(
          `SELECT external_id, import_batch_id, email_encrypted, email_hmac, phone_hmac,
                  alt_contact_name, alt_contact_phone_encrypted, address, city,
                  latitude::text AS latitude, longitude::text AS longitude
             FROM subscribers WHERE id = $1`,
          [subscriberId],
        )
      )[0]!;
    const before = await snapshot();

    const summary = await batches.createBatch(scope(), [zipFile(await zip(), 'c.zip')], actorId);
    createdBatches.push(summary.id);
    await expect(simulation.simulate(tenantId, summary.id)).resolves.toBe('SIMULADO');
    const simulated = MigrationBatchReportSchema.parse(
      await batches.getReport(scope(), summary.id),
    );
    expect(simulated.counts.titulares.complementados).toBe(1);
    await expect(promoteNow(summary.id)).resolves.toBe('CONCILIADO');

    // No crea suscriptor; contratos históricos TERMINATED; el historial completo entra.
    expect(await countsFor(summary.id)).toMatchObject({
      subscribers: 0,
      contracts: 2,
      documents: 3,
      payments: 2,
      tickets: 2,
      supports: 2,
      tags: 1,
    });
    const historical = await sql<{ subscriber_id: string; status: string; end_date: unknown }>(
      `SELECT subscriber_id::text, status::text, end_date FROM contracts WHERE import_batch_id = $1`,
      [summary.id],
    );
    expect(historical).toHaveLength(2);
    for (const contract of historical) {
      expect(contract).toMatchObject({ subscriber_id: subscriberId, status: 'TERMINATED' });
      expect(contract.end_date).not.toBeNull();
    }
    const [own] = await sql<{ status: string }>(
      `SELECT status::text FROM contracts WHERE id = $1`,
      [ownContractId],
    );
    expect(own!.status).toBe('ACTIVE');

    // Vacíos completados (cifrados) y nada sobrescrito.
    const after = await snapshot();
    expect(after).toMatchObject({
      external_id: `uisp:client:${clientId}`,
      import_batch_id: null,
      phone_hmac: hmacPii(ownPhone, hashKey),
      alt_contact_name: 'Contacto Sintético',
      address: 'Calle Ficticia 1, Ciudad Ficticia',
      city: 'Ciudad Ficticia',
    });
    expect(decryptAes256Gcm(String(after['email_encrypted']), activeKey, previousKey)).toBe(
      'titular@example.invalid',
    );
    expect(Number(after['latitude'])).toBeCloseTo(4.6);
    const added = await sql<{ id: string }>(
      `SELECT id::text FROM party_contact WHERE party_id = $1 AND value_hmac = $2`,
      [partyId, hmacPii(altEmail, hashKey)],
    );
    expect(added).toHaveLength(1);

    const report = MigrationBatchReportSchema.parse(await batches.getReport(scope(), summary.id));
    expect(report.promotion).toMatchObject({ existentes: { SUSCRIPTOR: 1 } });
    expect(report.promotion?.promovidos.SUSCRIPTOR).toBeUndefined();
    // Teléfono principal distinto en UISP: observación sin valor.
    expect(report.counts.observaciones.DATO_DISTINTO_EN_UISP).toBe(1);
    expect(report.reconciliation).toMatchObject({ resultado: 'CONCILIADO', diferencias: [] });
    const [meta] = await sql<{ promotion_meta: Record<string, unknown> }>(
      `SELECT promotion_meta FROM migration_staging_records
        WHERE batch_id = $1 AND entity = 'SUSCRIPTOR'`,
      [summary.id],
    );
    expect(meta!.promotion_meta).toMatchObject({
      mode: 'COMPLEMENTO',
      subscriberId,
      linkedExternalId: `uisp:client:${clientId}`,
    });
    expect(JSON.stringify(meta!.promotion_meta)).not.toMatch(
      new RegExp(`titular@example|Calle Ficticia|${altPhone}|${document}`, 'u'),
    );

    // Reimportar el mismo ZIP: no duplica y sigue conciliando solo lo de UISP.
    const again = await batches.createBatch(scope(), [zipFile(await zip(), 'c.zip')], actorId);
    createdBatches.push(again.id);
    await expect(simulation.simulate(tenantId, again.id)).resolves.toBe('SIMULADO');
    await expect(promoteNow(again.id)).resolves.toBe('CONCILIADO');
    expect(Object.values(await countsFor(again.id)).every((value) => value === 0)).toBe(true);
    await expect(reversion.revert(scope(), again.id, actorId)).resolves.toBeDefined();

    // Un dato completado editado después bloquea la reversión.
    await sql(`UPDATE subscribers SET city = 'Otra Ciudad' WHERE id = $1`, [subscriberId]);
    await expect(reversion.revert(scope(), summary.id, actorId)).rejects.toMatchObject({
      response: {
        code: 'MIGRATION_REVERT_BLOCKED',
        details: { blockers: [{ motivo: 'DATO_COMPLETADO_MODIFICADO', cantidad: 1 }] },
      },
    });
    await sql(`UPDATE subscribers SET city = 'Ciudad Ficticia' WHERE id = $1`, [subscriberId]);

    // H1: el recifrado de claves (mismo valor en claro, IV nuevo) NO cuenta como edición...
    const reencrypt = async (plainEmail: string) => {
      const [row] = await sql<{ alt: string | null }>(
        `SELECT alt_contact_phone_encrypted AS alt FROM subscribers WHERE id = $1`,
        [subscriberId],
      );
      const alt = row!.alt ? decryptAes256Gcm(row!.alt, activeKey, previousKey) : null;
      await sql(
        `UPDATE subscribers SET email_encrypted = $2, alt_contact_phone_encrypted = $3
          WHERE id = $1`,
        [
          subscriberId,
          encryptAes256Gcm(plainEmail, activeKey),
          alt ? encryptAes256Gcm(alt, activeKey) : null,
        ],
      );
    };
    const [cipherBefore] = await sql<{ email_encrypted: string }>(
      `SELECT email_encrypted FROM subscribers WHERE id = $1`,
      [subscriberId],
    );
    // ...pero editar el valor en claro SÍ bloquea.
    await reencrypt(`editado-${run}@example.invalid`);
    await expect(reversion.revert(scope(), summary.id, actorId)).rejects.toMatchObject({
      response: {
        code: 'MIGRATION_REVERT_BLOCKED',
        details: { blockers: [{ motivo: 'DATO_COMPLETADO_MODIFICADO', cantidad: 1 }] },
      },
    });
    await reencrypt('titular@example.invalid');
    const [cipherAfter] = await sql<{ email_encrypted: string }>(
      `SELECT email_encrypted FROM subscribers WHERE id = $1`,
      [subscriberId],
    );
    expect(cipherAfter!.email_encrypted).not.toBe(cipherBefore!.email_encrypted);

    // Revertir: el suscriptor queda como antes; contrato y factura propios intactos.
    await expect(reversion.revert(scope(), summary.id, actorId)).resolves.toBeDefined();
    expect(await snapshot()).toEqual(before);
    expect(await countsFor(summary.id)).toMatchObject({ contracts: 0, documents: 0, payments: 0 });
    await expect(
      sql(`SELECT 1 FROM contracts WHERE id = $1 AND status = 'ACTIVE'`, [ownContractId]),
    ).resolves.toHaveLength(1);
    await expect(
      sql(`SELECT 1 FROM billing_documents WHERE id = $1 AND status = 'EMITIDO'`, [
        ownDocument!.id,
      ]),
    ).resolves.toHaveLength(1);
    await expect(
      sql(`SELECT 1 FROM party_contact WHERE id = $1`, [added[0]!.id]),
    ).resolves.toHaveLength(0);

    await sql(`DELETE FROM billing_documents WHERE id = $1`, [ownDocument!.id]);
    await sql(`DELETE FROM billing_periods WHERE id = $1`, [period!.id]);
    await sql(`DELETE FROM contracts WHERE id = $1`, [ownContractId]);
    await sql(`DELETE FROM subscribers WHERE id = $1`, [subscriberId]);
    await runInTenantSchema(ds, schemaName, (qr) =>
      party.removeOrphanImportedParties([partyId], 'CUSTOMER' as never, { manager: qr.manager }),
    );
  });

  it.each([
    ['vacía', '', 11],
    ['en blanco', '   ', 12],
  ])(
    'spec 2026-11-15 H4: revertir el complemento restaura exacta la dirección original %s',
    async (_label, originalAddress, offset) => {
      const clientId = run * 10 + offset;
      const document = documentFor(offset);
      const { activeKey } = loadPiiAesGcmKeyPair(config);
      const party = new PartyWriteAdapter(config);
      const subscriberId = randomUUID();
      const partyId = await runInTenantSchema(ds, schemaName, async (qr) => {
        const ensured = await party.ensurePartyWithRole(
          {
            partyType: 'NATURAL' as never,
            documentType: 'CC' as never,
            documentNumber: document,
            displayName: 'Titular Propio',
          },
          'CUSTOMER' as never,
          { manager: qr.manager, actorUserId: actorId },
        );
        await qr.query(
          `INSERT INTO subscribers (
             id, tenant_id, party_id, person_type, customer_segment, document_type,
             document_number_encrypted, document_number_hmac, first_name, last_name, stratum,
             vat_treatment, address, status, created_by)
           VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', $4, $5, 'Titular', 'Propio', 3,
             'EXCLUDED', $6, 'PROSPECT', $7)`,
          [
            subscriberId,
            tenantId,
            ensured.partyId,
            encryptAes256Gcm(document, activeKey),
            crypto.documentHmac(document),
            originalAddress,
            actorId,
          ],
        );
        return ensured.partyId;
      });
      await sql(
        `INSERT INTO migration_mappings
           (tenant_id, source_system, kind, external_value, action, target_ref, created_by)
         VALUES ($1, 'UISP', 'TITULAR', $2, 'EQUIVALE', $3, $4)`,
        [tenantId, String(clientId), subscriberId, actorId],
      );
      const snapshot = async () =>
        (
          await sql<Record<string, unknown>>(
            `SELECT external_id, email_encrypted, email_hmac, phone_encrypted, phone_hmac,
                    alt_contact_name, alt_contact_phone_encrypted, address, city,
                    latitude::text AS latitude, longitude::text AS longitude
               FROM subscribers WHERE id = $1`,
            [subscriberId],
          )
        )[0]!;
      const before = await snapshot();
      const summary = await batches.createBatch(
        scope(),
        [
          zipFile(
            await buildSyntheticUispZip({
              clientId,
              document,
              planIds: [planA, planB],
              tagIds: [tagExternal],
              cycleDay,
              methodId,
            }),
            `${clientId}.zip`,
          ),
        ],
        actorId,
      );
      createdBatches.push(summary.id);
      await expect(simulation.simulate(tenantId, summary.id)).resolves.toBe('SIMULADO');
      await expect(promoteNow(summary.id)).resolves.toBe('CONCILIADO');
      expect((await snapshot())['address']).toBe('Calle Ficticia 1, Ciudad Ficticia');

      await expect(reversion.revert(scope(), summary.id, actorId)).resolves.toBeDefined();
      expect(await snapshot()).toEqual(before);

      await sql(`DELETE FROM subscribers WHERE id = $1`, [subscriberId]);
      await runInTenantSchema(ds, schemaName, (qr) =>
        party.removeOrphanImportedParties([partyId], 'CUSTOMER' as never, {
          manager: qr.manager,
        }),
      );
    },
  );

  it('guardas: no se promueve sin simulación completa ni se revierte un lote solo simulado', async () => {
    const summary = await batches.createBatch(
      scope(),
      [zipFile(await buildSyntheticUispZip({ clientId: run * 10 + 5 }), 'x.zip')],
      actorId,
    );
    createdBatches.push(summary.id);
    // Simulación aún PENDIENTE.
    await expect(promotion.requestPromotion(scope(), summary.id, actorId)).rejects.toMatchObject({
      response: { code: 'MIGRATION_BATCH_NOT_PROMOTABLE' },
    });
    await expect(reversion.revert(scope(), summary.id, actorId)).rejects.toMatchObject({
      response: { code: 'MIGRATION_BATCH_NOT_REVERTIBLE' },
    });
    await expect(promotion.reconcile(scope(), summary.id, actorId)).rejects.toMatchObject({
      response: { code: 'MIGRATION_BATCH_NOT_RECONCILABLE' },
    });
    await expect(promotion.requestPromotion(scope(), randomUUID(), actorId)).rejects.toMatchObject({
      response: { code: 'MIGRATION_BATCH_NOT_FOUND' },
    });
    await sql(`UPDATE migration_batches SET purged_at = now() WHERE id = $1`, [summary.id]);
    await expect(promotion.requestPromotion(scope(), summary.id, actorId)).rejects.toMatchObject({
      response: { code: 'MIGRATION_BATCH_PURGED' },
    });
    // «Actualizar autores» solo en lotes promovidos o conciliados con intermedias.
    await expect(promotion.refreshAuthors(scope(), summary.id, actorId)).rejects.toMatchObject({
      response: { code: 'MIGRATION_BATCH_PURGED' },
    });
    await sql(`UPDATE migration_batches SET purged_at = NULL WHERE id = $1`, [summary.id]);
    await expect(promotion.refreshAuthors(scope(), summary.id, actorId)).rejects.toMatchObject({
      response: { code: 'MIGRATION_BATCH_NOT_RECONCILABLE' },
    });
    await expect(promotion.refreshAuthors(scope(), randomUUID(), actorId)).rejects.toMatchObject({
      response: { code: 'MIGRATION_BATCH_NOT_FOUND' },
    });
  });

  describe('spec 2026-11-15 «usuarios» §2.6–§2.8: atribución al personal de iWana', () => {
    const userIds: string[] = [];
    // Números de UISP únicos por corrida (enteros que caben en integer).
    const uisp = (offset: number) => run * 100 + offset;
    const T1 = '2023-03-01T08:00:00-0500';
    const T2 = '2023-03-02T09:30:00-0500';

    async function seedUser(): Promise<string> {
      const id = randomUUID();
      await sql(
        `INSERT INTO users (
           id, email, email_hmac, password_hash, role, status, tenant_id,
           mfa_enabled, mfa_required, is_operational_resource,
           password_reset_required, failed_login_attempts, locked_until,
           email_verified, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'SUPPORT', 'ACTIVE', $5,
                   false, false, false, false, 0, NULL, false, now(), now())`,
        [
          id,
          `uisp-attr-${id.slice(0, 8)}@example.invalid`,
          createHash('sha256').update(id).digest('hex'),
          '!'.repeat(60),
          tenantId,
        ],
      );
      userIds.push(id);
      return id;
    }

    const linkUser = (number: number, userId: string) =>
      sql(
        `INSERT INTO migration_mappings
           (tenant_id, source_system, kind, external_value, action, target_ref, created_by)
         VALUES ($1, 'UISP', 'USUARIO', $2, 'EQUIVALE', $3, $4)`,
        [tenantId, String(number), userId, actorId],
      );

    async function ticketState(batchId: string) {
      const [ticket] = await sql<{ id: string; assigned: string | null; created_by: string }>(
        `SELECT id::text, assigned_user_id::text AS assigned, created_by_user_id::text AS created_by
           FROM support_tickets WHERE import_batch_id = $1 AND subject = 'Ticket sintético con tareas'`,
        [batchId],
      );
      const comments = await sql<{ body: string; author: string }>(
        `SELECT body, author_user_id::text AS author FROM ticket_comments
          WHERE ticket_id = $1 ORDER BY body`,
        [ticket!.id],
      );
      const payments = await sql<{ external_id: string; created_by: string }>(
        `SELECT external_id, created_by::text FROM billing_payments
          WHERE import_batch_id = $1 ORDER BY external_id`,
        [batchId],
      );
      return {
        ticket: ticket!,
        authors: Object.fromEntries(comments.map((c) => [c.body, c.author])),
        payments: payments.map((p) => p.created_by),
      };
    }

    async function unlinkedObservation(batchId: string): Promise<number | undefined> {
      const [row] = await sql<{ n: number | null }>(
        `SELECT (counts->'observaciones'->>'USUARIO_UISP_SIN_ENLAZAR')::int AS n
           FROM migration_batches WHERE id = $1`,
        [batchId],
      );
      return row?.n ?? undefined;
    }

    afterAll(async () => {
      if (!ds?.isInitialized || userIds.length === 0) return;
      await sql(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    });

    it('promueve con asignado, autores, creador y registrador enlazados; cuenta los no enlazados', async () => {
      const ana = await seedUser();
      const luis = await seedUser();
      const deleted = await seedUser();
      await sql(`UPDATE users SET deleted_at = now() WHERE id = $1`, [deleted]);
      await linkUser(uisp(1), ana);
      await linkUser(uisp(2), luis);
      await linkUser(uisp(3), deleted);
      const batchId = await simulatedBatch([run * 10 + 20], [], {
        ticketAssignedUserId: uisp(2),
        ticketActivity: [
          { id: 1, userId: uisp(1), public: true, createdAt: T1, comment: { body: 'Abre' } },
          { id: 2, userId: uisp(4), public: false, comment: { body: 'Sin enlazar' } },
          { id: 3, userId: uisp(3), public: true, createdAt: T2, comment: { body: 'Borrado' } },
        ],
        paymentUserIds: [uisp(2), uisp(4)],
      });
      await expect(promoteNow(batchId)).resolves.toBe('CONCILIADO');

      const state = await ticketState(batchId);
      expect(state.ticket.assigned).toBe(luis);
      expect(state.ticket.created_by).toBe(ana);
      expect(state.authors).toEqual({ Abre: ana, 'Sin enlazar': actorId, Borrado: actorId });
      expect(state.payments).toEqual([luis, actorId]);
      const [other] = await sql<{ assigned: string | null; created_by: string }>(
        `SELECT assigned_user_id::text AS assigned, created_by_user_id::text AS created_by
           FROM support_tickets WHERE import_batch_id = $1 AND subject = 'Ticket sintético sin tareas'`,
        [batchId],
      );
      expect(other).toEqual({ assigned: null, created_by: actorId });
      // uisp(3) apunta a un usuario borrado y uisp(4) no tiene equivalencia.
      expect(await unlinkedObservation(batchId)).toBe(2);
      const report = MigrationBatchReportSchema.parse(await batches.getReport(scope(), batchId));
      expect(report.counts?.observaciones).toMatchObject({ USUARIO_UISP_SIN_ENLAZAR: 2 });
      expect(JSON.stringify(report.counts)).not.toContain(String(uisp(4)));
    });

    it('sin equivalencias queda como hoy; «Actualizar autores» corrige, respeta y es idempotente', async () => {
      const ana = await seedUser();
      const luis = await seedUser();
      const someone = await seedUser();
      const batchId = await simulatedBatch([run * 10 + 21], [], {
        ticketAssignedUserId: uisp(12),
        ticketActivity: [
          { id: 1, userId: uisp(11), public: true, createdAt: T1, comment: { body: 'Abre' } },
          { id: 2, userId: uisp(13), public: false, comment: { body: 'Otro' } },
          { id: 3, userId: null, public: true, createdAt: T2, comment: { body: 'Cliente' } },
        ],
        paymentUserIds: [uisp(12), uisp(11)],
      });
      await expect(promoteNow(batchId)).resolves.toBe('CONCILIADO');
      const before = await ticketState(batchId);
      expect(before.ticket).toMatchObject({ assigned: null, created_by: actorId });
      expect(before.authors).toEqual({ Abre: actorId, Otro: actorId, Cliente: actorId });
      expect(before.payments).toEqual([actorId, actorId]);
      expect(await unlinkedObservation(batchId)).toBe(3);

      // Sin equivalencias todavía: no cambia nada.
      await expect(promotion.refreshAuthors(scope(), batchId, actorId)).resolves.toEqual({
        tickets: 0,
        comentarios: 0,
        pagos: 0,
        respetados: 0,
        sinEnlazar: 3,
      });

      await linkUser(uisp(11), ana);
      await linkUser(uisp(12), luis);
      await linkUser(uisp(13), luis);
      // Alguien lo asignó a mano después de importar: se respeta.
      await sql(`UPDATE support_tickets SET assigned_user_id = $2 WHERE id = $1`, [
        before.ticket.id,
        someone,
      ]);

      await expect(promotion.refreshAuthors(scope(), batchId, actorId)).resolves.toEqual({
        tickets: 1,
        comentarios: 2,
        pagos: 2,
        respetados: 1,
        sinEnlazar: 0,
      });
      const after = await ticketState(batchId);
      expect(after.ticket).toMatchObject({ assigned: someone, created_by: ana });
      expect(after.authors).toEqual({ Abre: ana, Otro: luis, Cliente: actorId });
      expect(after.payments).toEqual([luis, ana]);
      expect(await unlinkedObservation(batchId)).toBeUndefined();

      // Repetir no cambia nada nuevo y vuelve a contar lo respetado.
      await expect(promotion.refreshAuthors(scope(), batchId, actorId)).resolves.toEqual({
        tickets: 0,
        comentarios: 0,
        pagos: 0,
        respetados: 1,
        sinEnlazar: 0,
      });
      expect(await ticketState(batchId)).toEqual(after);

      // §2.8: revertir el lote retira lo importado pero no borra usuarios.
      await reversion.revert(scope(), batchId, actorId);
      const [left] = await sql<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [[ana, luis, someone]],
      );
      expect(left!.n).toBe(3);
      const [mappings] = await sql<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM migration_mappings
          WHERE tenant_id = $1 AND kind = 'USUARIO' AND external_value = ANY($2::varchar[])`,
        [tenantId, [String(uisp(11)), String(uisp(12)), String(uisp(13))]],
      );
      expect(mappings!.n).toBe(3);
    });

    it('«Actualizar autores» respeta cambios manuales en creador, autor de comentario y registrador, y audita cada fila', async () => {
      const ana = await seedUser();
      const luis = await seedUser();
      const someone = await seedUser();
      const batchId = await simulatedBatch([run * 10 + 22], [], {
        ticketAssignedUserId: uisp(22),
        ticketActivity: [
          { id: 1, userId: uisp(21), public: true, createdAt: T1, comment: { body: 'Abre' } },
          { id: 2, userId: uisp(23), public: false, comment: { body: 'Otro' } },
        ],
        paymentUserIds: [uisp(22), uisp(21)],
      });
      await expect(promoteNow(batchId)).resolves.toBe('CONCILIADO');
      const before = await ticketState(batchId);
      expect(before.ticket).toMatchObject({ assigned: null, created_by: actorId });
      expect(before.authors).toEqual({ Abre: actorId, Otro: actorId });
      expect(before.payments).toEqual([actorId, actorId]);

      await linkUser(uisp(21), ana);
      await linkUser(uisp(22), luis);
      await linkUser(uisp(23), luis);
      // Cambios manuales posteriores a la importación, uno por columna re-atribuible.
      await sql(`UPDATE support_tickets SET created_by_user_id = $2 WHERE id = $1`, [
        before.ticket.id,
        someone,
      ]);
      await sql(
        `UPDATE ticket_comments SET author_user_id = $2 WHERE ticket_id = $1 AND body = 'Otro'`,
        [before.ticket.id, someone],
      );
      const [firstPayment] = await sql<{ id: string }>(
        `SELECT id::text FROM billing_payments WHERE import_batch_id = $1 ORDER BY external_id LIMIT 1`,
        [batchId],
      );
      await sql(`UPDATE billing_payments SET created_by = $2 WHERE id = $1`, [
        firstPayment!.id,
        someone,
      ]);
      audit.logWithin.mockClear();

      await expect(promotion.refreshAuthors(scope(), batchId, actorId)).resolves.toEqual({
        tickets: 1,
        comentarios: 1,
        pagos: 1,
        respetados: 3,
        sinEnlazar: 0,
      });
      const after = await ticketState(batchId);
      // Asignado vacío se completa; creador, comentario «Otro» y primer pago se respetan.
      expect(after.ticket).toMatchObject({ assigned: luis, created_by: someone });
      expect(after.authors).toEqual({ Abre: ana, Otro: someone });
      expect(after.payments).toEqual([someone, ana]);

      // S-4: una entrada de auditoría por fila cambiada, con ids de usuario y sin PII.
      const rowEntries = audit.logWithin.mock.calls
        .map(
          ([entry]) =>
            entry as { entityType: string; entityId: string; oldValue: unknown; newValue: unknown },
        )
        .filter((entry) => entry.entityType !== 'MigrationBatch');
      expect(rowEntries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entityType: 'SupportTicket',
            entityId: before.ticket.id,
            oldValue: { assigned_user_id: null },
            newValue: expect.objectContaining({
              assigned_user_id: luis,
              origen: 'ACTUALIZAR_AUTORES',
              batchId,
            }),
          }),
          expect.objectContaining({
            entityType: 'TicketComment',
            oldValue: { author_user_id: actorId },
            newValue: expect.objectContaining({ author_user_id: ana }),
          }),
          expect.objectContaining({
            entityType: 'BillingPayment',
            oldValue: { created_by: actorId },
            newValue: expect.objectContaining({ created_by: ana }),
          }),
        ]),
      );
      expect(rowEntries).toHaveLength(3);
      expect(JSON.stringify(rowEntries)).not.toContain('Abre');

      // Repetir: nada nuevo, ninguna entrada por fila.
      audit.logWithin.mockClear();
      await expect(promotion.refreshAuthors(scope(), batchId, actorId)).resolves.toMatchObject({
        tickets: 0,
        comentarios: 0,
        pagos: 0,
        respetados: 3,
      });
      expect(
        audit.logWithin.mock.calls.filter(
          ([entry]) => (entry as { entityType: string }).entityType !== 'MigrationBatch',
        ),
      ).toHaveLength(0);
    });
  });
});
