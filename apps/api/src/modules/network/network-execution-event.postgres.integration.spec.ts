import { randomUUID, createHmac } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Job, Queue, Worker } from 'bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import {
  AuditLog,
  dataSourceOptions,
  IpAssignment,
  Ipv4Network,
  NetworkInboxEvent,
  NetworkPlanProfile,
  NetworkRouter,
  NetworkSetting,
  runInTenantSchema,
  ServiceProvisioning,
  TenantContext,
} from '@iwana/db';
import {
  canonicalizeNetworkExecutionEvent,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  ExpedienteStatus,
  RegularizeProvisioningBodySchema,
  SubscriberStatus,
  UserRole,
  WfmWorkType,
  type NetworkExecutionEvent,
} from '@iwana/shared';
import { CreateNetworkCatalog1600000000000 } from '../../../../../packages/database/src/migrations/tenant/160_network_catalog';
import { CreateNetworkProvisioning1610000000000 } from '../../../../../packages/database/src/migrations/tenant/161_network_provisioning';
import { EnableBtreeGist1784419216000 } from '../../../../../packages/database/src/migrations/public/028_enable_btree_gist';
import type { ExecutionSnapshot } from '../tasks/ports/execution-order-read.port';
import { AuditService } from '../audit/audit.service';
import { ExpedienteService } from '../crm/expedientes/expediente.service';
import { SubscribersService } from '../crm/subscribers/subscribers.service';
import {
  ServiceProvisioningCommercialStatusPort,
  SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT,
} from '../crm/ports/service-provisioning-commercial-status.port';
import { ServiceProvisioningActivationListener } from '../crm/subscribers/listeners/service-provisioning-activation.listener';
import { SubscriberActivationListener } from '../crm/subscribers/listeners/subscriber-activation.listener';
import { ServiceProvisioningInventoryActivationListener } from '../inventory/listeners/service-provisioning-activation.listener';
import { ExpedienteActivatedEvent } from '../crm/expedientes/events/expediente-pipeline.events';
import { ServiceProvisioningCommercialStatusAdapter } from './adapters/service-provisioning-commercial-status.adapter';
import { NetworkExecutionEventProcessor } from './network-execution-event.processor';
import {
  NetworkProvisioningReconcilerProcessor,
  NETWORK_PROVISIONING_RECONCILE_JOB,
  NETWORK_PROVISIONING_RECONCILE_QUEUE,
} from './network-provisioning-reconciler.processor';
import { IpamService } from './ipam.service';
import { ManualRouterProvisioningAdapter } from './adapters/manual-router-provisioning.adapter';
import { NetworkActorReadPort } from './ports/network-actor-read.port';
import { ServiceProvisioningService } from './service-provisioning.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const redisAvailable = process.env['IWANA_REDIS_INTEGRATION_AVAILABLE'] === 'true';
const describeWithServices = dbAvailable && redisAvailable ? describe : describe.skip;
const allowedDatabase = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
if (dbAvailable && !allowedDatabase.test(process.env['DB_NAME'] ?? 'dbiw')) {
  throw new Error('MOD13 B3 solo permite fixtures sintéticas en dbiw, test o iwana_it_*');
}
const tenantId = randomUUID();
const schemaName = `tenant_mod13_b3_${randomUUID().replaceAll('-', '')}`;
const tenantSlug = `mod13-b3-${randomUUID().slice(0, 8)}`;
const routerId = randomUUID();
const networkId = randomUUID();
const actorId = randomUUID();
const technicianId = randomUUID();
const subscriberId = randomUUID();
const contractId = randomUUID();
const expedienteId = randomUUID();
const cpeSerialNumber = `CPE-${randomUUID().slice(0, 8)}`;
const executionOrderId = randomUUID();
const provisioningId = randomUUID();
const eventId = randomUUID();
const signingKey = Buffer.alloc(32, 17).toString('base64');
const tenantContext = { tenantId, schemaName, tenantSlug };
const expedienteService = { transitionStatus: jest.fn() };
const subscribersService = {
  findByExpedienteId: jest.fn(),
  activateFromExpediente: jest.fn(),
};
let subscriberIsActive = false;

const snapshot = (overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot => ({
  id: executionOrderId,
  executionOrderNumber: 'OTE-MOD13-B3-0001',
  status: ExecutionOrderStatus.COMPLETED,
  workType: WfmWorkType.INSTALLATION,
  isAnnulled: false,
  subscriberId,
  assignedTechnicianId: technicianId,
  customerDisplayLabel: 'Fixture de integración',
  closedAt: new Date().toISOString(),
  result: ExecutionOrderResult.EXECUTED,
  ...overrides,
});

function redisConnection() {
  const host = process.env['REDIS_HOST'] ?? '127.0.0.1';
  const port = Number(process.env['REDIS_PORT'] ?? 6379);
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || !Number.isInteger(port)) {
    throw new Error('MOD13 B3 solo permite Redis loopback para fixtures integradas.');
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
  'MOD13 B3: eventos, inbox y reconciliación — PostgreSQL + Redis reales',
  () => {
    let dataSource: DataSource;
    let eventModule: TestingModule;
    let eventEmitter: EventEmitter2;
    let networkQueue: Queue;
    let reconcileQueue: Queue;
    let networkQueuePrefix: string;
    let auditService: AuditService;
    let crmStatusWriteCount = 0;
    let failNextCrmStatusWrite = false;
    let commercialStatusDelegate: ServiceProvisioningCommercialStatusPort;
    const commercialStatusPort: ServiceProvisioningCommercialStatusPort = {
      record: async (id, status, detail) => {
        crmStatusWriteCount += 1;
        if (failNextCrmStatusWrite) {
          failNextCrmStatusWrite = false;
          throw new Error('Fallo CRM sintético para validar el reintento.');
        }
        await commercialStatusDelegate.record(id, status, detail);
      },
    };

    async function clearTenantRows(): Promise<void> {
      await TenantContext.run(tenantContext, () =>
        runInTenantSchema(dataSource, schemaName, async (qr) => {
          await qr.query(
            'UPDATE service_provisionings SET ip_assignment_id = NULL WHERE tenant_id = $1',
            [tenantId],
          );
          await qr.query('DELETE FROM network_inbox_events WHERE tenant_id = $1', [tenantId]);
          await qr.query('DELETE FROM ip_assignments WHERE tenant_id = $1', [tenantId]);
          await qr.query('DELETE FROM service_provisionings WHERE tenant_id = $1', [tenantId]);
          await qr.query('DELETE FROM audit_logs WHERE tenant_id = $1', [tenantId]);
        }),
      );
    }

    async function insertCertifiedService(
      serviceExpedienteId: string | null = null,
    ): Promise<void> {
      await TenantContext.run(tenantContext, () =>
        runInTenantSchema(dataSource, schemaName, async (qr) => {
          await qr.query(
            `INSERT INTO service_provisionings (
             id, tenant_id, subscriber_id, execution_order_id, execution_order_number, expediente_id,
             router_id, ipv4_network_id, contract_id, cpe_serial_number,
             control_method, control_params, status,
             reserved_by, reserved_at, certified_by, certified_at, certification_evidence_id,
             commercial_activation_status, version
           ) VALUES (
             $1, $2, $3, $4, 'OTE-MOD13-B3-0001', $5, $6, $7, $8, $9, 'PCQ_ADDRESS_LIST',
             '{"method":"PCQ_ADDRESS_LIST","addressList":"subscribers"}'::jsonb,
             'CERTIFIED', $10, NOW(), $10, NOW(), $11, 'NOT_APPLICABLE', 1
           )`,
            [
              provisioningId,
              tenantId,
              subscriberId,
              executionOrderId,
              serviceExpedienteId,
              routerId,
              networkId,
              contractId,
              cpeSerialNumber,
              actorId,
              randomUUID(),
            ],
          );
          const assignments = (await qr.query(
            `INSERT INTO ip_assignments (tenant_id, ipv4_network_id, ip, service_provisioning_id, status)
           VALUES ($1, $2, '10.77.0.10', $3, 'RESERVED') RETURNING id`,
            [tenantId, networkId, provisioningId],
          )) as Array<{ id: string }>;
          await qr.query('UPDATE service_provisionings SET ip_assignment_id = $1 WHERE id = $2', [
            assignments[0]?.id,
            provisioningId,
          ]);
        }),
      );
    }

    async function readProvisioningState(): Promise<{
      service:
        | {
            status: string;
            commercial_activation_status: string;
            commercial_activation_detail: string | null;
            version: number;
          }
        | undefined;
      assignment: { status: string; release_reason: string | null } | undefined;
      inbox: { processed_at: Date | null; last_error_code: string | null } | undefined;
    }> {
      return TenantContext.run(tenantContext, () =>
        runInTenantSchema(dataSource, schemaName, async (qr) => {
          const services = await qr.query(
            `SELECT status, commercial_activation_status, commercial_activation_detail, version
             FROM service_provisionings WHERE tenant_id = $1 AND id = $2`,
            [tenantId, provisioningId],
          );
          const assignments = await qr.query(
            `SELECT status, release_reason
             FROM ip_assignments WHERE tenant_id = $1 AND service_provisioning_id = $2`,
            [tenantId, provisioningId],
          );
          const inbox = await qr.query(
            `SELECT processed_at, last_error_code
             FROM network_inbox_events WHERE tenant_id = $1 AND event_id = $2`,
            [tenantId, eventId],
          );
          return { service: services[0], assignment: assignments[0], inbox: inbox[0] };
        }),
      );
    }

    async function seedInventoryReferences(): Promise<void> {
      await TenantContext.run(tenantContext, () =>
        runInTenantSchema(dataSource, schemaName, async (qr) => {
          const assetId = randomUUID();
          await qr.query(
            `INSERT INTO serialized_assets (id, tenant_id, serial_number, subscriber_ref_id)
           VALUES ($1, $2, $3, $4)`,
            [assetId, tenantId, cpeSerialNumber, subscriberId],
          );
          await qr.query(
            `INSERT INTO asset_loan_assignments (id, tenant_id, serialized_asset_id, subscriber_ref_id)
           VALUES ($1, $2, $3, $4)`,
            [randomUUID(), tenantId, assetId, subscriberId],
          );
        }),
      );
    }

    async function readInventoryReferences(): Promise<
      Array<{ asset_contract: string | null; assignment_contract: string | null }>
    > {
      return TenantContext.run(tenantContext, () =>
        runInTenantSchema(dataSource, schemaName, (qr) =>
          qr.query(
            `SELECT asset.contract_ref_id AS asset_contract,
                  assignment.contract_ref_id AS assignment_contract
             FROM serialized_assets asset
             JOIN asset_loan_assignments assignment
               ON assignment.serialized_asset_id = asset.id
            WHERE asset.tenant_id = $1 AND asset.serial_number = $2`,
            [tenantId, cpeSerialNumber],
          ),
        ),
      );
    }

    async function readAuditEntries(): Promise<
      Array<{ entity_type: string; new_value: Record<string, unknown> }>
    > {
      return TenantContext.run(tenantContext, () =>
        runInTenantSchema(dataSource, schemaName, (qr) =>
          qr.query(
            `SELECT entity_type, new_value
             FROM audit_logs WHERE tenant_id = $1
            ORDER BY created_at, id`,
            [tenantId],
          ),
        ),
      );
    }

    beforeAll(async () => {
      const loopbackHost = process.env['DB_HOST'] ?? '127.0.0.1';
      if (!['localhost', '127.0.0.1', '::1'].includes(loopbackHost)) {
        throw new Error('MOD13 B3 solo permite Postgres loopback para fixtures integradas.');
      }
      dataSource = new DataSource({
        ...dataSourceOptions,
        entities: [
          AuditLog,
          IpAssignment,
          Ipv4Network,
          NetworkInboxEvent,
          NetworkPlanProfile,
          NetworkRouter,
          NetworkSetting,
          ServiceProvisioning,
        ],
        migrations: [],
        logging: false,
        extra: { ...dataSourceOptions.extra, max: 4, min: 1 },
      });
      await dataSource.initialize();
      const setup = dataSource.createQueryRunner();
      await setup.connect();
      try {
        await setup.query('CREATE SCHEMA ' + `"${schemaName}"`);
        await new EnableBtreeGist1784419216000().up(setup);
        await setup.query(`SET search_path TO "${schemaName}"`);
        await new CreateNetworkCatalog1600000000000().up(setup);
        await new CreateNetworkProvisioning1610000000000().up(setup);
        await setup.query(
          `INSERT INTO network_routers
           (id, tenant_id, name, management_host, supported_control_methods, created_by)
         VALUES ($1, $2, 'Router B3', 'router.example.invalid', ARRAY['PCQ_ADDRESS_LIST'], $3)`,
          [routerId, tenantId, actorId],
        );
        await setup.query(
          `INSERT INTO ipv4_networks
           (id, tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
            default_control_method, created_by)
         VALUES ($1, $2, $3, 'Red B3', '10.77.0.0/24', '10.77.0.1', '10.77.0.10', '10.77.0.250',
                 'PCQ_ADDRESS_LIST', $4)`,
          [networkId, tenantId, routerId, actorId],
        );
        await setup.query(`
        CREATE TABLE serialized_assets (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          serial_number varchar(120) NOT NULL,
          subscriber_ref_id uuid NOT NULL,
          contract_ref_id uuid NULL,
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )
      `);
        await setup.query(`
        CREATE TABLE asset_loan_assignments (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          serialized_asset_id uuid NOT NULL,
          subscriber_ref_id uuid NOT NULL,
          contract_ref_id uuid NULL,
          removed_at timestamptz NULL,
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )
      `);
        await setup.query(`
        CREATE TABLE audit_logs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL,
          user_id uuid NULL,
          action varchar(32) NOT NULL,
          entity_type varchar(100) NOT NULL,
          entity_id varchar(100) NOT NULL,
          old_value jsonb NULL,
          new_value jsonb NULL,
          ip_address varchar(45) NULL,
          user_agent varchar(512) NULL,
          request_id varchar(100) NULL,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )
      `);
        // El schema sintético se crea y se prepara antes de registrar su tenant de prueba como ACTIVE.
        await setup.query(
          `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'MOD13 B3 fixture', $2, $3, 'ACTIVE', 'mod13-b3@example.invalid')`,
          [tenantId, tenantSlug, schemaName],
        );
      } finally {
        await setup.release();
      }

      auditService = new AuditService(dataSource, {} as never);
      commercialStatusDelegate = new ServiceProvisioningCommercialStatusAdapter(
        dataSource,
        auditService,
      );

      const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
      networkQueuePrefix = `mod13b3-${suffix}`;
      networkQueue = new Queue('network-execution-events', {
        connection: redisConnection(),
        prefix: networkQueuePrefix,
      });
      reconcileQueue = new Queue(NETWORK_PROVISIONING_RECONCILE_QUEUE, {
        connection: redisConnection(),
        prefix: `mod13b3-reconcile-${suffix}`,
      });
      eventModule = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
        providers: [
          ServiceProvisioningActivationListener,
          SubscriberActivationListener,
          ServiceProvisioningInventoryActivationListener,
          { provide: ExpedienteService, useValue: expedienteService },
          { provide: SubscribersService, useValue: subscribersService },
          { provide: SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT, useValue: commercialStatusPort },
          { provide: DataSource, useValue: dataSource },
        ],
      }).compile();
      await eventModule.init();
      eventEmitter = eventModule.get(EventEmitter2);
    }, 180_000);

    afterAll(async () => {
      failNextCrmStatusWrite = false;
      if (networkQueue) {
        const jobs = await networkQueue.getJobs(['waiting', 'delayed', 'failed', 'completed']);
        await Promise.all(jobs.map((job) => job.remove()));
        await networkQueue.close();
      }
      if (reconcileQueue) {
        const jobs = await reconcileQueue.getJobs(['waiting', 'delayed', 'failed', 'completed']);
        await Promise.all(jobs.map((job) => job.remove()));
        await reconcileQueue.close();
      }
      await eventModule?.close();
      if (dataSource?.isInitialized) {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
        await dataSource.destroy();
      }
    }, 180_000);

    beforeEach(async () => {
      failNextCrmStatusWrite = false;
      crmStatusWriteCount = 0;
      subscriberIsActive = false;
      expedienteService.transitionStatus
        .mockReset()
        .mockImplementation(async (id: string, _body: unknown, actorUserId: string) => {
          await eventEmitter.emitAsync(
            'crm.expediente.activated',
            new ExpedienteActivatedEvent(tenantId, schemaName, id, actorUserId),
          );
        });
      subscribersService.findByExpedienteId.mockReset().mockImplementation(async () => ({
        status: subscriberIsActive ? SubscriberStatus.ACTIVE : SubscriberStatus.PROSPECT,
        emailEncrypted: 'ciphertext-email',
        phoneEncrypted: null,
      }));
      subscribersService.activateFromExpediente.mockImplementation(async () => {
        subscriberIsActive = true;
        return { id: subscriberId };
      });
      await clearTenantRows();
    });

    it('registra SIGNATURE_INVALID en el inbox real sin sobrescribir una identidad ya recibida', async () => {
      const invalidEventId = randomUUID();
      const invalidExecutionOrderId = randomUUID();
      const executionOrderReadPort = { getExecutionSnapshot: jest.fn() };
      const processor = new NetworkExecutionEventProcessor(
        dataSource,
        {
          get: (key: string) => (key === 'INTERNAL_QUEUE_SIGNING_KEY' ? signingKey : undefined),
        } as never,
        eventEmitter,
        executionOrderReadPort as never,
        auditService,
      );
      const worker = new Worker(
        'network-execution-events',
        async (job: Job<unknown>) => processor.process(job),
        { connection: redisConnection(), prefix: networkQueuePrefix, concurrency: 1 },
      );
      const signedWithInvalidHmac = {
        tenantId,
        envelope: {
          eventId: invalidEventId,
          eventType: 'ExecutionOrderCancelledV1',
          executionOrderId: invalidExecutionOrderId,
          aggregateVersion: 1,
          result: null,
          occurredAt: new Date().toISOString(),
        },
        signature: 'a'.repeat(64),
      };
      const failed = new Promise<void>((resolve) => worker.once('failed', () => resolve()));
      try {
        await networkQueue.add('process-invalid-signature', signedWithInvalidHmac, {
          jobId: invalidEventId,
          attempts: 1,
        });
        await failed;

        const inboxRows = await TenantContext.run(tenantContext, () =>
          runInTenantSchema(dataSource, schemaName, (qr) =>
            qr.query(
              `SELECT event_type, execution_order_id, processed_at, last_error_code
               FROM network_inbox_events WHERE tenant_id = $1 AND event_id = $2`,
              [tenantId, invalidEventId],
            ),
          ),
        );
        expect(inboxRows).toEqual([
          {
            event_type: 'ExecutionOrderCancelledV1',
            execution_order_id: invalidExecutionOrderId,
            processed_at: null,
            last_error_code: 'SIGNATURE_INVALID',
          },
        ]);
        expect(executionOrderReadPort.getExecutionSnapshot).not.toHaveBeenCalled();
      } finally {
        await worker.close();
        const remainingJob = await networkQueue.getJob(invalidEventId);
        await remainingJob?.remove();
      }
    }, 60_000);

    it('CA-NET-07/09: activa una certificación; el listener CRM falla, conserva PENDING y reintenta inbox único', async () => {
      await insertCertifiedService(expedienteId);
      await seedInventoryReferences();
      const envelope: NetworkExecutionEvent = {
        eventId,
        eventType: 'ExecutionOrderClosedV1',
        executionOrderId,
        aggregateVersion: 2,
        result: ExecutionOrderResult.EXECUTED,
        occurredAt: new Date().toISOString(),
      };
      const signed = {
        tenantId,
        envelope,
        signature: createHmac('sha256', Buffer.from(signingKey, 'base64'))
          .update(canonicalizeNetworkExecutionEvent(tenantId, envelope))
          .digest('hex'),
      };
      const executionOrderReadPort = {
        getExecutionSnapshot: jest.fn().mockResolvedValue(snapshot()),
      };
      const processor = new NetworkExecutionEventProcessor(
        dataSource,
        {
          get: (key: string) => (key === 'INTERNAL_QUEUE_SIGNING_KEY' ? signingKey : undefined),
        } as never,
        eventEmitter,
        executionOrderReadPort as never,
        auditService,
      );
      const worker = new Worker(
        'network-execution-events',
        async (job: Job<unknown>) => processor.process(job),
        { connection: redisConnection(), prefix: networkQueuePrefix, concurrency: 1 },
      );
      const waitFor = async <T>(promise: Promise<T>, label: string): Promise<T> => {
        let timeout: NodeJS.Timeout | undefined;
        try {
          return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
              timeout = setTimeout(
                () => reject(new Error(`BullMQ no emitió ${label} a tiempo.`)),
                45_000,
              );
            }),
          ]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      };
      const firstFailure = new Promise<void>((resolve) => worker.once('failed', () => resolve()));
      const completed = new Promise<void>((resolve) => worker.once('completed', () => resolve()));
      failNextCrmStatusWrite = true;
      try {
        await networkQueue.add('process-network-execution-event', signed, {
          jobId: eventId,
          attempts: 2,
          backoff: { type: 'fixed', delay: 2_000 },
          removeOnComplete: true,
        });
        await waitFor(firstFailure, 'failed');
        const failedState = await readProvisioningState();
        expect(failedState.service).toMatchObject({
          status: 'ACTIVE',
          commercial_activation_status: 'PENDING',
        });
        expect(failedState.assignment).toMatchObject({ status: 'ACTIVE' });
        expect(failedState.inbox).toMatchObject({
          processed_at: null,
          last_error_code: 'CRM_LISTENER_FAILED',
        });

        await waitFor(completed, 'completed');
        const retriedState = await readProvisioningState();
        expect(retriedState.inbox?.processed_at).toBeInstanceOf(Date);
        expect(retriedState.inbox?.last_error_code).toBeNull();
        expect(retriedState.service?.commercial_activation_status).toBe('DONE');
        expect(retriedState.service?.commercial_activation_detail).toBeNull();
        expect(subscriberIsActive).toBe(true);
        expect(subscribersService.activateFromExpediente).toHaveBeenCalledWith(
          expedienteId,
          'network-worker',
        );
        expect(crmStatusWriteCount).toBe(2);
        const inboxCount = await TenantContext.run(tenantContext, () =>
          runInTenantSchema(dataSource, schemaName, async (qr) =>
            qr.query(
              'SELECT count(*)::int AS total FROM network_inbox_events WHERE tenant_id = $1 AND event_id = $2',
              [tenantId, eventId],
            ),
          ),
        );
        expect(inboxCount[0]?.total).toBe(1);
        expect(await readInventoryReferences()).toEqual([
          { asset_contract: contractId, assignment_contract: contractId },
        ]);
        const auditEntries = await readAuditEntries();
        expect(auditEntries.map((entry) => entry.new_value['action'])).toEqual([
          'ACTIVATE',
          'COMMERCIAL_STATUS',
        ]);
        await expect(
          networkQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
        ).resolves.toEqual({
          waiting: 0,
          active: 0,
          delayed: 0,
          failed: 0,
          completed: 0,
          paused: 0,
        });
      } finally {
        await worker.close();
        const remainingJob = await networkQueue.getJob(eventId);
        await remainingJob?.remove();
      }
    }, 60_000);

    it('CA-NET-10: conserva el servicio ACTIVE y registra contacto pendiente al fallar la transición CRM', async () => {
      await insertCertifiedService(expedienteId);
      expedienteService.transitionStatus.mockRejectedValueOnce({
        response: { code: 'EXPEDIENTE_SUBSCRIBER_CONTACT_REQUIRED' },
      });
      const envelope: NetworkExecutionEvent = {
        eventId,
        eventType: 'ExecutionOrderClosedV1',
        executionOrderId,
        aggregateVersion: 2,
        result: ExecutionOrderResult.EXECUTED,
        occurredAt: new Date().toISOString(),
      };
      const signed = {
        tenantId,
        envelope,
        signature: createHmac('sha256', Buffer.from(signingKey, 'base64'))
          .update(canonicalizeNetworkExecutionEvent(tenantId, envelope))
          .digest('hex'),
      };
      const processor = new NetworkExecutionEventProcessor(
        dataSource,
        {
          get: (key: string) => (key === 'INTERNAL_QUEUE_SIGNING_KEY' ? signingKey : undefined),
        } as never,
        eventEmitter,
        { getExecutionSnapshot: jest.fn().mockResolvedValue(snapshot()) } as never,
        auditService,
      );
      const worker = new Worker(
        'network-execution-events',
        async (job: Job<unknown>) => processor.process(job),
        { connection: redisConnection(), prefix: networkQueuePrefix, concurrency: 1 },
      );
      const completed = new Promise<void>((resolve, reject) => {
        worker.once('completed', () => resolve());
        worker.once('failed', (_job, error) => reject(error));
      });
      try {
        await networkQueue.add('process-network-execution-event-contact-pending', signed, {
          jobId: eventId,
          attempts: 1,
        });
        await completed;

        const state = await readProvisioningState();
        expect(state.service).toMatchObject({
          status: 'ACTIVE',
          commercial_activation_status: 'BLOCKED',
          commercial_activation_detail: 'CONTACT_REQUIRED',
        });
        expect(state.assignment).toMatchObject({ status: 'ACTIVE' });
        expect(state.inbox?.processed_at).toBeInstanceOf(Date);
        expect(state.inbox?.last_error_code).toBeNull();
        expect(expedienteService.transitionStatus).toHaveBeenCalledWith(
          expedienteId,
          { targetStatus: ExpedienteStatus.CLIENTE_ACTIVO },
          'network-worker',
        );
        expect(subscribersService.findByExpedienteId).not.toHaveBeenCalled();
        await expect(readAuditEntries()).resolves.toEqual([
          expect.objectContaining({
            entity_type: 'ServiceProvisioning',
            new_value: expect.objectContaining({ action: 'ACTIVATE' }),
          }),
          expect.objectContaining({
            entity_type: 'ServiceProvisioning',
            new_value: expect.objectContaining({
              action: 'COMMERCIAL_STATUS',
              detail: 'CONTACT_REQUIRED',
            }),
          }),
        ]);
      } finally {
        await worker.close();
        const remainingJob = await networkQueue.getJob(eventId);
        await remainingJob?.remove();
      }
    }, 60_000);

    it('CA-NET-11: regularize aplica R12/R6 ter, activa y reintenta la misma fila en Postgres', async () => {
      let currentOrder = snapshot({ status: ExecutionOrderStatus.IN_PROGRESS, result: null });
      const executionOrderReadPort = {
        getExecutionSnapshot: jest.fn().mockImplementation(async () => currentOrder),
        getExecutionSnapshots: jest.fn(),
        hasEvidence: jest.fn(),
        listInstallationOrders: jest.fn(),
        hasOpenWithdrawalOrders: jest.fn(),
      };
      const actor: JwtPayload = {
        sub: actorId,
        email: 'fixture@example.test',
        role: UserRole.NOC,
        tenantId,
        schemaName,
        jti: randomUUID(),
        type: 'tenant',
      };
      const service = new ServiceProvisioningService(
        dataSource,
        auditService,
        new IpamService(dataSource),
        executionOrderReadPort as never,
        {
          getForSubscriber: jest.fn().mockResolvedValue({
            expedienteId: null,
            planId: null,
            downloadMbps: null,
            uploadMbps: null,
            contracts: [],
          }),
        } as never,
        { getFirstInstalledAtCustomer: jest.fn().mockResolvedValue(null) } as never,
        { findByIds: jest.fn().mockResolvedValue([]) } as unknown as NetworkActorReadPort,
        { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) } as never,
        new ManualRouterProvisioningAdapter(),
        eventEmitter,
      );
      const body = RegularizeProvisioningBodySchema.parse({
        executionOrderId,
        routerId,
        ipv4NetworkId: networkId,
        requestedIp: '10.77.0.20',
        controlParams: { method: 'PCQ_ADDRESS_LIST', addressList: 'subscribers' },
        reason: 'Instalación ejecutada para corregir una omisión operativa.',
      });
      const run = (input = body) =>
        TenantContext.run(tenantContext, () => service.regularize(input, actor));

      await expect(run()).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PROVISIONING_ORDER_NOT_ELIGIBLE' }),
      });
      currentOrder = snapshot({ assignedTechnicianId: null });
      await expect(run()).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PROVISIONING_TECHNICIAN_REQUIRED' }),
      });
      currentOrder = snapshot({ assignedTechnicianId: actorId });
      await expect(run()).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PROVISIONING_CERTIFIER_IS_EXECUTOR' }),
      });

      currentOrder = snapshot();
      const created = await run();
      const repeated = await run();
      expect(created.id).toBe(repeated.id);
      expect(created.status).toBe('ACTIVE');
      expect(created.origin).toBe('REGULARIZED');
      await expect(
        run({ ...body, reason: 'Motivo diferente para regularizar esta instalación.' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PROVISIONING_ALREADY_ACTIVE' }),
      });

      const persisted = await TenantContext.run(tenantContext, () =>
        runInTenantSchema(dataSource, schemaName, (qr) =>
          qr.query(
            `SELECT service.id, service.status, service.origin, service.regularization_reason,
                  service.regularized_by, service.regularized_at, service.activated_at,
                  assignment.status AS ip_status, host(assignment.ip) AS ip
             FROM service_provisionings service
             JOIN ip_assignments assignment
               ON assignment.id = service.ip_assignment_id
            WHERE service.tenant_id = $1 AND service.execution_order_id = $2`,
            [tenantId, executionOrderId],
          ),
        ),
      );
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toMatchObject({
        id: created.id,
        status: 'ACTIVE',
        origin: 'REGULARIZED',
        regularization_reason: body.reason,
        regularized_by: actorId,
        ip_status: 'ACTIVE',
        ip: '10.77.0.20',
      });
      expect(persisted[0]?.regularized_at).toBeInstanceOf(Date);
      expect(persisted[0]?.activated_at).toBeInstanceOf(Date);
    }, 60_000);

    it('CA-NET-08: reconcilia una OT cancelada y libera servicio e IP con RECONCILED', async () => {
      await insertCertifiedService();
      const executionOrderReadPort = {
        getExecutionSnapshots: jest
          .fn()
          .mockResolvedValue([
            snapshot({
              status: ExecutionOrderStatus.CANCELLED,
              result: ExecutionOrderResult.CANCELLED,
            }),
          ]),
      };
      const processor = new NetworkProvisioningReconcilerProcessor(
        dataSource,
        reconcileQueue,
        executionOrderReadPort as never,
        auditService,
        eventEmitter,
      );
      const queued = await reconcileQueue.add(
        NETWORK_PROVISIONING_RECONCILE_JOB,
        { tenantId, tenantSlug, schemaName },
        { jobId: randomUUID() },
      );

      await processor.process(queued as never);

      const state = await readProvisioningState();
      expect(state.service?.status).toBe('RELEASED');
      expect(state.assignment).toMatchObject({ status: 'RELEASED', release_reason: 'RECONCILED' });
      await expect(readAuditEntries()).resolves.toEqual([
        expect.objectContaining({
          entity_type: 'ServiceProvisioning',
          new_value: expect.objectContaining({ action: 'RELEASE', eventId: 'RECONCILED' }),
        }),
      ]);
      await queued.remove();
    }, 60_000);
  },
);
