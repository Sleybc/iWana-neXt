import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Job, Queue, Worker } from 'bullmq';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  CONTRACT_ACTIVATED_EVENT_TYPE,
  TenantStatus,
  type ContractActivatedEnvelope,
} from '@iwana/shared';
import { createBillingSchema } from '../billing-postgres.fixture';
import { dropBillingTenantFixture } from '../../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import type { BillableContract } from '../ports/billing-contract-read.port';
import { BillingPaymentsService } from '../payments/billing-payments.service';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import { BillingGenerationService } from './billing-generation.service';
import { CRM_CONTRACT_EVENTS_QUEUE } from './billing-generation.constants';
import { ContractActivatedProcessor } from './contract-activated.processor';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const redisAvailable = process.env['IWANA_REDIS_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = dataSourceOptions.database;
const safeDatabaseName =
  typeof databaseName === 'string' && /^(test|iwana_it_[a-z0-9_]+)$/u.test(databaseName);
const describeWithServices =
  dbAvailable && redisAvailable && safeDatabaseName ? describe : describe.skip;

function redisConnection() {
  const host = process.env['REDIS_HOST'] ?? '127.0.0.1';
  const port = Number(process.env['REDIS_PORT'] ?? 6379);
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || !Number.isInteger(port)) {
    throw new Error('El primer cobro solo permite Redis loopback en fixtures integradas.');
  }
  return {
    host,
    port,
    password: process.env['REDIS_PASSWORD'],
    db: Number(process.env['REDIS_DB'] ?? 0),
    maxRetriesPerRequest: null,
  };
}

describeWithServices(
  'MOD14 E: primer cobro por crm.contract.activated — PostgreSQL + Redis reales',
  () => {
    let dataSource: DataSource;
    let billingFixture: Awaited<ReturnType<typeof createBillingSchema>> | undefined;
    let tenantId: string;
    let schemaName: string;
    let generation: BillingGenerationService;
    let processor: ContractActivatedProcessor;
    let queue: Queue;
    let worker: Worker;
    let prefix: string;
    const contracts: BillableContract[] = [];
    const outcomes = new Map<string, unknown>();
    const failures = new Map<string, Error>();
    const piiKey = '4ef6bb844c9e858d2a93b5585599d419f79148fc24b5d9b0e03f5a53fa146d27';

    const tenantContext = () => ({ tenantId, schemaName, tenantSlug: 'billing-first-charge-it' });

    async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return runInTenantSchema(
        dataSource,
        schemaName,
        (qr) => qr.query(sql, params) as Promise<T[]>,
      );
    }

    async function seedContract(billingStartDate: string): Promise<BillableContract> {
      const contract: BillableContract = {
        contractId: randomUUID(),
        subscriberId: randomUUID(),
        partyId: null,
        status: 'ACTIVE',
        statusReasonCode: null,
        terminatedAt: null,
        cycleDay: 5,
        cutoffDay: 20,
        activatedAt: billingStartDate,
        endDate: null,
        planName: 'Plan hogar',
        monthlyPrice: '30000.00',
        vatSnapshot: {
          treatment: 'STANDARD',
          legalBasis: 'ET-468',
          ratePercent: 19,
          requiresAccountantReview: false,
          resolvedAt: '2026-11-01T00:00:00.000Z',
        },
        unbilledAdditionalCount: 0,
        buyer: {
          displayName: 'Adquirente de prueba',
          documentType: 'NIT',
          documentNumber: '900000001',
          hasDocumentNumber: true,
          address: 'Dirección de prueba',
          rutResponsibilities: [],
        },
      };
      await rows(
        `INSERT INTO subscribers (id, tenant_id, person_type, document_type, business_name)
         VALUES ($1,$2,'JURIDICA','NIT','Adquirente de prueba')`,
        [contract.subscriberId, tenantId],
      );
      await rows(
        `INSERT INTO contracts (id, tenant_id, subscriber_id, status, billing_cycle_day, start_date,
                                plan_snapshot_json, vat_snapshot, fiscal_document)
         VALUES ($1,$2,$3,'ACTIVE',5,$4,$5::jsonb,$6::jsonb,'900000001')`,
        [
          contract.contractId,
          tenantId,
          contract.subscriberId,
          billingStartDate,
          JSON.stringify({ name: contract.planName, monthlyPrice: contract.monthlyPrice }),
          JSON.stringify(contract.vatSnapshot),
        ],
      );
      contracts.push(contract);
      return contract;
    }

    function envelope(
      contract: BillableContract,
      billingStartDate: string,
      eventId = randomUUID(),
    ): ContractActivatedEnvelope {
      return {
        eventId,
        eventType: CONTRACT_ACTIVATED_EVENT_TYPE,
        tenantId,
        aggregateId: contract.contractId,
        occurredAt: new Date().toISOString(),
        payload: {
          tenantId,
          contractId: contract.contractId,
          subscriberId: contract.subscriberId,
          activatedAt: `${billingStartDate}T15:00:00.000Z`,
          billingStartDate,
          source: 'SIGNATURE',
        },
      };
    }

    async function publishAndWait(jobs: Array<{ name: string; data: unknown }>): Promise<string[]> {
      const ids = jobs.map(() => randomUUID());
      const settled = new Promise<void>((resolve) => {
        const check = () => {
          if (ids.every((id) => outcomes.has(id) || failures.has(id))) resolve();
        };
        worker.on('completed', check);
        worker.on('failed', check);
      });
      await Promise.all(
        jobs.map((job, index) =>
          queue.add(job.name, job.data, { jobId: ids[index]!, attempts: 1 }),
        ),
      );
      await settled;
      return ids;
    }

    beforeAll(async () => {
      dataSource = new DataSource({
        ...dataSourceOptions,
        entities: [],
        migrations: [],
        logging: false,
        extra: { ...dataSourceOptions.extra, max: 10, min: 1 },
      });
      await dataSource.initialize();
      billingFixture = await createBillingSchema(dataSource);
      schemaName = billingFixture.schemaName;
      tenantId = billingFixture.tenantId;
      // Política sembrada por la 173: ANTICIPADO, SEPARADO, BORRADOR y lote apagado.
      expect(
        await rows<{ automatic_generation: boolean }>(
          'SELECT automatic_generation FROM billing_policy WHERE tenant_id = $1',
          [tenantId],
        ),
      ).toEqual([{ automatic_generation: false }]);

      const contractRead = {
        findBillableForDate: jest.fn(async () => []),
        findByContractId: jest.fn(
          async (id: string) => contracts.find(({ contractId }) => contractId === id) ?? null,
        ),
        findBillingCycleByContractId: jest.fn(async () => ({ cycleDay: 5, cutoffDay: 20 })),
        findTitularRefs: jest.fn(async () => []),
        lockTitularForBillingWrite: jest
          .fn()
          .mockResolvedValue({ exists: true, anonymized: false, partyId: null }),
      };
      const tenantSettings = {
        getSnapshot: jest.fn(async () => ({
          timezone: 'America/Bogota',
          mfaRequiredAll: false,
          brandingCustomized: false,
        })),
      };
      const audit = { logWithin: jest.fn(async () => undefined) };
      const privacyMarks = { activeMarks: jest.fn(async () => ({})) };
      const issuer = {
        getIssuerIdentity: jest.fn(async () => ({
          legalName: 'Operador de prueba',
          nit: '900123456',
          verificationDigit: '7',
        })),
      };
      const config = new ConfigService({
        NODE_ENV: 'test',
        MFA_ENCRYPTION_KEY: piiKey,
        PII_ENCRYPTION_KEY: piiKey,
      });
      const documents = new BillingDocumentsService(
        dataSource,
        audit as never,
        contractRead as never,
        issuer as never,
        config,
        { getEffectivePermissionsForUser: jest.fn(async () => []) } as never,
        tenantSettings as never,
        privacyMarks as never,
        new BillingPaymentsService(
          dataSource,
          contractRead as never,
          audit as never,
          new EventEmitter2(),
          privacyMarks as never,
          tenantSettings as never,
        ),
      );
      generation = new BillingGenerationService(
        dataSource,
        contractRead as never,
        tenantSettings as never,
        documents,
        audit as never,
        privacyMarks as never,
      );
      const tenants = {
        findTenantLifecycleById: jest.fn(async (id: string) =>
          id === tenantId
            ? {
                id: tenantId,
                schemaName,
                slug: 'billing-first-charge-it',
                status: TenantStatus.ACTIVE,
                deletedAt: null,
              }
            : null,
        ),
      };
      processor = new ContractActivatedProcessor(
        tenants as never,
        tenantSettings as never,
        generation,
      );

      prefix = `mod14-e-${randomUUID().replace(/-/gu, '')}`;
      queue = new Queue(CRM_CONTRACT_EVENTS_QUEUE, { connection: redisConnection(), prefix });
      worker = new Worker(
        CRM_CONTRACT_EVENTS_QUEUE,
        async (job: Job<unknown>) => processor.process(job),
        { connection: redisConnection(), prefix, concurrency: 2 },
      );
      worker.on('completed', (job, result) => outcomes.set(job.id ?? '', result));
      worker.on('failed', (job, error) => failures.set(job?.id ?? '', error));
    });

    afterAll(async () => {
      await worker?.close();
      if (queue) {
        await queue.obliterate({ force: true });
        await queue.close();
      }
      if (dataSource?.isInitialized) await dropBillingTenantFixture(dataSource, billingFixture);
    });

    it('CA-3: genera de inmediato un único borrador con lote apagado aunque el evento se repita', async () => {
      const contract = await seedContract('2026-11-11');
      const event = envelope(contract, '2026-11-11');
      const ids = await publishAndWait([
        { name: CONTRACT_ACTIVATED_EVENT_TYPE, data: event },
        { name: CONTRACT_ACTIVATED_EVENT_TYPE, data: event },
        { name: CONTRACT_ACTIVATED_EVENT_TYPE, data: event },
      ]);

      expect(ids.map((id) => failures.get(id))).toEqual([undefined, undefined, undefined]);
      expect(ids.map((id) => outcomes.get(id)).sort()).toEqual([
        'existing',
        'existing',
        'generated',
      ]);
      const periods = await rows<{ period_start: string; covered_start: string }>(
        `SELECT period_start::text, covered_start::text FROM billing_periods
          WHERE tenant_id = $1 AND contract_id = $2`,
        [tenantId, contract.contractId],
      );
      expect(periods).toEqual([{ period_start: '2026-11-05', covered_start: '2026-11-11' }]);
      const documents = await rows<{ status: string; kind: string; base_amount: string }>(
        `SELECT d.status, l.kind, l.base_amount
           FROM billing_documents d JOIN billing_document_lines l ON l.document_id = d.id
          WHERE d.tenant_id = $1 AND d.contract_id = $2`,
        [tenantId, contract.contractId],
      );
      // 24 de 30 días (11-nov a 4-dic) de 30.000 en DIAS_REALES.
      expect(documents).toEqual([
        { status: 'BORRADOR', kind: 'PRORRATEO', base_amount: '24000.00' },
      ]);

      // Redelivery posterior del mismo evento: sigue sin duplicar.
      const [again] = await publishAndWait([{ name: CONTRACT_ACTIVATED_EVENT_TYPE, data: event }]);
      expect(outcomes.get(again!)).toBe('existing');
      expect(
        await rows<{ count: number }>(
          'SELECT count(*)::int AS count FROM billing_documents WHERE tenant_id = $1 AND contract_id = $2',
          [tenantId, contract.contractId],
        ),
      ).toEqual([{ count: 1 }]);
    }, 60_000);

    it('respeta JUNTO_AL_SIGUIENTE: el tramo inicial sale ya junto al periodo siguiente', async () => {
      const contract = await seedContract('2026-11-11');
      await rows(
        `INSERT INTO billing_contract_policy (contract_id, tenant_id, first_period_mode)
         VALUES ($1,$2,'JUNTO_AL_SIGUIENTE')`,
        [contract.contractId, tenantId],
      );
      const [id] = await publishAndWait([
        { name: CONTRACT_ACTIVATED_EVENT_TYPE, data: envelope(contract, '2026-11-11') },
      ]);

      expect(failures.get(id!)).toBeUndefined();
      expect(outcomes.get(id!)).toBe('generated');
      expect(
        await rows<{ period_start: string; covered_start: string }>(
          `SELECT period_start::text, covered_start::text FROM billing_periods
            WHERE tenant_id = $1 AND contract_id = $2`,
          [tenantId, contract.contractId],
        ),
      ).toEqual([{ period_start: '2026-12-05', covered_start: '2026-11-11' }]);
    }, 60_000);

    it('no duplica si el contrato ya tenía un periodo por generación manual previa', async () => {
      const contract = await seedContract('2026-11-11');
      const manual = await TenantContext.run(tenantContext(), () =>
        generation.generate({ date: '2026-11-11', contractId: contract.contractId }),
      );
      expect(manual.generated).toBe(1);

      const [id] = await publishAndWait([
        { name: CONTRACT_ACTIVATED_EVENT_TYPE, data: envelope(contract, '2026-11-11') },
      ]);
      expect(outcomes.get(id!)).toBe('existing');
      expect(
        await rows<{ count: number }>(
          'SELECT count(*)::int AS count FROM billing_periods WHERE tenant_id = $1 AND contract_id = $2',
          [tenantId, contract.contractId],
        ),
      ).toEqual([{ count: 1 }]);
    }, 60_000);

    it('rechaza sin reintento un envelope inválido o de un tenant inexistente y no escribe', async () => {
      const contract = await seedContract('2026-11-11');
      const valid = envelope(contract, '2026-11-11');
      const before = await rows<{ count: number }>(
        'SELECT count(*)::int AS count FROM billing_periods WHERE tenant_id = $1',
        [tenantId],
      );
      const foreignTenant = randomUUID();
      const ids = await publishAndWait([
        { name: CONTRACT_ACTIVATED_EVENT_TYPE, data: { ...valid, aggregateId: randomUUID() } },
        {
          name: CONTRACT_ACTIVATED_EVENT_TYPE,
          data: {
            ...valid,
            tenantId: foreignTenant,
            payload: { ...valid.payload, tenantId: foreignTenant },
          },
        },
        { name: 'otro.evento', data: valid },
      ]);

      for (const id of ids) {
        expect(failures.get(id)?.name).toBe('UnrecoverableError');
        expect((await queue.getJob(id))?.attemptsMade).toBe(1);
      }
      expect(
        await rows<{ count: number }>(
          'SELECT count(*)::int AS count FROM billing_periods WHERE tenant_id = $1',
          [tenantId],
        ),
      ).toEqual(before);
    }, 60_000);
  },
);
