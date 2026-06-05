'use client';

import { HardHat, Wrench } from 'lucide-react';
import { Badge } from '@iwana/ui';
import type {
  InternalUser,
  WfmDashboardSummary,
  WfmTechnicianAvailability,
  WfmWorkOrder,
} from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import {
  getActiveWorkOrdersForTechnician,
  getAvailabilityForTechnician,
  getTechnicianAvailabilityLabel,
  getTechnicianAvailabilityVariant,
  getTechnicianDisplayName,
  getTechnicianLoadCount,
  getTechnicianSubtitle,
  getWorkOrderPriorityLabel,
  getWorkOrderPriorityVariant,
  getWorkOrderStatusLabel,
  getWorkOrderStatusVariant,
  filterOperationalTechnicians,
  formatWfmDateTime,
} from './scheduling-ui';

interface TechnicianWorkListProps {
  technicians: InternalUser[];
  workOrders: WfmWorkOrder[];
  summary: WfmDashboardSummary | null;
  availability: WfmTechnicianAvailability[];
  selectedTechnicianId: string;
}

export function TechnicianWorkList({
  technicians,
  workOrders,
  summary,
  availability,
  selectedTechnicianId,
}: TechnicianWorkListProps) {
  const maxVisibleTechnicians = 8;
  const maxVisibleWorkOrders = 3;
  const maxVisibleAvailability = 2;
  const operationalUsers = filterOperationalTechnicians(technicians);
  const activeUserIds = new Set<string>([
    ...(summary?.technicianLoad.map((item) => item.assignedUserId) ?? []),
    ...workOrders.map((workOrder) => workOrder.assignedUserId),
    ...availability.map((item) => item.userId),
  ]);

  const filteredUsers = selectedTechnicianId
    ? operationalUsers.filter((user) => user.id === selectedTechnicianId)
    : activeUserIds.size > 0
      ? operationalUsers.filter((user) => activeUserIds.has(user.id))
      : operationalUsers;
  const visibleUsers = selectedTechnicianId
    ? filteredUsers
    : filteredUsers.slice(0, maxVisibleTechnicians);
  const hiddenUsersCount = Math.max(filteredUsers.length - visibleUsers.length, 0);

  return (
    <PortalPanel
      eyebrow="Capacidad técnica"
      title="Carga por técnico"
      description="Consolida agenda del día, ordenes de trabajo abiertas y bloqueos del rango activo."
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="neutral" className="px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
            {visibleUsers.length} visibles
          </Badge>
          {hiddenUsersCount > 0 && (
            <Badge variant="info" className="px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
              +{hiddenUsersCount} adicionales
            </Badge>
          )}
        </div>
      }
      className="h-full"
    >
      {visibleUsers.length === 0 ? (
        <PortalEmptyState
          title="Sin técnicos visibles"
          description="No hay técnicos o contratistas cargados para la empresa en este momento."
          icon={HardHat}
        />
      ) : (
        <div className="space-y-4">
          {!summary && (
            <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-dark-border dark:text-gray-400">
              El resumen del dashboard WFM no está disponible. Se muestran datos operativos básicos.
            </div>
          )}

          {visibleUsers.map((user) => {
            const assignedWorkOrders = getActiveWorkOrdersForTechnician(workOrders, user.id);
            const userAvailability = getAvailabilityForTechnician(availability, user.id);
            const loadCount = getTechnicianLoadCount(summary, user.id);

            return (
              <section
                key={user.id}
                className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {getTechnicianDisplayName(user)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {getTechnicianSubtitle(user)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="primary">
                      Hoy: {loadCount === null ? 'No disponible' : `${loadCount}`}
                    </Badge>
                    <Badge variant="warning">OT activas: {assignedWorkOrders.length}</Badge>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                      Ordenes de trabajo activas
                    </p>
                    {assignedWorkOrders.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Sin ordenes de trabajo abiertas para este técnico.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {assignedWorkOrders.slice(0, maxVisibleWorkOrders).map((workOrder) => (
                          <div
                            key={workOrder.id}
                            className="rounded-2xl border border-gray-200 bg-white px-3 py-3 dark:border-dark-border dark:bg-dark-surface-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {workOrder.code}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {workOrder.summary}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant={getWorkOrderStatusVariant(workOrder.status)}>
                                  {getWorkOrderStatusLabel(workOrder.status)}
                                </Badge>
                                <Badge variant={getWorkOrderPriorityVariant(workOrder.priority)}>
                                  {getWorkOrderPriorityLabel(workOrder.priority)}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                        {assignedWorkOrders.length > maxVisibleWorkOrders && (
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            +{assignedWorkOrders.length - maxVisibleWorkOrders} ordenes de trabajo
                            adicionales
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                      Disponibilidad del rango
                    </p>
                    {userAvailability.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Sin bloqueos ni franjas adicionales registradas.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {userAvailability.slice(0, maxVisibleAvailability).map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-3 dark:border-dark-border dark:bg-dark-surface-2"
                          >
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
                              <Wrench className="h-4 w-4" aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={getTechnicianAvailabilityVariant(item.type)}>
                                  {getTechnicianAvailabilityLabel(item.type)}
                                </Badge>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatWfmDateTime(item.startsAt)} →{' '}
                                  {formatWfmDateTime(item.endsAt)}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                {item.reason || 'Sin motivo operativo'}
                              </p>
                            </div>
                          </div>
                        ))}
                        {userAvailability.length > maxVisibleAvailability && (
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            +{userAvailability.length - maxVisibleAvailability} franjas adicionales
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PortalPanel>
  );
}
