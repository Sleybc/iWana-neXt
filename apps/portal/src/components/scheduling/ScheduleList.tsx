'use client';

import { ScheduleEventStatus } from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import type { InternalUser, WfmScheduleEvent } from '@/lib/api-client';
import { PortalAlert, PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
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
      {events.length === 0 ? (
        <PortalEmptyState
          title="Sin eventos en el rango"
          description="Prueba otro rango o vuelve a Día para revisar una jornada específica."
        />
      ) : (
        <div className="space-y-4">
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

          <div className="overflow-x-auto">
            <table
              className="w-full text-sm"
              role="grid"
              aria-colcount={7}
              aria-rowcount={events.length}
            >
              <thead>
                <tr className="border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3">
                  <th
                    role="columnheader"
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300"
                  >
                    Evento
                  </th>
                  <th
                    role="columnheader"
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300"
                  >
                    Tipo
                  </th>
                  <th
                    role="columnheader"
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300"
                  >
                    Estado
                  </th>
                  <th
                    role="columnheader"
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300"
                  >
                    Responsable
                  </th>
                  <th
                    role="columnheader"
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300"
                  >
                    Horario
                  </th>
                  <th
                    role="columnheader"
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300"
                  >
                    Ubicación
                  </th>
                  <th
                    role="columnheader"
                    className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300"
                  >
                    Accion
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
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
                      className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-iwana-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-inset dark:border-dark-border dark:hover:bg-dark-surface-3"
                    >
                      <td role="gridcell" className="align-middle px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {event.title}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {event.description || 'Sin descripción operativa'}
                          </span>
                        </div>
                      </td>
                      <td role="gridcell" className="align-middle px-4 py-3">
                        <Badge variant={getWfmWorkTypeVariant(event.type)}>
                          {getWfmWorkTypeLabel(event.type)}
                        </Badge>
                      </td>
                      <td role="gridcell" className="align-middle px-4 py-3">
                        <Badge variant={getScheduleEventStatusVariant(event.status)}>
                          {getScheduleEventStatusLabel(event.status)}
                        </Badge>
                      </td>
                      <td
                        role="gridcell"
                        className="align-middle px-4 py-3 text-gray-600 dark:text-gray-300"
                      >
                        {technician ? getTechnicianDisplayName(technician) : 'No disponible'}
                      </td>
                      <td
                        role="gridcell"
                        className="align-middle px-4 py-3 text-gray-600 dark:text-gray-300"
                      >
                        {formatWfmDateRange(event.scheduledStartAt, event.scheduledEndAt)}
                      </td>
                      <td
                        role="gridcell"
                        className="align-middle px-4 py-3 text-gray-600 dark:text-gray-300"
                      >
                        {[event.address, event.sector, event.municipality]
                          .filter(Boolean)
                          .join(' · ') || 'No disponible'}
                      </td>
                      <td role="gridcell" className="align-middle px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="secondary"
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
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PortalPanel>
  );
}
