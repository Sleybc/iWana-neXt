import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { StockLocation, TenantContext, isValidSchemaName, runInTenantSchema } from '@iwana/db';
import {
  INVENTORY_EXECUTION_REQUESTS_QUEUE,
  INVENTORY_SOURCE_CLEANUP_INTERVAL_MS,
  INVENTORY_SOURCE_MAX_AGE_MS,
  OPERATIONS_EXECUTION_DLQ,
  OPERATIONS_EXECUTION_EVENTS_QUEUE,
  INVENTORY_CONSUMPTION_REJECTION_REASON_CODES,
  INVENTORY_REVERSAL_REJECTION_REASON_CODES,
  InventoryConsumptionRejectionReasonCode,
  InventoryDisposition,
  InventoryReversalRejectionReasonCode,
  StockLocationStatus,
  StockLocationType,
  SignedInventoryExecutionReversalRequestSchema,
  SignedInventoryExecutionRequestSchema,
  canonicalizeInventoryExecutionRequest,
  type InventoryMovementConfirmedV1,
  type InventoryMovementRejectedV1,
  type InventoryReversalConfirmedV1,
  type InventoryReversalRejectedV1,
  type OperationalEventEnvelopeV1,
  type SignedInventoryExecutionReversalRequest,
  type SignedInventoryExecutionRequest,
} from '@iwana/shared';
import { ExecutionOrderMovementSchema } from '../dto';
import { InventoryBusinessRejection } from './inventory-business-rejection';
import { StockLedgerService } from './stock-ledger.service';

const INVENTORY_EXECUTION_REQUEST_CONCURRENCY = readConcurrency();
const DLQ_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const SOURCE_JOB_RETENTION_SECONDS = 24 * 60 * 60;
const INVENTORY_SOURCE_CLEANUP_JOB = 'clean-expired-inventory-source-failures';
const FAILED_JOBS_BATCH_SIZE = 1_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_V5_NAMESPACE = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');

interface InternalTenantRow {
  id: string;
  slug: string;
  schema_name: string;
  status: string;
}

interface ReceiptRow {
  kind: 'CONSUMPTION' | 'REVERSAL';
  outcome: 'CONFIRMED' | 'REJECTED';
  stock_movement_id: string | null;
  original_stock_movement_id: string | null;
  reason_code: string | null;
  execution_order_id: string;
  aggregate_version: number | string;
  decided_at: Date | string;
}

interface InventoryRequestReceipt {
  kind: 'CONSUMPTION' | 'REVERSAL';
  outcome: 'CONFIRMED' | 'REJECTED';
  stockMovementId: string | null;
  originalStockMovementId: string | null;
  reasonCode: string | null;
  executionOrderId: string;
  aggregateVersion: number;
  decidedAt: string;
}

interface InventoryDlqJob {
  tenantId?: string;
  eventId?: string;
  executionOrderId?: string;
  inventoryRequestId?: string;
  reversalRequestId?: string;
  failedAt: string;
  attemptsMade: number;
  errorType: string;
}

function readConcurrency(): number {
  const raw = process.env['INVENTORY_EXECUTION_REQUEST_CONCURRENCY'];
  if (raw === undefined || raw === '') return 4;
  const concurrency = Number(raw);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new Error('INVENTORY_EXECUTION_REQUEST_CONCURRENCY debe estar entre 1 y 32.');
  }
  return concurrency;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deterministicUuidV5(name: string): string {
  const digest = createHash('sha1').update(UUID_V5_NAMESPACE).update(name).digest().subarray(0, 16);
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x50;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function isConsumptionReasonCode(value: string): value is InventoryConsumptionRejectionReasonCode {
  return (INVENTORY_CONSUMPTION_REJECTION_REASON_CODES as readonly string[]).includes(value);
}

function isReversalReasonCode(value: string): value is InventoryReversalRejectionReasonCode {
  return (INVENTORY_REVERSAL_REJECTION_REASON_CODES as readonly string[]).includes(value);
}

function safeErrorType(error: unknown): string {
  if (!(error instanceof Error)) return 'INVENTORY_EXECUTION_REQUEST_FAILURE';
  const known = new Set([
    'UnrecoverableError',
    'QueryFailedError',
    'TimeoutError',
    'AbortError',
    'InventoryTenantNotActiveError',
  ]);
  return known.has(error.name) ? error.name : 'INVENTORY_EXECUTION_REQUEST_FAILURE';
}

function toReceipt(row: ReceiptRow | undefined): InventoryRequestReceipt | null {
  if (!row) return null;
  const decidedAt = row.decided_at instanceof Date ? row.decided_at : new Date(row.decided_at);
  if (Number.isNaN(decidedAt.getTime())) {
    throw new Error('El recibo de inventario tiene una fecha de decisión inválida.');
  }
  return {
    kind: row.kind,
    outcome: row.outcome,
    stockMovementId: row.stock_movement_id,
    originalStockMovementId: row.original_stock_movement_id,
    reasonCode: row.reason_code,
    executionOrderId: row.execution_order_id,
    aggregateVersion: Number(row.aggregate_version),
    decidedAt: decidedAt.toISOString(),
  };
}

/** Consume solicitudes V2 firmadas y guarda una decisión terminal reproducible. */
@Injectable()
@Processor(INVENTORY_EXECUTION_REQUESTS_QUEUE, {
  concurrency: INVENTORY_EXECUTION_REQUEST_CONCURRENCY,
})
export class InventoryExecutionRequestProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(InventoryExecutionRequestProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly stockLedger: StockLedgerService,
    @InjectQueue(OPERATIONS_EXECUTION_EVENTS_QUEUE)
    private readonly responseQueue: Queue,
    @InjectQueue(OPERATIONS_EXECUTION_DLQ)
    private readonly dlqQueue: Queue,
    @InjectQueue(INVENTORY_EXECUTION_REQUESTS_QUEUE)
    private readonly requestsQueue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.requestsQueue.add(
      INVENTORY_SOURCE_CLEANUP_JOB,
      {},
      {
        repeat: { every: INVENTORY_SOURCE_CLEANUP_INTERVAL_MS },
        jobId: 'inventory-source-cleanup-api',
      },
    );
  }

  async process(job: Job<unknown>): Promise<void> {
    if (job.name === INVENTORY_SOURCE_CLEANUP_JOB) {
      await this.removeExpiredInventorySourceJobs();
      return;
    }

    const signed = this.verifySignatureBeforeValidation(job.data);
    const envelope = isRecord(signed) ? signed['envelope'] : null;
    const eventType = isRecord(envelope) ? envelope['eventType'] : null;

    if (eventType === 'InventoryConsumptionReversalRequestedV1') {
      const parsed = SignedInventoryExecutionReversalRequestSchema.safeParse(signed);
      if (!parsed.success) throw new UnrecoverableError('Solicitud de reverso firmada inválida.');
      await this.processReversalRequest(parsed.data);
      return;
    }

    if (eventType !== 'InventoryConsumptionRequestedV2') {
      throw new UnrecoverableError('Tipo de solicitud de inventario desconocido.');
    }
    const parsed = SignedInventoryExecutionRequestSchema.safeParse(signed);
    if (!parsed.success) throw new UnrecoverableError('Solicitud firmada inválida.');
    await this.processConsumptionRequest(parsed.data);
  }

  private async processConsumptionRequest(request: SignedInventoryExecutionRequest): Promise<void> {
    const payload = request.envelope.payload;
    const tenant = await this.resolveActiveTenant(request.tenantId);
    await TenantContext.run(
      { tenantId: tenant.id, schemaName: tenant.schema_name, tenantSlug: tenant.slug },
      async () => {
        const existingReceipt = await this.findReceipt(
          tenant.schema_name,
          tenant.id,
          'CONSUMPTION',
          payload.inventoryRequestId,
        );
        if (existingReceipt) {
          await this.enqueueResponse(tenant.id, payload.inventoryRequestId, existingReceipt);
          return;
        }

        const subscriberId = payload.subscriberId ?? undefined;
        if (
          payload.finalDisposition === InventoryDisposition.INSTALLED_AT_CUSTOMER &&
          !subscriberId?.trim()
        ) {
          await this.persistRejectedReceipt(tenant, {
            kind: 'CONSUMPTION',
            requestId: payload.inventoryRequestId,
            executionOrderId: payload.executionOrderId,
            aggregateVersion: request.envelope.aggregateVersion,
            reasonCode: 'SUBSCRIBER_REQUIRED',
          });
        } else {
          const ledgerInputResult = ExecutionOrderMovementSchema.safeParse({
            executionOrderId: payload.executionOrderId,
            itemId: payload.itemId,
            technicianCustodyId: payload.technicianCustodyId,
            quantity: payload.quantity,
            ...(payload.serial ? { serialNumber: payload.serial } : {}),
            customerSiteLocationId: null,
            subscriberId,
            contractRefId: null,
            action: payload.action,
            finalDisposition: payload.finalDisposition,
            idempotencyKey: payload.inventoryRequestId,
          });
          if (!ledgerInputResult.success) {
            throw new UnrecoverableError('La solicitud no satisface el esquema del ledger.');
          }

          const technicianCustodyLocationId = await this.resolveTechnicianCustodyLocation(
            tenant.schema_name,
            tenant.id,
            payload.technicianCustodyId,
          );
          if (!technicianCustodyLocationId) {
            await this.persistRejectedReceipt(tenant, {
              kind: 'CONSUMPTION',
              requestId: payload.inventoryRequestId,
              executionOrderId: payload.executionOrderId,
              aggregateVersion: request.envelope.aggregateVersion,
              reasonCode: 'CUSTODY_INSUFFICIENT',
            });
          } else {
            try {
              await this.stockLedger.recordExecutionOrderMovementForInventoryRequest(
                ledgerInputResult.data,
                { sub: payload.actorUserId },
                technicianCustodyLocationId,
                async (manager, movement) =>
                  this.insertReceipt(manager, {
                    tenantId: tenant.id,
                    kind: 'CONSUMPTION',
                    requestId: payload.inventoryRequestId,
                    executionOrderId: payload.executionOrderId,
                    aggregateVersion: request.envelope.aggregateVersion,
                    outcome: 'CONFIRMED',
                    stockMovementId: movement.movement.id,
                    originalStockMovementId: null,
                    reasonCode: null,
                  }),
              );
            } catch (error) {
              if (
                !(error instanceof InventoryBusinessRejection) ||
                !isConsumptionReasonCode(error.reasonCode)
              ) {
                throw error;
              }
              await this.persistRejectedReceipt(tenant, {
                kind: 'CONSUMPTION',
                requestId: payload.inventoryRequestId,
                executionOrderId: payload.executionOrderId,
                aggregateVersion: request.envelope.aggregateVersion,
                reasonCode: error.reasonCode,
              });
            }
          }
        }

        const decidedReceipt = await this.findReceipt(
          tenant.schema_name,
          tenant.id,
          'CONSUMPTION',
          payload.inventoryRequestId,
        );
        if (!decidedReceipt) throw new Error('No se pudo confirmar el recibo de inventario.');
        await this.enqueueResponse(tenant.id, payload.inventoryRequestId, decidedReceipt);
      },
    );
  }

  private async processReversalRequest(
    request: SignedInventoryExecutionReversalRequest,
  ): Promise<void> {
    const payload = request.envelope.payload;
    const tenant = await this.resolveActiveTenant(request.tenantId);
    await TenantContext.run(
      { tenantId: tenant.id, schemaName: tenant.schema_name, tenantSlug: tenant.slug },
      async () => {
        const existingReceipt = await this.findReceipt(
          tenant.schema_name,
          tenant.id,
          'REVERSAL',
          payload.reversalRequestId,
        );
        if (existingReceipt) {
          await this.enqueueResponse(tenant.id, payload.reversalRequestId, existingReceipt);
          return;
        }

        try {
          await this.stockLedger.reverseExecutionOrderMovementForInventoryRequest(
            {
              executionOrderId: payload.executionOrderId,
              reversalRequestId: payload.reversalRequestId,
              originalStockMovementId: payload.originalStockMovementId,
              technicianCustodyId: payload.technicianCustodyId,
            },
            { sub: payload.actorUserId },
            async (manager, movement, originalStockMovementId) =>
              this.insertReceipt(manager, {
                tenantId: tenant.id,
                kind: 'REVERSAL',
                requestId: payload.reversalRequestId,
                executionOrderId: payload.executionOrderId,
                aggregateVersion: request.envelope.aggregateVersion,
                outcome: 'CONFIRMED',
                stockMovementId: movement.movement.id,
                originalStockMovementId,
                reasonCode: null,
              }),
          );
        } catch (error) {
          if (
            !(error instanceof InventoryBusinessRejection) ||
            !isReversalReasonCode(error.reasonCode)
          ) {
            throw error;
          }
          await this.persistRejectedReceipt(tenant, {
            kind: 'REVERSAL',
            requestId: payload.reversalRequestId,
            executionOrderId: payload.executionOrderId,
            aggregateVersion: request.envelope.aggregateVersion,
            reasonCode: error.reasonCode,
            originalStockMovementId: payload.originalStockMovementId,
          });
        }

        const decidedReceipt = await this.findReceipt(
          tenant.schema_name,
          tenant.id,
          'REVERSAL',
          payload.reversalRequestId,
        );
        if (!decidedReceipt) throw new Error('No se pudo confirmar el recibo de reverso.');
        await this.enqueueResponse(tenant.id, payload.reversalRequestId, decidedReceipt);
      },
    );
  }

  private async resolveActiveTenant(tenantId: string): Promise<InternalTenantRow> {
    const tenant = await this.resolveTenant(tenantId);
    if (tenant.status !== 'ACTIVE') {
      const deferred = new Error('Tenant aún no está activo.');
      deferred.name = 'InventoryTenantNotActiveError';
      throw deferred;
    }
    return tenant;
  }

  /** Verifica el HMAC sobre datos opacos; el esquema completo se valida después. */
  private verifySignatureBeforeValidation(candidate: unknown): unknown {
    if (!isRecord(candidate) || !isRecord(candidate['envelope'])) {
      throw new UnrecoverableError('Solicitud de inventario sin firma válida.');
    }
    const tenantId = candidate['tenantId'];
    const signature = candidate['signature'];
    if (typeof tenantId !== 'string' || typeof signature !== 'string') {
      throw new UnrecoverableError('Solicitud de inventario sin firma válida.');
    }

    const providedIsHex = /^[a-f0-9]{64}$/iu.test(signature);
    const provided = providedIsHex ? Buffer.from(signature, 'hex') : Buffer.alloc(32);
    const canonical = canonicalizeInventoryExecutionRequest(tenantId, candidate['envelope']);
    const keys = [
      this.readSigningKey('INTERNAL_QUEUE_SIGNING_KEY', true),
      this.readSigningKey('INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS', false),
    ].filter((key): key is Buffer => key !== null);

    let matched = false;
    for (const key of keys) {
      const expected = createHmac('sha256', key).update(canonical).digest();
      const equal = timingSafeEqual(expected, provided);
      matched = equal || matched;
    }
    if (!providedIsHex || !matched) {
      throw new UnrecoverableError('Firma de solicitud de inventario inválida.');
    }
    return candidate;
  }

  private readSigningKey(name: string, required: boolean): Buffer | null {
    const value = this.config.get<string>(name)?.trim();
    if (!value) {
      if (!required) return null;
      throw new UnrecoverableError('Clave de firma ausente.');
    }
    const key = Buffer.from(value, 'base64');
    if (key.byteLength < 32 || key.toString('base64') !== value) {
      throw new UnrecoverableError('Clave de firma inválida.');
    }
    return key;
  }

  private async resolveTenant(tenantId: string): Promise<InternalTenantRow> {
    const rows = (await this.dataSource.query(
      `SELECT id, slug, schema_name, status
         FROM public.tenants
        WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId],
    )) as InternalTenantRow[];
    const tenant = rows[0];
    if (!tenant || !isValidSchemaName(tenant.schema_name)) {
      throw new UnrecoverableError('Tenant inexistente o schema inválido.');
    }
    return tenant;
  }

  private async findReceipt(
    schemaName: string,
    tenantId: string,
    kind: 'CONSUMPTION' | 'REVERSAL',
    requestId: string,
  ): Promise<InventoryRequestReceipt | null> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT kind, outcome, stock_movement_id, original_stock_movement_id,
                reason_code, execution_order_id, aggregate_version, decided_at
           FROM inventory_execution_request_receipts
          WHERE tenant_id = $1 AND kind = $2 AND request_id = $3`,
        [tenantId, kind, requestId],
      )) as ReceiptRow[];
      return toReceipt(rows[0]);
    });
  }

  private async resolveTechnicianCustodyLocation(
    schemaName: string,
    tenantId: string,
    responsibleRefId: string,
  ): Promise<string | null> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const location = await qr.manager.findOne(StockLocation, {
        where: {
          tenantId,
          responsibleRefId,
          type: StockLocationType.MOBILE_TECHNICIAN,
          status: StockLocationStatus.ACTIVE,
        },
      });
      return location?.id ?? null;
    });
  }

  private async insertReceipt(
    manager: EntityManager,
    input: {
      tenantId: string;
      kind: 'CONSUMPTION' | 'REVERSAL';
      requestId: string;
      executionOrderId: string;
      aggregateVersion: number;
      outcome: 'CONFIRMED' | 'REJECTED';
      stockMovementId: string | null;
      originalStockMovementId: string | null;
      reasonCode: string | null;
    },
  ): Promise<void> {
    await manager.query(
      `INSERT INTO inventory_execution_request_receipts
         (id, tenant_id, kind, request_id, execution_order_id, aggregate_version,
          outcome, stock_movement_id, original_stock_movement_id, reason_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        randomUUID(),
        input.tenantId,
        input.kind,
        input.requestId,
        input.executionOrderId,
        input.aggregateVersion,
        input.outcome,
        input.stockMovementId,
        input.originalStockMovementId,
        input.reasonCode,
      ],
    );
  }

  private async persistRejectedReceipt(
    tenant: InternalTenantRow,
    input: {
      kind: 'CONSUMPTION' | 'REVERSAL';
      requestId: string;
      executionOrderId: string;
      aggregateVersion: number;
      reasonCode: InventoryConsumptionRejectionReasonCode | InventoryReversalRejectionReasonCode;
      originalStockMovementId?: string;
    },
  ): Promise<void> {
    await runInTenantSchema(this.dataSource, tenant.schema_name, async (qr) =>
      this.insertReceipt(qr.manager, {
        tenantId: tenant.id,
        kind: input.kind,
        requestId: input.requestId,
        executionOrderId: input.executionOrderId,
        aggregateVersion: input.aggregateVersion,
        outcome: 'REJECTED',
        stockMovementId: null,
        originalStockMovementId: input.originalStockMovementId ?? null,
        reasonCode: input.reasonCode,
      }),
    );
  }

  private async enqueueResponse(
    tenantId: string,
    requestId: string,
    receipt: InventoryRequestReceipt,
  ): Promise<void> {
    const eventId = deterministicUuidV5(
      receipt.kind === 'REVERSAL' ? `reversal:${requestId}` : requestId,
    );
    let envelope: OperationalEventEnvelopeV1;
    if (receipt.kind === 'CONSUMPTION') {
      const payload: InventoryMovementConfirmedV1 | InventoryMovementRejectedV1 =
        receipt.outcome === 'CONFIRMED'
          ? {
              executionOrderId: receipt.executionOrderId,
              inventoryRequestId: requestId,
              stockMovementId: receipt.stockMovementId as string,
            }
          : {
              executionOrderId: receipt.executionOrderId,
              inventoryRequestId: requestId,
              reasonCode: receipt.reasonCode as InventoryConsumptionRejectionReasonCode,
            };
      envelope = {
        eventId,
        eventType:
          receipt.outcome === 'CONFIRMED'
            ? 'InventoryMovementConfirmedV1'
            : 'InventoryMovementRejectedV1',
        tenantId,
        aggregateId: receipt.executionOrderId,
        aggregateVersion: receipt.aggregateVersion,
        occurredAt: receipt.decidedAt,
        correlationId: requestId,
        payload,
      } as OperationalEventEnvelopeV1;
    } else {
      const payload: InventoryReversalConfirmedV1 | InventoryReversalRejectedV1 =
        receipt.outcome === 'CONFIRMED'
          ? {
              executionOrderId: receipt.executionOrderId,
              reversalRequestId: requestId,
              stockMovementId: receipt.stockMovementId as string,
            }
          : {
              executionOrderId: receipt.executionOrderId,
              reversalRequestId: requestId,
              reasonCode: receipt.reasonCode as InventoryReversalRejectionReasonCode,
            };
      envelope = {
        eventId,
        eventType:
          receipt.outcome === 'CONFIRMED'
            ? 'InventoryReversalConfirmedV1'
            : 'InventoryReversalRejectedV1',
        tenantId,
        aggregateId: receipt.executionOrderId,
        aggregateVersion: receipt.aggregateVersion,
        occurredAt: receipt.decidedAt,
        correlationId: requestId,
        payload,
      } as OperationalEventEnvelopeV1;
    }

    const accepted = await this.responseQueue.add(
      'deliver-execution-event',
      { tenantId, envelope },
      {
        jobId: `inventory-response-${eventId}`,
        attempts: 8,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: { age: SOURCE_JOB_RETENTION_SECONDS },
      },
    );
    if (!accepted) throw new Error('La cola de respuestas no aceptó el resultado.');
  }

  private async removeExpiredInventorySourceJobs(): Promise<void> {
    await Promise.all([
      this.removeExpiredJobs(this.requestsQueue, 'inventory-execution-requests'),
      this.removeExpiredJobs(this.responseQueue, 'operations-execution-events'),
    ]);
  }

  private async removeExpiredJobs(queue: Queue, queueName: string): Promise<void> {
    try {
      let removed: string[];
      do {
        removed = await queue.clean(
          INVENTORY_SOURCE_MAX_AGE_MS - INVENTORY_SOURCE_CLEANUP_INTERVAL_MS,
          FAILED_JOBS_BATCH_SIZE,
          'failed',
        );
      } while (removed.length === FAILED_JOBS_BATCH_SIZE);
    } catch (error) {
      this.logger.warn(
        `[inventory-execution-request] source_cleanup_failed queue=${queueName} ` +
          `error_type=${safeErrorType(error)}`,
      );
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<unknown> | undefined, error: Error): Promise<void> {
    if (!job) return;
    if (
      (job.attemptsMade ?? 0) < (job.opts.attempts ?? 1) &&
      !(error instanceof UnrecoverableError)
    ) {
      return;
    }

    const data = isRecord(job.data) ? job.data : {};
    const envelope = isRecord(data['envelope']) ? data['envelope'] : {};
    const payload = isRecord(envelope['payload']) ? envelope['payload'] : {};
    const tenantId = safeUuid(data['tenantId']);
    const eventId = safeUuid(envelope['eventId']);
    const executionOrderId = safeUuid(payload['executionOrderId']);
    const inventoryRequestId = safeUuid(payload['inventoryRequestId']);
    const reversalRequestId = safeUuid(payload['reversalRequestId']);
    const errorType = safeErrorType(error);
    const failedAt = new Date().toISOString();
    const attemptsMade = Math.max(0, job.attemptsMade ?? 0);

    const identifiers =
      tenantId && eventId && executionOrderId && inventoryRequestId
        ? {
            tenantId,
            eventId,
            executionOrderId,
            inventoryRequestId,
            ...(reversalRequestId ? { reversalRequestId } : {}),
          }
        : {};
    const diagnostic: InventoryDlqJob = {
      ...identifiers,
      failedAt,
      attemptsMade,
      errorType,
    };
    try {
      await this.dlqQueue.add('failed-inventory-execution-event', diagnostic, {
        jobId: `dlq-${eventId ?? randomUUID()}`,
        removeOnComplete: true,
        removeOnFail: { age: DLQ_RETENTION_SECONDS },
      });
    } catch (enqueueError) {
      this.logger.error(
        `[inventory-execution-request] dlq_enqueue_failed error_type=${safeErrorType(enqueueError)} ` +
          `attempts=${attemptsMade} failed_at=${failedAt}`,
      );
      return;
    }

    await job.remove();
  }
}
