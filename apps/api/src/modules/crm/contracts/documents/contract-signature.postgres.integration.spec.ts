import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash, randomUUID } from 'node:crypto';
import { Job, Queue, Worker } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  AuditLog,
  MediaAsset,
  TenantContext,
  dataSourceOptions,
  runInTenantSchema,
} from '@iwana/db';
import { Contract } from '../entities/contract.entity';
import { ContractPermanenceRecord } from '../entities/contract-permanence.entity';
import { Subscriber } from '../../subscribers/entities/subscriber.entity';
import {
  CONTRACT_ACTIVATED_EVENT_TYPE,
  CRM_CONTRACT_EVENTS_QUEUE,
  CRM_CONTRACT_PDF_QUEUE,
  CRM_CONTRACT_SIGNED_PDF_JOB_NAME,
  ContractSignedPdfJobPayloadSchema,
  NetworkType,
  TenantStatus,
  VatConcept,
  VatLegalBasis,
  VatTreatment,
  contractSignatureObjectKeys,
  DocumentType,
  type ContractSignatureCommand,
} from '@iwana/shared';
import { decryptObjectBuffer, encryptObjectBuffer, type StoragePort } from '@iwana/storage';
import { AuditService } from '../../../audit/audit.service';
import { PlatformAuditService } from '../../../audit/platform-audit.service';
import { BillingDocumentsService } from '../../../billing/documents/billing-documents.service';
import { BillingGenerationService } from '../../../billing/generation/billing-generation.service';
import { ContractActivatedProcessor } from '../../../billing/generation/contract-activated.processor';
import { BillingPaymentsService } from '../../../billing/payments/billing-payments.service';
import { BillingContractReadAdapter } from '../billing-contract-read.adapter';
import { ContractActivationEventsPublisher } from '../contract-activation-events';
import { ContractPermanenceService } from '../contract-permanence.service';
import { ContractsService } from '../contracts.service';
import { ContractStatus } from '../../enums/contract-status.enum';
import { ContractDocumentGenerationService } from './contract-document-generation.service';
import { ContractSignatureService } from './contract-signature.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const redisAvailable = process.env['IWANA_REDIS_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = dataSourceOptions.database;
const safeDatabaseName =
  typeof databaseName === 'string' && /^(test|iwana_it_[a-z0-9_]+)$/u.test(databaseName);
const describeWithServices =
  dbAvailable && redisAvailable && safeDatabaseName ? describe : describe.skip;

const KEY_HEX = '4ef6bb844c9e858d2a93b5585599d419f79148fc24b5d9b0e03f5a53fa146d27';
const KEY = Buffer.from(KEY_HEX, 'hex');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('firma-integracion'),
]);

function redisConnection() {
  const host = process.env['REDIS_HOST'] ?? '127.0.0.1';
  const port = Number(process.env['REDIS_PORT'] ?? 6379);
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || !Number.isInteger(port)) {
    throw new Error('La firma integrada solo permite Redis loopback.');
  }
  return {
    host,
    port,
    password: process.env['REDIS_PASSWORD'],
    db: Number(process.env['REDIS_DB'] ?? 0),
    maxRetriesPerRequest: null,
  };
}

/**
 * Bloque D (ADR-109 D1/D2; CA-2, CA-4, CA-8, CA-12) contra PostgreSQL y Redis reales:
 * firma → ACTIVE con start_date = activación → outbox → cola → MOD14 genera un único cobro.
 * El re-render con Chromium lo cubre el worker; aquí un trabajador de BullMQ real hace de
 * worker (lee la firma cifrada de medios y guarda el PDF firmado).
 */
describeWithServices('Firma del contrato: PostgreSQL + Redis reales', () => {
  let dataSource: DataSource;
  let signature: ContractSignatureService;
  let contracts: ContractsService;
  let pdfQueue: Queue;
  let eventsQueue: Queue;
  let pdfWorker: Worker;
  let billingWorker: Worker;
  const billingOutcomes: unknown[] = [];
  const tenantId = randomUUID();
  const technician = randomUUID();
  const schemaName = 'tenant_contract_sign_' + randomUUID().replace(/-/g, '');
  const prefix = `crm-sign-${randomUUID().replace(/-/gu, '')}`;
  const quote = (identifier: string) => '"' + identifier.replace(/"/g, '""') + '"';
  const context = { tenantId, schemaName, tenantSlug: 'contract-sign-it' };
  const inContext = <T>(callback: () => Promise<T>) => TenantContext.run(context, callback);
  const orders = new Map<string, { subscriberId: string }>();
  const activations = new Map<string, Date>();
  const released: string[] = [];
  // Medios en memoria: LocalFsStorageAdapter arma rutas con '/' y no sirve en Windows.
  const objects = new Map<string, Buffer>();
  const storage = {
    putObject: async (key: string, body: Buffer) => void objects.set(key, Buffer.from(body)),
    getObject: async (key: string) => {
      const value = objects.get(key);
      if (!value) throw new Error('Objeto inexistente.');
      return value;
    },
  } as unknown as StoragePort;

  const rows = <T>(sql: string, params: unknown[] = []) =>
    runInTenantSchema(dataSource, schemaName, (qr) => qr.query(sql, params) as Promise<T[]>);

  async function fixture(activatedAt = new Date('2026-11-10T15:00:00.000Z')) {
    const subscriberId = randomUUID();
    const contractId = randomUUID();
    const orderId = randomUUID();
    const generationId = randomUUID();
    const unsigned = Buffer.from(`%PDF-1.7 contrato ${contractId}`);
    const unsignedSha = createHash('sha256').update(unsigned).digest('hex');
    const objectKey = `${schemaName}/contracts/${contractId}/${generationId}.pdf.enc`;
    await storage.putObject(objectKey, encryptObjectBuffer(unsigned, KEY), {
      contentType: 'application/octet-stream',
    });
    await rows(
      `INSERT INTO subscribers (
         id, tenant_id, person_type, customer_segment, document_type, nit, business_name,
         vat_treatment, tax_regime, vat_responsibility, rut_responsibilities, address,
         created_by
       ) VALUES ($1, $2, 'JURIDICA', 'PYME', 'NIT', '900000001', 'Adquirente de prueba',
         'STANDARD', 'COMMON', 'RESPONSABLE', ARRAY[]::text[], 'Dirección de prueba', $3)`,
      [subscriberId, tenantId, technician],
    );
    await rows(
      `INSERT INTO contracts (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status,
                              alias, service_usage, billing_cycle_day, fiscal_document)
       VALUES ($1, $2, $3, 'plan-1', $4::jsonb, 'DRAFT', 'Servicio sintético', 'NON_RESIDENTIAL',
               15, '900000001')`,
      [
        contractId,
        tenantId,
        subscriberId,
        JSON.stringify({ id: 'plan-1', name: 'Plan hogar', monthlyPrice: '30000.00' }),
      ],
    );
    await rows(
      `INSERT INTO contract_document_generations
         (id, tenant_id, contract_id, execution_order_id, status, template_legal_text_id,
          template_version, snapshot_encrypted, snapshot_sha256, document_object_key,
          document_sha256, requested_by, completed_at)
       VALUES ($1, $2, $3, $4, 'READY', $5, '1.0', 'cifrado', $6, $7, $8, $9, now())`,
      [
        generationId,
        tenantId,
        contractId,
        orderId,
        randomUUID(),
        'e'.repeat(64),
        objectKey,
        unsignedSha,
        technician,
      ],
    );
    orders.set(orderId, { subscriberId });
    activations.set(contractId, activatedAt);
    return { subscriberId, contractId, orderId, generationId, unsignedSha };
  }

  function command(
    f: Awaited<ReturnType<typeof fixture>>,
    overrides: object = {},
  ): ContractSignatureCommand {
    return {
      idempotencyKey: randomUUID(),
      generationId: f.generationId,
      documentSha256: f.unsignedSha,
      executionOrderId: f.orderId,
      signatureImage: `data:image/png;base64,${PNG.toString('base64')}`,
      signer: {
        fullName: 'Representante Sintético',
        documentType: DocumentType.CC,
        documentNumber: '1000000001',
      },
      location: { latitude: 4.711, longitude: -74.072 },
      device: { userAgent: 'jest-integration', platform: null },
      ...overrides,
    };
  }

  async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 30_000) {
    const started = Date.now();
    while (!(await predicate())) {
      if (Date.now() - started > timeoutMs) throw new Error('Tiempo de espera agotado.');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [Contract, Subscriber, ContractPermanenceRecord, AuditLog, MediaAsset],
      migrations: [],
      logging: false,
      extra: { max: 10, min: 1, application_name: schemaName },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Contract sign synthetic', $2, $3, 'ACTIVE', 'contract-sign@example.invalid')`,
      [tenantId, `contract-sign-${tenantId.slice(0, 8)}`, schemaName],
    );
    await dataSource.query('CREATE SCHEMA ' + quote(schemaName));
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, context.tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const config = new ConfigService({
      NODE_ENV: 'test',
      PII_ENCRYPTION_KEY: KEY_HEX,
      MFA_ENCRYPTION_KEY: KEY_HEX,
    });
    const audit = new AuditService(dataSource, {
      log: jest.fn(),
    } as unknown as PlatformAuditService);
    const tenantSettings = { getTimezone: jest.fn(async () => 'America/Bogota') };
    contracts = new ContractsService(
      dataSource,
      {
        getPlanById: jest.fn(async () => ({
          id: 'plan-1',
          vatConcept: VatConcept.INTERNET_ACCESS,
          networkType: NetworkType.FIXED,
        })),
      } as never,
      {
        resolve: jest.fn(() => ({
          status: 'RESOLVED',
          treatment: VatTreatment.EXEMPT,
          legalBasis: VatLegalBasis.ET_481_H,
          ratePercent: 0,
          requiresAccountantReview: false,
        })),
      } as never,
      audit,
      {} as never,
      config,
      {} as never,
      {} as never,
      undefined,
      { activeMarks: jest.fn(async () => ({})) } as never,
      tenantSettings as never,
    );
    const permanence = new ContractPermanenceService(
      dataSource,
      { getOffer: jest.fn(async () => null) } as never,
      audit,
    );
    const generation = new ContractDocumentGenerationService(
      dataSource,
      { add: jest.fn() } as never,
      contracts,
      {} as never,
      permanence,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        getExecutionSnapshot: jest.fn(async (id: string) => {
          const order = orders.get(id);
          return order
            ? {
                isAnnulled: false,
                subscriberId: order.subscriberId,
                assignedTechnicianId: technician,
              }
            : null;
        }),
      } as never,
      { getEffectivePermissionsForUser: jest.fn(async () => []) } as never,
      audit,
      config,
    );

    pdfQueue = new Queue(CRM_CONTRACT_PDF_QUEUE, { connection: redisConnection(), prefix });
    eventsQueue = new Queue(CRM_CONTRACT_EVENTS_QUEUE, { connection: redisConnection(), prefix });
    // Trabajador del PDF firmado: mismo contrato de cola que el worker real.
    pdfWorker = new Worker(
      CRM_CONTRACT_PDF_QUEUE,
      async (job: Job<unknown>) => {
        if (job.name !== CRM_CONTRACT_SIGNED_PDF_JOB_NAME) throw new Error('job inesperado');
        const payload = ContractSignedPdfJobPayloadSchema.parse(job.data);
        const keys = contractSignatureObjectKeys(
          schemaName,
          payload.contractId,
          payload.generationId,
          payload.signingKey,
        );
        const png = decryptObjectBuffer(await storage.getObject(keys.signatureImage), [KEY]);
        const signed = Buffer.concat([Buffer.from('%PDF-1.7 firmado '), png]);
        await storage.putObject(keys.signedDocument, encryptObjectBuffer(signed, KEY), {
          contentType: 'application/octet-stream',
        });
        return {
          signedDocumentSha256: createHash('sha256').update(signed).digest('hex'),
          bytes: signed.length,
        };
      },
      { connection: redisConnection(), prefix },
    );

    const settingsPriority = {
      getSnapshot: jest.fn(async () => ({
        timezone: 'America/Bogota',
        mfaRequiredAll: false,
        brandingCustomized: false,
      })),
    };
    const contractRead = new BillingContractReadAdapter(
      dataSource,
      config,
      settingsPriority as never,
    );
    const privacyMarks = { activeMarks: jest.fn(async () => ({})) };
    const billingDocuments = new BillingDocumentsService(
      dataSource,
      audit,
      contractRead,
      {
        getIssuerIdentity: jest.fn(async () => ({
          legalName: 'Operador de prueba',
          nit: '900123456',
          verificationDigit: '7',
        })),
      } as never,
      config,
      { getEffectivePermissionsForUser: jest.fn(async () => []) } as never,
      settingsPriority as never,
      privacyMarks as never,
      new BillingPaymentsService(
        dataSource,
        contractRead,
        audit,
        new EventEmitter2(),
        privacyMarks as never,
        settingsPriority as never,
      ),
    );
    const processor = new ContractActivatedProcessor(
      {
        findTenantLifecycleById: jest.fn(async (id: string) =>
          id === tenantId
            ? {
                id,
                schemaName,
                slug: context.tenantSlug,
                status: TenantStatus.ACTIVE,
                deletedAt: null,
              }
            : null,
        ),
      } as never,
      settingsPriority as never,
      new BillingGenerationService(
        dataSource,
        contractRead,
        settingsPriority as never,
        billingDocuments,
        audit,
        privacyMarks as never,
      ),
    );
    billingWorker = new Worker(
      CRM_CONTRACT_EVENTS_QUEUE,
      async (job: Job<unknown>) => processor.process(job),
      { connection: redisConnection(), prefix },
    );
    billingWorker.on('completed', (_job, result) => billingOutcomes.push(result));

    signature = new ContractSignatureService(
      dataSource,
      pdfQueue,
      storage,
      contracts,
      generation,
      permanence,
      new ContractActivationEventsPublisher(dataSource, eventsQueue),
      {
        getProvisioningActivatedAt: jest.fn(async (id: string) => activations.get(id) ?? null),
        listUnsignedBlockedProvisioningIds: jest.fn(async (id: string) => [`sp-${id}`]),
      } as never,
      { record: jest.fn(async (id: string) => void released.push(id)) } as never,
      tenantSettings as never,
      audit,
      config,
    );
  }, 180_000);

  afterAll(async () => {
    await signature?.onModuleDestroy();
    await pdfWorker?.close();
    await billingWorker?.close();
    for (const queue of [pdfQueue, eventsQueue]) {
      if (!queue) continue;
      await queue.obliterate({ force: true });
      await queue.close();
    }
    if (dataSource?.isInitialized) {
      if (!/^tenant_contract_sign_[a-f0-9]{32}$/.test(schemaName))
        throw new Error('Schema inválido.');
      await dataSource.query('DROP SCHEMA IF EXISTS ' + quote(schemaName) + ' CASCADE');
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await dataSource.destroy();
    }
  });

  it('CA-2: firma → ACTIVE con la fecha de activación, un evento y un único cobro; la repetición es idempotente', async () => {
    const f = await fixture();
    const input = command(f);

    const first = await inContext(() =>
      signature.sign(f.contractId, input, { sub: technician } as never),
    );
    expect(first).toMatchObject({
      status: 'ACTIVE',
      billingStartDate: '2026-11-10',
      replayed: false,
    });

    const [contract] = await rows<{ status: string; start_date: string }>(
      'SELECT status, start_date::text FROM contracts WHERE id = $1',
      [f.contractId],
    );
    expect(contract).toEqual({ status: ContractStatus.ACTIVE, start_date: '2026-11-10' });
    const [stored] = await rows<{
      signer_encrypted: string;
      signed_document_sha256: string;
      location_latitude: string;
    }>(
      'SELECT signer_encrypted, signed_document_sha256, location_latitude::text FROM contract_signatures WHERE contract_id = $1',
      [f.contractId],
    );
    expect(stored?.signer_encrypted).not.toContain('1000000001');
    expect(stored?.signed_document_sha256).toBe(first.signedDocumentSha256);
    expect(stored?.location_latitude).toBe('4.711');

    await waitFor(async () => {
      const docs = await rows<{ count: number }>(
        'SELECT count(*)::int AS count FROM billing_documents WHERE contract_id = $1',
        [f.contractId],
      );
      return docs[0]?.count === 1;
    });
    const events = await rows<{ source: string; published_at: Date | null }>(
      'SELECT source, published_at FROM contract_activation_events WHERE contract_id = $1',
      [f.contractId],
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.source).toBe('SIGNATURE');
    expect(events[0]?.published_at).not.toBeNull();

    const replay = await inContext(() =>
      signature.sign(f.contractId, input, { sub: technician } as never),
    );
    expect(replay).toMatchObject({
      replayed: true,
      signedDocumentSha256: first.signedDocumentSha256,
    });
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(
      await rows('SELECT 1 FROM contract_activation_events WHERE contract_id = $1', [f.contractId]),
    ).toHaveLength(1);
    expect(
      await rows<{ count: number }>(
        'SELECT count(*)::int AS count FROM billing_documents WHERE contract_id = $1',
        [f.contractId],
      ),
    ).toEqual([{ count: 1 }]);
    expect(billingOutcomes).toContain('generated');
    expect(released).toContain(`sp-${f.contractId}`);

    // Una segunda firma con otra clave ya no activa: 409.
    await expect(
      inContext(() => signature.sign(f.contractId, command(f), { sub: technician } as never)),
    ).rejects.toThrow(ConflictException);
  }, 90_000);

  it('CA-4: huella distinta a la generada se rechaza y un PDF firmado alterado falla la verificación', async () => {
    const f = await fixture();
    await expect(
      inContext(() =>
        signature.sign(f.contractId, command(f, { documentSha256: 'a'.repeat(64) }), {
          sub: technician,
        } as never),
      ),
    ).rejects.toMatchObject({ response: { code: 'CONTRACT_DOCUMENT_HASH_MISMATCH' } });
    const [draft] = await rows<{ status: string }>('SELECT status FROM contracts WHERE id = $1', [
      f.contractId,
    ]);
    expect(draft?.status).toBe(ContractStatus.DRAFT);

    await inContext(() => signature.sign(f.contractId, command(f), { sub: technician } as never));
    const verified = await inContext(() => signature.readSignedDocument(f.contractId));
    expect(verified.includes(PNG)).toBe(true);
    const [row] = await rows<{ signed_document_object_key: string }>(
      'SELECT signed_document_object_key FROM contract_signatures WHERE contract_id = $1',
      [f.contractId],
    );
    await storage.putObject(
      row!.signed_document_object_key,
      encryptObjectBuffer(Buffer.from('%PDF-1.7 alterado'), KEY),
      { contentType: 'application/octet-stream' },
    );
    await expect(inContext(() => signature.readSignedDocument(f.contractId))).rejects.toMatchObject(
      {
        response: { code: 'CONTRACT_DOCUMENT_INTEGRITY_FAILED' },
      },
    );
  }, 90_000);

  it('CA-12: el técnico ve el PDF durante la firma, auditado, y después recibe 403', async () => {
    const f = await fixture();
    const actor = { sub: technician } as never;
    const pdf = await inContext(() =>
      signature.viewForSigning(f.contractId, f.generationId, f.orderId, actor),
    );
    expect(pdf.toString()).toContain(f.contractId);
    const audits = await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.manager.find(AuditLog, { where: { entityId: f.generationId } }),
    );
    expect(audits.map((entry) => entry.action)).toContain('RECORD_ACCESS');

    await inContext(() => signature.sign(f.contractId, command(f), actor));
    await expect(
      inContext(() => signature.viewForSigning(f.contractId, f.generationId, f.orderId, actor)),
    ).rejects.toThrow(ForbiddenException);
  }, 90_000);

  it('CA-8: activación manual desde DRAFT emite MANUAL una vez; SUSPENDED → ACTIVE no emite', async () => {
    const f = await fixture();
    await inContext(() =>
      contracts.activateManual(f.contractId, technician, { reason: 'Firma en papel archivada' }),
    );
    await expect(
      inContext(() =>
        contracts.activateManual(f.contractId, technician, { reason: 'Firma en papel archivada' }),
      ),
    ).rejects.toMatchObject({ response: { code: 'CONTRACT_NOT_DRAFT' } });
    await rows(`UPDATE contracts SET status = 'SUSPENDED' WHERE id = $1`, [f.contractId]);
    await inContext(() => contracts.activate(f.contractId, technician));
    const events = await rows<{ source: string }>(
      'SELECT source FROM contract_activation_events WHERE contract_id = $1',
      [f.contractId],
    );
    expect(events).toEqual([{ source: 'MANUAL' }]);
    const audits = await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.manager.find(AuditLog, { where: { entityId: f.contractId } }),
    );
    expect(JSON.stringify(audits.map((entry) => entry.newValue))).toContain(
      'Firma en papel archivada',
    );
  }, 90_000);
});
