'use client';

import { CalendarClock, Crosshair, MapPin, Route, Ticket } from 'lucide-react';
import { Badge, Button, OperationalSidePeek, SkeletonBlock } from '@iwana/ui';
import { ScheduleEventStatus } from '@iwana/shared';
import type {
  InternalUser,
  WfmScheduleEvent,
  ExecutionOrderDetailResponse,
  ExecutionOrderRecord,
} from '@/lib/api-client';
import { PortalAlert, PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import { ExecutionOrderSummary } from '@/components/operations/ExecutionOrderSummary';
import type { ExecutionOrderSyncState } from '@/components/operations/ExecutionOrderSummary';
import {
  formatWfmDateRange,
  formatScheduleEventCoordinates,
  getEventReferenceLabel,
  getScheduleEventStatusLabel,
  getScheduleEventStatusVariant,
  getTechnicianDisplayName,
  getWfmWorkTypeLabel,
  getWfmWorkTypeVariant,
  isScheduleEventTerminalStatus,
} from './scheduling-ui';

export type { ExecutionOrderSyncState } from '@/components/operations/ExecutionOrderSummary';

export interface ScheduleEventDrawerProps {
  open: boolean;
  event: WfmScheduleEvent | null;
  technician: InternalUser | null;
  executionOrder?: ExecutionOrderRecord | ExecutionOrderDetailResponse | null;
  syncState?: ExecutionOrderSyncState;
  onOpenChange: (open: boolean) => void;
  onOpenMoveToPending?: () => void;
  onOpenExecutionOrder?: () => void;
  onRefreshDetail?: () => Promise<void>;
  canReschedule: boolean;
  isLoading: boolean;
  error: string | null;
  executionOrderError?: string | null;
  workOrderWarning?: string | null;
  onRetry?: () => Promise<void>;
}

function formatChangeTimestamp(date: string): string {
  try {
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(date));
  } catch {
    return 'Fecha no disponible';
  }
}

/**
 * Panel lateral de Agenda — superficie de coordinación exclusivamente.
 *
 * La Agenda nunca contiene formularios de ejecución de campo, selectores genéricos
 * de estado ni controles de mutación de OT. El coordinador supervisa contexto,
 * resuelve excepciones y abre la OT cuando necesita revisar la ejecución completa.
 */
export function ScheduleEventDrawer({
  open,
  event,
  technician,
  executionOrder,
  syncState = 'synced',
  onOpenChange,
  onOpenMoveToPending,
  onOpenExecutionOrder,
  onRefreshDetail,
  canReschedule,
  isLoading,
  error,
  executionOrderError = null,
  workOrderWarning = null,
  onRetry,
}: ScheduleEventDrawerProps) {
  const terminalEvent = event ? isScheduleEventTerminalStatus(event.status) : true;
  const coordinatesLabel = event ? formatScheduleEventCoordinates(event) : null;
  const hasExecutionOrder = Boolean(event?.executionOrderId);

  return (
    <OperationalSidePeek
      open={open}
      onOpenChange={onOpenChange}
      title={event?.title || 'Detalle del evento'}
      description="Supervisa la visita, resuelve excepciones y abre la orden de trabajo cuando necesites revisar la ejecución."
      eyebrow="Agenda · coordinación"
    >
      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando detalle del evento">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-48" />
        </div>
      ) : error ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar el detalle"
          description={error}
          action={
            onRetry ? (
              <Button type="button" variant="secondary" onClick={() => void onRetry()}>
                Reintentar
              </Button>
            ) : undefined
          }
        />
      ) : !event ? (
        <PortalEmptyState
          title="Evento no disponible"
          description="Selecciona otro evento de la agenda para consultar su trazabilidad."
        />
      ) : (
        <div className="space-y-5">
          {/* ── Badges de encabezado ── */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getWfmWorkTypeVariant(event.type)}>
              {getWfmWorkTypeLabel(event.type)}
            </Badge>
            <Badge variant={getScheduleEventStatusVariant(event.status)}>
              {getScheduleEventStatusLabel(event.status)}
            </Badge>
            {hasExecutionOrder ? <Badge variant="primary">Orden vinculada</Badge> : null}
          </div>

          {/* ── Contexto operativo ── */}
          <section
            aria-labelledby="agenda-context"
            className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3"
          >
            <h3 id="agenda-context" className="portal-eyebrow-muted">
              Contexto operativo
            </h3>
            <div className="mt-3 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <p className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 h-4 w-4 text-iwana-primary" aria-hidden="true" />
                <span>{formatWfmDateRange(event.scheduledStartAt, event.scheduledEndAt)}</span>
              </p>
              <p className="flex items-start gap-2">
                <Route className="mt-0.5 h-4 w-4 text-iwana-primary" aria-hidden="true" />
                <span>
                  {technician ? getTechnicianDisplayName(technician) : 'Responsable no disponible'}
                </span>
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-iwana-primary" aria-hidden="true" />
                <span>
                  {[event.address, event.sector, event.municipality].filter(Boolean).join(' · ') ||
                    'Ubicación no disponible'}
                </span>
              </p>
              {coordinatesLabel ? (
                <p className="flex items-start gap-2">
                  <Crosshair className="mt-0.5 h-4 w-4 text-iwana-primary" aria-hidden="true" />
                  <span>Coordenadas: {coordinatesLabel}</span>
                </p>
              ) : null}
              <p className="flex items-start gap-2">
                <Ticket className="mt-0.5 h-4 w-4 text-iwana-primary" aria-hidden="true" />
                <span>{getEventReferenceLabel(event)}</span>
              </p>
            </div>
            <p className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300">
              {event.description || 'Sin descripción interna registrada para esta actividad.'}
            </p>
          </section>

          {workOrderWarning ? (
            <PortalAlert
              variant="warning"
              title="Orden de trabajo no disponible"
              description={workOrderWarning}
            />
          ) : null}

          {/* ── Siguiente acción de coordinación ── */}
          <section
            aria-labelledby="agenda-next-action"
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="agenda-next-action"
                  className="text-sm font-semibold text-gray-900 dark:text-white"
                >
                  Siguiente acción
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {terminalEvent
                    ? 'El evento está cerrado y solo puede consultarse.'
                    : 'Elige una acción de coordinación para mantener la visita al día.'}
                </p>
              </div>
              {canReschedule && !terminalEvent && onOpenMoveToPending ? (
                <Button type="button" variant="secondary" onClick={onOpenMoveToPending}>
                  Mover a pendientes
                </Button>
              ) : null}
            </div>
          </section>

          {/* ── Resumen de la orden de trabajo ── */}
          <section
            aria-labelledby="agenda-order"
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3
                  id="agenda-order"
                  className="text-sm font-semibold text-gray-900 dark:text-white"
                >
                  Resumen de la orden de trabajo
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  La información completa se registra en la orden de trabajo; Agenda solo muestra su
                  resumen.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <ExecutionOrderSummary
                order={executionOrder ?? null}
                availability={
                  hasExecutionOrder ? (executionOrder ? 'linked' : 'unavailable') : 'unlinked'
                }
                error={executionOrderError}
                syncState={syncState}
                readonly
                canOpen={hasExecutionOrder && Boolean(onOpenExecutionOrder)}
                {...(onRefreshDetail ? { onRefreshDetail } : {})}
                {...(executionOrderError && onRetry ? { onRetry } : {})}
                {...(hasExecutionOrder && onOpenExecutionOrder
                  ? { onOpen: onOpenExecutionOrder }
                  : {})}
              />
            </div>
          </section>

          {/* ── Excepciones ── */}
          {syncState !== 'synced' ? (
            <PortalAlert
              variant="warning"
              title="Sincronización pendiente"
              description={
                syncState === 'stale'
                  ? 'Los datos de la orden pueden estar desactualizados. Actualiza para ver el estado vigente.'
                  : syncState === 'conflict'
                    ? 'La orden cambió en el servidor. Revisa la versión vigente antes de decidir.'
                    : syncState === 'error'
                      ? 'No pudimos sincronizar la orden. Intenta de nuevo más tarde.'
                      : 'Actualización pendiente. Última sincronización puede no reflejar el estado actual.'
              }
            />
          ) : null}

          {/* ── Historial de cambios ── */}
          <section
            aria-labelledby="agenda-history"
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
          >
            <h3 id="agenda-history" className="text-sm font-semibold text-gray-900 dark:text-white">
              Historial de cambios
            </h3>
            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              <p className="flex items-center justify-between py-1.5">
                <span>
                  Creado: {formatChangeTimestamp(event.createdAt ?? event.scheduledStartAt)}
                </span>
              </p>
              <p className="flex items-center justify-between py-1.5">
                <span>
                  Última modificación:{' '}
                  {formatChangeTimestamp(event.updatedAt ?? event.scheduledStartAt)}
                </span>
              </p>
              <p className="flex items-center justify-between py-1.5">
                <span>Tipo: {getWfmWorkTypeLabel(event.type)}</span>
              </p>
              <p className="flex items-center justify-between py-1.5">
                <span>Estado: {getScheduleEventStatusLabel(event.status)}</span>
              </p>
              {event.assignedUserId ? (
                <p className="flex items-center justify-between py-1.5">
                  <span>
                    Responsable:{' '}
                    {technician
                      ? getTechnicianDisplayName(technician)
                      : 'Responsable no disponible'}
                  </span>
                </p>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </OperationalSidePeek>
  );
}
