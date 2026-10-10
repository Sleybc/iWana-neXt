import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { createHmac, randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { isValidSchemaName } from '@iwana/db';
import {
  OPERATIONS_EXECUTION_EVENTS_QUEUE,
  OPERATIONS_EXECUTION_DLQ,
  INVENTORY_EXECUTION_REQUESTS_QUEUE,
  InventoryConsumptionReversalRequestedV1EnvelopeSchema,
  InventoryConsumptionRequestedV2EnvelopeSchema,
  InventoryReversalConfirmedV1Schema,
  InventoryReversalRejectedV1Schema,
  SignedInventoryExecutionReversalRequestSchema,
  SignedInventoryExecutionRequestSchema,
  canonicalizeInventoryExecutionRequest,
  type OperationalEventEnvelopeV1,
  type OperationalEventTypeV1,
} from '@iwana/shared';

interface ExecutionEventJob {
  tenantId: string;
  envelope: OperationalEventEnvelopeV1;
}

interface TenantRow {
  schema_name: string;
}

const SCHEDULE_PROJECTED_EXECUTION_EVENTS: ReadonlySet<OperationalEventTypeV1> = new Set([
  'ExecutionOrderStartedV1',
  'ExecutionOrderBlockedV1',
  'ExecutionOrderClosedV1',
  'ExecutionOrderFollowUpRequiredV1',
]);

const INVENTORY_EVENT_TYPES: ReadonlySet<OperationalEventTypeV1> = new Set([
  'InventoryConsumptionRequestedV1',
  'InventoryConsumptionRequestedV2',
  'InventoryConsumptionReversalRequestedV1',
  'InventoryMovementConfirmedV1',
  'InventoryMovementRejectedV1',
  'InventoryReversalConfirmedV1',
  'InventoryReversalRejectedV1',
]);
const INVENTORY_EVENTS_BYPASSING_AGGREGATE_VERSION: ReadonlySet<OperationalEventTypeV1> = new Set([
  'InventoryConsumptionRequestedV2',
  'InventoryConsumptionReversalRequestedV1',
  'InventoryMovementConfirmedV1',
  'InventoryMovementRejectedV1',
  'InventoryReversalConfirmedV1',
  'InventoryReversalRejectedV1',
]);
const DLQ_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const SOURCE_JOB_RETENTION_SECONDS = 24 * 60 * 60;

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

interface InventoryOutboxRow {
  event_id: string;
  tenant_id: string;
  aggregate_id: string;
  aggregate_version: number;
  event_type: string;
  correlation_id: string;
  occurred_at: Date | string;
  payload: unknown;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeUuid(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined;
}

function timestampsMatch(left: Date | string, right: string): boolean {
  const leftTimestamp = new Date(left).getTime();
  const rightTimestamp = new Date(right).getTime();
  return (
    Number.isFinite(leftTimestamp) &&
    Number.isFinite(rightTimestamp) &&
    leftTimestamp === rightTimestamp
  );
}

function safeAttemptsMade(value: number | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? Math.min(value, 1000)
    : 0;
}

function safeExecutionErrorType(error: unknown): string {
  const knownTypes = new Set([
    'Error',
    'UnrecoverableError',
    'QueryFailedError',
    'TimeoutError',
    'AbortError',
  ]);
  return error instanceof Error && knownTypes.has(error.name)
    ? error.name
    : 'EXECUTION_EVENT_FAILURE';
}

function safeInventoryErrorType(error: unknown): string {
  const knownTypes = new Set([
    'Error',
    'UnrecoverableError',
    'QueryFailedError',
    'TimeoutError',
    'AbortError',
  ]);
  return error instanceof Error && knownTypes.has(error.name)
    ? error.name
    : 'INVENTORY_EVENT_FAILURE';
}

/**
 * Procesador de eventos operativos de MOD11.
 *
 * Consume eventos del outbox relay y aplica la matriz de convergencia
 * de ADR-068 sobre ScheduleEvent, VisitRequest y Task.
 *
 * PLAT-P1-02: @OnWorkerEvent('failed') redirige jobs agotados al DLQ después de 8 intentos.
 */
@Injectable()
@Processor(OPERATIONS_EXECUTION_EVENTS_QUEUE)
export class ExecutionOrderEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(ExecutionOrderEventsProcessor.name);
  private readonly pool: Pool;

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(OPERATIONS_EXECUTION_DLQ)
    private readonly dlqQueue: Queue,
    @InjectQueue(INVENTORY_EXECUTION_REQUESTS_QUEUE)
    private readonly inventoryRequestsQueue: Queue,
  ) {
    super();
    this.pool = new Pool({
      host: this.config.get<string>('DB_HOST', 'localhost'),
      port: this.config.get<number>('DB_PORT', 5432),
      user: this.config.get<string>('DB_USER', 'iwana'),
      password: this.config.get<string>('DB_PASSWORD', ''),
      database: this.config.get<string>('DB_NAME', 'iwana'),
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }

  /**
   * PLAT-P1-02: Tras agotar los 8 intentos, el job se mueve al DLQ
   * con metadatos de diagnóstico.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<ExecutionEventJob>, error: Error): Promise<void> {
    const data: Record<string, unknown> = isRecord(job.data) ? job.data : {};
    const envelope = isRecord(data['envelope']) ? data['envelope'] : {};
    const payload = isRecord(envelope['payload']) ? envelope['payload'] : {};
    const eventType = envelope['eventType'];

    // BullMQ emite `failed` en cada intento. Persistir el diagnóstico solo al
    // agotar el retry evita DLQ duplicadas para fallos técnicos recuperables.
    if (
      (job.attemptsMade ?? 0) < (job.opts.attempts ?? 1) &&
      !(error instanceof UnrecoverableError)
    ) {
      return;
    }

    const tenantId = safeUuid(data['tenantId']);
    const eventId = safeUuid(envelope['eventId']);
    const aggregateId = safeUuid(envelope['aggregateId']);
    const safePayloadExecutionOrderId = safeUuid(payload['executionOrderId']);
    const safeInventoryRequestId = safeUuid(payload['inventoryRequestId']);
    const safeReversalRequestId = safeUuid(payload['reversalRequestId']);
    const failedAt = new Date().toISOString();
    const attemptsMade = safeAttemptsMade(job.attemptsMade);

    if (
      typeof eventType === 'string' &&
      INVENTORY_EVENT_TYPES.has(eventType as OperationalEventTypeV1)
    ) {
      const identifiers =
        tenantId && eventId && aggregateId && safePayloadExecutionOrderId && safeInventoryRequestId
          ? {
              tenantId,
              eventId,
              executionOrderId: safePayloadExecutionOrderId,
              inventoryRequestId: safeInventoryRequestId,
            }
          : tenantId &&
              eventId &&
              aggregateId &&
              safePayloadExecutionOrderId &&
              safeReversalRequestId
            ? {
                tenantId,
                eventId,
                executionOrderId: safePayloadExecutionOrderId,
                reversalRequestId: safeReversalRequestId,
              }
            : {};
      const diagnostic: InventoryDlqJob = {
        ...identifiers,
        failedAt,
        attemptsMade,
        errorType: safeInventoryErrorType(error),
      };
      try {
        await this.dlqQueue.add('failed-inventory-execution-event', diagnostic, {
          jobId: `dlq-${eventId ?? randomUUID()}`,
          removeOnComplete: true,
          removeOnFail: { age: DLQ_RETENTION_SECONDS },
        });
      } catch (enqueueError) {
        this.logger.error(
          `[execution-events] inventory_dlq_enqueue_failed ` +
            `error_type=${safeInventoryErrorType(enqueueError)} attempts=${attemptsMade} failed_at=${failedAt}`,
        );
        return;
      }
      await job.remove();
      return;
    }

    const aggregateVersion = envelope['aggregateVersion'];
    const diagnostic: ExecutionEventDlqJob = {
      kind: 'execution-event',
      ...(tenantId ? { tenantId } : {}),
      ...(eventId ? { eventId } : {}),
      ...(aggregateId ? { aggregateId } : {}),
      ...(typeof aggregateVersion === 'number' &&
      Number.isInteger(aggregateVersion) &&
      aggregateVersion > 0
        ? { aggregateVersion }
        : {}),
      failedAt,
      attemptsMade,
      errorType: safeExecutionErrorType(error),
    };
    const identifierLog = [
      tenantId ? `tenant=${tenantId}` : undefined,
      eventId ? `event=${eventId}` : undefined,
      aggregateId ? `aggregate=${aggregateId}` : undefined,
    ]
      .filter((part): part is string => part !== undefined)
      .join(' ');
    this.logger.error(
      `[execution-events] DLQ ${identifierLog} ` +
        `attempts=${attemptsMade} error_type=${diagnostic.errorType} failed_at=${failedAt}`,
    );

    await this.dlqQueue.add('failed-execution-event', diagnostic, {
      jobId: `dlq-${eventId ?? randomUUID()}-${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: { age: DLQ_RETENTION_SECONDS },
    });
  }

  async process(job: Job<ExecutionEventJob>): Promise<void> {
    const { tenantId, envelope } = job.data;

    if (envelope.tenantId !== tenantId) {
      throw new UnrecoverableError('Ejecución de evento con contexto tenant inválido.');
    }

    const client = await this.pool.connect();
    try {
      // Resolver schema desde el registro confiable de public.tenants
      const tenant = await client.query<TenantRow>(
        `SELECT schema_name FROM public.tenants
         WHERE id = $1
           AND deleted_at IS NULL
           AND status <> 'MARKED_FOR_DELETION'`,
        [tenantId],
      );
      const schemaName = tenant.rows[0]?.schema_name;
      if (!schemaName || !isValidSchemaName(schemaName)) {
        throw new UnrecoverableError('Tenant inexistente o schema inválido.');
      }

      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schemaName}"`);

      if (envelope.eventType === 'InventoryConsumptionRequestedV2') {
        await this.assertInventoryEventMatchesOutbox(client, tenantId, envelope);
      }
      if (envelope.eventType === 'InventoryConsumptionReversalRequestedV1') {
        await this.assertInventoryReversalEventMatchesOutbox(client, tenantId, envelope);
      }

      // ── Deduplicación por inbox ────────────────────────────────────────
      const current = await client.query<{ aggregate_version: number }>(
        `SELECT aggregate_version FROM execution_order_inbox_events
         WHERE tenant_id = $1
           AND consumer = $2
           AND aggregate_id = $3
           AND processed_at IS NOT NULL
         ORDER BY aggregate_version DESC
         LIMIT 1
         FOR UPDATE`,
        [tenantId, 'mod11-operation-projection', envelope.aggregateId],
      );
      const latestVersion = current.rows[0]?.aggregate_version ?? 0;

      // Eventos fuera de orden (versión antigua después de nueva): NO revierten
      const bypassAggregateVersion = INVENTORY_EVENTS_BYPASSING_AGGREGATE_VERSION.has(
        envelope.eventType,
      );
      if (!bypassAggregateVersion && envelope.aggregateVersion <= latestVersion) {
        await client.query('COMMIT');
        this.logger.debug(
          `[execution-events] skip out-of-order event_id=${envelope.eventId} ` +
            `version=${envelope.aggregateVersion} latest=${latestVersion}`,
        );
        return;
      }

      // Insertar en inbox — la unicidad (tenant_id, consumer, event_id) garantiza
      // que un duplicado de BullMQ no se procese dos veces.
      const inserted = await client.query(
        `INSERT INTO execution_order_inbox_events
           (tenant_id, consumer, event_id, aggregate_id, aggregate_version, processed_at)
         VALUES ($1, $2, $3, $4, $5, NULL)
         ON CONFLICT (tenant_id, consumer, event_id) DO NOTHING
         RETURNING id`,
        [
          tenantId,
          'mod11-operation-projection',
          envelope.eventId,
          envelope.aggregateId,
          envelope.aggregateVersion,
        ],
      );
      if ((inserted.rowCount ?? 0) === 0) {
        // Duplicado: ya existe en inbox
        await client.query('COMMIT');
        return;
      }

      let scheduleEventId: string | null = null;
      if (SCHEDULE_PROJECTED_EXECUTION_EVENTS.has(envelope.eventType)) {
        // El lookup de la proyección debe usar el mismo agregado validado en
        // el payload, antes de consultar cualquier vínculo de agenda.
        this.assertPayload(envelope, true);
        const orders = await client.query<{ schedule_event_id: string | null }>(
          `SELECT schedule_event_id FROM execution_orders
           WHERE id = $1 AND tenant_id = $2`,
          [envelope.aggregateId, tenantId],
        );
        const order = orders.rows[0];
        if (!order) {
          throw new UnrecoverableError('No se encontró la OT para proyectar su evento de agenda.');
        }
        scheduleEventId = order.schedule_event_id;
        if (scheduleEventId === null) {
          // CA-13: NULL es el estado normal de toda OT despachada sin cita
          // (ADR-091 §D5), por lo que la omisión es de nivel `debug` y no
          // `warn` (alertaría en el flujo esperado). Va como clave=valor
          // estable, con evento, tipo, OT y tenant, para poder correlacionar
          // "por qué no cambió la agenda" sin abrir la base.
          this.logger.debug(
            `[execution-events] schedule_projection_skipped reason=schedule_event_id_null ` +
              `event=${envelope.eventId} type=${envelope.eventType} ` +
              `ot=${envelope.aggregateId} tenant=${tenantId}`,
          );
        }
      }

      // ── Matriz de convergencia ADR-068 ──────────────────────────────────
      const handlers: Record<
        OperationalEventTypeV1,
        (event: OperationalEventEnvelopeV1) => Promise<void>
      > = {
        VisitScheduledV1: (event) => {
          this.assertPayload(event, false);
          return Promise.resolve();
        },
        VisitWindowChangedV1: (event) => {
          this.assertPayload(event, true);
          return Promise.resolve();
        },
        VisitResourceChangedV1: (event) => {
          this.assertPayload(event, true);
          return Promise.resolve();
        },
        VisitCancelledV1: (event) => {
          this.assertPayload(event, true);
          return Promise.resolve();
        },
        ExecutionOrderStartedV1: (e) =>
          this.applyExecutionOrderStarted(client, tenantId, e, scheduleEventId),
        ExecutionOrderBlockedV1: (e) =>
          this.applyExecutionOrderBlocked(client, tenantId, e, scheduleEventId),
        InventoryConsumptionRequestedV1: (event) => {
          this.assertPayload(event, true);
          // MOD12 consumirá este evento desde el outbox y procesará el
          // movimiento de inventario. MOD11 no actúa sobre este evento
          // porque es el emisor, no el consumidor.
          return Promise.resolve();
        },
        InventoryConsumptionRequestedV2: (event) =>
          this.enqueueSignedInventoryRequest(
            tenantId,
            InventoryConsumptionRequestedV2EnvelopeSchema.parse(event),
          ),
        InventoryConsumptionReversalRequestedV1: (event) =>
          this.enqueueSignedInventoryReversalRequest(
            tenantId,
            InventoryConsumptionReversalRequestedV1EnvelopeSchema.parse(event),
          ),
        ExecutionOrderClosedV1: (e) =>
          this.applyExecutionOrderClosed(client, tenantId, e, scheduleEventId),
        // MOD11 T2 (CA-13): cancelación y anulación son hechos de dominio
        // cuyos efectos ya aplicó sincrónicamente la transacción emisora
        // (la agenda actualizó evento/solicitud; la anulación no proyecta
        // nada porque la OT no debió existir). El handler acusa recibo para
        // que el hecho durable no envenene la cola; no propaga estado (T1
        // sigue siendo dueño de la propagación agenda → OT).
        ExecutionOrderCancelledV1: (event) => {
          this.assertPayload(event, true);
          return Promise.resolve();
        },
        ExecutionOrderAnnulledV1: (event) => {
          this.assertPayload(event, true);
          return Promise.resolve();
        },
        ExecutionOrderFollowUpRequiredV1: (e) =>
          this.applyExecutionOrderFollowUp(client, tenantId, e, scheduleEventId),
        InventoryMovementConfirmedV1: (e) =>
          this.applyInventoryMovementConfirmed(client, tenantId, e),
        InventoryMovementRejectedV1: (e) =>
          this.applyInventoryMovementRejected(client, tenantId, e),
        InventoryReversalConfirmedV1: (e) =>
          this.applyInventoryReversalConfirmed(client, tenantId, e),
        InventoryReversalRejectedV1: (e) =>
          this.applyInventoryReversalRejected(client, tenantId, e),
      };

      const handler = handlers[envelope.eventType];
      if (!handler) throw new UnrecoverableError('Tipo de evento no versionado.');

      await handler(envelope);

      // Marcar inbox como procesado
      await client.query(
        `UPDATE execution_order_inbox_events
         SET processed_at = NOW()
         WHERE tenant_id = $1
           AND consumer = $2
           AND event_id = $3`,
        [tenantId, 'mod11-operation-projection', envelope.eventId],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      this.logger.warn(
        `[execution-events] retry event=${safeUuid(envelope.eventId) ?? 'omitted'} ` +
          `tenant=${safeUuid(tenantId) ?? 'omitted'} attempt=${job.attemptsMade + 1}`,
      );
      throw error;
    } finally {
      client.release();
    }
  }

  private async enqueueSignedInventoryRequest(tenantId: string, candidate: unknown): Promise<void> {
    const envelope = InventoryConsumptionRequestedV2EnvelopeSchema.parse(candidate);
    const activeKey = this.configValue('INTERNAL_QUEUE_SIGNING_KEY');
    const secret = Buffer.from(activeKey, 'base64');
    if (secret.byteLength < 32 || secret.toString('base64') !== activeKey) {
      throw new UnrecoverableError('INTERNAL_QUEUE_SIGNING_KEY inválida.');
    }

    const signature = createHmac('sha256', secret)
      .update(canonicalizeInventoryExecutionRequest(tenantId, envelope))
      .digest('hex');
    const signed = SignedInventoryExecutionRequestSchema.parse({
      tenantId,
      envelope,
      signature,
    });

    await this.inventoryRequestsQueue.add('process-inventory-execution-request', signed, {
      // El contrato de cola usa el eventId del evento de solicitud.
      jobId: envelope.eventId,
      attempts: 8,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: { age: SOURCE_JOB_RETENTION_SECONDS },
    });
  }

  private async enqueueSignedInventoryReversalRequest(
    tenantId: string,
    candidate: unknown,
  ): Promise<void> {
    const envelope = InventoryConsumptionReversalRequestedV1EnvelopeSchema.parse(candidate);
    const activeKey = this.configValue('INTERNAL_QUEUE_SIGNING_KEY');
    const secret = Buffer.from(activeKey, 'base64');
    if (secret.byteLength < 32 || secret.toString('base64') !== activeKey) {
      throw new UnrecoverableError('INTERNAL_QUEUE_SIGNING_KEY inválida.');
    }

    const signature = createHmac('sha256', secret)
      .update(canonicalizeInventoryExecutionRequest(tenantId, envelope))
      .digest('hex');
    const signed = SignedInventoryExecutionReversalRequestSchema.parse({
      tenantId,
      envelope,
      signature,
    });

    await this.inventoryRequestsQueue.add('process-inventory-execution-request', signed, {
      jobId: envelope.eventId,
      attempts: 8,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: { age: SOURCE_JOB_RETENTION_SECONDS },
    });
  }

  private async assertInventoryEventMatchesOutbox(
    client: PoolClient,
    tenantId: string,
    candidate: unknown,
  ): Promise<void> {
    const parsed = InventoryConsumptionRequestedV2EnvelopeSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.tenantId !== tenantId) {
      throw new UnrecoverableError('INVENTORY_OUTBOX_EVENT_MISMATCH');
    }

    const envelope = parsed.data;
    const result = await client.query<InventoryOutboxRow>(
      `SELECT event_id, tenant_id, aggregate_id, aggregate_version,
              event_type, correlation_id, occurred_at, payload
         FROM execution_order_outbox_events
        WHERE tenant_id = $1 AND event_id = $2
        FOR SHARE`,
      [tenantId, envelope.eventId],
    );
    const outbox = result.rows[0];
    if (
      !outbox ||
      outbox.event_id.toLowerCase() !== envelope.eventId.toLowerCase() ||
      outbox.tenant_id.toLowerCase() !== tenantId.toLowerCase() ||
      outbox.event_type !== envelope.eventType ||
      outbox.aggregate_id.toLowerCase() !== envelope.aggregateId.toLowerCase() ||
      outbox.aggregate_version !== envelope.aggregateVersion ||
      outbox.correlation_id.toLowerCase() !== envelope.correlationId.toLowerCase() ||
      !timestampsMatch(outbox.occurred_at, envelope.occurredAt) ||
      canonicalizeInventoryExecutionRequest(tenantId, outbox.payload) !==
        canonicalizeInventoryExecutionRequest(tenantId, envelope.payload)
    ) {
      throw new UnrecoverableError('INVENTORY_OUTBOX_EVENT_MISMATCH');
    }
  }

  private async assertInventoryReversalEventMatchesOutbox(
    client: PoolClient,
    tenantId: string,
    candidate: unknown,
  ): Promise<void> {
    const parsed = InventoryConsumptionReversalRequestedV1EnvelopeSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.tenantId !== tenantId) {
      throw new UnrecoverableError('INVENTORY_OUTBOX_EVENT_MISMATCH');
    }

    const envelope = parsed.data;
    const result = await client.query<InventoryOutboxRow>(
      `SELECT event_id, tenant_id, aggregate_id, aggregate_version,
              event_type, correlation_id, occurred_at, payload
         FROM execution_order_outbox_events
        WHERE tenant_id = $1 AND event_id = $2
        FOR SHARE`,
      [tenantId, envelope.eventId],
    );
    const outbox = result.rows[0];
    if (
      !outbox ||
      outbox.event_id.toLowerCase() !== envelope.eventId.toLowerCase() ||
      outbox.tenant_id.toLowerCase() !== tenantId.toLowerCase() ||
      outbox.event_type !== envelope.eventType ||
      outbox.aggregate_id.toLowerCase() !== envelope.aggregateId.toLowerCase() ||
      outbox.aggregate_version !== envelope.aggregateVersion ||
      outbox.correlation_id.toLowerCase() !== envelope.correlationId.toLowerCase() ||
      !timestampsMatch(outbox.occurred_at, envelope.occurredAt) ||
      canonicalizeInventoryExecutionRequest(tenantId, outbox.payload) !==
        canonicalizeInventoryExecutionRequest(tenantId, envelope.payload)
    ) {
      throw new UnrecoverableError('INVENTORY_OUTBOX_EVENT_MISMATCH');
    }
  }

  private configValue(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value) throw new UnrecoverableError(`${name} ausente.`);
    return value;
  }

  // ── Proyección: ExecutionOrderStartedV1 ─────────────────────────────────
  // ADR-068 §Matriz de convergencia: IN_PROGRESS → ScheduleEvent=IN_PROGRESS,
  // VisitRequest=IN_EXECUTION, Task=IN_PROGRESS
  private async applyExecutionOrderStarted(
    client: PoolClient,
    tenantId: string,
    event: OperationalEventEnvelopeV1,
    scheduleEventId: string | null,
  ): Promise<void> {
    const payload = event.payload as {
      executionOrderId: string;
    };

    // schedule_event_id NULL se omite en el despacho del handler; no existe
    // proyección de agenda para esta OT. VisitRequest y Task sí convergen.
    if (scheduleEventId !== null) {
      // ScheduleEvent → IN_PROGRESS (vía execution_order_id FK lógica)
      await client.query(
        `UPDATE schedule_events
         SET status = 'IN_PROGRESS', updated_at = NOW()
         WHERE tenant_id = $1
           AND execution_order_id = $2
           AND status NOT IN ('COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW')`,
        [tenantId, payload.executionOrderId],
      );
    }

    // VisitRequest → IN_EXECUTION
    await client.query(
      `UPDATE visit_requests
       SET status = 'IN_EXECUTION', updated_at = NOW()
       WHERE tenant_id = $1
         AND execution_order_id = $2
         AND status NOT IN ('CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED')`,
      [tenantId, payload.executionOrderId],
    );

    // Task → IN_PROGRESS (vía task_id en execution_orders)
    await this.transitionLinkedTask(client, tenantId, payload.executionOrderId, 'IN_PROGRESS');
  }

  // ── Proyección: ExecutionOrderBlockedV1 ─────────────────────────────────
  // ADR-068: BLOCKED → ScheduleEvent=IN_PROGRESS (alerta), VisitRequest=IN_EXECUTION,
  // Task=BLOCKED
  private async applyExecutionOrderBlocked(
    client: PoolClient,
    tenantId: string,
    event: OperationalEventEnvelopeV1,
    scheduleEventId: string | null,
  ): Promise<void> {
    const payload = event.payload as {
      executionOrderId: string;
    };

    if (scheduleEventId !== null) {
      // ScheduleEvent → IN_PROGRESS sin cambiar estado (ya lo está; la alerta es UX)
      await client.query(
        `UPDATE schedule_events
         SET updated_at = NOW()
         WHERE tenant_id = $1 AND execution_order_id = $2`,
        [tenantId, payload.executionOrderId],
      );
    }

    // VisitRequest → IN_EXECUTION
    await client.query(
      `UPDATE visit_requests
       SET status = 'IN_EXECUTION', updated_at = NOW()
       WHERE tenant_id = $1
         AND execution_order_id = $2
         AND status NOT IN ('CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED')`,
      [tenantId, payload.executionOrderId],
    );

    // Task → BLOCKED
    await this.transitionLinkedTask(client, tenantId, payload.executionOrderId, 'BLOCKED');
  }

  // ── Proyección: ExecutionOrderClosedV1 ──────────────────────────────────
  // ADR-068 §Matriz de convergencia:
  //   COMPLETED          → ScheduleEvent=COMPLETED, VisitRequest=CLOSED, Task=RESOLVED
  //   COMPLETED_WITH_OBS → igual que COMPLETED
  //   NOT_EXECUTED       → ScheduleEvent=CANCELLED, VisitRequest=REQUIRES_RESCHEDULE, Task=READY
  //   CANCELLED          → ScheduleEvent=CANCELLED, VisitRequest=CANCELLED, Task=CANCELLED
  private async applyExecutionOrderClosed(
    client: PoolClient,
    tenantId: string,
    event: OperationalEventEnvelopeV1,
    scheduleEventId: string | null,
  ): Promise<void> {
    const payload = event.payload as {
      executionOrderId: string;
      result: string;
    };

    let scheduleStatus: string;
    let visitStatus: string;
    let taskStatus: string | null;

    switch (payload.result) {
      case 'EXECUTED':
      case 'EXECUTED_WITH_OBSERVATIONS':
        scheduleStatus = 'COMPLETED';
        visitStatus = 'CLOSED';
        taskStatus = 'RESOLVED';
        break;
      case 'NOT_EXECUTED':
        scheduleStatus = 'CANCELLED';
        visitStatus = 'REQUIRES_RESCHEDULE';
        taskStatus = 'READY';
        break;
      case 'CANCELLED':
        scheduleStatus = 'CANCELLED';
        visitStatus = 'CANCELLED';
        taskStatus = 'CANCELLED';
        break;
      default:
        scheduleStatus = 'COMPLETED';
        visitStatus = 'CLOSED';
        taskStatus = 'RESOLVED';
    }

    if (scheduleEventId !== null) {
      // ScheduleEvent
      await client.query(
        `UPDATE schedule_events
         SET status = $3, updated_at = NOW()
         WHERE tenant_id = $1
           AND execution_order_id = $2
           AND status NOT IN ('COMPLETED', 'CANCELLED')`,
        [tenantId, payload.executionOrderId, scheduleStatus],
      );
    }

    // VisitRequest
    await client.query(
      `UPDATE visit_requests
       SET status = $3, updated_at = NOW()
       WHERE tenant_id = $1
         AND execution_order_id = $2
         AND status NOT IN ('CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED')`,
      [tenantId, payload.executionOrderId, visitStatus],
    );

    // Task
    if (taskStatus) {
      await this.transitionLinkedTask(client, tenantId, payload.executionOrderId, taskStatus);
    }
  }

  // ── Proyección: ExecutionOrderFollowUpRequiredV1 ────────────────────────
  // ADR-068: REQUIRES_FOLLOW_UP → ScheduleEvent=COMPLETED,
  //   VisitRequest=REQUIRES_RESCHEDULE, Task=PENDING_INTERNAL
  private async applyExecutionOrderFollowUp(
    client: PoolClient,
    tenantId: string,
    event: OperationalEventEnvelopeV1,
    scheduleEventId: string | null,
  ): Promise<void> {
    const payload = event.payload as {
      executionOrderId: string;
    };

    if (scheduleEventId !== null) {
      // ScheduleEvent → COMPLETED
      await client.query(
        `UPDATE schedule_events
         SET status = 'COMPLETED', updated_at = NOW()
         WHERE tenant_id = $1
           AND execution_order_id = $2
           AND status NOT IN ('COMPLETED', 'CANCELLED')`,
        [tenantId, payload.executionOrderId],
      );
    }

    // VisitRequest → REQUIRES_RESCHEDULE
    await client.query(
      `UPDATE visit_requests
       SET status = 'REQUIRES_RESCHEDULE', updated_at = NOW()
       WHERE tenant_id = $1
         AND execution_order_id = $2
         AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED')`,
      [tenantId, payload.executionOrderId],
    );

    // Task → PENDING_INTERNAL
    await this.transitionLinkedTask(client, tenantId, payload.executionOrderId, 'PENDING_INTERNAL');
  }

  // ── Proyección: InventoryMovementConfirmedV1 ──────────────────────────
  // ADR-068: MOD12 confirma el movimiento → MOD11 actualiza el registro
  // de consumo a CONFIRMED y guarda el stockMovementId.
  private async applyInventoryMovementConfirmed(
    client: PoolClient,
    tenantId: string,
    event: OperationalEventEnvelopeV1,
  ): Promise<void> {
    const payload = event.payload as {
      executionOrderId: string;
      inventoryRequestId: string;
      stockMovementId: string;
    };
    const transitioned = await client.query(
      `UPDATE execution_order_item_usage
       SET movement_status = 'CONFIRMED',
           stock_movement_id = $3,
           rejection_reason_code = NULL
       WHERE tenant_id = $1
         AND inventory_request_id = $2
         AND movement_status = 'PENDING'
       RETURNING id`,
      [tenantId, payload.inventoryRequestId, payload.stockMovementId],
    );
    if ((transitioned.rowCount ?? 0) > 0) return;

    const current = await client.query<{
      movement_status: string | null;
      stock_movement_id: string | null;
    }>(
      `SELECT movement_status, stock_movement_id
       FROM execution_order_item_usage
       WHERE tenant_id = $1 AND inventory_request_id = $2`,
      [tenantId, payload.inventoryRequestId],
    );
    if (!current.rows[0]) throw new Error('Inventory request is not available yet.');

    const row = current.rows[0];
    if (row.movement_status === 'CONFIRMED' && row.stock_movement_id === payload.stockMovementId) {
      return;
    }
    this.logger.warn(
      `[execution-events] inventory_result_anomaly code=CONTRADICTORY_INVENTORY_RESULT ` +
        `event=${event.eventId} tenant=${tenantId} ot=${payload.executionOrderId} ` +
        `inventory_request=${payload.inventoryRequestId}`,
    );
  }

  // ── Proyección: InventoryMovementRejectedV1 ───────────────────────────
  // ADR-068: MOD12 rechaza el movimiento → MOD11 actualiza el registro
  // de consumo a REJECTED.
  private async applyInventoryMovementRejected(
    client: PoolClient,
    tenantId: string,
    event: OperationalEventEnvelopeV1,
  ): Promise<void> {
    const payload = event.payload as {
      executionOrderId: string;
      inventoryRequestId: string;
      reasonCode: string;
    };
    const transitioned = await client.query(
      `UPDATE execution_order_item_usage
       SET movement_status = 'REJECTED',
           stock_movement_id = NULL,
           rejection_reason_code = $3
       WHERE tenant_id = $1
         AND inventory_request_id = $2
         AND movement_status = 'PENDING'
       RETURNING id`,
      [tenantId, payload.inventoryRequestId, payload.reasonCode],
    );
    if ((transitioned.rowCount ?? 0) > 0) return;

    const current = await client.query<{
      movement_status: string | null;
      rejection_reason_code: string | null;
    }>(
      `SELECT movement_status, rejection_reason_code
       FROM execution_order_item_usage
       WHERE tenant_id = $1 AND inventory_request_id = $2`,
      [tenantId, payload.inventoryRequestId],
    );
    if (!current.rows[0]) throw new Error('Inventory request is not available yet.');

    const row = current.rows[0];
    if (row.movement_status === 'REJECTED' && row.rejection_reason_code === payload.reasonCode) {
      return;
    }
    this.logger.warn(
      `[execution-events] inventory_result_anomaly code=CONTRADICTORY_INVENTORY_RESULT ` +
        `event=${event.eventId} tenant=${tenantId} ot=${payload.executionOrderId} ` +
        `inventory_request=${payload.inventoryRequestId}`,
    );
  }

  private async applyInventoryReversalConfirmed(
    client: PoolClient,
    tenantId: string,
    event: OperationalEventEnvelopeV1,
  ): Promise<void> {
    const payload = InventoryReversalConfirmedV1Schema.parse(event.payload);
    const transitioned = await client.query(
      `UPDATE execution_order_item_usage_reversals
          SET status = 'CONFIRMED',
              stock_movement_id = $3,
              rejection_reason_code = NULL,
              decided_at = NOW()
        WHERE tenant_id = $1
          AND reversal_request_id = $2
          AND status = 'PENDING'
        RETURNING id`,
      [tenantId, payload.reversalRequestId, payload.stockMovementId],
    );
    if ((transitioned.rowCount ?? 0) > 0) return;

    const current = await client.query<{
      status: string;
      stock_movement_id: string | null;
    }>(
      `SELECT status, stock_movement_id
         FROM execution_order_item_usage_reversals
        WHERE tenant_id = $1 AND reversal_request_id = $2`,
      [tenantId, payload.reversalRequestId],
    );
    const row = current.rows[0];
    if (!row) throw new Error('Reversal request is not available yet.');
    if (row.status === 'CONFIRMED' && row.stock_movement_id === payload.stockMovementId) return;

    this.logger.warn(
      `[execution-events] reversal_result_anomaly code=CONTRADICTORY_REVERSAL_RESULT ` +
        `event=${event.eventId} tenant=${tenantId} ot=${payload.executionOrderId} ` +
        `reversal_request=${payload.reversalRequestId}`,
    );
  }

  private async applyInventoryReversalRejected(
    client: PoolClient,
    tenantId: string,
    event: OperationalEventEnvelopeV1,
  ): Promise<void> {
    const payload = InventoryReversalRejectedV1Schema.parse(event.payload);
    const transitioned = await client.query(
      `UPDATE execution_order_item_usage_reversals
          SET status = 'REJECTED',
              stock_movement_id = NULL,
              rejection_reason_code = $3,
              decided_at = NOW()
        WHERE tenant_id = $1
          AND reversal_request_id = $2
          AND status = 'PENDING'
        RETURNING id`,
      [tenantId, payload.reversalRequestId, payload.reasonCode],
    );
    if ((transitioned.rowCount ?? 0) > 0) return;

    const current = await client.query<{
      status: string;
      rejection_reason_code: string | null;
    }>(
      `SELECT status, rejection_reason_code
         FROM execution_order_item_usage_reversals
        WHERE tenant_id = $1 AND reversal_request_id = $2`,
      [tenantId, payload.reversalRequestId],
    );
    const row = current.rows[0];
    if (!row) throw new Error('Reversal request is not available yet.');
    if (row.status === 'REJECTED' && row.rejection_reason_code === payload.reasonCode) return;

    this.logger.warn(
      `[execution-events] reversal_result_anomaly code=CONTRADICTORY_REVERSAL_RESULT ` +
        `event=${event.eventId} tenant=${tenantId} ot=${payload.executionOrderId} ` +
        `reversal_request=${payload.reversalRequestId}`,
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Transiciona la Task vinculada a la OT por task_id.
   * Resuelve el task_id desde execution_orders y aplica la transición.
   */
  private async transitionLinkedTask(
    client: PoolClient,
    tenantId: string,
    executionOrderId: string,
    targetStatus: string,
  ): Promise<void> {
    try {
      // Resolver el task_id vinculado desde execution_orders
      const order = await client.query<{ task_id: string | null }>(
        `SELECT task_id FROM execution_orders
         WHERE id = $1 AND tenant_id = $2`,
        [executionOrderId, tenantId],
      );

      const taskId = order.rows[0]?.task_id;
      if (!taskId) return;

      // Validar formato de task_id: solo UUID o strings alfanuméricos con guiones
      if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) {
        this.logger.warn(
          `[execution-events] task_id inválido para OT ${executionOrderId}: ${taskId}`,
        );
        return;
      }

      await client.query(
        `UPDATE operational_tasks
         SET status = $3, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [taskId, tenantId, targetStatus],
      );
    } catch (error) {
      // Fallo en proyección de Task no debe abortar el evento completo.
      // Se registra y el reconciliador lo detectará.
      this.logger.warn(
        `[execution-events] no se pudo actualizar Task para OT ${executionOrderId}: ` +
          `${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  /**
   * Valida el envelope: integridad estructural sin inspeccionar el payload.
   */
  private assertPayload(event: OperationalEventEnvelopeV1, requiresOrder: boolean): void {
    const payload = event.payload as { executionOrderId?: string };
    if (requiresOrder && payload.executionOrderId !== event.aggregateId) {
      throw new UnrecoverableError('Payload fuera del aggregate del evento.');
    }
    if (event.tenantId.length === 0 || event.aggregateVersion < 1) {
      throw new UnrecoverableError('Envelope de evento inválido.');
    }
  }
}
