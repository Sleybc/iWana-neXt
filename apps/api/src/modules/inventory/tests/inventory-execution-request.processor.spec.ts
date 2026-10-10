import { createHmac } from 'node:crypto';
import { Queue, UnrecoverableError } from 'bullmq';
import { EntityManager } from 'typeorm';
import {
  ExecutionOrderItemAction,
  INVENTORY_SOURCE_CLEANUP_INTERVAL_MS,
  INVENTORY_SOURCE_MAX_AGE_MS,
  InventoryDisposition,
  SignedInventoryExecutionReversalRequest,
  SignedInventoryExecutionRequest,
  canonicalizeInventoryExecutionRequest,
} from '@iwana/shared';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { StockLocation } from '@iwana/db';
import { StockLocationStatus, StockLocationType } from '@iwana/shared';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InventoryBusinessRejection } from '../services/inventory-business-rejection';
import { InventoryExecutionRequestProcessor } from '../services/inventory-execution-request.processor';
import { StockLedgerService } from '../services/stock-ledger.service';

jest.mock('@iwana/db', () => ({
  StockLocation: class StockLocation {},
  TenantContext: { run: jest.fn((_context, callback: () => unknown) => callback()) },
  isValidSchemaName: jest.fn(() => true),
  runInTenantSchema: jest.fn(),
}));

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ORDER_ID = '20000000-0000-4000-8000-000000000001';
const REQUEST_ID = '30000000-0000-4000-8000-000000000001';
const ITEM_ID = '40000000-0000-4000-8000-000000000001';
const CUSTODY_ID = '50000000-0000-4000-8000-000000000001';
const CUSTODY_LOCATION_ID = 'loc-mobile-not-technician-id';
const ACTOR_ID = '60000000-0000-4000-8000-000000000001';
const SUBSCRIBER_ID = '70000000-0000-4000-8000-000000000001';
const REQUEST_EVENT_ID = '80000000-0000-4000-8000-000000000001';
const MOVEMENT_ID = '90000000-0000-4000-8000-000000000001';
const ORIGINAL_MOVEMENT_ID = '90000000-0000-4000-8000-000000000002';
const REVERSAL_REQUEST_ID = '30000000-0000-4000-8000-000000000002';
const DECIDED_AT = '2026-10-06T12:00:00.000Z';
const SIGNING_KEY = Buffer.alloc(32, 7);

interface CleanupTestJob {
  id: string;
  data: unknown;
  finishedOn: number;
}

function makeSignedRequest(
  payloadOverrides: Partial<SignedInventoryExecutionRequest['envelope']['payload']> = {},
): SignedInventoryExecutionRequest {
  const envelope: SignedInventoryExecutionRequest['envelope'] = {
    eventId: REQUEST_EVENT_ID,
    eventType: 'InventoryConsumptionRequestedV2',
    tenantId: TENANT_ID,
    aggregateId: ORDER_ID,
    aggregateVersion: 4,
    occurredAt: DECIDED_AT,
    correlationId: REQUEST_ID,
    payload: {
      executionOrderId: ORDER_ID,
      eventId: REQUEST_EVENT_ID,
      intentId: REQUEST_ID,
      inventoryRequestId: REQUEST_ID,
      itemId: ITEM_ID,
      quantity: 1,
      technicianCustodyId: CUSTODY_ID,
      action: ExecutionOrderItemAction.INSTALL,
      finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      subscriberId: SUBSCRIBER_ID,
      actorUserId: ACTOR_ID,
      ...payloadOverrides,
    },
  };
  return {
    tenantId: TENANT_ID,
    envelope,
    signature: createHmac('sha256', SIGNING_KEY)
      .update(canonicalizeInventoryExecutionRequest(TENANT_ID, envelope))
      .digest('hex'),
  };
}

function makeSignedReversalRequest(): SignedInventoryExecutionReversalRequest {
  const envelope: SignedInventoryExecutionReversalRequest['envelope'] = {
    eventId: REQUEST_EVENT_ID,
    eventType: 'InventoryConsumptionReversalRequestedV1',
    tenantId: TENANT_ID,
    aggregateId: ORDER_ID,
    aggregateVersion: 5,
    occurredAt: DECIDED_AT,
    correlationId: REVERSAL_REQUEST_ID,
    payload: {
      executionOrderId: ORDER_ID,
      reversalRequestId: REVERSAL_REQUEST_ID,
      inventoryRequestId: REQUEST_ID,
      originalStockMovementId: ORIGINAL_MOVEMENT_ID,
      technicianCustodyId: CUSTODY_ID,
      actorUserId: ACTOR_ID,
    },
  };
  return {
    tenantId: TENANT_ID,
    envelope,
    signature: createHmac('sha256', SIGNING_KEY)
      .update(canonicalizeInventoryExecutionRequest(TENANT_ID, envelope))
      .digest('hex'),
  };
}

function makeJob(data: unknown) {
  return {
    data,
    attemptsMade: 0,
    opts: { attempts: 8 },
    id: REQUEST_EVENT_ID,
  } as never;
}

describe('InventoryExecutionRequestProcessor', () => {
  let processor: InventoryExecutionRequestProcessor;
  let dataSource: { query: jest.Mock };
  let stockLedger: {
    recordExecutionOrderMovementForInventoryRequest: jest.Mock;
    reverseExecutionOrderMovementForInventoryRequest: jest.Mock;
  };
  let responseQueue: { add: jest.Mock; clean: jest.Mock };
  let dlqQueue: { add: jest.Mock };
  let requestQueue: { add: jest.Mock; clean: jest.Mock };
  let queryRunner: { query: jest.Mock; manager: { query: jest.Mock; findOne: jest.Mock } };
  let receipt: Record<string, unknown> | null;
  let receiptReads: number;

  beforeEach(() => {
    receipt = null;
    receiptReads = 0;
    dataSource = {
      query: jest
        .fn()
        .mockResolvedValue([
          { id: TENANT_ID, slug: 'test', schema_name: 'tenant_test001', status: 'ACTIVE' },
        ]),
    };
    queryRunner = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT kind, outcome')) {
          receiptReads += 1;
          return receiptReads <= 2 && !receipt ? [] : receipt ? [receipt] : [];
        }
        return [];
      }),
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: CUSTODY_LOCATION_ID,
          tenantId: TENANT_ID,
          responsibleRefId: CUSTODY_ID,
          type: StockLocationType.MOBILE_TECHNICIAN,
          status: StockLocationStatus.ACTIVE,
        }),
        query: jest.fn(async (sql: string, params: unknown[]) => {
          if (sql.includes('INSERT INTO inventory_execution_request_receipts')) {
            receipt = {
              kind: params[2],
              outcome: params[6],
              stock_movement_id: params[7],
              original_stock_movement_id: params[8],
              reason_code: params[9],
              execution_order_id: params[4],
              aggregate_version: params[5],
              decided_at: DECIDED_AT,
            };
          }
          return [];
        }),
      },
    };
    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (runner: typeof queryRunner) => Promise<unknown>,
      ) => callback(queryRunner),
    );
    stockLedger = {
      recordExecutionOrderMovementForInventoryRequest: jest.fn(
        async (
          _input: unknown,
          _principal: unknown,
          _technicianCustodyLocationId: string,
          persist: (
            manager: EntityManager,
            movement: { movement: { id: string } },
          ) => Promise<void>,
        ) => persist(queryRunner.manager as never, { movement: { id: MOVEMENT_ID } }),
      ),
      reverseExecutionOrderMovementForInventoryRequest: jest.fn(
        async (
          _input: unknown,
          _principal: unknown,
          persist: (
            manager: EntityManager,
            movement: { movement: { id: string } },
            originalMovementId: string,
          ) => Promise<void>,
        ) =>
          persist(
            queryRunner.manager as never,
            { movement: { id: MOVEMENT_ID } },
            ORIGINAL_MOVEMENT_ID,
          ),
      ),
    };
    responseQueue = {
      add: jest.fn().mockResolvedValue({ id: 'accepted' }),
      clean: jest.fn().mockResolvedValue([]),
    };
    dlqQueue = { add: jest.fn().mockResolvedValue({ id: 'dlq-accepted' }) };
    requestQueue = {
      add: jest.fn().mockResolvedValue({ id: 'cleanup-scheduled' }),
      clean: jest.fn().mockResolvedValue([]),
    };
    processor = new InventoryExecutionRequestProcessor(
      dataSource as unknown as DataSource,
      {
        get: jest.fn((name: string) =>
          name === 'INTERNAL_QUEUE_SIGNING_KEY' ? SIGNING_KEY.toString('base64') : undefined,
        ),
      } as unknown as ConfigService,
      stockLedger as unknown as StockLedgerService,
      responseQueue as unknown as Queue,
      dlqQueue as unknown as Queue,
      requestQueue as unknown as Queue,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('programa limpieza horaria y borra jobs antiguos sin leer su contenido con solo API activo', async () => {
    const now = Date.now();
    const cleanupGraceMs = INVENTORY_SOURCE_MAX_AGE_MS - INVENTORY_SOURCE_CLEANUP_INTERVAL_MS;
    const failedAt = now - (23 * 60 * 60 * 1000 + 30 * 60 * 1000);
    const requestJobs: CleanupTestJob[] = [
      { id: 'malformed-old', data: { malformed: true }, finishedOn: failedAt },
      ...Array.from({ length: 1_000 }, (_, index) => ({
        id: `old-request-${index}`,
        data: null,
        finishedOn: failedAt,
      })),
      {
        id: 'recent',
        data: { eventType: 'InventoryConsumptionRequestedV2' },
        finishedOn: now - 60_000,
      },
    ];
    const eventJobs: CleanupTestJob[] = [
      { id: 'missing-event-type', data: {}, finishedOn: failedAt },
    ];
    const cleanByAge = (jobs: CleanupTestJob[]) =>
      jest.fn(async (grace: number, limit: number, type: string) => {
        expect(type).toBe('failed');
        const cutoff = Date.now() - grace;
        const expired = jobs.filter((job) => job.finishedOn <= cutoff).slice(0, limit);
        for (const job of expired) jobs.splice(jobs.indexOf(job), 1);
        return expired.map((job) => job.id);
      });
    requestQueue.clean = cleanByAge(requestJobs);
    responseQueue.clean = cleanByAge(eventJobs);

    await processor.onApplicationBootstrap();
    await processor.process({ name: 'clean-expired-inventory-source-failures' } as never);

    expect(requestQueue.add).toHaveBeenCalledWith(
      'clean-expired-inventory-source-failures',
      {},
      expect.objectContaining({
        jobId: 'inventory-source-cleanup-api',
        repeat: { every: INVENTORY_SOURCE_CLEANUP_INTERVAL_MS },
      }),
    );
    expect(INVENTORY_SOURCE_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
    expect(INVENTORY_SOURCE_CLEANUP_INTERVAL_MS).toBe(60 * 60 * 1000);
    expect(cleanupGraceMs).toBe(23 * 60 * 60 * 1000);
    expect(requestQueue.clean).toHaveBeenCalledTimes(2);
    expect(requestQueue.clean).toHaveBeenNthCalledWith(1, cleanupGraceMs, 1_000, 'failed');
    expect(requestQueue.clean).toHaveBeenNthCalledWith(2, cleanupGraceMs, 1_000, 'failed');
    expect(responseQueue.clean).toHaveBeenCalledWith(cleanupGraceMs, 1_000, 'failed');
    expect(requestJobs.map(({ id }) => id)).toEqual(['recent']);
    expect(eventJobs).toHaveLength(0);
  });

  it('valida la firma, escribe el recibo con el movimiento y reemite respuesta determinista', async () => {
    const job = makeJob(makeSignedRequest());

    await processor.process(job);
    await processor.process(job);

    expect(stockLedger.recordExecutionOrderMovementForInventoryRequest).toHaveBeenCalledTimes(1);
    expect(stockLedger.recordExecutionOrderMovementForInventoryRequest.mock.calls[0]?.[1]).toEqual({
      sub: ACTOR_ID,
    });
    expect(
      (
        stockLedger.recordExecutionOrderMovementForInventoryRequest.mock.calls[0]?.[0] as {
          subscriberId: string | undefined;
        }
      ).subscriberId,
    ).toBe(SUBSCRIBER_ID);
    expect(stockLedger.recordExecutionOrderMovementForInventoryRequest.mock.calls[0]?.[2]).toBe(
      CUSTODY_LOCATION_ID,
    );
    expect(queryRunner.manager.findOne).toHaveBeenCalledWith(
      StockLocation,
      expect.objectContaining({
        where: {
          tenantId: TENANT_ID,
          responsibleRefId: CUSTODY_ID,
          type: StockLocationType.MOBILE_TECHNICIAN,
          status: StockLocationStatus.ACTIVE,
        },
      }),
    );
    expect(queryRunner.manager.query).toHaveBeenCalledTimes(1);
    expect(responseQueue.add).toHaveBeenCalledTimes(2);
    const first = responseQueue.add.mock.calls[0]?.[1] as {
      tenantId: string;
      envelope: { eventId: string; eventType: string; payload: { stockMovementId: string } };
    };
    const second = responseQueue.add.mock.calls[1]?.[1] as typeof first;
    expect(first.envelope.eventId).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(first.envelope.eventId).toBe(second.envelope.eventId);
    expect(first.envelope.eventType).toBe('InventoryMovementConfirmedV1');
    expect(first.envelope.payload.stockMovementId).toBe(MOVEMENT_ID);
    expect(responseQueue.add.mock.calls[0]?.[2]).toMatchObject({
      jobId: `inventory-response-${first.envelope.eventId}`,
      attempts: 8,
      removeOnComplete: true,
      removeOnFail: { age: 24 * 60 * 60 },
    });
    expect(TenantContext.run).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, schemaName: 'tenant_test001', tenantSlug: 'test' },
      expect.any(Function),
    );
  });

  it('procesa el reverso firmado con recibo y respuesta deterministas', async () => {
    const job = makeJob(makeSignedReversalRequest());

    await processor.process(job);
    await processor.process(job);

    expect(stockLedger.reverseExecutionOrderMovementForInventoryRequest).toHaveBeenCalledTimes(1);
    expect(stockLedger.reverseExecutionOrderMovementForInventoryRequest.mock.calls[0]?.[0]).toEqual(
      {
        executionOrderId: ORDER_ID,
        reversalRequestId: REVERSAL_REQUEST_ID,
        originalStockMovementId: ORIGINAL_MOVEMENT_ID,
        technicianCustodyId: CUSTODY_ID,
      },
    );
    expect(queryRunner.manager.query).toHaveBeenCalledTimes(1);
    expect(queryRunner.manager.query.mock.calls[0]?.[1]).toEqual([
      expect.any(String),
      TENANT_ID,
      'REVERSAL',
      REVERSAL_REQUEST_ID,
      ORDER_ID,
      5,
      'CONFIRMED',
      MOVEMENT_ID,
      ORIGINAL_MOVEMENT_ID,
      null,
    ]);
    expect(responseQueue.add).toHaveBeenCalledTimes(2);
    const first = responseQueue.add.mock.calls[0]?.[1] as {
      envelope: { eventId: string; eventType: string; payload: Record<string, unknown> };
    };
    const second = responseQueue.add.mock.calls[1]?.[1] as typeof first;
    expect(first.envelope.eventType).toBe('InventoryReversalConfirmedV1');
    expect(first.envelope.eventId).toBe(second.envelope.eventId);
    expect(first.envelope.payload).toEqual({
      executionOrderId: ORDER_ID,
      reversalRequestId: REVERSAL_REQUEST_ID,
      stockMovementId: MOVEMENT_ID,
    });
  });

  it.each([
    'REVERSAL_ORIGINAL_NOT_FOUND',
    'REVERSAL_CUSTODY_INACTIVE',
    'REVERSAL_ASSET_MOVED',
    'REVERSAL_LOAN_MISMATCH',
  ] as const)('persiste el rechazo de reverso %s como decisión terminal', async (reasonCode) => {
    stockLedger.reverseExecutionOrderMovementForInventoryRequest.mockRejectedValueOnce(
      new InventoryBusinessRejection(reasonCode),
    );

    await expect(processor.process(makeJob(makeSignedReversalRequest()))).resolves.toBeUndefined();

    expect(queryRunner.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inventory_execution_request_receipts'),
      [
        expect.any(String),
        TENANT_ID,
        'REVERSAL',
        REVERSAL_REQUEST_ID,
        ORDER_ID,
        5,
        'REJECTED',
        null,
        ORIGINAL_MOVEMENT_ID,
        reasonCode,
      ],
    );
    const enqueued = responseQueue.add.mock.calls[0]?.[1] as {
      envelope: { eventType: string; payload: { reversalRequestId: string; reasonCode: string } };
    };
    expect(enqueued.envelope.eventType).toBe('InventoryReversalRejectedV1');
    expect(enqueued.envelope.payload).toEqual({
      executionOrderId: ORDER_ID,
      reversalRequestId: REVERSAL_REQUEST_ID,
      reasonCode,
    });
    expect(responseQueue.add).toHaveBeenCalledTimes(1);
    expect(dlqQueue.add).not.toHaveBeenCalled();
  });

  it('descarta HMAC inválido antes de consultar el tenant', async () => {
    const invalid = { ...makeSignedRequest(), signature: '0'.repeat(64) };

    await expect(processor.process(makeJob(invalid))).rejects.toBeInstanceOf(UnrecoverableError);

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(stockLedger.recordExecutionOrderMovementForInventoryRequest).not.toHaveBeenCalled();
  });

  it('difiere tenant no activo sin convertirlo en rechazo de negocio', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: TENANT_ID, slug: 'test', schema_name: 'tenant_test001', status: 'PROVISIONING' },
    ]);

    await expect(processor.process(makeJob(makeSignedRequest()))).rejects.toMatchObject({
      name: 'InventoryTenantNotActiveError',
    });

    expect(stockLedger.recordExecutionOrderMovementForInventoryRequest).not.toHaveBeenCalled();
    expect(queryRunner.query).not.toHaveBeenCalled();
  });

  it('persiste un rechazo de negocio y devuelve su motivo sin reintentar el job', async () => {
    stockLedger.recordExecutionOrderMovementForInventoryRequest.mockRejectedValueOnce(
      new InventoryBusinessRejection('SERIAL_NOT_IN_CUSTODY'),
    );

    await expectBusinessRejection('SERIAL_NOT_IN_CUSTODY');
    expect(stockLedger.recordExecutionOrderMovementForInventoryRequest).toHaveBeenCalledTimes(1);
  });

  it('persiste SUBSCRIBER_REQUIRED antes de validar la entrada del ledger y completa el job', async () => {
    await expectBusinessRejection('SUBSCRIBER_REQUIRED', makeSignedRequest({ subscriberId: null }));

    expect(stockLedger.recordExecutionOrderMovementForInventoryRequest).not.toHaveBeenCalled();
    expect(queryRunner.manager.findOne).not.toHaveBeenCalled();
  });

  it('persiste ITEM_INACTIVE como rechazo terminal y completa el job', async () => {
    stockLedger.recordExecutionOrderMovementForInventoryRequest.mockRejectedValueOnce(
      new InventoryBusinessRejection('ITEM_INACTIVE'),
    );

    await expectBusinessRejection('ITEM_INACTIVE');
    expect(stockLedger.recordExecutionOrderMovementForInventoryRequest).toHaveBeenCalledTimes(1);
  });

  it('persiste como rechazo terminal la falta de custodia móvil activa y completa el job', async () => {
    queryRunner.manager.findOne.mockResolvedValueOnce(null);

    await expectBusinessRejection('CUSTODY_INSUFFICIENT');
    expect(stockLedger.recordExecutionOrderMovementForInventoryRequest).not.toHaveBeenCalled();
  });

  it('elimina el job fallido solo después de aceptar el diagnóstico permitido', async () => {
    const steps: string[] = [];
    dlqQueue.add.mockImplementation(async () => {
      steps.push('diagnostic');
      return { id: 'dlq-accepted' };
    });
    const remove = jest.fn(async () => {
      steps.push('remove');
    });
    const signed = makeSignedRequest();
    const job = {
      data: signed,
      attemptsMade: 8,
      opts: { attempts: 8 },
      id: REQUEST_EVENT_ID,
      remove,
    } as never;

    await processor.onFailed(job, new Error('mensaje de excepción no permitido'));

    expect(steps).toEqual(['diagnostic', 'remove']);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(dlqQueue.add).toHaveBeenCalledWith(
      'failed-inventory-execution-event',
      expect.objectContaining({
        tenantId: TENANT_ID,
        eventId: REQUEST_EVENT_ID,
        executionOrderId: ORDER_ID,
        inventoryRequestId: REQUEST_ID,
        errorType: 'INVENTORY_EXECUTION_REQUEST_FAILURE',
      }),
      {
        jobId: `dlq-${REQUEST_EVENT_ID}`,
        removeOnComplete: true,
        removeOnFail: { age: 30 * 24 * 60 * 60 },
      },
    );
    const diagnostic = dlqQueue.add.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(diagnostic).sort()).toEqual(
      [
        'attemptsMade',
        'errorType',
        'eventId',
        'executionOrderId',
        'failedAt',
        'inventoryRequestId',
        'tenantId',
      ].sort(),
    );
  });

  it('conserva el identificador del reverso en la DLQ sin incluir el motivo ni el sobre', async () => {
    const signed = makeSignedReversalRequest();
    const privateReason = 'Corrección interna que permanece en MOD11';
    const remove = jest.fn().mockResolvedValue(undefined);
    const data = {
      ...signed,
      envelope: {
        ...signed.envelope,
        payload: { ...signed.envelope.payload, reason: privateReason },
      },
    };

    await processor.onFailed(
      { data, attemptsMade: 8, opts: { attempts: 8 }, remove } as never,
      new Error(privateReason),
    );

    const diagnostic = dlqQueue.add.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(diagnostic).toEqual({
      tenantId: TENANT_ID,
      eventId: REQUEST_EVENT_ID,
      executionOrderId: ORDER_ID,
      inventoryRequestId: REQUEST_ID,
      reversalRequestId: REVERSAL_REQUEST_ID,
      attemptsMade: 8,
      failedAt: expect.any(String),
      errorType: 'INVENTORY_EXECUTION_REQUEST_FAILURE',
    });
    expect(JSON.stringify(diagnostic)).not.toContain(privateReason);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('omite un identificador de reverso inválido del diagnóstico', async () => {
    const signed = makeSignedReversalRequest();
    const remove = jest.fn().mockResolvedValue(undefined);

    await processor.onFailed(
      {
        data: {
          ...signed,
          envelope: {
            ...signed.envelope,
            payload: { ...signed.envelope.payload, reversalRequestId: 'not-a-uuid' },
          },
        },
        attemptsMade: 8,
        opts: { attempts: 8 },
        remove,
      } as never,
      new Error('processor failure'),
    );

    const diagnostic = dlqQueue.add.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(diagnostic).not.toHaveProperty('reversalRequestId');
    expect(diagnostic).toHaveProperty('inventoryRequestId', REQUEST_ID);
  });

  it('escribe diagnóstico sin IDs inválidos y elimina el job fuente tras aceptarlo', async () => {
    const steps: string[] = [];
    dlqQueue.add.mockImplementation(async () => {
      steps.push('diagnostic');
      return { id: 'dlq-accepted' };
    });
    const remove = jest.fn(async () => {
      steps.push('remove');
    });
    const malformed = {
      tenantId: 'not-a-uuid',
      envelope: {
        eventId: 'also-invalid',
        payload: {
          executionOrderId: ORDER_ID,
          inventoryRequestId: REQUEST_ID,
        },
      },
    };

    await processor.onFailed(
      { data: malformed, attemptsMade: 8, opts: { attempts: 8 }, remove } as never,
      new Error('mensaje crudo no permitido'),
    );

    expect(steps).toEqual(['diagnostic', 'remove']);
    const diagnostic = dlqQueue.add.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(diagnostic).sort()).toEqual(['attemptsMade', 'errorType', 'failedAt']);
    expect(diagnostic).toMatchObject({
      attemptsMade: 8,
      errorType: 'INVENTORY_EXECUTION_REQUEST_FAILURE',
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('deja solo log catalogado y conserva el job si no acepta el diagnóstico', async () => {
    const rawMessage = 'mensaje crudo no permitido';
    const loggerError = jest.spyOn(
      (processor as unknown as { logger: { error: (message: string) => void } }).logger,
      'error',
    );
    const remove = jest.fn().mockResolvedValue(undefined);
    dlqQueue.add.mockRejectedValueOnce(new Error(rawMessage));

    await processor.onFailed(
      { data: makeSignedRequest(), attemptsMade: 8, opts: { attempts: 8 }, remove } as never,
      new Error('processor failure'),
    );

    const logs = loggerError.mock.calls.flat().join(' ');
    expect(logs).toContain('dlq_enqueue_failed');
    expect(logs).toContain('error_type=INVENTORY_EXECUTION_REQUEST_FAILURE');
    expect(logs).not.toContain(rawMessage);
    expect(remove).not.toHaveBeenCalled();
  });

  async function expectBusinessRejection(
    reasonCode: string,
    signedRequest = makeSignedRequest(),
  ): Promise<void> {
    await expect(processor.process(makeJob(signedRequest))).resolves.toBeUndefined();

    expect(queryRunner.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO inventory_execution_request_receipts'),
      expect.arrayContaining([
        'CONSUMPTION',
        REQUEST_ID,
        ORDER_ID,
        4,
        'REJECTED',
        null,
        null,
        reasonCode,
      ]),
    );
    const enqueued = responseQueue.add.mock.calls[0]?.[1] as {
      envelope: { eventType: string; payload: { reasonCode: string } };
    };
    expect(enqueued.envelope.eventType).toBe('InventoryMovementRejectedV1');
    expect(enqueued.envelope.payload.reasonCode).toBe(reasonCode);
    expect(responseQueue.add).toHaveBeenCalledTimes(1);
    expect(dlqQueue.add).not.toHaveBeenCalled();
  }

  it('resuelve la carrera de dos jobs: 23505, reintento y recibo existente', async () => {
    let entrants = 0;
    let releaseBarrier: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    let receiptWriterSelected = false;
    stockLedger.recordExecutionOrderMovementForInventoryRequest.mockImplementation(
      async (
        _input: unknown,
        _principal: unknown,
        _technicianCustodyLocationId: string,
        persist: (manager: EntityManager, movement: { movement: { id: string } }) => Promise<void>,
      ) => {
        entrants += 1;
        if (entrants === 2) releaseBarrier();
        await barrier;
        if (receiptWriterSelected) {
          const duplicate = new Error('unique violation');
          duplicate.name = 'QueryFailedError';
          throw duplicate;
        }
        receiptWriterSelected = true;
        await persist(queryRunner.manager as never, { movement: { id: MOVEMENT_ID } });
      },
    );

    const signed = makeSignedRequest();
    const concurrent = await Promise.allSettled([
      processor.process(makeJob(signed)),
      processor.process(makeJob(signed)),
    ]);
    expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(concurrent.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(queryRunner.manager.query).toHaveBeenCalledTimes(1);

    await processor.process(makeJob(signed));

    expect(stockLedger.recordExecutionOrderMovementForInventoryRequest).toHaveBeenCalledTimes(2);
    expect(queryRunner.manager.query).toHaveBeenCalledTimes(1);
    expect(responseQueue.add).toHaveBeenCalledTimes(2);
  });
});
