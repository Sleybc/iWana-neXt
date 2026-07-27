import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { Pool, PoolClient } from 'pg';
import { isValidSchemaName } from '@iwana/db';
import {
  OPERATIONS_EXECUTION_EVENTS_QUEUE,
  OPERATIONS_EXECUTION_DLQ,
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
    config: ConfigService,
    @InjectQueue(OPERATIONS_EXECUTION_DLQ)
    private readonly dlqQueue: Queue,
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

  /**
   * PLAT-P1-02: Tras agotar los 8 intentos, el job se mueve al DLQ
   * con metadatos de diagnóstico.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<ExecutionEventJob>, error: Error): Promise<void> {
    const { tenantId, envelope } = job.data;

    this.logger.error(
      `[execution-events] DLQ event_id=${envelope.eventId} ` +
        `tenant=${tenantId} attempts=${job.attemptsMade}/${job.opts.attempts} ` +
        `error=${error.message}`,
    );

    await this.dlqQueue.add(
      'failed-execution-event',
      {
        tenantId,
        envelope,
        diagnostic: {
          failedAt: new Date().toISOString(),
          attemptsMade: job.attemptsMade,
          jobId: job.id,
          errorMessage: error.message,
          errorName: error.name,
        },
      },
      {
        jobId: `dlq-${envelope.eventId}-${Date.now()}`,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
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
      if (envelope.aggregateVersion <= latestVersion) {
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
        ExecutionOrderStartedV1: (e) => this.applyExecutionOrderStarted(client, tenantId, e),
        ExecutionOrderBlockedV1: (e) => this.applyExecutionOrderBlocked(client, tenantId, e),
        InventoryConsumptionRequestedV1: (event) => {
          this.assertPayload(event, true);
          return Promise.resolve();
        },
        ExecutionOrderClosedV1: (e) => this.applyExecutionOrderClosed(client, tenantId, e),
        ExecutionOrderFollowUpRequiredV1: (e) =>
          this.applyExecutionOrderFollowUp(client, tenantId, e),
        InventoryMovementConfirmedV1: (event) => {
          this.assertPayload(event, true);
          return Promise.resolve();
        },
        InventoryMovementRejectedV1: (event) => {
          this.assertPayload(event, true);
          return Promise.resolve();
        },
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
        `[execution-events] retry event=${envelope.eventId} tenant=${tenantId} ` +
          `attempt=${job.attemptsMade + 1}`,
      );
      throw error;
    } finally {
      client.release();
    }
  }

  // ── Proyección: ExecutionOrderStartedV1 ─────────────────────────────────
  // ADR-068 §Matriz de convergencia: IN_PROGRESS → ScheduleEvent=IN_PROGRESS,
  // VisitRequest=IN_EXECUTION, Task=IN_PROGRESS
  private async applyExecutionOrderStarted(
    client: PoolClient,
    tenantId: string,
    event: OperationalEventEnvelopeV1,
  ): Promise<void> {
    const payload = event.payload as {
      executionOrderId: string;
    };

    // ScheduleEvent → IN_PROGRESS (vía execution_order_id FK lógica)
    await client.query(
      `UPDATE schedule_events
       SET status = 'IN_PROGRESS', updated_at = NOW()
       WHERE tenant_id = $1
         AND execution_order_id = $2
         AND status NOT IN ('COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW')`,
      [tenantId, payload.executionOrderId],
    );

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
  ): Promise<void> {
    const payload = event.payload as {
      executionOrderId: string;
    };

    // ScheduleEvent → IN_PROGRESS sin cambiar estado (ya lo está; la alerta es UX)
    await client.query(
      `UPDATE schedule_events
       SET updated_at = NOW()
       WHERE tenant_id = $1 AND execution_order_id = $2`,
      [tenantId, payload.executionOrderId],
    );

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

    // ScheduleEvent
    await client.query(
      `UPDATE schedule_events
       SET status = $3, updated_at = NOW()
       WHERE tenant_id = $1
         AND execution_order_id = $2
         AND status NOT IN ('COMPLETED', 'CANCELLED')`,
      [tenantId, payload.executionOrderId, scheduleStatus],
    );

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
  ): Promise<void> {
    const payload = event.payload as {
      executionOrderId: string;
    };

    // ScheduleEvent → COMPLETED
    await client.query(
      `UPDATE schedule_events
       SET status = 'COMPLETED', updated_at = NOW()
       WHERE tenant_id = $1
         AND execution_order_id = $2
         AND status NOT IN ('COMPLETED', 'CANCELLED')`,
      [tenantId, payload.executionOrderId],
    );

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
