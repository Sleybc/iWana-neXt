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
import { MigrationTitularErasureParticipant } from './privacy/migration-titular-erasure.participant';
import { buildSyntheticUispZip } from './test/uisp-zip.fixture';

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

  async function simulatedBatch(clientIds: number[], methods: string[] = []): Promise<string> {
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
      entities: [Party, PartyRole, PartyContact],
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
    const titularLookup = new CrmMigrationTitularLookupAdapter();
    batches = new MigrationBatchesService(
      ds,
      storage as never,
      queue as never,
      crypto,
      audit as never,
    );
    simulation = new MigrationSimulationService(ds, storage as never, crypto, titularLookup);
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

  it('rechazos de cobro: SIN_CONTRATO_ASOCIADO cuando ningún contrato del titular se promueve', async () => {
    const batchId = await simulatedBatch([run * 10 + 5]);
    await mutateStaging(batchId, 'CONTRATO', (payload) => {
      payload['raw']['servicePlanId'] = 987654321;
    });
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
  });
});
