jest.mock('otplib', () => ({
  TOTP: jest.fn().mockImplementation(() => ({
    generate: jest.fn(),
    verify: jest.fn(),
  })),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));

import { createHmac, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import { Job, Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import {
  dataSourceOptions,
  grantTenantSchemaAppPrivileges,
  runInTenantSchema,
  TenantContext,
} from '@iwana/db';
import {
  canonicalizeNetworkExecutionEvent,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  NETWORK_EXECUTION_EVENTS_QUEUE,
  WfmWorkType,
  type NetworkExecutionEvent,
} from '@iwana/shared';
import { CreateNetworkCatalog1600000000000 } from '../../../../../../packages/database/src/migrations/tenant/160_network_catalog';
import { CreateNetworkProvisioning1610000000000 } from '../../../../../../packages/database/src/migrations/tenant/161_network_provisioning';
import { EnableBtreeGist1784419216000 } from '../../../../../../packages/database/src/migrations/public/028_enable_btree_gist';
import { ServiceProvisioningActivatedEvent } from '../events/service-provisioning-activated.event';
import { REDIS_CLIENT } from '../../redis/redis.module';

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
const redisAvailable = process.env['IWANA_REDIS_INTEGRATION_AVAILABLE'] === 'true';
const describeWithServices = dbAvailable && redisAvailable ? describe : describe.skip;
const allowedDatabase = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
if (dbAvailable && !allowedDatabase.test(process.env['DB_NAME'] ?? 'dbiw')) {
  throw new Error('MOD13 B-wire solo permite fixtures sintéticas en dbiw, test o iwana_it_*');
}

const tenantId = randomUUID();
const schemaName = `tenant_mod13_wire_${randomUUID().replaceAll('-', '')}`;
const tenantSlug = `mod13-wire-${randomUUID().slice(0, 8)}`;
const actorId = randomUUID();
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
const context = { tenantId, schemaName, tenantSlug };

function redisOptions(db: number) {
  const host = process.env['REDIS_HOST'] ?? '127.0.0.1';
  const port = Number(process.env['REDIS_PORT'] ?? 6379);
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || !Number.isInteger(port)) {
    throw new Error('MOD13 B-wire solo permite Redis loopback para fixtures integradas.');
  }
  return {
    host,
    port,
    password: process.env['REDIS_PASSWORD'],
    db,
    maxRetriesPerRequest: null,
  };
}

async function findEmptyRedisDatabase(): Promise<number> {
  const configuredDb = Number(process.env['REDIS_DB'] ?? 0);
  const client = new Redis(redisOptions(configuredDb));
  try {
    const config = (await client.config('GET', 'databases')) as string[];
    const databaseCount = Number(config[1]);
    const keyspace = await client.info('keyspace');
    const occupied = new Set<number>();
    for (const line of keyspace.split(/\r?\n/u)) {
      const match = /^db(\d+):keys=(\d+)/u.exec(line);
      if (match && Number(match[2]) > 0) occupied.add(Number(match[1]));
    }
    const empty = Array.from({ length: databaseCount }, (_, index) => index).find(
      (database) => database !== configuredDb && !occupied.has(database),
    );
    if (empty === undefined) {
      throw new Error('MOD13 B-wire requiere una base Redis loopback vacía para aislar la cola.');
    }
    return empty;
  } finally {
    await client.quit();
  }
}

function signedEvent(envelope: NetworkExecutionEvent): Record<string, unknown> {
  const signingKey = process.env['INTERNAL_QUEUE_SIGNING_KEY'];
  if (!signingKey) throw new Error('MOD13 B-wire requiere la clave local de firma configurada.');
  const key = Buffer.from(signingKey, 'base64');
  if (key.byteLength < 32 || key.toString('base64') !== signingKey) {
    throw new Error('MOD13 B-wire requiere una clave de firma válida.');
  }
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

describeWithServices('MOD13 B-wire: consumidor real de NetworkModule en AppModule', () => {
  let moduleRef: TestingModule | undefined;
  let fixtureDataSource: DataSource | undefined;
  let queue: Queue | undefined;
  let queueEvents: QueueEvents | undefined;
  let redisClient: Redis | undefined;
  let eventEmitter: EventEmitter2 | undefined;
  let selectedRedisDb: number | undefined;
  const originalRedisDb = process.env['REDIS_DB'];
  const activationEvents: ServiceProvisioningActivatedEvent[] = [];
  let schemaCreated = false;
  let tenantInserted = false;

  beforeAll(async () => {
    const databaseHost = process.env['DB_HOST'] ?? '127.0.0.1';
    if (!['localhost', '127.0.0.1', '::1'].includes(databaseHost)) {
      throw new Error('MOD13 B-wire solo permite Postgres loopback para fixtures integradas.');
    }
    selectedRedisDb = await findEmptyRedisDatabase();
    process.env['REDIS_DB'] = String(selectedRedisDb);

    const { AppModule } = await import('../../../app.module');
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    fixtureDataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      migrationsRun: false,
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 3, min: 1 },
    });
    await fixtureDataSource.initialize();
    await createFixtureSchema(fixtureDataSource);
    tenantInserted = true;

    const appEventEmitter = moduleRef.get<EventEmitter2>(EventEmitter2);
    eventEmitter = appEventEmitter;
    appEventEmitter.on(
      'network.service-provisioning.activated',
      (event: ServiceProvisioningActivatedEvent) => activationEvents.push(event),
    );
    queue = moduleRef.get<Queue>(getQueueToken(NETWORK_EXECUTION_EVENTS_QUEUE));
    queueEvents = new QueueEvents(NETWORK_EXECUTION_EVENTS_QUEUE, {
      connection: redisOptions(selectedRedisDb),
    });
    redisClient = moduleRef.get<Redis>(REDIS_CLIENT);
    await queueEvents.waitUntilReady();
    await moduleRef.init();
  }, 180_000);

  afterAll(async () => {
    await queueEvents?.close();
    await moduleRef?.close();
    if (redisClient && selectedRedisDb !== undefined) {
      await redisClient.flushdb();
      await redisClient.quit();
    }
    if (fixtureDataSource?.isInitialized) {
      if (schemaCreated) {
        await fixtureDataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      }
      if (tenantInserted) {
        await fixtureDataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      }
      await fixtureDataSource.destroy();
    }
    if (originalRedisDb === undefined) delete process.env['REDIS_DB'];
    else process.env['REDIS_DB'] = originalRedisDb;
  }, 180_000);

  it('EXECUTED sobre CERTIFIED activa servicio/IP, emite el evento y deduplica la reentrega', async () => {
    const envelope: NetworkExecutionEvent = {
      eventId: executedEventId,
      eventType: 'ExecutionOrderClosedV1',
      executionOrderId: executedOrderId,
      aggregateVersion: 2,
      result: ExecutionOrderResult.EXECUTED,
      occurredAt: new Date().toISOString(),
    };
    await enqueueSignedEvent(envelope, `executed-${randomUUID()}`);
    const activated = await readNetworkState(
      fixtureDataSource as DataSource,
      executedOrderId,
      executedProvisioningId,
      executedEventId,
    );
    expect(activated).toMatchObject({
      serviceStatus: 'ACTIVE',
      commercialActivationStatus: 'BLOCKED',
      commercialActivationDetail: 'NO_EXPEDIENTE',
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

    await enqueueSignedEvent(envelope, `redelivery-${randomUUID()}`);
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
    await enqueueSignedEvent(envelope, `not-executed-${randomUUID()}`);
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

  async function enqueueSignedEvent(envelope: NetworkExecutionEvent, jobId: string): Promise<void> {
    const job = await (queue as Queue).add(
      'process-network-execution-event',
      signedEvent(envelope),
      {
        jobId,
        attempts: 1,
        removeOnComplete: true,
      },
    );
    await (job as Job).waitUntilFinished(queueEvents as QueueEvents, 60_000);
  }

  async function createFixtureSchema(source: DataSource): Promise<void> {
    const queryRunner = source.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
      schemaCreated = true;
      await new EnableBtreeGist1784419216000().up(queryRunner);
      await queryRunner.query(`SET search_path TO "${schemaName}"`);
      await new CreateNetworkCatalog1600000000000().up(queryRunner);
      await new CreateNetworkProvisioning1610000000000().up(queryRunner);
      await queryRunner.query(`
        CREATE TABLE execution_orders (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          execution_order_number varchar(40) NOT NULL,
          status varchar(32) NOT NULL,
          work_type varchar(32) NOT NULL,
          is_annulled boolean NOT NULL DEFAULT false,
          subscriber_id varchar(160) NULL,
          assigned_technician_id uuid NULL,
          customer_display_label varchar(200) NOT NULL,
          closed_at timestamptz NULL,
          result varchar(32) NULL
        )
      `);
      await queryRunner.query(`
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
      await queryRunner.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'MOD13 B-wire fixture', $2, $3, 'ACTIVE', 'mod13-wire@example.invalid')`,
        [tenantId, tenantSlug, schemaName],
      );
      tenantInserted = true;
      await queryRunner.query(
        `INSERT INTO network_routers
          (id, tenant_id, name, management_host, supported_control_methods, created_by)
         VALUES ($1, $2, 'Router B-wire', 'router.example.invalid',
                 ARRAY['SIMPLE_QUEUE_STATIC_IP'], $3)`,
        [routerId, tenantId, actorId],
      );
      await queryRunner.query(
        `INSERT INTO ipv4_networks
          (id, tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
           default_control_method, created_by)
         VALUES ($1, $2, $3, 'Red B-wire', '10.78.0.0/24', '10.78.0.1',
                 '10.78.0.10', '10.78.0.250', 'SIMPLE_QUEUE_STATIC_IP', $4)`,
        [networkId, tenantId, routerId, actorId],
      );
      await seedProvisioning(queryRunner, {
        orderId: executedOrderId,
        orderNumber: 'OTE-MOD13-WIRE-EXEC-01',
        orderResult: ExecutionOrderResult.EXECUTED,
        provisioningId: executedProvisioningId,
        assignmentId: executedAssignmentId,
        ip: '10.78.0.10',
        status: 'CERTIFIED',
      });
      await seedProvisioning(queryRunner, {
        orderId: notExecutedOrderId,
        orderNumber: 'OTE-MOD13-WIRE-NOT-01',
        orderResult: ExecutionOrderResult.NOT_EXECUTED,
        provisioningId: notExecutedProvisioningId,
        assignmentId: notExecutedAssignmentId,
        ip: '10.78.0.11',
        status: 'RESERVED',
      });
      await grantTenantSchemaAppPrivileges(queryRunner, schemaName);
    } finally {
      await queryRunner.release();
    }
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
    await queryRunner.query(
      `INSERT INTO execution_orders (
         id, tenant_id, execution_order_number, status, work_type, is_annulled,
         subscriber_id, assigned_technician_id, customer_display_label, closed_at, result
       ) VALUES ($1, $2, $3, $4, $5, false, $6, $7, 'Fixture de red', NOW(), $8)`,
      [
        values.orderId,
        tenantId,
        values.orderNumber,
        ExecutionOrderStatus.COMPLETED,
        WfmWorkType.INSTALLATION,
        randomUUID(),
        actorId,
        values.orderResult,
      ],
    );
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
});
