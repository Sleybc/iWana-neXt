import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isValidSchemaName, runInTenantSchema, TenantContext } from '@iwana/db';
import type { OperationalEventEnvelopeV1 } from '@iwana/shared';

export interface RelayHealth {
  /** Número total de eventos pendientes de publicación en todos los tenants */
  pendingEvents: number;
  /** Antigüedad en segundos del evento más antiguo sin publicar (o null) */
  oldestPendingAgeSeconds: number | null;
  /** Última vez que el relay escaneó */
  lastScanAt: string | null;
  /** Estado del relay; sin umbral aprobado no se emite un veredicto. */
  relayStatus: 'HEALTHY' | 'DEGRADED' | 'STOPPED' | 'UNVERIFIED';
  /** Umbrales operativos configurados, sin valores implícitos. */
  lagThresholds: RelayLagThresholds;
  /** Etiqueta explícita cuando aún no existe un umbral aprobado. */
  lagThresholdStatus: 'configured' | 'sin umbral aprobado';
  /** Resumen estadístico del lag observado, sin criterio de abort. */
  lagDistributionSeconds: RelayLagDistribution;
  /** Eventos que terminaron en DLQ y permanecen visibles para operación. */
  dlqSize: number;
  /** Discrepancias detectables entre OT canónica y sus proyecciones. */
  reconciliationDiscrepancies: number;
  /** Desglose por tenant */
  perTenant: Array<{
    tenantId: string;
    schemaName: string;
    pendingCount: number;
    oldestAgeSeconds: number | null;
  }>;
}

export interface RelayLagDistribution {
  count: number;
  minSeconds: number | null;
  p50Seconds: number | null;
  p95Seconds: number | null;
  p99Seconds: number | null;
  maxSeconds: number | null;
}

export interface RelayLagThresholds {
  degradedSeconds: number | null;
  stoppedSeconds: number | null;
}

export interface PlatformRelayTelemetry {
  outboxDepth: number;
  oldestPendingAgeSeconds: number | null;
  dlqSize: number;
  reconciliationDiscrepancies: number;
  lastScanAt: string | null;
  lagDistributionSeconds: RelayLagDistribution;
  lagThresholds: RelayLagThresholds;
  lagThresholdStatus: 'configured' | 'sin umbral aprobado';
}

export interface ProjectionDiscrepancy {
  tenantId: string;
  schemaName: string;
  executionOrderId: string;
  executionOrderStatus: string;
  scheduleEventStatus: string | null;
  visitRequestStatus: string | null;
  taskStatus: string | null;
  expectedScheduleStatus: string | null;
  expectedVisitStatus: string | null;
  expectedTaskStatus: string | null;
  hasDiscrepancy: boolean;
}

/**
 * Servicio de convergencia de proyecciones operativas.
 *
 * Expone métricas de relay health y reconcilia el estado entre
 * MOD11 (execution_orders) y MOD09 (schedule_events, visit_requests, tasks).
 */
@Injectable()
export class ExecutionOrderProjectionConvergenceService {
  private readonly logger = new Logger(ExecutionOrderProjectionConvergenceService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /**
   * PLAT-P1-04: Health endpoint para el relay de eventos.
   *
   * Devuelve el número de eventos pendientes, antigüedad del más antiguo,
   * último escaneo y estado del relay.
   */
  async getRelayHealth(): Promise<RelayHealth> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const pending = (await qr.query(
        `SELECT
            COUNT(*) FILTER (WHERE published_at IS NULL)::int AS pending_count,
            EXTRACT(EPOCH FROM NOW() - MIN(occurred_at)
              FILTER (WHERE published_at IS NULL))::bigint AS oldest_age_seconds,
            MAX(published_at) FILTER (WHERE published_at IS NOT NULL)::text AS last_published_at,
            COUNT(*) FILTER (WHERE last_error IS NOT NULL)::int AS dlq_size,
            COUNT(*) FILTER (WHERE published_at IS NULL)::int AS lag_count,
            MIN(EXTRACT(EPOCH FROM NOW() - occurred_at))
              FILTER (WHERE published_at IS NULL) AS lag_min_seconds,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM NOW() - occurred_at))
              FILTER (WHERE published_at IS NULL) AS lag_p50_seconds,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM NOW() - occurred_at))
              FILTER (WHERE published_at IS NULL) AS lag_p95_seconds,
            percentile_cont(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM NOW() - occurred_at))
              FILTER (WHERE published_at IS NULL) AS lag_p99_seconds,
            MAX(EXTRACT(EPOCH FROM NOW() - occurred_at))
              FILTER (WHERE published_at IS NULL) AS lag_max_seconds
          FROM execution_order_outbox_events
          WHERE tenant_id = $1`,
        [tenantId],
      )) as Array<{
        pending_count: string;
        oldest_age_seconds: string | null;
        last_published_at: string | null;
        dlq_size: string;
        lag_count: string;
        lag_min_seconds: string | null;
        lag_p50_seconds: string | null;
        lag_p95_seconds: string | null;
        lag_p99_seconds: string | null;
        lag_max_seconds: string | null;
      }>;

      const pendingCount = parseInt(pending[0]?.pending_count ?? '0', 10);
      const oldestAge = pending[0]?.oldest_age_seconds
        ? parseInt(pending[0].oldest_age_seconds, 10)
        : null;

      const threshold = this.getLagThresholds();
      const relayStatus = this.deriveRelayStatus(oldestAge, threshold);
      const row = pending[0];

      return {
        pendingEvents: pendingCount,
        oldestPendingAgeSeconds: oldestAge,
        lastScanAt: row?.last_published_at ?? null,
        relayStatus,
        lagThresholds: {
          degradedSeconds: threshold.degradedSeconds,
          stoppedSeconds: threshold.stoppedSeconds,
        },
        lagThresholdStatus: threshold.configured ? 'configured' : 'sin umbral aprobado',
        lagDistributionSeconds: this.parseLagDistribution(row),
        dlqSize: Number.parseInt(row?.dlq_size ?? '0', 10),
        reconciliationDiscrepancies: await this.countTenantDiscrepancies(qr, tenantId),
        perTenant: [
          {
            tenantId,
            schemaName,
            pendingCount,
            oldestAgeSeconds: oldestAge,
          },
        ],
      };
    });
  }

  /**
   * Telemetría agregada para el contrato público de health.
   *
   * No expone tenantId/schemaName y no altera el estado global del health por
   * lag: el consumidor recibe medición y configuración explícita, no un abort
   * inventado.
   */
  async getPlatformRelayTelemetry(): Promise<PlatformRelayTelemetry> {
    const tenants = (await this.dataSource.query(
      `SELECT id, schema_name FROM public.tenants
       WHERE deleted_at IS NULL AND status <> 'MARKED_FOR_DELETION'`,
    )) as Array<{ id: string; schema_name: string }>;

    const total: PlatformRelayTelemetry = {
      outboxDepth: 0,
      oldestPendingAgeSeconds: null,
      dlqSize: 0,
      reconciliationDiscrepancies: 0,
      lastScanAt: null,
      lagDistributionSeconds: this.emptyLagDistribution(),
      ...this.thresholdContract(),
    };
    const lagSamples: number[] = [];

    for (const tenant of tenants) {
      if (!isValidSchemaName(tenant.schema_name)) continue;

      try {
        await runInTenantSchema(this.dataSource, tenant.schema_name, async (qr) => {
          const rows = (await qr.query(
            `SELECT
               COUNT(*) FILTER (WHERE published_at IS NULL)::int AS pending_count,
               EXTRACT(EPOCH FROM NOW() - MIN(occurred_at)
                 FILTER (WHERE published_at IS NULL))::bigint AS oldest_age_seconds,
               MAX(published_at) FILTER (WHERE published_at IS NOT NULL)::text AS last_published_at,
               COUNT(*) FILTER (WHERE last_error IS NOT NULL)::int AS dlq_size
             FROM execution_order_outbox_events
             WHERE tenant_id = $1`,
            [tenant.id],
          )) as Array<{
            pending_count: string;
            oldest_age_seconds: string | null;
            last_published_at: string | null;
            dlq_size: string;
          }>;
          const row = rows[0];
          const pendingCount = Number.parseInt(row?.pending_count ?? '0', 10);
          total.outboxDepth += pendingCount;
          total.dlqSize += Number.parseInt(row?.dlq_size ?? '0', 10);
          total.oldestPendingAgeSeconds = this.maxNullable(
            total.oldestPendingAgeSeconds,
            row?.oldest_age_seconds ? Number.parseInt(row.oldest_age_seconds, 10) : null,
          );
          if (
            row?.last_published_at &&
            (!total.lastScanAt || row.last_published_at > total.lastScanAt)
          ) {
            total.lastScanAt = row.last_published_at;
          }

          const lagRows = (await qr.query(
            `SELECT EXTRACT(EPOCH FROM NOW() - occurred_at) AS lag_seconds
             FROM execution_order_outbox_events
             WHERE tenant_id = $1 AND published_at IS NULL`,
            [tenant.id],
          )) as Array<{ lag_seconds: string | null }>;
          for (const lagRow of lagRows) {
            const lag = Number.parseFloat(lagRow.lag_seconds ?? 'NaN');
            if (Number.isFinite(lag)) lagSamples.push(lag);
          }

          total.reconciliationDiscrepancies += await this.countTenantDiscrepancies(qr, tenant.id);
          return undefined;
        });
      } catch (error) {
        this.logger.warn(
          `No se pudo recolectar telemetría del relay para un tenant: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }

    total.lagDistributionSeconds = this.summarizeLagSamples(lagSamples);
    return total;
  }

  /**
   * Reconcilia las proyecciones de una OT: compara el estado canonico de
   * execution_orders contra schedule_events, visit_requests y tasks.
   *
   * No autocorrige — solo detecta y registra discrepancias para que el
   * operador decida la acción.
   *
   * ADR-068 §"Las lecturas de Agenda muestran el estado canonico de MOD11
   * o una proyección con versión y fecha de sincronización."
   */
  async reconcileOrder(executionOrderId: string): Promise<ProjectionDiscrepancy> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Estado canónico de MOD11
      const order = (await qr.query(
        `SELECT id, status, result::text
         FROM execution_orders
         WHERE id = $1 AND tenant_id = $2`,
        [executionOrderId, tenantId],
      )) as Array<{ id: string; status: string; result: string | null }>;

      if (order.length === 0) {
        throw new Error('OT no encontrada');
      }

      const eoStatus: string = order[0]!.status;
      const eoResult: string | null = order[0]!.result;

      // Proyección ScheduleEvent
      const schedule = (await qr.query(
        `SELECT status FROM schedule_events
         WHERE execution_order_id = $1 AND tenant_id = $2
         LIMIT 1`,
        [executionOrderId, tenantId],
      )) as Array<{ status: string }>;

      // Proyección VisitRequest
      const visit = (await qr.query(
        `SELECT status FROM visit_requests
         WHERE execution_order_id = $1 AND tenant_id = $2
         LIMIT 1`,
        [executionOrderId, tenantId],
      )) as Array<{ status: string }>;

      // Proyección Task
      const orderTask = (await qr.query(
        `SELECT task_id FROM execution_orders
         WHERE id = $1 AND tenant_id = $2`,
        [executionOrderId, tenantId],
      )) as Array<{ task_id: string | null }>;

      let taskStatus: string | null = null;
      const taskId = orderTask[0]?.task_id;
      if (taskId && /^[a-zA-Z0-9_-]+$/.test(taskId)) {
        const task = (await qr.query(
          `SELECT status FROM operational_tasks
           WHERE id = $1 AND tenant_id = $2
           LIMIT 1`,
          [taskId, tenantId],
        )) as Array<{ status: string }>;
        taskStatus = task[0]?.status ?? null;
      }

      // Mapa de expectativas según estado canónico (ADR-068 matriz de convergencia)
      const { expectedSchedule, expectedVisit, expectedTask } = this.computeExpectedProjections(
        eoStatus,
        eoResult,
      );

      const hasDiscrepancy =
        (schedule[0]?.status ?? null) !== expectedSchedule ||
        (visit[0]?.status ?? null) !== expectedVisit ||
        taskStatus !== expectedTask;

      if (hasDiscrepancy) {
        this.logger.warn(
          `[convergence] discrepancia detectada para OT ${executionOrderId}: ` +
            `Schedule=${schedule[0]?.status ?? 'null'}(esperado=${expectedSchedule}) ` +
            `Visit=${visit[0]?.status ?? 'null'}(esperado=${expectedVisit}) ` +
            `Task=${taskStatus ?? 'null'}(esperado=${expectedTask})`,
        );
      }

      return {
        tenantId,
        schemaName,
        executionOrderId,
        executionOrderStatus: eoStatus,
        scheduleEventStatus: schedule[0]?.status ?? null,
        visitRequestStatus: visit[0]?.status ?? null,
        taskStatus,
        expectedScheduleStatus: expectedSchedule,
        expectedVisitStatus: expectedVisit,
        expectedTaskStatus: expectedTask,
        hasDiscrepancy,
      };
    });
  }

  private getLagThresholds(): {
    degradedSeconds: number | null;
    stoppedSeconds: number | null;
    configured: boolean;
  } {
    const degradedSeconds = this.config?.get<number>('OUTBOX_RELAY_LAG_DEGRADED_SECONDS');
    const stoppedSeconds = this.config?.get<number>('OUTBOX_RELAY_LAG_STOPPED_SECONDS');
    const configured =
      degradedSeconds !== undefined &&
      stoppedSeconds !== undefined &&
      stoppedSeconds >= degradedSeconds;
    return {
      degradedSeconds: configured ? degradedSeconds : null,
      stoppedSeconds: configured ? stoppedSeconds : null,
      configured,
    };
  }

  private thresholdContract(): Pick<
    PlatformRelayTelemetry,
    'lagThresholds' | 'lagThresholdStatus'
  > {
    const threshold = this.getLagThresholds();
    return {
      lagThresholds: {
        degradedSeconds: threshold.degradedSeconds,
        stoppedSeconds: threshold.stoppedSeconds,
      },
      lagThresholdStatus: threshold.configured ? 'configured' : 'sin umbral aprobado',
    };
  }

  private deriveRelayStatus(
    oldestAge: number | null,
    threshold: ReturnType<ExecutionOrderProjectionConvergenceService['getLagThresholds']>,
  ): RelayHealth['relayStatus'] {
    if (!threshold.configured || oldestAge === null) return 'UNVERIFIED';
    if (oldestAge >= threshold.stoppedSeconds!) return 'STOPPED';
    if (oldestAge >= threshold.degradedSeconds!) return 'DEGRADED';
    return 'HEALTHY';
  }

  private parseLagDistribution(row?: {
    lag_count: string;
    lag_min_seconds: string | null;
    lag_p50_seconds: string | null;
    lag_p95_seconds: string | null;
    lag_p99_seconds: string | null;
    lag_max_seconds: string | null;
  }): RelayLagDistribution {
    if (!row) return this.emptyLagDistribution();
    return {
      count: Number.parseInt(row.lag_count ?? '0', 10),
      minSeconds: this.parseFloatOrNull(row.lag_min_seconds),
      p50Seconds: this.parseFloatOrNull(row.lag_p50_seconds),
      p95Seconds: this.parseFloatOrNull(row.lag_p95_seconds),
      p99Seconds: this.parseFloatOrNull(row.lag_p99_seconds),
      maxSeconds: this.parseFloatOrNull(row.lag_max_seconds),
    };
  }

  private summarizeLagSamples(samples: number[]): RelayLagDistribution {
    if (samples.length === 0) return this.emptyLagDistribution();
    const ordered = [...samples].sort((a, b) => a - b);
    return {
      count: ordered.length,
      minSeconds: ordered[0]!,
      p50Seconds: this.percentile(ordered, 0.5),
      p95Seconds: this.percentile(ordered, 0.95),
      p99Seconds: this.percentile(ordered, 0.99),
      maxSeconds: ordered[ordered.length - 1]!,
    };
  }

  private percentile(values: number[], percentile: number): number {
    const index = Math.min(values.length - 1, Math.ceil(percentile * values.length) - 1);
    return values[index]!;
  }

  private emptyLagDistribution(): RelayLagDistribution {
    return {
      count: 0,
      minSeconds: null,
      p50Seconds: null,
      p95Seconds: null,
      p99Seconds: null,
      maxSeconds: null,
    };
  }

  private parseFloatOrNull(value: string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private maxNullable(current: number | null, candidate: number | null): number | null {
    if (current === null) return candidate;
    if (candidate === null) return current;
    return Math.max(current, candidate);
  }

  private async countTenantDiscrepancies(
    qr: { query: (query: string, parameters?: unknown[]) => Promise<unknown> },
    tenantId: string,
  ): Promise<number> {
    const rows = (await qr.query(
      `SELECT eo.status AS execution_order_status,
              eo.result::text AS execution_order_result,
              schedule.status AS schedule_status,
              visit.status AS visit_status,
              task.status AS task_status
       FROM execution_orders eo
       LEFT JOIN LATERAL (
         SELECT status FROM schedule_events
         WHERE execution_order_id = eo.id AND tenant_id = eo.tenant_id
         ORDER BY created_at DESC LIMIT 1
       ) schedule ON TRUE
       LEFT JOIN LATERAL (
         SELECT status FROM visit_requests
         WHERE execution_order_id = eo.id AND tenant_id = eo.tenant_id
         ORDER BY created_at DESC LIMIT 1
       ) visit ON TRUE
       LEFT JOIN operational_tasks task
         ON task.id = eo.task_id AND task.tenant_id = eo.tenant_id
       WHERE eo.tenant_id = $1`,
      [tenantId],
    )) as Array<{
      execution_order_status: string;
      execution_order_result: string | null;
      schedule_status: string | null;
      visit_status: string | null;
      task_status: string | null;
    }>;

    return rows.reduce((count, row) => {
      const expected = this.computeExpectedProjections(
        row.execution_order_status,
        row.execution_order_result,
      );
      return (
        count +
        (row.schedule_status !== expected.expectedSchedule ||
        row.visit_status !== expected.expectedVisit ||
        row.task_status !== expected.expectedTask
          ? 1
          : 0)
      );
    }, 0);
  }

  /**
   * Computa los estados esperados de las proyecciones según la matriz de
   * convergencia de ADR-068.
   */
  private computeExpectedProjections(
    status: string,
    result: string | null,
  ): {
    expectedSchedule: string | null;
    expectedVisit: string | null;
    expectedTask: string | null;
  } {
    switch (status) {
      case 'CREATED':
      case 'ASSIGNED':
      case 'EN_ROUTE':
        return {
          expectedSchedule: 'SCHEDULED',
          expectedVisit: 'SCHEDULED',
          expectedTask: 'SCHEDULED',
        };

      case 'IN_PROGRESS':
        return {
          expectedSchedule: 'IN_PROGRESS',
          expectedVisit: 'IN_EXECUTION',
          expectedTask: 'IN_PROGRESS',
        };

      case 'BLOCKED':
        return {
          expectedSchedule: 'IN_PROGRESS',
          expectedVisit: 'IN_EXECUTION',
          expectedTask: 'BLOCKED',
        };

      case 'COMPLETED':
      case 'COMPLETED_WITH_OBSERVATIONS':
        if (result === 'REQUIRES_FOLLOW_UP') {
          return {
            expectedSchedule: 'COMPLETED',
            expectedVisit: 'REQUIRES_RESCHEDULE',
            expectedTask: 'PENDING_INTERNAL',
          };
        }
        return {
          expectedSchedule: 'COMPLETED',
          expectedVisit: 'CLOSED',
          expectedTask: 'RESOLVED',
        };

      case 'NOT_EXECUTED':
        return {
          expectedSchedule: 'COMPLETED',
          expectedVisit: 'REQUIRES_RESCHEDULE',
          expectedTask: 'READY',
        };

      case 'CANCELLED':
        return {
          expectedSchedule: 'CANCELLED',
          expectedVisit: 'CANCELLED',
          expectedTask: 'CANCELLED',
        };

      default:
        return {
          expectedSchedule: null,
          expectedVisit: null,
          expectedTask: null,
        };
    }
  }
}
