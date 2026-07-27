import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import type { OperationalEventEnvelopeV1 } from '@iwana/shared';

export interface RelayHealth {
  /** Número total de eventos pendientes de publicación en todos los tenants */
  pendingEvents: number;
  /** Antigüedad en segundos del evento más antiguo sin publicar (o null) */
  oldestPendingAgeSeconds: number | null;
  /** Última vez que el relay escaneó */
  lastScanAt: string | null;
  /** Estado del relay: HEALTHY, DEGRADED, STOPPED */
  relayStatus: 'HEALTHY' | 'DEGRADED' | 'STOPPED';
  /** Desglose por tenant */
  perTenant: Array<{
    tenantId: string;
    schemaName: string;
    pendingCount: number;
    oldestAgeSeconds: number | null;
  }>;
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

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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
           COUNT(*)::int AS pending_count,
           COALESCE(
             EXTRACT(EPOCH FROM NOW() - MIN(occurred_at))::bigint,
             NULL
           ) AS oldest_age_seconds,
           COALESCE(
             MAX(published_at)::text,
             NULL
           ) AS last_published_at
         FROM execution_order_outbox_events
         WHERE tenant_id = $1 AND published_at IS NULL`,
        [tenantId],
      )) as Array<{
        pending_count: string;
        oldest_age_seconds: string | null;
        last_published_at: string | null;
      }>;

      const pendingCount = parseInt(pending[0]?.pending_count ?? '0', 10);
      const oldestAge = pending[0]?.oldest_age_seconds
        ? parseInt(pending[0].oldest_age_seconds, 10)
        : null;

      // Determinar estado del relay según la antigüedad del evento más antiguo
      let relayStatus: RelayHealth['relayStatus'] = 'HEALTHY';
      if (pendingCount > 0 && oldestAge !== null) {
        if (oldestAge > 600) {
          // Más de 10 minutos sin publicar
          relayStatus = 'STOPPED';
        } else if (oldestAge > 120) {
          // Más de 2 minutos
          relayStatus = 'DEGRADED';
        }
      }

      return {
        pendingEvents: pendingCount,
        oldestPendingAgeSeconds: oldestAge,
        lastScanAt: pending[0]?.last_published_at ?? null,
        relayStatus,
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
