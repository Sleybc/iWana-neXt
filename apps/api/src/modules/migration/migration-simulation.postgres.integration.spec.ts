import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import JSZip from 'jszip';
import { Queue, type Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema } from '@iwana/db';
import { MigrationBatchReportSchema, type MigrationSimulateJob } from '@iwana/shared';
import { MigrationImportTables1940000000194 } from '../../../../../packages/database/src/migrations/tenant/194_migration_import_tables';
import { CrmMigrationTitularLookupAdapter } from '../crm/migration-adapters/crm-migration-titular-lookup.adapter';
import { MigrationBatchesService } from './migration-batches.service';
import { MigrationImportProcessor } from './migration-import.processor';
import { MigrationCrypto } from './migration-crypto';
import { MigrationMappingsService } from './migration-mappings.service';
import { MigrationPurgeService } from './migration-purge.service';
import { MigrationSimulationService } from './migration-simulation.service';
import { SYNTHETIC_METHOD_ID, buildSyntheticUispZip } from './test/uisp-zip.fixture';

/**
 * Bloque B contra PostgreSQL real (ADR-110 D2, D4, D10, D11): la 194 real, la carga a
 * intermedias cifradas, el informe por entidad y motivo, equivalencias, conflicto por HMAC,
 * titular anonimizado, idempotencia de la simulación y purga a 30 días.
 *
 * Storage y cola son dobles en memoria; CRM se representa con tablas mínimas (solo las
 * columnas que lee el adaptador).
 */
const INTEGRATION_DATABASE_NAME = /^(test|iwana_it_[a-z0-9_]+)$/u;
const enabled =
  process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true' &&
  INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '');
const describeDb = enabled ? describe : describe.skip;
const redisAvailable = process.env['IWANA_REDIS_INTEGRATION_AVAILABLE'] === 'true';
const itRedis = redisAvailable ? it : it.skip;

function redisConnection() {
  const host = process.env['REDIS_HOST'] ?? '127.0.0.1';
  const port = Number(process.env['REDIS_PORT'] ?? 6379);
  const db = Number(process.env['REDIS_DB'] ?? 15);
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || db !== 15) {
    throw new Error('La prueba de cola solo usa Redis loopback en el índice 15.');
  }
  return { host, port, password: process.env['REDIS_PASSWORD'], db, maxRetriesPerRequest: null };
}

describeDb('Importación UISP — simulación sobre PostgreSQL real', () => {
  let ds: DataSource;
  const schemaName = `tenant_migr_sim_${randomBytes(5).toString('hex')}`;
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const scope = { tenantId, schemaName };
  const objects = new Map<string, Buffer>();
  const deleted: string[] = [];
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
      deleted.push(key);
      objects.delete(key);
    }),
  };
  const jobs: MigrationSimulateJob[] = [];
  const queue = {
    add: jest.fn(async (_name: string, payload: MigrationSimulateJob) => {
      jobs.push(payload);
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
  let batches: MigrationBatchesService;
  let mappings: MigrationMappingsService;
  let simulation: MigrationSimulationService;
  let purge: MigrationPurgeService;

  const sql = <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, params) as Promise<[T, ...T[]]>);

  const zipFile = (buffer: Buffer, name: string) => ({
    originalname: name,
    mimetype: 'application/zip',
    size: buffer.length,
    buffer,
  });

  beforeAll(async () => {
    ds = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { max: 4, connectionTimeoutMillis: 5000 },
    });
    await ds.initialize();
    await ds.query(`CREATE SCHEMA "${schemaName}"`);
    await ds.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, contact_email, status)
       VALUES ($1, 'Fixture importación', $2, $3, $4, 'ACTIVE')`,
      [
        tenantId,
        `${schemaName}-slug`.replaceAll('_', '-'),
        schemaName,
        `${schemaName}@invalid.example`,
      ],
    );
    await runInTenantSchema(ds, schemaName, async (qr) => {
      await new MigrationImportTables1940000000194().up(qr);
      // Columnas de promoción y conciliación del lote (199, bloque C) que lee el informe.
      await qr.query(`ALTER TABLE migration_batches
        ADD COLUMN promotion jsonb NULL, ADD COLUMN reconciliation jsonb NULL,
        ADD COLUMN promoted_by uuid NULL`);
      await qr.query(`
        CREATE TABLE subscribers (
          id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
          document_number_hmac varchar(64) NULL, external_id varchar(160) NULL,
          anonymized_at timestamptz NULL, deleted_at timestamptz NULL);
        CREATE TABLE expediente_records (
          id uuid PRIMARY KEY, document_number_hmac varchar(64) NULL,
          anonymized_at timestamptz NULL, deleted_at timestamptz NULL);
        CREATE TABLE crm_billing_cycles (
          cycle_day smallint PRIMARY KEY, active boolean NOT NULL DEFAULT true);
        INSERT INTO crm_billing_cycles (cycle_day, active) VALUES (5, true), (10, false);`);
    });

    batches = new MigrationBatchesService(
      ds,
      storage as never,
      queue as never,
      crypto,
      audit as never,
    );
    mappings = new MigrationMappingsService(ds, audit as never);
    simulation = new MigrationSimulationService(
      ds,
      storage as never,
      crypto,
      new CrmMigrationTitularLookupAdapter(),
    );
    purge = new MigrationPurgeService(ds, storage as never, audit as never);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await ds.query(`DELETE FROM public.tenants WHERE id = $1`, [tenantId]);
      await ds.destroy();
    }
  });

  it('simula el lote, carga intermedias cifradas e informa por entidad y motivo', async () => {
    // Titular vigente con el documento del cliente 9002 → conflicto; 9003 fue anonimizado.
    await sql(
      `INSERT INTO subscribers (id, tenant_id, document_number_hmac, external_id)
       VALUES ($1, $2, $3, NULL), ($4, $2, NULL, 'uisp:client:9003')`,
      [randomUUID(), tenantId, crypto.documentHmac('1000000002'), randomUUID()],
    );
    await sql(
      `UPDATE subscribers SET anonymized_at = now() WHERE external_id = 'uisp:client:9003'`,
    );

    const planTarget = randomUUID();
    await mappings.create(
      scope,
      { kind: 'PLAN', externalValue: '501', action: 'EQUIVALE', targetRef: planTarget },
      actorId,
    );
    await mappings.create(
      scope,
      { kind: 'CICLO', externalValue: '5', action: 'EQUIVALE', targetRef: '5' },
      actorId,
    );
    await mappings.create(
      scope,
      {
        kind: 'METODO_PAGO',
        externalValue: SYNTHETIC_METHOD_ID,
        action: 'EQUIVALE',
        targetRef: 'EFECTIVO',
      },
      actorId,
    );
    await mappings.create(
      scope,
      { kind: 'ETIQUETA', externalValue: '11', action: 'DESCARTAR' },
      actorId,
    );

    const invalidJson = new JSZip();
    invalidJson.file('client.json', '{roto');
    const files = [
      zipFile(await buildSyntheticUispZip({ clientId: 9001, document: '1000000001' }), 'a.zip'),
      zipFile(await buildSyntheticUispZip({ clientId: 9002, document: '1.000.000.002' }), 'b.zip'),
      zipFile(await buildSyntheticUispZip({ clientId: 9003, document: '1000000003' }), 'c.zip'),
      zipFile(await invalidJson.generateAsync({ type: 'nodebuffer' }), 'd.zip'),
    ];
    const summary = await batches.createBatch(scope, files, actorId);
    expect(summary).toMatchObject({
      status: 'SIMULADO',
      processing: 'PENDIENTE',
      filesReceived: 4,
    });
    expect(jobs).toEqual([{ version: 1, tenantId, batchId: summary.id }]);
    expect(objects.size).toBe(4);

    await expect(simulation.simulate(tenantId, summary.id)).resolves.toBe('SIMULADO');

    const report = MigrationBatchReportSchema.parse(await batches.getReport(scope, summary.id));
    expect(report.processing).toBe('COMPLETADO');
    expect(report.counts.archivos).toEqual({
      recibidos: 4,
      leidos: 3,
      rechazados: { JSON_INVALIDO: 1 },
    });
    expect(report.counts.entidades.SUSCRIPTOR).toEqual({ leidos: 3, validos: 1, rechazados: 2 });
    expect(report.rejections.SUSCRIPTOR).toEqual({ TITULAR_EXISTENTE: 1, TITULAR_ANONIMIZADO: 1 });
    // Plan 502 sin equivalencia en los 3 clientes; los demás contratos de 9002/9003 dependen.
    expect(report.rejections.CONTRATO).toEqual({
      PLAN_SIN_EQUIVALENCIA: 3,
      DEPENDE_DE_TITULAR_RECHAZADO: 2,
    });
    expect(report.rejections.DOCUMENTO_COBRO).toEqual({ DEPENDE_DE_TITULAR_RECHAZADO: 6 });
    expect(report.counts.entidades.DOCUMENTO_COBRO).toEqual({
      leidos: 9,
      validos: 3,
      rechazados: 6,
    });
    expect(report.counts.tareasSinFuente).toBe(9);
    expect(report.counts.observaciones).toMatchObject({
      TAREAS_SIN_FUENTE: 3,
      ESTRATO_PENDIENTE_EVIDENCIA: 3,
      FACTURA_SIN_PDF: 3,
    });
    expect(report.counts.pendientesEquivalencia).toEqual([
      { kind: 'PLAN', externalValue: '502', externalLabel: 'Plan sintético 502', occurrences: 3 },
    ]);

    // Intermedias: códigos de motivo en claro, carga útil cifrada y descifrable.
    const rows = await sql<{
      entity: string;
      external_id: string;
      status: string;
      rejection_reason: string | null;
      payload_encrypted: string;
    }>(
      `SELECT entity, external_id, status, rejection_reason, payload_encrypted
         FROM migration_staging_records WHERE batch_id = $1 ORDER BY entity, external_id`,
      [summary.id],
    );
    expect(rows).toHaveLength(3 * (1 + 2 + 3 + 2 + 2 + 2));
    const titular = rows.find((row) => row.external_id === 'uisp:client:9001')!;
    expect(titular).toMatchObject({
      entity: 'SUSCRIPTOR',
      status: 'VALIDO',
      rejection_reason: null,
    });
    for (const row of rows) {
      expect(row.payload_encrypted).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/u);
      expect(row.payload_encrypted).not.toContain('1000000001');
    }
    const payload = crypto.decryptPayload<{ derived: { documentNumber: string } }>(
      titular.payload_encrypted,
    );
    expect(payload.derived.documentNumber).toBe('1000000001');
    expect(rows.find((row) => row.external_id === 'uisp:client:9002')!.rejection_reason).toBe(
      'TITULAR_EXISTENTE',
    );

    // El lote no guarda PII: ni documentos ni nombres en counts/rejections.
    const [batchRow] = await sql<{ counts: unknown; rejections: unknown }>(
      `SELECT counts, rejections FROM migration_batches WHERE id = $1`,
      [summary.id],
    );
    const stored = JSON.stringify(batchRow);
    for (const pii of ['1000000001', '1000000002', 'Titular', 'example.invalid']) {
      expect(stored).not.toContain(pii);
    }

    // Repetir la simulación no duplica intermedias.
    await simulation.simulate(tenantId, summary.id);
    const [{ total }] = await sql<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM migration_staging_records WHERE batch_id = $1`,
      [summary.id],
    );
    expect(total).toBe(rows.length);

    // Pendientes contra el catálogo vigente: al crear la equivalencia desaparece.
    await expect(batches.pendingMappings(scope, summary.id)).resolves.toHaveLength(1);
    await mappings.create(
      scope,
      { kind: 'PLAN', externalValue: '502', action: 'EQUIVALE', targetRef: randomUUID() },
      actorId,
    );
    await expect(batches.pendingMappings(scope, summary.id)).resolves.toEqual([]);

    const listed = await batches.list(scope, 1, 20);
    expect(listed.total).toBe(1);
    expect(listed.data[0]!.id).toBe(summary.id);
  });

  it('equivalencias: duplicado → 409, destino inválido → 400, actualizar y borrar', async () => {
    await expect(
      mappings.create(
        scope,
        { kind: 'PLAN', externalValue: '501', action: 'EQUIVALE', targetRef: randomUUID() },
        actorId,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      mappings.create(scope, { kind: 'PLAN', externalValue: '999', action: 'DESCARTAR' }, actorId),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      mappings.create(
        scope,
        { kind: 'METODO_PAGO', externalValue: 'x', action: 'EQUIVALE', targetRef: 'BITCOIN' },
        actorId,
      ),
    ).rejects.toMatchObject({ status: 400 });
    const tag = (await mappings.list(scope, 'ETIQUETA'))[0]!;
    const updated = await mappings.update(scope, tag.id, { action: 'NOTA' }, actorId);
    expect(updated).toMatchObject({ action: 'NOTA', targetRef: null });
    await mappings.remove(scope, tag.id, actorId);
    await expect(mappings.remove(scope, tag.id, actorId)).rejects.toMatchObject({ status: 404 });
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'MigrationMapping', action: 'DELETE' }),
      expect.anything(),
    );
  });

  it('lote de otro tenant no es visible y un id inexistente es 404', async () => {
    await expect(
      batches.getReport({ tenantId: randomUUID(), schemaName }, randomUUID()),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('purga a 30 días: borra ZIP e intermedias y conserva conteos sin PII', async () => {
    const [{ id }] = await sql<{ id: string }>(`SELECT id FROM migration_batches LIMIT 1`);
    const before = await batches.getReport(scope, id);
    // Aún no vence: no purga.
    await expect(purge.purgeTenant(scope)).resolves.toBe(0);
    await sql(
      `UPDATE migration_batches
          SET created_at = now() - interval '31 days', purge_after = now() - interval '1 day'
        WHERE id = $1`,
      [id],
    );
    await expect(purge.purgeTenant(scope)).resolves.toBe(1);
    expect(deleted.sort()).toEqual(
      [0, 1, 2, 3].map((index) => `${schemaName}/migration/${id}/${index}.zip.enc`).sort(),
    );
    const [{ total }] = await sql<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM migration_staging_records WHERE batch_id = $1`,
      [id],
    );
    expect(total).toBe(0);
    const after = await batches.getReport(scope, id);
    expect(after.purgedAt).not.toBeNull();
    expect(after.counts).toEqual(before.counts);
    expect(after.rejections).toEqual(before.rejections);
    const [row] = await sql<{ source_object_key: string | null }>(
      `SELECT source_object_key FROM migration_batches WHERE id = $1`,
      [id],
    );
    expect(row!.source_object_key).toBeNull();
    // Idempotente y la simulación ya no corre sobre un lote purgado.
    await expect(purge.purgeTenant(scope)).resolves.toBe(0);
    await expect(simulation.simulate(tenantId, id)).resolves.toBe('OMITIDO');
  });

  itRedis('encola en Redis real solo identificadores y el processor simula el lote', async () => {
    const prefix = `iwana-it-migration-${randomBytes(4).toString('hex')}`;
    const realQueue = new Queue('migration-import', { connection: redisConnection(), prefix });
    try {
      const realBatches = new MigrationBatchesService(
        ds,
        storage as never,
        realQueue,
        crypto,
        audit as never,
      );
      const summary = await realBatches.createBatch(
        scope,
        [
          zipFile(
            await buildSyntheticUispZip({ clientId: 9101, document: '1000000101', tagIds: [] }),
            'r.zip',
          ),
        ],
        actorId,
      );
      const job = (await realQueue.getJob(`migration-simulate-${summary.id}`)) as Job;
      expect(job.name).toBe('simulate-batch');
      expect(job.data).toEqual({ version: 1, tenantId, batchId: summary.id });
      expect(JSON.stringify(job.data)).not.toMatch(/1000000101|Titular|tenant_/u);
      expect(job.opts.attempts).toBe(5);

      const processor = new MigrationImportProcessor(ds, realQueue, simulation, purge, {} as never);
      await processor.process(job);
      const report = await batches.getReport(scope, summary.id);
      expect(report.processing).toBe('COMPLETADO');
      expect(report.counts.entidades.SUSCRIPTOR).toEqual({ leidos: 1, validos: 1, rechazados: 0 });
      expect(report.counts.tareasSinFuente).toBe(3);
    } finally {
      await realQueue.obliterate({ force: true }).catch(() => undefined);
      await realQueue.close();
    }
  });

  it('anticipa DATOS_OBLIGATORIOS_AUSENTES y el ciclo inactivo en CRM antes de promover', async () => {
    await sql(`UPDATE crm_billing_cycles SET active = false WHERE cycle_day = 5`);
    try {
      const summary = await batches.createBatch(
        scope,
        [
          zipFile(
            await buildSyntheticUispZip({ clientId: 9201, document: '1000000201', stratum: null }),
            'sin-estrato.zip',
          ),
          zipFile(
            await buildSyntheticUispZip({ clientId: 9202, document: '1000000202', tagIds: [] }),
            'ciclo-inactivo.zip',
          ),
        ],
        actorId,
      );
      await expect(simulation.simulate(tenantId, summary.id)).resolves.toBe('SIMULADO');
      const report = await batches.getReport(scope, summary.id);
      expect(report.rejections.SUSCRIPTOR).toMatchObject({ DATOS_OBLIGATORIOS_AUSENTES: 1 });
      // 9202: el plan 501 tiene equivalencia pero su ciclo (5) quedó inactivo en CRM.
      expect(report.rejections.CONTRATO?.CICLO_SIN_EQUIVALENCIA).toBeGreaterThanOrEqual(1);
      expect(report.rejections.PAGO).toEqual({ DEPENDE_DE_TITULAR_RECHAZADO: 2 });
      // El ciclo con equivalencia no aparece como valor pendiente de mapear.
      expect(report.counts.pendientesEquivalencia.filter((item) => item.kind === 'CICLO')).toEqual(
        [],
      );
    } finally {
      await sql(`UPDATE crm_billing_cycles SET active = true WHERE cycle_day = 5`);
    }
  });
});
