// Jest corre en CJS y no transforma el ESM transitivo @scure/base de otplib;
// AppModule se mantiene real y este proveedor no participa en el wiring MOD13.
jest.mock('otplib', () => ({
  TOTP: jest.fn().mockImplementation(() => ({
    generate: jest.fn(),
    verify: jest.fn(),
  })),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import type { Job } from 'bullmq';
import {
  AccessProfile,
  AccessProfilePermission,
  ExecutionOrder,
  User,
  UserAccessProfile,
  dataSourceOptions,
  grantTenantSchemaAppPrivileges,
  runInTenantSchema,
  TenantContext,
} from '@iwana/db';
import {
  AccessPermissionKey,
  CustomerSegment,
  canonicalizeNetworkExecutionEvent,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  INVENTORY_EXECUTION_REQUESTS_QUEUE,
  OPERATIONS_EXECUTION_DLQ,
  OPERATIONS_EXECUTION_EVENTS_QUEUE,
  SEARCH_INDEX_QUEUE,
  TENANT_PROVISIONING_QUEUE,
  USERS_BULK_CREATE_QUEUE,
  ASSURANCE_FIELD_SERVICE_QUEUE,
  NETWORK_EXECUTION_EVENTS_QUEUE,
  PersonType,
  TaxRegime,
  UserStatus,
  VatTreatment,
  UserRole,
  WfmWorkType,
  type NetworkExecutionEvent,
} from '@iwana/shared';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { ServiceProvisioningActivatedEvent } from '../events/service-provisioning-activated.event';
import { NetworkExecutionEventProcessor } from '../network-execution-event.processor';
import { NetworkProvisioningController } from '../network-provisioning.controller';
import { NETWORK_PROVISIONING_RECONCILE_QUEUE } from '../network-provisioning-reconciler.processor';
import { EVIDENCE_ANALYSIS_QUEUE } from '../../media/evidence-asset.provider';
import { PRIVACY_DUE_ALERTS_QUEUE } from '../../privacy/alerts/privacy-due-alerts.constants';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { Subscriber } from '../../crm/subscribers/entities/subscriber.entity';

const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void })
  .loadEnvFile;
if (loadEnvFile) {
  const workspaceRoot = resolve(__dirname, '../../../../../../');
  for (const filename of ['.env.development.local', '.env.development', '.env']) {
    const path = resolve(workspaceRoot, filename);
    if (!existsSync(path)) continue;
    try {
      loadEnvFile(path);
    } catch {
      // La precondición posterior informa la dependencia local sin exponer su configuración.
    }
  }
}

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabase = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const effectiveDatabase = (dataSourceOptions as { database?: string }).database;
if (dbAvailable && !allowedDatabase.test(effectiveDatabase ?? '')) {
  throw new Error('MOD13 B-wire solo permite fixtures sintéticas en dbiw, test o iwana_it_*');
}

const tenantId = randomUUID();
const schemaName = `tenant_mod13_wire_${randomUUID().replaceAll('-', '')}`;
const tenantSlug = `mod13-wire-${randomUUID().slice(0, 8)}`;
const actorId = randomUUID();
const technicianId = randomUUID();
const routerId = randomUUID();
const networkId = randomUUID();
const executedOrderId = randomUUID();
const executedProvisioningId = randomUUID();
const executedAssignmentId = randomUUID();
const executedEventId = randomUUID();
const notExecutedOrderId = randomUUID();
const notExecutedProvisioningId = randomUUID();
const notExecutedAssignmentId = randomUUID();
const notExecutedEventId = randomUUID();
const commandOrderId = randomUUID();
const commandSubscriberId = randomUUID();
const regularizeOrderId = randomUUID();
const regularizeSubscriberId = randomUUID();
const context = { tenantId, schemaName, tenantSlug };
const syntheticSigningKey = randomBytes(32).toString('base64');
const queueNames = [
  TENANT_PROVISIONING_QUEUE,
  SEARCH_INDEX_QUEUE,
  ASSURANCE_FIELD_SERVICE_QUEUE,
  USERS_BULK_CREATE_QUEUE,
  OPERATIONS_EXECUTION_EVENTS_QUEUE,
  OPERATIONS_EXECUTION_DLQ,
  INVENTORY_EXECUTION_REQUESTS_QUEUE,
  EVIDENCE_ANALYSIS_QUEUE,
  PRIVACY_DUE_ALERTS_QUEUE,
  NETWORK_EXECUTION_EVENTS_QUEUE,
  NETWORK_PROVISIONING_RECONCILE_QUEUE,
];
const queueStub = {
  add: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};
const redisStub = {
  disconnect: jest.fn(),
  del: jest.fn().mockResolvedValue(0),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
};

function signedEvent(envelope: NetworkExecutionEvent): Record<string, unknown> {
  const key = Buffer.from(syntheticSigningKey, 'base64');
  return {
    tenantId,
    envelope,
    signature: createHmac('sha256', key)
      .update(canonicalizeNetworkExecutionEvent(tenantId, envelope))
      .digest('hex'),
  };
}

interface NetworkState {
  serviceStatus: string;
  commercialActivationStatus: string;
  commercialActivationDetail: string | null;
  assignmentStatus: string;
  inboxProcessedAt: Date | null;
  inboxLastErrorCode: string | null;
  inboxCount: number;
  activationAuditCount: number;
}

async function readNetworkState(
  source: DataSource,
  orderId: string,
  provisioningId: string,
  eventId: string,
): Promise<NetworkState> {
  return TenantContext.run(context, () =>
    runInTenantSchema(source, schemaName, async (qr) => {
      const services = (await qr.query(
        `SELECT status, commercial_activation_status, commercial_activation_detail
           FROM service_provisionings
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, provisioningId],
      )) as Array<{
        status: string;
        commercial_activation_status: string;
        commercial_activation_detail: string | null;
      }>;
      const assignments = (await qr.query(
        `SELECT status FROM ip_assignments
          WHERE tenant_id = $1 AND service_provisioning_id = $2`,
        [tenantId, provisioningId],
      )) as Array<{ status: string }>;
      const inbox = (await qr.query(
        `SELECT processed_at, last_error_code
           FROM network_inbox_events
          WHERE tenant_id = $1 AND event_id = $2 AND execution_order_id = $3`,
        [tenantId, eventId, orderId],
      )) as Array<{ processed_at: Date | null; last_error_code: string | null }>;
      const counts = (await qr.query(
        `SELECT
           (SELECT count(*)::int FROM network_inbox_events
             WHERE tenant_id = $1 AND event_id = $2) AS inbox_count,
           (SELECT count(*)::int FROM audit_logs
             WHERE tenant_id = $1 AND entity_type = 'ServiceProvisioning'
               AND entity_id = $3 AND new_value->>'action' = 'ACTIVATE') AS activation_audit_count`,
        [tenantId, eventId, provisioningId],
      )) as Array<{ inbox_count: number; activation_audit_count: number }>;
      return {
        serviceStatus: services[0]?.status ?? 'MISSING',
        commercialActivationStatus: services[0]?.commercial_activation_status ?? 'MISSING',
        commercialActivationDetail: services[0]?.commercial_activation_detail ?? null,
        assignmentStatus: assignments[0]?.status ?? 'MISSING',
        inboxProcessedAt: inbox[0]?.processed_at ?? null,
        inboxLastErrorCode: inbox[0]?.last_error_code ?? null,
        inboxCount: counts[0]?.inbox_count ?? 0,
        activationAuditCount: counts[0]?.activation_audit_count ?? 0,
      };
    }),
  );
}

describeWithDb('MOD13 — cableado de NetworkModule en AppModule y PostgreSQL real', () => {
  let moduleRef: TestingModule | undefined;
  let fixtureDataSource: DataSource | undefined;
  let eventEmitter: EventEmitter2 | undefined;
  let networkController: NetworkProvisioningController | undefined;
  let executionEventProcessor: NetworkExecutionEventProcessor | undefined;
  const originalSigningKey = process.env['INTERNAL_QUEUE_SIGNING_KEY'];
  const activationEvents: ServiceProvisioningActivatedEvent[] = [];
  let schemaCreated = false;
  let tenantInserted = false;
  let provisioningId: string | undefined;

  const nocActor = {
    sub: actorId,
    email: 'a'.repeat(64),
    role: UserRole.NOC,
    tenantId,
    schemaName,
    jti: randomUUID(),
    type: 'tenant' as const,
  };
  const technicianActor = {
    ...nocActor,
    sub: technicianId,
    role: UserRole.TECHNICIAN,
    jti: randomUUID(),
  };

  beforeAll(async () => {
    const databaseHost = process.env['DB_HOST'] ?? '127.0.0.1';
    if (!['localhost', '127.0.0.1', '::1'].includes(databaseHost)) {
      throw new Error('La prueba solo permite PostgreSQL loopback para fixtures efímeras.');
    }
    process.env['INTERNAL_QUEUE_SIGNING_KEY'] = syntheticSigningKey;

    const { AppModule } = await import('../../../app.module');
    const moduleBuilder = Test.createTestingModule({ imports: [AppModule] });
    moduleBuilder.overrideProvider(REDIS_CLIENT).useValue(redisStub);
    for (const queueName of queueNames) {
      moduleBuilder.overrideProvider(getQueueToken(queueName)).useValue(queueStub);
    }
    moduleRef = await moduleBuilder.compile();

    fixtureDataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        AccessProfile,
        AccessProfilePermission,
        ExecutionOrder,
        User,
        UserAccessProfile,
        Subscriber,
      ],
      migrations: [],
      migrationsRun: false,
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 3, min: 1 },
    });
    await fixtureDataSource.initialize();
    await createFixtureSchema(fixtureDataSource);

    const appEventEmitter = moduleRef.get<EventEmitter2>(EventEmitter2);
    eventEmitter = appEventEmitter;
    appEventEmitter.on(
      'network.service-provisioning.activated',
      (event: ServiceProvisioningActivatedEvent) => activationEvents.push(event),
    );
    networkController = moduleRef.get(NetworkProvisioningController);
    executionEventProcessor = moduleRef.get(NetworkExecutionEventProcessor);
  }, 180_000);

  afterAll(async () => {
    const cleanupFailures: unknown[] = [];
    const attemptCleanup = async (action: () => Promise<unknown>): Promise<void> => {
      try {
        await action();
      } catch (error) {
        cleanupFailures.push(error);
      }
    };

    try {
      await attemptCleanup(async () => moduleRef?.close());
      if (fixtureDataSource?.isInitialized) {
        if (schemaCreated) {
          await attemptCleanup(() =>
            fixtureDataSource!.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`),
          );
        }
        if (tenantInserted) {
          await attemptCleanup(() =>
            fixtureDataSource!.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]),
          );
        }
        await attemptCleanup(() => fixtureDataSource!.destroy());
      }
    } finally {
      if (originalSigningKey === undefined) delete process.env['INTERNAL_QUEUE_SIGNING_KEY'];
      else process.env['INTERNAL_QUEUE_SIGNING_KEY'] = originalSigningKey;
    }

    if (cleanupFailures.length > 0) {
      throw new AggregateError(cleanupFailures, 'Falló la limpieza de fixtures MOD13 B-wire.');
    }
  }, 180_000);

  it('context: entrega al NOC la proyección completa de la OT sembrada', async () => {
    const result = await TenantContext.run(context, () =>
      (networkController as NetworkProvisioningController).getOrderContext(
        commandOrderId,
        nocActor,
      ),
    );

    expect(result).toMatchObject({
      executionOrder: {
        id: commandOrderId,
        assignedTechnician: { id: technicianId, name: 'Técnico sintético' },
      },
      subscriber: { id: commandSubscriberId, displayLabel: 'Suscriptor sintético' },
      provisioning: null,
    });
  });

  it('context: entrega al técnico solo la proyección reducida', async () => {
    const result = await TenantContext.run(context, () =>
      (networkController as NetworkProvisioningController).getOrderContext(
        commandOrderId,
        technicianActor,
      ),
    );

    expect(Object.keys(result).sort()).toEqual(
      ['certified', 'executionOrderId', 'ip', 'status', 'updatedAt'].sort(),
    );
    expect(result).toMatchObject({
      executionOrderId: commandOrderId,
      status: null,
      ip: null,
      certified: false,
    });
  });

  it('reserve: persiste el servicio y la asignación IP con los puertos tipados', async () => {
    const result = await TenantContext.run(context, () =>
      (networkController as NetworkProvisioningController).reserve(
        {
          executionOrderId: commandOrderId,
          routerId,
          ipv4NetworkId: networkId,
          controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'mod13-wiring-qa' },
        },
        nocActor,
      ),
    );
    provisioningId = result.id;

    expect(result.status).toBe('RESERVED');
    expect(result.ip).toMatch(/^10\.78\.0\./u);
    expect(result.routerInstruction?.mode).toBe('MANUAL');
  });

  it('certify: rechaza evidencia que el puerto real de la prueba no reconoce', async () => {
    expect(provisioningId).toBeDefined();
    await expect(
      TenantContext.run(context, () =>
        (networkController as NetworkProvisioningController).certify(
          provisioningId as string,
          { evidenceId: randomUUID(), version: 1 },
          nocActor,
        ),
      ),
    ).rejects.toMatchObject({
      response: { code: 'PROVISIONING_EVIDENCE_REQUIRED' },
      status: 422,
    });
  });

  it('release: libera la reserva y la dirección IP', async () => {
    expect(provisioningId).toBeDefined();
    const result = await TenantContext.run(context, () =>
      (networkController as NetworkProvisioningController).release(
        provisioningId as string,
        { version: 1, reason: 'Limpieza de fixture' },
        nocActor,
      ),
    );

    expect(result.status).toBe('RELEASED');
  });

  it('regularize: rechaza una OT abierta', async () => {
    await expect(
      TenantContext.run(context, () =>
        (networkController as NetworkProvisioningController).regularize(
          {
            executionOrderId: regularizeOrderId,
            routerId,
            ipv4NetworkId: networkId,
            controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'mod13-wiring-qa' },
            reason: 'La orden fixture sigue abierta',
          },
          nocActor,
        ),
      ),
    ).rejects.toMatchObject({
      response: { code: 'PROVISIONING_ORDER_NOT_ELIGIBLE' },
      status: 422,
    });
  });

  it('EXECUTED sobre CERTIFIED activa servicio/IP, emite el evento y deduplica la reentrega', async () => {
    const envelope: NetworkExecutionEvent = {
      eventId: executedEventId,
      eventType: 'ExecutionOrderClosedV1',
      executionOrderId: executedOrderId,
      aggregateVersion: 2,
      result: ExecutionOrderResult.EXECUTED,
      occurredAt: new Date().toISOString(),
    };
    await processSignedEvent(envelope);
    const activated = await readNetworkState(
      fixtureDataSource as DataSource,
      executedOrderId,
      executedProvisioningId,
      executedEventId,
    );
    expect(activated).toMatchObject({
      serviceStatus: 'ACTIVE',
      commercialActivationStatus: 'PENDING',
      commercialActivationDetail: null,
      assignmentStatus: 'ACTIVE',
      inboxLastErrorCode: null,
      inboxCount: 1,
      activationAuditCount: 1,
    });
    expect(activated.inboxProcessedAt).toBeInstanceOf(Date);
    expect(activationEvents).toHaveLength(1);
    expect(activationEvents[0]).toMatchObject({
      tenantId,
      schemaName,
      serviceProvisioningId: executedProvisioningId,
      executionOrderId: executedOrderId,
    });

    await processSignedEvent(envelope);
    const redelivered = await readNetworkState(
      fixtureDataSource as DataSource,
      executedOrderId,
      executedProvisioningId,
      executedEventId,
    );
    expect(redelivered).toMatchObject({
      serviceStatus: 'ACTIVE',
      assignmentStatus: 'ACTIVE',
      inboxCount: 1,
      activationAuditCount: 1,
    });
    expect(activationEvents).toHaveLength(1);
  }, 90_000);

  it('NOT_EXECUTED sobre RESERVED libera el servicio y la IP', async () => {
    const envelope: NetworkExecutionEvent = {
      eventId: notExecutedEventId,
      eventType: 'ExecutionOrderClosedV1',
      executionOrderId: notExecutedOrderId,
      aggregateVersion: 2,
      result: ExecutionOrderResult.NOT_EXECUTED,
      occurredAt: new Date().toISOString(),
    };
    await processSignedEvent(envelope);
    const state = await readNetworkState(
      fixtureDataSource as DataSource,
      notExecutedOrderId,
      notExecutedProvisioningId,
      notExecutedEventId,
    );
    expect(state).toMatchObject({
      serviceStatus: 'RELEASED',
      assignmentStatus: 'RELEASED',
      inboxLastErrorCode: null,
      inboxCount: 1,
      activationAuditCount: 0,
    });
    expect(state.inboxProcessedAt).toBeInstanceOf(Date);
    expect(activationEvents).toHaveLength(1);
  }, 90_000);

  async function processSignedEvent(envelope: NetworkExecutionEvent): Promise<void> {
    await (executionEventProcessor as NetworkExecutionEventProcessor).process({
      data: signedEvent(envelope),
    } as Job<unknown>);
  }

  async function createFixtureSchema(source: DataSource): Promise<void> {
    const queryRunner = source.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
      schemaCreated = true;
      await queryRunner.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'MOD13 B-wire fixture', $2, $3, 'ACTIVE', 'mod13-wire@example.invalid')`,
        [tenantId, tenantSlug, schemaName],
      );
      tenantInserted = true;
    } finally {
      await queryRunner.release();
    }

    const tenantDataSource = createTenantDataSource(source, schemaName, `mod13-wire-${tenantSlug}`);
    try {
      await tenantDataSource.initialize();
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      if (tenantDataSource.isInitialized) await tenantDataSource.destroy();
    }

    const fixtures = source.createQueryRunner();
    await fixtures.connect();
    try {
      await fixtures.query(`SET search_path TO "${schemaName}"`);
      await seedActorUsers(fixtures);
      await fixtures.query(
        `INSERT INTO network_routers
          (id, tenant_id, name, management_host, supported_control_methods, created_by)
         VALUES ($1, $2, 'Router B-wire', 'router.example.invalid',
                 ARRAY['SIMPLE_QUEUE_STATIC_IP'], $3)`,
        [routerId, tenantId, actorId],
      );
      await fixtures.query(
        `INSERT INTO ipv4_networks
          (id, tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
           default_control_method, created_by)
         VALUES ($1, $2, $3, 'Red B-wire', '10.78.0.0/24', '10.78.0.1',
                 '10.78.0.10', '10.78.0.250', 'SIMPLE_QUEUE_STATIC_IP', $4)`,
        [networkId, tenantId, routerId, actorId],
      );
      await seedProvisioning(fixtures, {
        orderId: executedOrderId,
        orderNumber: 'OTE-MOD13-WIRE-EXEC-01',
        orderResult: ExecutionOrderResult.EXECUTED,
        provisioningId: executedProvisioningId,
        assignmentId: executedAssignmentId,
        ip: '10.78.0.10',
        status: 'CERTIFIED',
      });
      await seedProvisioning(fixtures, {
        orderId: notExecutedOrderId,
        orderNumber: 'OTE-MOD13-WIRE-NOT-01',
        orderResult: ExecutionOrderResult.NOT_EXECUTED,
        provisioningId: notExecutedProvisioningId,
        assignmentId: notExecutedAssignmentId,
        ip: '10.78.0.11',
        status: 'RESERVED',
      });
      await seedOpenExecutionOrder(fixtures, {
        id: commandOrderId,
        number: 'OTE-MOD13-WIRE-COMMAND-01',
        subscriberId: commandSubscriberId,
        label: 'Suscriptor sintético',
      });
      await seedOpenExecutionOrder(fixtures, {
        id: regularizeOrderId,
        number: 'OTE-MOD13-WIRE-REGULARIZE-01',
        subscriberId: regularizeSubscriberId,
        label: 'Suscriptor de regularización sintético',
      });
      await grantTenantSchemaAppPrivileges(fixtures, schemaName);
    } finally {
      await fixtures.release();
    }
  }

  async function seedActorUsers(
    queryRunner: ReturnType<DataSource['createQueryRunner']>,
  ): Promise<void> {
    const manager = queryRunner.manager;
    await manager.insert(User, [
      {
        id: actorId,
        email: `noc-${tenantId}@example.invalid`,
        emailHash: createHash('sha256').update(`${tenantId}:noc`).digest('hex'),
        passwordHash: 'x'.repeat(60),
        role: UserRole.NOC,
        status: UserStatus.ACTIVE,
        tenantId,
        firstName: 'NOC',
        lastName: 'fixture',
      },
      {
        id: technicianId,
        email: `technician-${tenantId}@example.invalid`,
        emailHash: createHash('sha256').update(`${tenantId}:technician`).digest('hex'),
        passwordHash: 'x'.repeat(60),
        role: UserRole.TECHNICIAN,
        status: UserStatus.ACTIVE,
        tenantId,
        firstName: 'Técnico',
        lastName: 'sintético',
      },
    ]);

    const nocProfile = await manager.findOne(AccessProfile, {
      where: { tenantId, name: 'Acceso estándar Aprovisionamiento' },
    });
    if (!nocProfile) throw new Error('La migración tenant 162 no sembró el perfil NOC de MOD13.');

    const technicianProfile = await manager.save(AccessProfile, {
      tenantId,
      name: `MOD13 fixture ${tenantSlug}`,
      description: 'Perfil sintético para la prueba de cableado.',
      baseRoleConstraint: UserRole.TECHNICIAN,
      scopeSiteId: null,
      isSystem: false,
      isActive: true,
    });
    await manager.insert(AccessProfilePermission, {
      tenantId,
      profileId: technicianProfile.id,
      permissionKey: AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
    });
    await manager.insert(UserAccessProfile, [
      { tenantId, userId: actorId, profileId: nocProfile.id, isActive: true },
      { tenantId, userId: technicianId, profileId: technicianProfile.id, isActive: true },
    ]);
  }

  async function seedSubscriber(
    queryRunner: ReturnType<DataSource['createQueryRunner']>,
    subscriberId: string,
  ): Promise<void> {
    await queryRunner.manager.insert(Subscriber, {
      id: subscriberId,
      tenantId,
      personType: PersonType.JURIDICA,
      customerSegment: CustomerSegment.PYME,
      nit: `fixture-${subscriberId.slice(0, 8)}`,
      businessName: 'Suscriptor sintético MOD13',
      vatTreatment: VatTreatment.STANDARD,
      taxRegime: TaxRegime.COMMON,
      address: 'Dirección sintética de prueba',
      createdBy: actorId,
    });
  }

  async function seedProvisioning(
    queryRunner: ReturnType<DataSource['createQueryRunner']>,
    values: {
      orderId: string;
      orderNumber: string;
      orderResult: ExecutionOrderResult;
      provisioningId: string;
      assignmentId: string;
      ip: string;
      status: 'CERTIFIED' | 'RESERVED';
    },
  ): Promise<void> {
    const subscriberId = randomUUID();
    await seedSubscriber(queryRunner, subscriberId);
    await queryRunner.manager.insert(ExecutionOrder, {
      id: values.orderId,
      tenantId,
      executionOrderNumber: values.orderNumber,
      assignedTechnicianId: technicianId,
      originContext: 'MOD13_INTEGRATION_FIXTURE',
      originRefId: values.orderId,
      subscriberId,
      customerDisplayLabel: 'Fixture de red',
      workType: WfmWorkType.INSTALLATION,
      workSummary: 'Fixture de prueba de aprovisionamiento',
      status: ExecutionOrderStatus.COMPLETED,
      result: values.orderResult,
      closedAt: new Date(),
    });
    await queryRunner.query(
      `INSERT INTO service_provisionings (
         id, tenant_id, subscriber_id, execution_order_id, execution_order_number,
         router_id, ipv4_network_id, control_method, control_params, status,
         reserved_by, reserved_at, certified_by, certified_at, certification_evidence_id,
         commercial_activation_status, version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'SIMPLE_QUEUE_STATIC_IP',
         '{"method":"SIMPLE_QUEUE_STATIC_IP","queueName":"mod13-wire"}'::jsonb,
         $8, $9, NOW(), $10, $11, $12, 'NOT_APPLICABLE', 1
       )`,
      [
        values.provisioningId,
        tenantId,
        randomUUID(),
        values.orderId,
        values.orderNumber,
        routerId,
        networkId,
        values.status,
        actorId,
        values.status === 'CERTIFIED' ? actorId : null,
        values.status === 'CERTIFIED' ? new Date() : null,
        values.status === 'CERTIFIED' ? randomUUID() : null,
      ],
    );
    const assignments = (await queryRunner.query(
      `INSERT INTO ip_assignments (
         id, tenant_id, ipv4_network_id, ip, service_provisioning_id, status
       ) VALUES ($1, $2, $3, $4::inet, $5, 'RESERVED') RETURNING id`,
      [values.assignmentId, tenantId, networkId, values.ip, values.provisioningId],
    )) as Array<{ id: string }>;
    await queryRunner.query(
      'UPDATE service_provisionings SET ip_assignment_id = $1 WHERE id = $2 AND tenant_id = $3',
      [assignments[0]?.id, values.provisioningId, tenantId],
    );
  }

  async function seedOpenExecutionOrder(
    queryRunner: ReturnType<DataSource['createQueryRunner']>,
    order: { id: string; number: string; subscriberId: string; label: string },
  ): Promise<void> {
    await seedSubscriber(queryRunner, order.subscriberId);
    await queryRunner.manager.insert(ExecutionOrder, {
      id: order.id,
      tenantId,
      executionOrderNumber: order.number,
      assignedTechnicianId: technicianId,
      originContext: 'MOD13_INTEGRATION_FIXTURE',
      originRefId: order.id,
      subscriberId: order.subscriberId,
      customerDisplayLabel: order.label,
      workType: WfmWorkType.INSTALLATION,
      workSummary: 'Fixture de prueba de aprovisionamiento',
      status: ExecutionOrderStatus.IN_PROGRESS,
    });
  }
});
