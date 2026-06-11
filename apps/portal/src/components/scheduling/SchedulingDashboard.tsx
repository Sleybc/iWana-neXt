'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import { WorkOrderStatus } from '@iwana/shared';
import type {
  InternalUser,
  ListWfmVisitRequestsResponse,
  WfmDashboardSummary,
  WfmScheduleEvent,
  WfmWorkOrder,
} from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import { PendingVisitRequestInbox } from './PendingVisitRequestInbox';
import {
  formatWfmDateTime,
  getScheduleEventStatusLabel,
  getWorkOrderStatusVariant,
} from './scheduling-ui';
import { isTerminalVisitRequestStatus } from './pending-visits-ui';
import { SchedulingAlertRail } from './SchedulingAlertRail';
import { SchedulingSummaryStrip } from './SchedulingSummaryStrip';
import { SchedulingTimelineBoard } from './SchedulingTimelineBoard';

interface SchedulingDashboardProps {
  summary: WfmDashboardSummary | null;
  events: WfmScheduleEvent[];
  workOrders: WfmWorkOrder[];
  pendingVisitRequests: ListWfmVisitRequestsResponse | null;
  techniciansById: Map<string, InternalUser>;
  selectedDayKey: string;
  isLoading: boolean;
  onRefresh: () => void;
  onSelectEvent: (event: WfmScheduleEvent) => void;
  onFilterTechnician: (technicianId: string) => void;
}

function startOfDay(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00`);
}

function endOfDay(dayKey: string): Date {
  return new Date(`${dayKey}T23:59:59.999`);
}

function isWithinSelectedDay(isoValue: string | null | undefined, dayKey: string): boolean {
  if (!isoValue) {
    return false;
  }

  const value = new Date(isoValue);
  const from = startOfDay(dayKey);
  const to = endOfDay(dayKey);
  return value >= from && value <= to;
}

function getOpenWorkOrderCount(workOrders: WfmWorkOrder[]): number {
  return workOrders.filter(
    (workOrder) =>
      workOrder.status === WorkOrderStatus.OPEN || workOrder.status === WorkOrderStatus.ASSIGNED,
  ).length;
}

function getOverdueWorkOrderCount(
  workOrders: WfmWorkOrder[],
  eventsById: Map<string, WfmScheduleEvent>,
): number {
  const now = Date.now();

  return workOrders.filter((workOrder) => {
    if (
      workOrder.status === WorkOrderStatus.DONE ||
      workOrder.status === WorkOrderStatus.CANCELLED ||
      !workOrder.scheduledEventId
    ) {
      return false;
    }

    const linkedEvent = eventsById.get(workOrder.scheduledEventId);
    if (!linkedEvent) {
      return false;
    }

    return new Date(linkedEvent.scheduledStartAt).getTime() < now;
  }).length;
}

function SchedulingOperationalSignals({
  events,
  workOrders,
  selectedDayKey,
  onSelectEvent,
}: {
  events: WfmScheduleEvent[];
  workOrders: WfmWorkOrder[];
  selectedDayKey: string;
  onSelectEvent: (event: WfmScheduleEvent) => void;
}) {
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const recentEvents = [...events]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 4);

  const daySignals = [
    {
      label: 'Programadas',
      value: events.filter((event) => event.status === 'SCHEDULED').length,
      variant: 'primary' as const,
    },
    {
      label: 'En ruta',
      value: events.filter((event) => event.status === 'EN_ROUTE').length,
      variant: 'info' as const,
    },
    {
      label: 'En ejecución',
      value: events.filter((event) => event.status === 'IN_PROGRESS').length,
      variant: 'warning' as const,
    },
    {
      label: 'Completadas hoy',
      value: events.filter(
        (event) =>
          event.status === 'COMPLETED' && isWithinSelectedDay(event.updatedAt, selectedDayKey),
      ).length,
      variant: 'success' as const,
    },
  ];

  const workOrderSignals = [
    {
      label: 'Abiertas',
      value: getOpenWorkOrderCount(workOrders),
      variant: getWorkOrderStatusVariant(WorkOrderStatus.OPEN),
    },
    {
      label: 'Atrasadas',
      value: getOverdueWorkOrderCount(workOrders, eventsById),
      variant: 'error' as const,
    },
    {
      label: 'En ejecución',
      value: workOrders.filter((workOrder) => workOrder.status === WorkOrderStatus.IN_PROGRESS)
        .length,
      variant: getWorkOrderStatusVariant(WorkOrderStatus.IN_PROGRESS),
    },
    {
      label: 'Cerradas hoy',
      value: workOrders.filter(
        (workOrder) =>
          workOrder.status === WorkOrderStatus.DONE &&
          isWithinSelectedDay(workOrder.closedAt, selectedDayKey),
      ).length,
      variant: getWorkOrderStatusVariant(WorkOrderStatus.DONE),
    },
  ];

  return (
    <PortalPanel
      eyebrow="Señales básicas"
      title="Estado de la jornada y órdenes"
      description="Lectura corta para saber cómo viene el día y dónde se concentra el trabajo técnico."
      className="h-full"
      contentClassName="space-y-5"
    >
      <section className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Estado de la jornada
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Resumen del día operativo actual.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {daySignals.map((signal) => (
            <div
              key={signal.label}
              className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3"
            >
              <Badge variant={signal.variant}>{signal.label}</Badge>
              <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                {signal.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Señales de órdenes de trabajo
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Bloque acotado para esta fase, sin entrar aún en analítica profunda.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {workOrderSignals.map((signal) => (
            <div
              key={signal.label}
              className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
            >
              <Badge variant={signal.variant}>{signal.label}</Badge>
              <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                {signal.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Programados recientemente
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Últimos eventos tocados dentro del rango activo.
          </p>
        </div>
        {recentEvents.length === 0 ? (
          <PortalEmptyState
            title="Sin actividad reciente"
            description="Cuando existan cambios recientes en agenda aparecerán aquí."
            icon={Clock3}
          />
        ) : (
          <div className="space-y-2">
            {recentEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelectEvent(event)}
                className="flex w-full items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-iwana-primary/30 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:bg-dark-surface-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {event.title}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {formatWfmDateTime(event.scheduledStartAt)}
                  </p>
                </div>
                <Badge variant="neutral">{getScheduleEventStatusLabel(event.status)}</Badge>
              </button>
            ))}
          </div>
        )}
      </section>
    </PortalPanel>
  );
}

export function SchedulingDashboard({
  summary,
  events,
  workOrders,
  pendingVisitRequests,
  techniciansById,
  selectedDayKey,
  isLoading,
  onRefresh,
  onSelectEvent,
  onFilterTechnician,
}: SchedulingDashboardProps) {
  const router = useRouter();
  const actionableVisitRequests = (pendingVisitRequests?.items ?? []).filter(
    (visitRequest) => !isTerminalVisitRequestStatus(visitRequest.status),
  );
  const [selectedVisitRequestId, setSelectedVisitRequestId] = useState<string | null>(
    actionableVisitRequests[0]?.id ?? null,
  );

  useEffect(() => {
    setSelectedVisitRequestId((current) => {
      if (current && actionableVisitRequests.some((visitRequest) => visitRequest.id === current)) {
        return current;
      }

      return actionableVisitRequests[0]?.id ?? null;
    });
  }, [actionableVisitRequests]);

  const pendingResponse =
    pendingVisitRequests && actionableVisitRequests.length > 0
      ? {
          ...pendingVisitRequests,
          items: actionableVisitRequests,
        }
      : pendingVisitRequests;

  return (
    <div className="space-y-6">
      <SchedulingSummaryStrip summary={summary} isLoading={isLoading} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <PendingVisitRequestInbox
          filters={{
            status: '',
            originContext: '',
            priority: '',
            municipality: '',
            sector: '',
            page: 1,
            limit: 5,
          }}
          response={pendingResponse}
          selectedVisitRequestId={selectedVisitRequestId}
          filterOptions={null}
          isLoading={isLoading}
          isLoadingFilterOptions={false}
          compactMode
          onFiltersChange={() => undefined}
          onSelect={setSelectedVisitRequestId}
          onRefresh={onRefresh}
          onOpenFullInbox={() => router.push('/dashboard/scheduling/pending-visits')}
          extraActions={
            <Button asChild type="button" variant="ghost">
              <Link href="/dashboard/scheduling/agenda">
                Abrir agenda
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          }
        />

        <SchedulingAlertRail
          alerts={summary?.alerts ?? []}
          onOpenEvent={(eventId) => {
            const event = events.find((item) => item.id === eventId);
            if (event) {
              onSelectEvent(event);
            }
          }}
          onFilterTechnician={onFilterTechnician}
          eyebrow="Riesgos"
          title="Riesgos que requieren atención"
          description="Alertas priorizadas para intervenir antes de que la agenda pierda continuidad."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <SchedulingTimelineBoard
          events={events}
          techniciansById={techniciansById}
          selectedDayKey={selectedDayKey}
          onSelectEvent={onSelectEvent}
          eyebrow="Estado de la jornada"
          title="Personas asignadas hoy"
          description="Seguimiento del día para entender carga real y abrir detalle operativo rápido."
        />

        <SchedulingOperationalSignals
          events={events}
          workOrders={workOrders}
          selectedDayKey={selectedDayKey}
          onSelectEvent={onSelectEvent}
        />
      </div>
    </div>
  );
}
