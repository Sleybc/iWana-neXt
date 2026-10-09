import { BullRegistrar, InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { isValidSchemaName } from '@iwana/db';
import { OPERATIONS_EXECUTION_DLQ } from '@iwana/shared';

interface InventoryDlqJob {
  tenantId: string;
  eventId: string;
  executionOrderId: string;
  inventoryRequestId: string;
  failedAt: string;
  attemptsMade: number;
  errorType: string;
}

interface ExecutionEventDlqJob {
  kind: 'execution-event';
  tenantId?: string;
  eventId?: string;
  aggregateId?: string;
  aggregateVersion?: number;
  failedAt: string;
  attemptsMade: number;
  errorType: string;
}

interface ExecutionOrderDlqCleanupJob {
  kind: 'execution-order-dlq-cleanup';
}

interface SafeExecutionFailure {
  tenantId: string;
  eventId: string;
  aggregateId: string;
  aggregateVersion: number;
  failedAt: string;
  attemptsMade: number;
  errorType: string;
}

type ExecutionOrderDlqJob = InventoryDlqJob | ExecutionEventDlqJob | ExecutionOrderDlqCleanupJob;

const DLQ_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const DLQ_RETENTION_MILLISECONDS = DLQ_RETENTION_SECONDS * 1000;
const DLQ_CLEANUP_INTERVAL_MILLISECONDS = 60 * 60 * 1000;
const DLQ_CLEANUP_JOB_NAME = 'clean-expired-execution-order-dlq';
const DLQ_CLEANUP_JOB_ID = 'execution-order-dlq-cleanup-hourly';
const LEGACY_PURGE_MARKER = 'execution-order-dlq-legacy-payload-purge-v2:complete';
const LEGACY_PURGE_PENDING_FIELD = 'dlqLegacyPayloadPurgeV2Pending';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SAFE_INVENTORY_ERROR_TYPES = new Set([
  'Error',
  'UnrecoverableError',
  'QueryFailedError',
  'TimeoutError',
  'AbortError',
  'INVENTORY_EVENT_FAILURE',
  'INVENTORY_DLQ_FAILURE',
]);
const SAFE_EXECUTION_ERROR_TYPES = new Set([
  'Error',
  'UnrecoverableError',
  'QueryFailedError',
  'TimeoutError',
  'AbortError',
  'EXECUTION_EVENT_FAILURE',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function safeErrorType(value: unknown): string {
  return typeof value === 'string' && SAFE_EXECUTION_ERROR_TYPES.has(value)
    ? value
    : 'EXECUTION_EVENT_FAILURE';
}

function safeFailureTimestamp(value: unknown): string {
  if (typeof value !== 'string') return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function safeAttempts(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? Math.min(value, 1000)
    : 0;
}

function normalizeExecutionFailure(value: Record<string, unknown>): SafeExecutionFailure | null {
  const tenantId = safeUuid(value['tenantId']);
  const eventId = safeUuid(value['eventId']);
  const aggregateId = safeUuid(value['aggregateId']);
  const aggregateVersion = value['aggregateVersion'];
  if (
    !tenantId ||
    !eventId ||
    !aggregateId ||
    typeof aggregateVersion !== 'number' ||
    !Number.isInteger(aggregateVersion) ||
    aggregateVersion < 1
  ) {
    return null;
  }
  return {
    tenantId,
    eventId,
    aggregateId,
    aggregateVersion,
    failedAt: safeFailureTimestamp(value['failedAt']),
    attemptsMade: safeAttempts(value['attemptsMade']),
    errorType: safeErrorType(value['errorType']),
  };
}

function parseExecutionDlqJobOptions(value: unknown): Record<string, unknown> {
  let options: Record<string, unknown> = {};
  if (typeof value === 'string' && value.length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new Error('Execution order DLQ legacy job options are invalid');
    }
    if (!isRecord(parsed)) {
      throw new Error('Execution order DLQ legacy job options are invalid');
    }
    options = parsed;
  }
  return options;
}

function hasExecutionDlqRetention(value: unknown): boolean {
  const options = parseExecutionDlqJobOptions(value);
  return (
    options['removeOnComplete'] === true &&
    isRecord(options['removeOnFail']) &&
    options['removeOnFail']['age'] === DLQ_RETENTION_SECONDS
  );
}

function executionDlqRetentionOptions(value: unknown): string {
  const options = parseExecutionDlqJobOptions(value);
  return JSON.stringify({
    ...options,
    removeOnComplete: true,
    removeOnFail: { age: DLQ_RETENTION_SECONDS },
  });
}

function sanitizeLegacyExecutionFailure(value: Record<string, unknown>): ExecutionEventDlqJob {
  const envelope = isRecord(value['envelope']) ? value['envelope'] : {};
  const legacyDiagnostic = isRecord(value['diagnostic']) ? value['diagnostic'] : {};
  const normalized = normalizeExecutionFailure({
    tenantId: value['tenantId'],
    eventId: envelope['eventId'],
    aggregateId: envelope['aggregateId'],
    aggregateVersion: envelope['aggregateVersion'],
    failedAt: legacyDiagnostic['failedAt'],
    attemptsMade: legacyDiagnostic['attemptsMade'],
    errorType: legacyDiagnostic['errorName'],
  });

  if (normalized) return { kind: 'execution-event', ...normalized };
  return {
    kind: 'execution-event',
    failedAt: safeFailureTimestamp(legacyDiagnostic['failedAt']),
    attemptsMade: safeAttempts(legacyDiagnostic['attemptsMade']),
    errorType: 'EXECUTION_EVENT_FAILURE',
  };
}

function normalizeInventoryFailure(value: InventoryDlqJob): InventoryDlqJob | null {
  if (
    !UUID_PATTERN.test(value.tenantId) ||
    !UUID_PATTERN.test(value.eventId) ||
    !UUID_PATTERN.test(value.executionOrderId) ||
    !UUID_PATTERN.test(value.inventoryRequestId)
  ) {
    return null;
  }
  const failedAt = new Date(value.failedAt);
  return {
    tenantId: value.tenantId,
    eventId: value.eventId,
    executionOrderId: value.executionOrderId,
    inventoryRequestId: value.inventoryRequestId,
    failedAt: Number.isNaN(failedAt.getTime()) ? new Date().toISOString() : failedAt.toISOString(),
    attemptsMade:
      Number.isInteger(value.attemptsMade) && value.attemptsMade >= 0
        ? Math.min(value.attemptsMade, 1000)
        : 0,
    errorType: SAFE_INVENTORY_ERROR_TYPES.has(value.errorType)
      ? value.errorType
      : 'INVENTORY_EVENT_FAILURE',
  };
}

/**
 * Procesador de Dead Letter Queue para eventos de MOD11.
 *
 * Registra los metadatos de fallo permitidos en el outbox como last_error,
 * sin conservar el payload ni mensajes crudos de excepción.
 */
@Injectable()
@Processor(OPERATIONS_EXECUTION_DLQ)
export class ExecutionOrderDlqProcessor
  extends WorkerHost
  implements OnModuleInit, OnApplicationBootstrap
{
  private readonly logger = new Logger(ExecutionOrderDlqProcessor.name);
  private readonly pool: Pool;

  constructor(
    config: ConfigService,
    @InjectQueue(OPERATIONS_EXECUTION_DLQ) private readonly queue: Queue,
    private readonly bullRegistrar: BullRegistrar,
  ) {
    super();
    this.pool = new Pool({
      host: config.get<string>('DB_HOST', 'localhost'),
      port: config.get<number>('DB_PORT', 5432),
      user: config.get<string>('DB_USER', 'iwana'),
      password: config.get<string>('DB_PASSWORD', ''),
      database: config.get<string>('DB_NAME', 'iwana'),
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const purged = await this.purgeLegacyJobsByRedisKey();
      this.logger.log(`[execution-dlq] legacy_payload_purge_completed removed=${purged}`);
    } catch {
      this.logger.error(
        '[execution-dlq] legacy_payload_purge_failed error_type=REDIS_OPERATION_FAILED',
      );
      throw new Error('Execution order DLQ legacy payload purge failed');
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.add(
      DLQ_CLEANUP_JOB_NAME,
      { kind: 'execution-order-dlq-cleanup' },
      {
        repeat: { every: DLQ_CLEANUP_INTERVAL_MILLISECONDS },
        jobId: DLQ_CLEANUP_JOB_ID,
        removeOnComplete: true,
        removeOnFail: { age: DLQ_RETENTION_SECONDS },
      },
    );
    this.bullRegistrar.register();
  }

  /** Reescribe jobs heredados desde su hash Redis y elimina los terminales de forma idempotente. */
  async purgeLegacyJobsByRedisKey(): Promise<number> {
    const client = await this.queue.client;
    const markerKey = this.queue.toKey(LEGACY_PURGE_MARKER);
    if ((await client.exists(markerKey)) > 0) return 0;

    const jobsPrefix = this.queue.toKey('');
    const pattern = this.queue.toKey('*');
    let cursor = '0';
    let removed = 0;

    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        if (!key.startsWith(jobsPrefix)) continue;
        const jobId = key.slice(jobsPrefix.length);
        if (!jobId || jobId.includes(':') || (await client.type(key)) !== 'hash') continue;

        const pendingPurge = (await client.hget(key, LEGACY_PURGE_PENDING_FIELD)) === '1';
        const rawData = await client.hget(key, 'data');
        if (typeof rawData !== 'string') {
          if (pendingPurge) {
            throw new Error('Execution order DLQ legacy job data is invalid');
          }
          continue;
        }

        let data: unknown;
        try {
          data = JSON.parse(rawData) as unknown;
        } catch {
          if (pendingPurge) {
            throw new Error('Execution order DLQ legacy job data is invalid');
          }
          continue;
        }
        if (!isRecord(data)) {
          if (pendingPurge) {
            throw new Error('Execution order DLQ legacy job data is invalid');
          }
          continue;
        }
        const isLegacy = Object.prototype.hasOwnProperty.call(data, 'envelope');
        const isExecutionEvent = data['kind'] === 'execution-event';
        if (!isLegacy && !pendingPurge && !isExecutionEvent) continue;
        const rawOptions = await client.hget(key, 'opts');
        const needsRetentionUpgrade = isExecutionEvent && !hasExecutionDlqRetention(rawOptions);
        if (!isLegacy && !pendingPurge && !needsRetentionUpgrade) continue;

        if (isLegacy || needsRetentionUpgrade) {
          // HSET escribe data, opciones y marcador en una sola operación Redis.
          // El marcador permite reanudar si el proceso cae antes de quitar un job terminal.
          await client.hset(
            key,
            'data',
            JSON.stringify(isLegacy ? sanitizeLegacyExecutionFailure(data) : data),
            'opts',
            executionDlqRetentionOptions(rawOptions),
            LEGACY_PURGE_PENDING_FIELD,
            '1',
          );
        }
        const state = await this.queue.getJobState(jobId);
        if (state === 'completed' || state === 'failed') {
          if ((await this.queue.remove(jobId)) === 1) {
            removed += 1;
          } else if ((await client.exists(key)) > 0) {
            throw new Error('Execution order DLQ legacy terminal job could not be removed');
          }
        } else if (isLegacy || pendingPurge || needsRetentionUpgrade) {
          // Pendientes siguen su curso con data saneada y las opciones de retención nuevas.
          await client.hdel(key, LEGACY_PURGE_PENDING_FIELD);
        }
      }
    } while (cursor !== '0');

    await client.set(markerKey, '1');
    return removed;
  }

  async process(job: Job<ExecutionOrderDlqJob>): Promise<void> {
    const data: Record<string, unknown> = isRecord(job.data) ? job.data : {};
    if (data['kind'] === 'execution-order-dlq-cleanup') {
      const removed = await this.queue.clean(DLQ_RETENTION_MILLISECONDS, 1000, 'failed');
      this.logger.log(
        `[execution-dlq] failed_diagnostics_cleanup_completed removed=${removed.length}`,
      );
      return;
    }

    if (data['kind'] === 'execution-event') {
      const diagnostic = normalizeExecutionFailure(data);
      if (!diagnostic) {
        this.logger.error('[execution-dlq] execution_dlq_invalid_record error_type=INVALID_RECORD');
        return;
      }
      await this.processExecutionFailure(diagnostic);
      return;
    }

    const diagnostic = normalizeInventoryFailure(data as unknown as InventoryDlqJob);
    if (!diagnostic) {
      this.logger.error('[execution-dlq] inventory_dlq_invalid_record error_type=INVALID_RECORD');
      return;
    }
    await this.processInventoryFailure(diagnostic);
  }

  private async processExecutionFailure(diagnostic: SafeExecutionFailure): Promise<void> {
    const { tenantId, eventId, aggregateId, aggregateVersion } = diagnostic;
    this.logger.error(
      `[execution-dlq] execution_event_failed event=${eventId} tenant=${tenantId} ` +
        `aggregate=${aggregateId} attempts=${diagnostic.attemptsMade} ` +
        `error_type=${diagnostic.errorType} failed_at=${diagnostic.failedAt}`,
    );
    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      const tenant = await client.query<{ schema_name: string }>(
        `SELECT schema_name FROM public.tenants
         WHERE id = $1 AND deleted_at IS NULL`,
        [tenantId],
      );

      const schemaName = tenant.rows[0]?.schema_name;
      if (!schemaName || !isValidSchemaName(schemaName)) {
        this.logger.error(`[execution-dlq] execution_dlq_tenant_unresolved tenant=${tenantId}`);
        return;
      }

      await client.query('BEGIN');
      transactionOpen = true;
      await client.query(`SET LOCAL search_path TO "${schemaName}"`);

      // Actualizar el outbox con el último error para visibilidad del operador
      const updated = await client.query(
        `UPDATE execution_order_outbox_events
         SET last_error = $3
         WHERE event_id = $1 AND tenant_id = $2`,
        [
          eventId,
          tenantId,
          JSON.stringify({
            failedAt: diagnostic.failedAt,
            attemptsMade: diagnostic.attemptsMade,
            errorType: diagnostic.errorType,
          }),
        ],
      );

      if ((updated.rowCount ?? 0) === 0) {
        this.logger.warn(
          `[execution-dlq] execution_dlq_outbox_missing event=${eventId} tenant=${tenantId}`,
        );
      }

      // Registrar también en el inbox como error terminal
      await client.query(
        `INSERT INTO execution_order_inbox_events
           (tenant_id, consumer, event_id, aggregate_id, aggregate_version,
            processed_at, last_error)
         VALUES ($1, $2, $3, $4, $5, NULL, $6)
         ON CONFLICT (tenant_id, consumer, event_id)
         DO UPDATE SET last_error = $6, processed_at = NULL`,
        [
          tenantId,
          'mod11-dlq-terminal',
          eventId,
          aggregateId,
          aggregateVersion,
          `DLQ: ${diagnostic.errorType}`,
        ],
      );

      await client.query('COMMIT');
      transactionOpen = false;
      this.logger.log(
        `[execution-dlq] execution_event_recorded event=${eventId} tenant=${tenantId}`,
      );
    } catch (error) {
      if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
      const errorType = safeErrorType(error instanceof Error ? error.name : undefined);
      this.logger.error(`[execution-dlq] execution_dlq_persist_failed error_type=${errorType}`);
      // El mensaje fijo mantiene el fallo observable sin persistir el texto crudo;
      // BullMQ lo conserva en la DLQ según la retención de 30 días.
      throw new Error('Execution order DLQ diagnostic persistence failed');
    } finally {
      client.release();
    }
  }

  private async processInventoryFailure(diagnostic: InventoryDlqJob): Promise<void> {
    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      const tenant = await client.query<{ schema_name: string }>(
        `SELECT schema_name FROM public.tenants
         WHERE id = $1 AND deleted_at IS NULL AND status <> 'MARKED_FOR_DELETION'`,
        [diagnostic.tenantId],
      );
      const schemaName = tenant.rows[0]?.schema_name;
      if (!schemaName || !isValidSchemaName(schemaName)) {
        this.logger.error(
          `[execution-dlq] inventory_dlq_tenant_unresolved event=${diagnostic.eventId} ` +
            `tenant=${diagnostic.tenantId} ot=${diagnostic.executionOrderId} ` +
            `inventory_request=${diagnostic.inventoryRequestId}`,
        );
        return;
      }

      await client.query('BEGIN');
      transactionOpen = true;
      await client.query(`SET LOCAL search_path TO "${schemaName}"`);
      const source = await client.query<{
        aggregate_id: string;
        aggregate_version: number;
      }>(
        `SELECT aggregate_id, aggregate_version
           FROM execution_order_outbox_events
          WHERE tenant_id = $1 AND event_id = $2`,
        [diagnostic.tenantId, diagnostic.eventId],
      );
      const aggregateId = source.rows[0]?.aggregate_id ?? diagnostic.executionOrderId;
      const aggregateVersion = source.rows[0]?.aggregate_version;
      if (aggregateVersion === undefined) {
        await client.query('COMMIT');
        transactionOpen = false;
        this.logger.warn(
          `[execution-dlq] inventory_dlq_source_missing event=${diagnostic.eventId} ` +
            `tenant=${diagnostic.tenantId} ot=${diagnostic.executionOrderId} ` +
            `inventory_request=${diagnostic.inventoryRequestId}`,
        );
        return;
      }

      const safeDiagnostic = JSON.stringify({
        failedAt: diagnostic.failedAt,
        attemptsMade: diagnostic.attemptsMade,
        errorType: diagnostic.errorType,
      });
      await client.query(
        `UPDATE execution_order_outbox_events
            SET last_error = $3
          WHERE tenant_id = $1 AND event_id = $2`,
        [diagnostic.tenantId, diagnostic.eventId, safeDiagnostic],
      );
      await client.query(
        `INSERT INTO execution_order_inbox_events
           (tenant_id, consumer, event_id, aggregate_id, aggregate_version,
            processed_at, last_error)
         VALUES ($1, $2, $3, $4, $5, NULL, $6)
         ON CONFLICT (tenant_id, consumer, event_id)
         DO UPDATE SET last_error = $6, processed_at = NULL`,
        [
          diagnostic.tenantId,
          'mod11-dlq-terminal',
          diagnostic.eventId,
          aggregateId,
          aggregateVersion,
          `DLQ: ${diagnostic.errorType}`,
        ],
      );
      await client.query('COMMIT');
      transactionOpen = false;
      this.logger.error(
        `[execution-dlq] inventory_event_recorded event=${diagnostic.eventId} ` +
          `tenant=${diagnostic.tenantId} ot=${diagnostic.executionOrderId} ` +
          `inventory_request=${diagnostic.inventoryRequestId} ` +
          `attempts=${diagnostic.attemptsMade} error_type=${diagnostic.errorType}`,
      );
    } catch (error) {
      if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
      const errorType =
        error instanceof Error && SAFE_INVENTORY_ERROR_TYPES.has(error.name)
          ? error.name
          : 'INVENTORY_DLQ_FAILURE';
      this.logger.error(
        `[execution-dlq] inventory_dlq_processing_failed event=${diagnostic.eventId} ` +
          `tenant=${diagnostic.tenantId} ot=${diagnostic.executionOrderId} ` +
          `inventory_request=${diagnostic.inventoryRequestId} error_type=${errorType}`,
      );
      // La DLQ es el último eslabón; BullMQ conserva el job hasta su retry/DLQ.
    } finally {
      client.release();
    }
  }
}
