'use client';

import { Badge, Button } from '@iwana/ui';
import type { InternalUser, WfmScheduleEvent } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
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

export function ScheduleList({ events, techniciansById, onSelectEvent }: ScheduleListProps) {
  return (
    <PortalPanel
      eyebrow="Vista lista"
      title="Eventos del rango"
      description="Usa la tabla para revisar prioridades, estado y responsable técnico."
      actions={
        <Badge variant="neutral" className="px-3 py-1 text-[11px] uppercase tracking-[0.12em]">
          {events.length} eventos
        </Badge>
      }
    >
      {events.length === 0 ? (
        <PortalEmptyState
          title="Sin eventos en el rango"
          description="Prueba otro rango o crea un evento nuevo para poblar la agenda operativa."
        />
      ) : (
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
                  Técnico
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
                    className="border-b border-gray-50 transition-colors hover:bg-iwana-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-inset dark:border-dark-border dark:hover:bg-dark-surface-3"
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
                        onClick={() => onSelectEvent(event)}
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
      )}
    </PortalPanel>
  );
}
