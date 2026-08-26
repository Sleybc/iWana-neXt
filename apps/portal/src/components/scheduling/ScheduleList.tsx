'use client';

import { CircleDashed } from 'lucide-react';
import { ScheduleEventStatus } from '@iwana/shared';
import { Badge, Button, cn } from '@iwana/ui';
import type { InternalUser, WfmScheduleEvent } from '@/lib/api-client';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatWfmDateRange,
  getScheduleEventStatusLabel,
  getScheduleEventStatusVariant,
  getTechnicianDisplayName,
  getWfmWorkTypeLabel,
  getWfmWorkTypeVariant,
} from './scheduling-ui';

interface ScheduleListProps {
  events: WfmScheduleEvent[];
  techniciansById: Map<string, InternalUser>;
  onSelectEvent: (event: WfmScheduleEvent) => void;
}

const actionRequiredStatuses = new Set<ScheduleEventStatus>([
  ScheduleEventStatus.DRAFT,
  ScheduleEventStatus.SCHEDULED,
  ScheduleEventStatus.EN_ROUTE,
  ScheduleEventStatus.IN_PROGRESS,
  ScheduleEventStatus.RESCHEDULED,
]);

export function ScheduleList({ events, techniciansById, onSelectEvent }: ScheduleListProps) {
  const activeEventsCount = events.filter((event) =>
    actionRequiredStatuses.has(event.status),
  ).length;
  const noActionPendingCount = events.length - activeEventsCount;

  return (
    <PortalPanel
      eyebrow="Vista lista"
      title="Todo el volumen del rango"
      description="Usa la tabla para revisar la jornada completa, ordenar prioridades y detectar excepciones sin perder detalle por tarea."
      actions={
        <Badge variant="neutral" className="px-3 py-1 text-[11px] uppercase tracking-[0.12em]">
          {events.length} tareas
        </Badge>
      }
    >
      <div className="space-y-4">
        {events.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <PortalAlert
              variant="info"
              title="Todo el rango, sin recortes"
              description="Esta vista conviene cuando la jornada concentra muchas tareas y necesitas ordenar prioridades, detectar excepciones o abrir varios detalles seguidos."
            />

            <dl
              aria-label="Resumen operativo del rango"
              className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3"
            >
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-dark-border dark:bg-dark-surface-2">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                  Tareas visibles
                </dt>
                <dd className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {events.length}
                </dd>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Carga completa del rango activo.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-dark-border dark:bg-dark-surface-2">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                  Por atender
                </dt>
                <dd className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {activeEventsCount}
                </dd>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Requieren seguimiento o ejecución.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-dark-border dark:bg-dark-surface-2">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                  Sin acción pendiente
                </dt>
                <dd className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {noActionPendingCount}
                </dd>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Ya no exigen despacho inmediato.
                </p>
              </div>
            </dl>
          </div>
        ) : null}

        <div className={portalDataTableShellClassName}>
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[720px] text-sm"
              role="grid"
              aria-colcount={7}
              aria-rowcount={Math.max(events.length, 1)}
              aria-label="Listado de tareas del rango"
            >
              <thead className={portalDataTableHeadRowClassName}>
                <tr>
                  <PortalDataTableHead>Evento</PortalDataTableHead>
                  <PortalDataTableHead>Tipo</PortalDataTableHead>
                  <PortalDataTableHead>Estado</PortalDataTableHead>
                  <PortalDataTableHead>Responsable</PortalDataTableHead>
                  <PortalDataTableHead>Horario</PortalDataTableHead>
                  <PortalDataTableHead>Ubicación</PortalDataTableHead>
                  <PortalDataTableHead className="text-right">Acción</PortalDataTableHead>
                </tr>
              </thead>
              <tbody className={portalDataTableBodyClassName}>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={cn(portalDataTableCellClassName, 'py-12')}>
                      <PortalEmptyState
                        title="Sin eventos en el rango"
                        description="Prueba otro rango o vuelve a Día para revisar una jornada específica."
                        icon={CircleDashed}
                        className="w-full text-left"
                      />
                    </td>
                  </tr>
                ) : (
                  events.map((event) => {
                    const technician = techniciansById.get(event.assignedUserId);
                    return (
                      <tr
                        key={event.id}
                        role="row"
                        tabIndex={0}
                        onClick={() => onSelectEvent(event)}
                        onKeyDown={(keyEvent) => {
                          if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                            keyEvent.preventDefault();
                            onSelectEvent(event);
                          }
                        }}
                        className={cn(
                          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-inset',
                          portalTableRowHoverClassName,
                        )}
                      >
                        <td role="gridcell" className={portalDataTableCellClassName}>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {event.title}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {event.description || 'Sin descripción operativa'}
                            </span>
                          </div>
                        </td>
                        <td role="gridcell" className={portalDataTableCellClassName}>
                          <Badge variant={getWfmWorkTypeVariant(event.type)}>
                            {getWfmWorkTypeLabel(event.type)}
                          </Badge>
                        </td>
                        <td role="gridcell" className={portalDataTableCellClassName}>
                          <Badge variant={getScheduleEventStatusVariant(event.status)}>
                            {getScheduleEventStatusLabel(event.status)}
                          </Badge>
                        </td>
                        <td role="gridcell" className={portalDataTableCellClassName}>
                          {technician ? getTechnicianDisplayName(technician) : 'No disponible'}
                        </td>
                        <td role="gridcell" className={portalDataTableCellClassName}>
                          {formatWfmDateRange(event.scheduledStartAt, event.scheduledEndAt)}
                        </td>
                        <td role="gridcell" className={portalDataTableCellClassName}>
                          {[event.address, event.sector, event.municipality]
                            .filter(Boolean)
                            .join(' · ') || 'No disponible'}
                        </td>
                        <td
                          role="gridcell"
                          className={cn(portalDataTableCellClassName, 'text-right')}
                        >
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            aria-label={`Ver detalle de ${event.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectEvent(event);
                            }}
                          >
                            Ver detalle
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PortalPanel>
  );
}
