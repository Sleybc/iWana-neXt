import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import {
  dataSourceOptions,
  resolveMigrationDbCredentials,
  ExecutionOrder,
  ExecutionOrderActivity,
  ExecutionOrderAuditIntent,
  ExecutionOrderIdempotencyRecord,
  ExecutionOrderItemUsage,
  ExecutionOrderOutboxEvent,
  ExecutionOrderStatusTransition,
  InventoryCategory,
  InventoryItem,
  StockBalance,
  StockLocation,
  SerializedAsset,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequestLine,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  ExecutionOrderItemAction,
  InventoryDisposition,
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
  StockLocationStatus,
  StockLocationType,
  UserRole,
  WfmWorkType,
  INVENTORY_EXECUTION_REQUESTS_QUEUE,
  OPERATIONS_EXECUTION_EVENTS_QUEUE,
  OPERATIONS_EXECUTION_DLQ,
  type OperationalEventEnvelopeV1,
} from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { InventoryExecutionRequestProcessor } from '../services/inventory-execution-request.processor';
import { StockBalanceService } from '../services/stock-balance.service';
import { AssetLifecycleService } from '../services/asset-lifecycle.service';
import { StockMovementQueryService } from '../services/stock-movement-query.service';
import { AssetLoanService } from '../services/asset-loan.service';
import { SerializedAssetService } from '../services/serialized-asset.service';
import { InventoryCostingService } from '../services/inventory-costing.service';
import { InventoryDomainEventPublisher } from '../services/inventory-domain-event-publisher.service';
import { StockLedgerService } from '../services/stock-ledger.service';
import { ExecutionOrderEventsProcessor } from '../../../../../worker/src/processors/execution-order-events.processor';
import { ExecutionOrderReliabilityService } from '../../tasks/services/execution-order-reliability.service';
import { ExecutionOrdersService } from '../../tasks/services/execution-orders.service';

const SYNTHETIC_DB = 'i4_qa_20261006_a1';
const REDIS_DB = 15;
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const syntheticDbAvailable =
  process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true' &&
  process.env['DB_NAME'] === SYNTHETIC_DB;
const describeWithDb = syntheticDbAvailable && integrationTenantSlug ? describe : describe.skip;

type OutboxRow = {
  event_id: string;
  tenant_id: string;
  aggregate_id: string;
  aggregate_version: number;
  event_type: OperationalEventEnvelopeV1['eventType'];
  payload: OperationalEventEnvelopeV1['payload'];
  correlation_id: string;
  occurred_at: Date | string;
};

function safeClassName(error: unknown): string {
  return error instanceof Error ? error.constructor.name : 'NonErrorThrow';
}

function uuidV5(name: string): string {
  const namespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  const digest = createHash('sha1').update(namespace).update(name).digest().subarray(0, 16);
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x50;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describeWithDb('R-CA04 — recorrido MOD11 → Redis → MOD12 → recibo → proyección', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let schemaName: string;
  let tasksService: ExecutionOrdersService;
  let eventProcessor: ExecutionOrderEventsProcessor;
  let apiProcessor: InventoryExecutionRequestProcessor;
  let requestQueue: Queue;
  let eventsQueue: Queue;
  let dlqQueue: Queue;
  let eventsWorker: Worker;
  let apiWorker: Worker;
  let redisPrefix: string;
  let signingKey: string;
  let categoryId: string;
  let activeItemId: string;
  let inactiveItemId: string;
  let serialItemId: string;
  let serialOtherLocationId: string;
  const createdOrderIds: string[] = [];
  const createdIntentIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdSerialNumbers: string[] = [];
  const createdStockLocationIds: string[] = [];
  const processedJobIds: string[] = [];

  const tenantContext = () => ({
    tenantId,
    schemaName,
    tenantSlug: integrationTenantSlug!,
  });

  const configValues: Record<string, string | number> = {};
  const config = {
    get: <T = string>(name: string): T | undefined => configValues[name] as T | undefined,
    getOrThrow: <T = string>(name: string): T => {
      const value = configValues[name];
      if (value === undefined) throw new Error(`Missing local integration configuration: ${name}`);
      return value as T;
    },
  } as ConfigService;

  async function waitCompleted(worker: Worker, jobId: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error('WORKER_COMPLETION_TIMEOUT')), 20_000);
      const onCompleted = (job: Job | undefined) => {
        if (job?.id !== jobId) return;
        finish(undefined, job.attemptsMade);
      };
      const onFailed = (job: Job | undefined, error: Error) => {
        if (job?.id !== jobId) return;
        finish(new Error(safeClassName(error)));
      };
      const finish = (error?: Error, attempts?: number) => {
        clearTimeout(timeout);
        worker.off('completed', onCompleted);
        worker.off('failed', onFailed);
        if (error) reject(error);
        else resolve(attempts ?? 0);
      };
      worker.on('completed', onCompleted);
      worker.on('failed', onFailed);
    });
  }

  async function createOrderAndUsage(input: {
    itemId: string;
    serialNumber?: string;
    finalDisposition?: InventoryDisposition;
    action?: ExecutionOrderItemAction;
    subscriberId?: string | null;
  }): Promise<{ orderId: string; inventoryRequestId: string; actor: JwtPayload }> {
    const technicianId = randomUUID();
    const actor: JwtPayload = {
      sub: technicianId,
      email: 'actor-r-ca04@example.test',
      role: UserRole.TECHNICIAN,
      tenantId,
      schemaName,
      jti: randomUUID(),
      type: 'tenant',
    };
    const created = await TenantContext.run(tenantContext(), () =>
      tasksService.createFromScheduling(
        {
          scheduleEventId: randomUUID(),
          assignedTechnicianId: technicianId,
          assignedCrewId: null,
          originContext: 'R-CA04-INTEGRATION',
          originRefId: `r-ca04-${randomUUID()}`,
          customerDisplayLabel: 'Cliente de prueba sintético',
          subscriberId: input.subscriberId ?? null,
          workType: WfmWorkType.INSTALLATION,
          workSummary: 'Prueba integrada de rechazo de inventario',
          plannedWindowStartAt: '2030-02-01T10:00:00.000Z',
          plannedWindowEndAt: '2030-02-01T11:00:00.000Z',
        },
        actor,
      ),
    );
    createdOrderIds.push(created.id);
    await TenantContext.run(tenantContext(), () => tasksService.start(created.id, {}, actor));
    const usage = await TenantContext.run(tenantContext(), () =>
      tasksService.registerItemUsage(
        created.id,
        {
          itemId: input.itemId,
          technicianCustodyId: technicianId,
          quantity: 1,
          ...(input.serialNumber ? { serialNumber: input.serialNumber } : {}),
          action: input.action ?? ExecutionOrderItemAction.INSTALL,
          finalDisposition: input.finalDisposition ?? InventoryDisposition.INSTALLED_AT_CUSTOMER,
        },
        actor,
        { idempotencyKey: `r-ca04-${randomUUID()}`, correlationId: randomUUID() },
      ),
    );
    const inventoryRequestId = usage.inventoryRequestId;
    if (!inventoryRequestId) throw new Error('INVENTORY_REQUEST_ID_MISSING');
    createdIntentIds.push(inventoryRequestId);
    createdRequestIds.push(inventoryRequestId);
    return { orderId: created.id, inventoryRequestId, actor };
  }

  async function readRequestOutbox(inventoryRequestId: string): Promise<{
    row: OutboxRow;
    envelope: OperationalEventEnvelopeV1;
  }> {
    return TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const rows = (await qr.query(
          `SELECT event_id, tenant_id, aggregate_id, aggregate_version,
                  event_type, payload, correlation_id, occurred_at
             FROM execution_order_outbox_events
            WHERE tenant_id = $1 AND payload ->> 'inventoryRequestId' = $2
              AND event_type = 'InventoryConsumptionRequestedV2'
            ORDER BY occurred_at DESC
            LIMIT 1`,
          [tenantId, inventoryRequestId],
        )) as OutboxRow[];
        const row = rows[0];
        if (!row) throw new Error('INVENTORY_REQUEST_OUTBOX_MISSING');
        const envelope = {
          eventId: row.event_id,
          eventType: row.event_type,
          tenantId: row.tenant_id,
          aggregateId: row.aggregate_id,
          aggregateVersion: Number(row.aggregate_version),
          occurredAt: new Date(row.occurred_at).toISOString(),
          correlationId: row.correlation_id,
          payload: row.payload,
        } as OperationalEventEnvelopeV1;
        createdEventIds.push(row.event_id);
        return { row, envelope };
      }),
    );
  }

  async function runThroughRealQueues(
    orderId: string,
    inventoryRequestId: string,
  ): Promise<{
    workerAttempts: number;
    apiAttempts: number;
    responseAttempts: number;
    apiErrorClass: string | null;
  }> {
    const { row, envelope } = await readRequestOutbox(inventoryRequestId);
    const sourceJobId = `r-ca04-source-${row.event_id}`;
    const responseEventId = uuidV5(inventoryRequestId);
    const responseJobId = `inventory-response-${responseEventId}`;
    const sourceCompletion = waitCompleted(eventsWorker, sourceJobId);
    const requestCompletion = waitCompleted(apiWorker, row.event_id);
    const responseCompletion = waitCompleted(eventsWorker, responseJobId);
    const sourceJob = await eventsQueue.add(
      'deliver-execution-event',
      { tenantId, envelope },
      { jobId: sourceJobId, attempts: 1, removeOnComplete: false, removeOnFail: false },
    );
    processedJobIds.push(sourceJob.id!);
    let apiErrorClass: string | null = null;
    const workerAttempts = await sourceCompletion;
    let apiAttempts = 0;
    try {
      apiAttempts = await requestCompletion;
    } catch (error) {
      apiErrorClass = error instanceof Error ? error.message : safeClassName(error);
    }
    if (apiErrorClass === null) {
      const responseAttempts = await responseCompletion;
      return { workerAttempts, apiAttempts, responseAttempts, apiErrorClass };
    }
    return { workerAttempts, apiAttempts, responseAttempts: 0, apiErrorClass };
  }

  async function seedFixtures(): Promise<void> {
    categoryId = randomUUID();
    activeItemId = randomUUID();
    inactiveItemId = randomUUID();
    serialItemId = randomUUID();
    serialOtherLocationId = randomUUID();
    const categoryCode = `RCA04-${randomUUID().slice(0, 8)}`;
    const prefix = randomUUID().replaceAll('-', '').slice(0, 3).toUpperCase();
    await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await qr.query(
          `INSERT INTO inventory_categories
             (id, tenant_id, code, code_prefix, name, status, sort_order)
           VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 0)`,
          [categoryId, tenantId, categoryCode, prefix, 'Categoria R-CA04 sintética'],
        );
        for (const [id, sku, status, trackingMode, itemKind] of [
          [
            activeItemId,
            `RCA04-ACTIVE-${randomUUID().slice(0, 8)}`,
            InventoryItemStatus.ACTIVE,
            InventoryTrackingMode.CONSUMABLE,
            InventoryItemKind.CONSUMABLE,
          ],
          [
            inactiveItemId,
            `RCA04-INACTIVE-${randomUUID().slice(0, 8)}`,
            InventoryItemStatus.INACTIVE,
            InventoryTrackingMode.CONSUMABLE,
            InventoryItemKind.STOCK,
          ],
          [
            serialItemId,
            `RCA04-SERIAL-${randomUUID().slice(0, 8)}`,
            InventoryItemStatus.ACTIVE,
            InventoryTrackingMode.SERIALIZED,
            InventoryItemKind.SERIALIZED,
          ],
        ] as const) {
          await qr.query(
            `INSERT INTO inventory_items
               (id, tenant_id, sku, name, item_kind, category, category_id, tracking_mode,
                unit_of_measure, status, purchasable, inventory_controlled, asset_controlled)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'UNIT', $9, true, true, $10)`,
            [
              id,
              tenantId,
              sku,
              'Artículo de prueba R-CA04',
              itemKind,
              InventoryItemCategory.CPE,
              categoryId,
              trackingMode,
              status,
              trackingMode === InventoryTrackingMode.SERIALIZED,
            ],
          );
        }
        const otherTechId = randomUUID();
        await qr.query(
          `INSERT INTO stock_locations
             (id, tenant_id, code, name, type, status, responsible_ref_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            serialOtherLocationId,
            tenantId,
            `RCA04-${randomUUID().slice(0, 8)}`,
            'Ubicación sintética ajena',
            StockLocationType.MOBILE_TECHNICIAN,
            StockLocationStatus.ACTIVE,
            otherTechId,
          ],
        );
        createdStockLocationIds.push(serialOtherLocationId);
        const serialNumber = `RCA04-${randomUUID()}`;
        createdSerialNumbers.push(serialNumber);
        await qr.query(
          `INSERT INTO serialized_assets
             (id, tenant_id, inventory_item_id, serial_number, normalized_serial_number,
              current_status, current_location_id, current_responsible_type,
              current_responsible_ref_id)
           VALUES ($1, $2, $3, $4, $5, 'ASSIGNED_TO_TECHNICIAN', $6, 'TECHNICIAN', $7)`,
          [
            randomUUID(),
            tenantId,
            serialItemId,
            serialNumber,
            serialNumber.toUpperCase(),
            serialOtherLocationId,
            otherTechId,
          ],
        );
      }),
    );
  }

  async function seedActiveMobileCustody(responsibleRefId: string): Promise<string> {
    const locationId = randomUUID();
    expect(locationId).not.toBe(responsibleRefId);
    await TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await qr.query(
          `INSERT INTO stock_locations
             (id, tenant_id, code, name, type, status, responsible_ref_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            locationId,
            tenantId,
            `RCA04-${randomUUID().slice(0, 8)}`,
            'Custodia móvil sintética',
            StockLocationType.MOBILE_TECHNICIAN,
            StockLocationStatus.ACTIVE,
            responsibleRefId,
          ],
        );
      }),
    );
    createdStockLocationIds.push(locationId);
    return locationId;
  }

  async function readOutcome(inventoryRequestId: string): Promise<{
    outcome: string;
    reason_code: string | null;
    movement_status: string | null;
    rejection_reason_code: string | null;
  }> {
    return TenantContext.run(tenantContext(), () =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        const rows = (await qr.query(
          `SELECT receipt.outcome, receipt.reason_code,
                  usage.movement_status, usage.rejection_reason_code
             FROM inventory_execution_request_receipts receipt
             JOIN execution_order_item_usage usage
               ON usage.tenant_id = receipt.tenant_id
              AND usage.inventory_request_id = receipt.inventory_request_id
            WHERE receipt.tenant_id = $1 AND receipt.inventory_request_id = $2`,
          [tenantId, inventoryRequestId],
        )) as Array<{
          outcome: string;
          reason_code: string | null;
          movement_status: string | null;
          rejection_reason_code: string | null;
        }>;
        if (!rows[0]) throw new Error('INVENTORY_RECEIPT_OR_PROJECTION_MISSING');
        return rows[0];
      }),
    );
  }

  beforeAll(async () => {
    if (process.env['DB_NAME'] !== SYNTHETIC_DB) {
      throw new Error('La prueba exige la base sintética i4_qa_20261006_a1.');
    }
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        ...((dataSourceOptions.entities ?? []) as unknown as Function[]),
        ExecutionOrderActivity,
        ExecutionOrderItemUsage,
        ExecutionOrderStatusTransition,
        InventoryCategory,
        InventoryItem,
        StockBalance,
        StockLocation,
        SerializedAsset,
        PurchaseOrder,
        PurchaseOrderLine,
        PurchaseRequestLine,
      ],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 6, min: 1 },
    });
    await dataSource.initialize();
    const tenants = (await dataSource.query(
      'SELECT id, schema_name FROM public.tenants WHERE slug = $1 LIMIT 1',
      [integrationTenantSlug],
    )) as Array<{ id: string; schema_name: string }>;
    if (!tenants[0] || !tenants[0].schema_name.startsWith('tenant_i4_qa_')) {
      throw new Error('El tenant de integración no pertenece al esquema sintético permitido.');
    }
    tenantId = tenants[0].id;
    schemaName = tenants[0].schema_name;

    signingKey = randomBytes(32).toString('base64');
    redisPrefix = `rca04${randomUUID().replaceAll('-', '')}`;
    const postgresOptions = dataSourceOptions as PostgresConnectionOptions;
    configValues['DB_HOST'] = postgresOptions.host ?? '127.0.0.1';
    configValues['DB_PORT'] = postgresOptions.port ?? 5433;
    const dbCredentials = resolveMigrationDbCredentials();
    configValues['DB_USER'] = dbCredentials.username;
    configValues['DB_PASSWORD'] = dbCredentials.password;
    configValues['DB_NAME'] = SYNTHETIC_DB;
    configValues['INTERNAL_QUEUE_SIGNING_KEY'] = signingKey;

    const connection = { host: '127.0.0.1', port: 6380, db: REDIS_DB };
    const queueOptions = { connection, prefix: redisPrefix };
    requestQueue = new Queue(INVENTORY_EXECUTION_REQUESTS_QUEUE, queueOptions);
    eventsQueue = new Queue(OPERATIONS_EXECUTION_EVENTS_QUEUE, queueOptions);
    dlqQueue = new Queue(OPERATIONS_EXECUTION_DLQ, queueOptions);
    await Promise.all([
      requestQueue.waitUntilReady(),
      eventsQueue.waitUntilReady(),
      dlqQueue.waitUntilReady(),
    ]);

    eventProcessor = new ExecutionOrderEventsProcessor(config, dlqQueue, requestQueue);
    const stockBalance = new StockBalanceService(dataSource);
    const assetLifecycle = new AssetLifecycleService(dataSource);
    const movementQuery = new StockMovementQueryService(dataSource);
    const assetLoan = new AssetLoanService(dataSource);
    const serializedAsset = new SerializedAssetService(
      dataSource,
      assetLifecycle,
      movementQuery,
      {} as never,
      assetLoan,
    );
    const domainPublisher = new InventoryDomainEventPublisher(new EventEmitter2());
    const ledger = new StockLedgerService(
      dataSource,
      stockBalance,
      serializedAsset,
      assetLifecycle,
      new InventoryCostingService(),
      assetLoan,
      domainPublisher,
    );
    apiProcessor = new InventoryExecutionRequestProcessor(
      dataSource,
      config,
      ledger,
      eventsQueue,
      dlqQueue,
      requestQueue,
    );

    eventsWorker = new Worker(
      OPERATIONS_EXECUTION_EVENTS_QUEUE,
      (job) => eventProcessor.process(job as Job),
      queueOptions,
    );
    apiWorker = new Worker(
      INVENTORY_EXECUTION_REQUESTS_QUEUE,
      (job) => apiProcessor.process(job as Job<unknown>),
      queueOptions,
    );
    await Promise.all([eventsWorker.waitUntilReady(), apiWorker.waitUntilReady()]);

    const reliability = new ExecutionOrderReliabilityService({
      getOrThrow: () => 'r-ca04-idempotency-secret',
    } as never);
    tasksService = new ExecutionOrdersService(
      dataSource,
      undefined,
      undefined,
      undefined,
      reliability,
    );
    await seedFixtures();
  });

  afterAll(async () => {
    if (apiWorker) await apiWorker.close();
    if (eventsWorker) await eventsWorker.close();
    if (eventProcessor) {
      const eventPool = eventProcessor as unknown as { pool?: { end: () => Promise<void> } };
      await eventPool.pool?.end();
    }

    if (requestQueue && createdEventIds.length > 0) {
      for (const id of createdEventIds) {
        const job = await requestQueue.getJob(id);
        if (job) await job.remove().catch(() => undefined);
      }
    }
    if (eventsQueue) {
      for (const id of processedJobIds) {
        const job = await eventsQueue.getJob(id);
        if (job) await job.remove().catch(() => undefined);
      }
      for (const requestId of createdRequestIds) {
        const id = `inventory-response-${uuidV5(requestId)}`;
        const job = await eventsQueue.getJob(id);
        if (job) await job.remove().catch(() => undefined);
      }
    }

    if (dataSource?.isInitialized && tenantId && schemaName) {
      await TenantContext.run(tenantContext(), () =>
        runInTenantSchema(dataSource, schemaName, async (qr) => {
          if (createdRequestIds.length > 0) {
            await qr.query(
              'DELETE FROM inventory_execution_request_receipts WHERE tenant_id = $1 AND inventory_request_id = ANY($2::uuid[])',
              [tenantId, createdRequestIds],
            );
            await qr.query(
              'DELETE FROM execution_order_inbox_events WHERE event_id = ANY($1::uuid[])',
              [createdEventIds],
            );
          }
          if (createdOrderIds.length > 0) {
            await qr.query(
              'DELETE FROM execution_order_item_usage WHERE execution_order_id = ANY($1::uuid[])',
              [createdOrderIds],
            );
            await qr.query(
              'DELETE FROM execution_order_activities WHERE execution_order_id = ANY($1::uuid[])',
              [createdOrderIds],
            );
            await qr.query(
              'DELETE FROM execution_order_status_transitions WHERE execution_order_id = ANY($1::uuid[])',
              [createdOrderIds],
            );
            await qr.query(
              'DELETE FROM execution_order_outbox_events WHERE aggregate_id = ANY($1::uuid[])',
              [createdOrderIds],
            );
            if (createdEventIds.length > 0) {
              await qr.query(
                'DELETE FROM execution_order_outbox_events WHERE event_id = ANY($1::uuid[])',
                [createdEventIds],
              );
            }
            await qr.query(
              'DELETE FROM execution_order_inbox_events WHERE aggregate_id = ANY($1::uuid[])',
              [createdOrderIds],
            );
            if (createdIntentIds.length > 0) {
              await qr.query(
                'DELETE FROM execution_order_audit_intents WHERE intent_id = ANY($1::uuid[])',
                [createdIntentIds],
              );
              await qr.query(
                'DELETE FROM execution_order_idempotency_records WHERE intent_id = ANY($1::uuid[])',
                [createdIntentIds],
              );
            }
            await qr.manager.delete(ExecutionOrder, createdOrderIds);
          }
          if (createdSerialNumbers.length > 0) {
            await qr.query(
              'DELETE FROM serialized_assets WHERE tenant_id = $1 AND serial_number = ANY($2::varchar[])',
              [tenantId, createdSerialNumbers],
            );
          }
          if (createdStockLocationIds.length > 0) {
            await qr.query(
              'DELETE FROM stock_locations WHERE tenant_id = $1 AND id = ANY($2::uuid[])',
              [tenantId, createdStockLocationIds],
            );
          }
          if (categoryId) {
            await qr.query(
              'DELETE FROM inventory_items WHERE tenant_id = $1 AND category_id = $2',
              [tenantId, categoryId],
            );
            await qr.query('DELETE FROM inventory_categories WHERE tenant_id = $1 AND id = $2', [
              tenantId,
              categoryId,
            ]);
          }
        }),
      );
      await dataSource.destroy();
    }
    await Promise.all([requestQueue?.close(), eventsQueue?.close(), dlqQueue?.close()]);
  });

  it('SUBSCRIBER_REQUIRED llega al recibo y a REJECTED en la proyección sin reintento', async () => {
    const result = await createOrderAndUsage({ itemId: randomUUID() });
    const processing = runThroughRealQueues(result.orderId, result.inventoryRequestId);
    const { workerAttempts, apiAttempts, responseAttempts, apiErrorClass } = await processing;
    expect(apiErrorClass).toBeNull();
    expect(workerAttempts).toBe(1);
    expect(apiAttempts).toBe(1);
    expect(responseAttempts).toBe(1);
    const outcome = await readOutcome(result.inventoryRequestId);
    expect(outcome).toMatchObject({
      outcome: 'REJECTED',
      reason_code: 'SUBSCRIBER_REQUIRED',
      movement_status: 'REJECTED',
      rejection_reason_code: 'SUBSCRIBER_REQUIRED',
    });
  });

  it('CUSTODY_INSUFFICIENT llega al recibo y a REJECTED sin reintento', async () => {
    const result = await createOrderAndUsage({
      itemId: activeItemId,
      subscriberId: randomUUID(),
    });
    await seedActiveMobileCustody(result.actor.sub);
    const attempts = await runThroughRealQueues(result.orderId, result.inventoryRequestId);
    expect(attempts).toMatchObject({
      workerAttempts: 1,
      apiAttempts: 1,
      responseAttempts: 1,
      apiErrorClass: null,
    });
    expect(await readOutcome(result.inventoryRequestId)).toMatchObject({
      outcome: 'REJECTED',
      reason_code: 'CUSTODY_INSUFFICIENT',
      movement_status: 'REJECTED',
      rejection_reason_code: 'CUSTODY_INSUFFICIENT',
    });
  });

  it('ITEM_INACTIVE llega al recibo y a REJECTED sin reintento', async () => {
    const result = await createOrderAndUsage({
      itemId: inactiveItemId,
      subscriberId: randomUUID(),
    });
    await seedActiveMobileCustody(result.actor.sub);
    const attempts = await runThroughRealQueues(result.orderId, result.inventoryRequestId);
    expect(attempts).toMatchObject({
      workerAttempts: 1,
      apiAttempts: 1,
      responseAttempts: 1,
      apiErrorClass: null,
    });
    expect(await readOutcome(result.inventoryRequestId)).toMatchObject({
      outcome: 'REJECTED',
      reason_code: 'ITEM_INACTIVE',
      movement_status: 'REJECTED',
      rejection_reason_code: 'ITEM_INACTIVE',
    });
  });

  it('SERIAL_NOT_IN_CUSTODY llega al recibo y a REJECTED sin reintento', async () => {
    const result = await createOrderAndUsage({
      itemId: serialItemId,
      serialNumber: createdSerialNumbers[0]!,
      subscriberId: randomUUID(),
    });
    await seedActiveMobileCustody(result.actor.sub);
    const attempts = await runThroughRealQueues(result.orderId, result.inventoryRequestId);
    expect(attempts).toMatchObject({
      workerAttempts: 1,
      apiAttempts: 1,
      responseAttempts: 1,
      apiErrorClass: null,
    });
    expect(await readOutcome(result.inventoryRequestId)).toMatchObject({
      outcome: 'REJECTED',
      reason_code: 'SERIAL_NOT_IN_CUSTODY',
      movement_status: 'REJECTED',
      rejection_reason_code: 'SERIAL_NOT_IN_CUSTODY',
    });
  });
});
