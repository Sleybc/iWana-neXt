/**
 * Cierre de venta, bloque B (ADR-109 D5, CA-14) — generación del PDF del contrato con
 * PostgreSQL real (base `test`) y Chromium real (playwright-core).
 *
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/worker test:integration
 *
 * Crea un schema tenant sintético con todas las migraciones tenant, una generación PENDING
 * con el snapshot cifrado y procesa el trabajo: PDF A4 de 6 páginas, guardado cifrado,
 * huella SHA-256 del PDF en READY, alteración detectada y reproceso idempotente.
 */
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials } from '@iwana/db';
import { CRM_CONTRACT_PDF_JOB_NAME, type ContractPdfJobPayload } from '@iwana/shared';
import { decryptObjectBuffer, type StoragePort } from '@iwana/storage';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../packages/database/src/migrations/tenant/runner';
import { buildContractSnapshotFixture } from '../../test/fixtures/contracts/contract-snapshot.fixture';
import { ContractPdfRenderer } from '../contracts/contract-pdf-renderer';
import { fillContractTemplate } from '../contracts/contract-template';
import {
  CONTRACT_TEMPLATE_FILE,
  ContractPdfProcessor,
  contractPdfObjectKey,
} from './contract-pdf.processor';

function loadWorkspaceEnv(): void {
  if (process.env['DB_HOST'] && process.env['DB_PASSWORD']) return;
  const envPath = resolve(__dirname, '../../../../.env');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    const separator = line.indexOf('=');
    if (!line || line.startsWith('#') || separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/gu, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadWorkspaceEnv();

const describeWithDb =
  process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true' ? describe : describe.skip;
const KEY = randomBytes(32).toString('hex');

function encryptSnapshot(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(KEY, 'hex'), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${data.toString('hex')}`;
}

/** Almacenamiento en disco para la prueba (el adaptador local no crea subcarpetas en Windows). */
function diskStorage(baseDir: string): StoragePort {
  return {
    putObject: async (key, body) => {
      const target = join(baseDir, key);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body as Buffer);
    },
    getObject: async (key) => readFileSync(join(baseDir, key)),
    objectExists: async (key) => existsSync(join(baseDir, key)),
    deleteObject: async () => undefined,
    getPublicUrl: () => '',
    getSignedUrl: async () => '',
  };
}

function countPdfPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/gu) ?? []).length;
}

interface GenerationRecord {
  status: string;
  document_sha256: string;
  document_object_key: string;
  failure_reason: string | null;
  attempts: number;
}

describeWithDb('PDF del contrato: Postgres real + Chromium real', () => {
  jest.setTimeout(120_000);
  const tenantId = randomUUID();
  const schemaName = 'tenant_contract_pdf_' + randomUUID().replace(/-/gu, '');
  const quote = (identifier: string) => '"' + identifier.replace(/"/gu, '""') + '"';
  const storageDir = mkdtempSync(join(tmpdir(), 'iwana-contract-pdf-'));
  let dataSource: DataSource;
  let processor: ContractPdfProcessor;

  beforeAll(async () => {
    if (process.env['DB_NAME'] !== 'test') {
      throw new Error(
        `[BLOCKED] Solo corre con DB_NAME=test (recibido "${process.env['DB_NAME']}").`,
      );
    }
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number(process.env['DB_PORT'] ?? 5432),
      // DDL de las migraciones tenant: rol migrador, como el aprovisionamiento.
      ...resolveMigrationDbCredentials(),
      database: 'test',
      entities: [],
      migrations: [],
      logging: false,
      extra: { max: 4, min: 1, application_name: schemaName },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Contrato PDF sintético', $2, $3, 'ACTIVE', 'contract-pdf@example.invalid')`,
      [tenantId, `contract-pdf-${tenantId.slice(0, 8)}`, schemaName],
    );
    await dataSource.query('CREATE SCHEMA ' + quote(schemaName));
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, 'contract-pdf');
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    processor = new ContractPdfProcessor(
      dataSource,
      diskStorage(storageDir),
      new ContractPdfRenderer(new ConfigService({})),
      new ConfigService({
        PII_ENCRYPTION_KEY: KEY,
        CONTRACT_TEMPLATES_DIR: resolve(__dirname, '../../test/fixtures/contracts'),
      }),
    );
  });

  afterAll(async () => {
    rmSync(storageDir, { recursive: true, force: true });
    if (!dataSource?.isInitialized) return;
    if (!/^tenant_contract_pdf_[a-f0-9]{32}$/u.test(schemaName))
      throw new Error('Schema inválido.');
    await dataSource.query('DROP SCHEMA IF EXISTS ' + quote(schemaName) + ' CASCADE');
    await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    await dataSource.destroy();
  });

  const scoped = (sql: string, params: unknown[]) =>
    dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL search_path TO ${quote(schemaName)}`);
      return manager.query(sql, params) as Promise<unknown>;
    });

  async function seedGeneration(): Promise<ContractPdfJobPayload> {
    const subscriberId = randomUUID();
    const contractId = randomUUID();
    const generationId = randomUUID();
    const actorId = randomUUID();
    const snapshot = buildContractSnapshotFixture({ contractId });
    await scoped(
      `INSERT INTO subscribers (
         id, tenant_id, party_id, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, email_encrypted,
         phone_encrypted, vat_treatment, tax_regime, vat_responsibility, rut_responsibilities,
         address, created_by
       ) VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', $4, 'Fixture', 'Contrato', 3, $4, $4,
         'STANDARD', 'SIMPLIFIED', 'NO_RESPONSABLE', ARRAY[]::text[], 'Dirección sintética', $5)`,
      [subscriberId, tenantId, randomUUID(), 'synthetic-cipher-' + subscriberId, actorId],
    );
    await scoped(
      `INSERT INTO contracts (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, alias)
       VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb, 'DRAFT', 'Servicio sintético')`,
      [contractId, tenantId, subscriberId],
    );
    await scoped(
      `INSERT INTO contract_document_generations
         (id, tenant_id, contract_id, status, template_legal_text_id, template_version,
          snapshot_encrypted, snapshot_sha256, requested_by)
       VALUES ($1, $2, $3, 'PENDING', $4, '1.0-prueba', $5, $6, $7)`,
      [
        generationId,
        tenantId,
        contractId,
        snapshot.template.legalTextId,
        encryptSnapshot(snapshot),
        createHash('sha256').update(contractId).digest('hex'),
        actorId,
      ],
    );
    return { tenantId, contractId, generationId };
  }

  const job = (data: ContractPdfJobPayload, attemptsMade = 0) =>
    ({
      name: CRM_CONTRACT_PDF_JOB_NAME,
      data,
      attemptsMade,
      opts: { attempts: 3 },
    }) as unknown as Job<ContractPdfJobPayload>;

  async function readGeneration(id: string): Promise<GenerationRecord> {
    const rows = (await dataSource.query(
      `SELECT status, document_sha256, document_object_key, failure_reason, attempts
         FROM ${quote(schemaName)}.contract_document_generations WHERE id = $1`,
      [id],
    )) as GenerationRecord[];
    return rows[0]!;
  }

  it('genera el PDF A4 con Chromium, lo guarda cifrado y registra la huella en READY', async () => {
    const payload = await seedGeneration();
    await processor.process(job(payload));

    const row = await readGeneration(payload.generationId);
    expect(row.status).toBe('READY');
    expect(row.failure_reason).toBeNull();
    expect(row.document_object_key).toBe(
      contractPdfObjectKey(schemaName, payload.contractId, payload.generationId),
    );

    const stored = readFileSync(join(storageDir, row.document_object_key));
    expect(stored.includes(Buffer.from('%PDF'))).toBe(false);
    const pdf = decryptObjectBuffer(stored, [Buffer.from(KEY, 'hex')]);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(countPdfPages(pdf)).toBe(6);
    const sha = row.document_sha256.trim();
    expect(createHash('sha256').update(pdf).digest('hex')).toBe(sha);

    const altered = Buffer.from(pdf);
    const middle = Math.floor(altered.length / 2);
    altered[middle] = altered[middle]! ^ 0x01;
    expect(createHash('sha256').update(altered).digest('hex')).not.toBe(sha);

    // Reintento duplicado del mismo trabajo: no regenera ni cambia la huella.
    await processor.process(job(payload));
    const again = await readGeneration(payload.generationId);
    expect(again.document_sha256).toBe(row.document_sha256);
    expect(again.attempts).toBe(1);
  });

  it('con la plantilla real del worker genera el PDF READY, sin módulos móviles ni claves sin resolver', async () => {
    const templatesDir = resolve(__dirname, '../templates/contracts');
    const realTemplate = readFileSync(join(templatesDir, CONTRACT_TEMPLATE_FILE), 'utf8');
    const filled = fillContractTemplate(realTemplate, buildContractSnapshotFixture());
    expect(filled).not.toMatch(/\{\{|<!--(?:IF|ENDIF):/u);
    expect(filled).not.toMatch(/servicios móviles|portación|roaming|Línea o número móvil/iu);
    expect(filled).toMatch(/font-family:\s*Calibri,\s*Carlito,/u);

    const real = new ContractPdfProcessor(
      dataSource,
      diskStorage(storageDir),
      new ContractPdfRenderer(new ConfigService({})),
      new ConfigService({ PII_ENCRYPTION_KEY: KEY, CONTRACT_TEMPLATES_DIR: templatesDir }),
    );
    const payload = await seedGeneration();
    await real.process(job(payload));

    const row = await readGeneration(payload.generationId);
    expect(row.status).toBe('READY');
    expect(row.failure_reason).toBeNull();
    const pdf = decryptObjectBuffer(readFileSync(join(storageDir, row.document_object_key)), [
      Buffer.from(KEY, 'hex'),
    ]);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(countPdfPages(pdf)).toBeGreaterThan(0);
    const sha = row.document_sha256.trim();
    expect(createHash('sha256').update(pdf).digest('hex')).toBe(sha);

    // Huella estable: el reintento del mismo trabajo no regenera ni cambia la huella.
    await real.process(job(payload));
    const again = await readGeneration(payload.generationId);
    expect(again.document_sha256).toBe(row.document_sha256);
    expect(again.attempts).toBe(1);
  });

  it('agotados los reintentos de un render imposible marca FAILED con RENDER_FAILED', async () => {
    const payload = await seedGeneration();
    const broken = new ContractPdfProcessor(
      dataSource,
      diskStorage(storageDir),
      new ContractPdfRenderer(new ConfigService({})),
      new ConfigService({ PII_ENCRYPTION_KEY: KEY, CONTRACT_TEMPLATES_DIR: storageDir }),
    );
    await expect(broken.process(job(payload, 2))).rejects.toThrow();
    const row = await readGeneration(payload.generationId);
    expect(row.status).toBe('FAILED');
    expect(row.failure_reason).toBe('RENDER_FAILED');
  });
});
