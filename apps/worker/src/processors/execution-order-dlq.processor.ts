import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { isValidSchemaName } from '@iwana/db';
import { OPERATIONS_EXECUTION_DLQ, type OperationalEventEnvelopeV1 } from '@iwana/shared';

interface DlqJob {
  tenantId: string;
  envelope: OperationalEventEnvelopeV1;
  diagnostic: {
    failedAt: string;
    attemptsMade: number;
    jobId?: string;
    errorMessage: string;
    errorName: string;
  };
}

interface InventoryDlqJob {
  tenantId: string;
  eventId: string;
  executionOrderId: string;
  inventoryRequestId: string;
  failedAt: string;
  attemptsMade: number;
  errorType: string;
}

type ExecutionOrderDlqJob = DlqJob | InventoryDlqJob;

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
 * PLAT-P1-02: Almacena el evento fallido con su diagnóstico completo
 * en el outbox como last_error para trazabilidad del operador.
 */
@Injectable()
@Processor(OPERATIONS_EXECUTION_DLQ)
export class ExecutionOrderDlqProcessor extends WorkerHost {
  private readonly logger = new Logger(ExecutionOrderDlqProcessor.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
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

  async process(job: Job<ExecutionOrderDlqJob>): Promise<void> {
    if (!('envelope' in job.data)) {
      const diagnostic = normalizeInventoryFailure(job.data);
      if (!diagnostic) {
        this.logger.error('[execution-dlq] inventory_dlq_invalid_record error_type=INVALID_RECORD');
        return;
      }
      await this.processInventoryFailure(diagnostic);
      return;
    }

    const legacyJob = job as Job<DlqJob>;
    const { tenantId, envelope, diagnostic } = legacyJob.data;

    this.logger.error(
      `[execution-dlq] Evento muerto event_id=${envelope.eventId} ` +
        `type=${envelope.eventType} tenant=${tenantId} ` +
        `attempts=${diagnostic.attemptsMade} error=${diagnostic.errorMessage}`,
    );

    const client = await this.pool.connect();
    try {
      const tenant = await client.query<{ schema_name: string }>(
        `SELECT schema_name FROM public.tenants
         WHERE id = $1 AND deleted_at IS NULL`,
        [tenantId],
      );

      const schemaName = tenant.rows[0]?.schema_name;
      if (!schemaName || !isValidSchemaName(schemaName)) {
        this.logger.error(`[execution-dlq] No se pudo resolver schema para tenant=${tenantId}`);
        return;
      }

      await client.query(`SET LOCAL search_path TO "${schemaName}"`);

      // Actualizar el outbox con el último error para visibilidad del operador
      const updated = await client.query(
        `UPDATE execution_order_outbox_events
         SET last_error = $3
         WHERE event_id = $1 AND tenant_id = $2`,
        [
          envelope.eventId,
          tenantId,
          JSON.stringify({
            failedAt: diagnostic.failedAt,
            attemptsMade: diagnostic.attemptsMade,
            errorName: diagnostic.errorName,
            errorMessage: String(diagnostic.errorMessage).slice(0, 4000),
            dlqJobId: job.id,
          }),
        ],
      );

      if ((updated.rowCount ?? 0) === 0) {
        this.logger.warn(
          `[execution-dlq] Outbox event ${envelope.eventId} no encontrado en tenant ${tenantId}`,
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
          envelope.eventId,
          envelope.aggregateId,
          envelope.aggregateVersion,
          `DLQ: ${diagnostic.errorName} — ${String(diagnostic.errorMessage).slice(0, 500)}`,
        ],
      );

      this.logger.log(
        `[execution-dlq] Evento ${envelope.eventId} registrado en DLQ para intervención operativa`,
      );
    } catch (error) {
      this.logger.error(
        `[execution-dlq] Fallo al procesar DLQ para ${envelope.eventId}: ` +
          `${error instanceof Error ? error.message : 'unknown'}`,
      );
      // No relanzar: este es el último eslabón; si falla la DLQ misma,
      // el job queda en BullMQ para inspección manual.
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
