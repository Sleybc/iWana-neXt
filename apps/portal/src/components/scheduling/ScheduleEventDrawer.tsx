'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, MapPin, Route, Ticket, Wrench } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
} from '@iwana/ui';
import { ScheduleEventStatus, WorkOrderStatus } from '@iwana/shared';
import type { InternalUser, WfmScheduleEvent, WfmWorkOrder } from '@/lib/api-client';
import { PortalAlert, PortalEmptyState } from '@/components/shared/portal-ui';
import {
  SCHEDULE_EVENT_STATUS_OPTIONS,
  WORK_ORDER_STATUS_OPTIONS,
  formatWfmDateRange,
  getEventReferenceLabel,
  getScheduleEventStatusLabel,
  getScheduleEventStatusVariant,
  getTechnicianDisplayName,
  getWorkOrderPriorityLabel,
  getWorkOrderPriorityVariant,
  getWorkOrderSourceContextLabel,
  getWorkOrderStatusLabel,
  getWorkOrderStatusVariant,
  getWfmWorkTypeLabel,
  getWfmWorkTypeVariant,
  isScheduleEventTerminalStatus,
  isWorkOrderTerminalStatus,
} from './scheduling-ui';

interface ScheduleEventDrawerProps {
  open: boolean;
  event: WfmScheduleEvent | null;
  technician: InternalUser | null;
  workOrder: WfmWorkOrder | null;
  onOpenChange: (open: boolean) => void;
  onOpenReschedule: () => void;
  onTransitionEventStatus: (status: ScheduleEventStatus) => Promise<void>;
  onTransitionWorkOrderStatus: (status: WorkOrderStatus) => Promise<void>;
  canReschedule: boolean;
  isLoading: boolean;
  error: string | null;
  actionError: string | null;
  isEventTransitioning: boolean;
  isWorkOrderTransitioning: boolean;
}

export function ScheduleEventDrawer({
  open,
  event,
  technician,
  workOrder,
  onOpenChange,
  onOpenReschedule,
  onTransitionEventStatus,
  onTransitionWorkOrderStatus,
  canReschedule,
  isLoading,
  error,
  actionError,
  isEventTransitioning,
  isWorkOrderTransitioning,
}: ScheduleEventDrawerProps) {
  const [nextEventStatus, setNextEventStatus] = useState('');
  const [nextWorkOrderStatus, setNextWorkOrderStatus] = useState('');

  useEffect(() => {
    if (!open) {
      setNextEventStatus('');
      setNextWorkOrderStatus('');
    }
  }, [open]);

  const eventTransitionOptions = useMemo(
    () =>
      event
        ? SCHEDULE_EVENT_STATUS_OPTIONS.filter((option) => option.value !== event.status)
        : SCHEDULE_EVENT_STATUS_OPTIONS,
    [event],
  );

  const workOrderTransitionOptions = useMemo(
    () =>
      workOrder
        ? WORK_ORDER_STATUS_OPTIONS.filter((option) => option.value !== workOrder.status)
        : WORK_ORDER_STATUS_OPTIONS,
    [workOrder],
  );

  const terminalEvent = event ? isScheduleEventTerminalStatus(event.status) : true;
  const terminalWorkOrder = workOrder ? isWorkOrderTerminalStatus(workOrder.status) : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{event?.title || 'Detalle del evento'}</DialogTitle>
          <DialogDescription>
            Revisa datos operativos, ejecuta transiciones y consulta la work order vinculada.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4" aria-busy="true">
            <div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
              <div className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
            </div>
          </div>
        ) : error ? (
          <PortalAlert
            variant="error"
            title="No fue posible cargar el detalle"
            description={error}
          />
        ) : !event ? (
          <PortalEmptyState
            title="Evento no disponible"
            description="Selecciona otro evento de la agenda para consultar su trazabilidad."
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getWfmWorkTypeVariant(event.type)}>
                {getWfmWorkTypeLabel(event.type)}
              </Badge>
              <Badge variant={getScheduleEventStatusVariant(event.status)}>
                {getScheduleEventStatusLabel(event.status)}
              </Badge>
              {event.workOrderId && <Badge variant="warning">OT vinculada</Badge>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  Contexto operativo
                </p>
                <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                  <p className="flex items-start gap-2">
                    <CalendarClock
                      className="mt-0.5 h-4 w-4 text-iwana-primary"
                      aria-hidden="true"
                    />
                    <span>{formatWfmDateRange(event.scheduledStartAt, event.scheduledEndAt)}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Route className="mt-0.5 h-4 w-4 text-iwana-primary" aria-hidden="true" />
                    <span>
                      {technician ? getTechnicianDisplayName(technician) : 'Técnico no disponible'}
                    </span>
                  </p>
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 text-iwana-primary" aria-hidden="true" />
                    <span>
                      {[event.address, event.sector, event.municipality]
                        .filter(Boolean)
                        .join(' · ') || 'Ubicación no disponible'}
                    </span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Ticket className="mt-0.5 h-4 w-4 text-iwana-primary" aria-hidden="true" />
                    <span>{getEventReferenceLabel(event)}</span>
                  </p>
                </div>
                <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300">
                  {event.description || 'Sin descripción interna registrada para esta actividad.'}
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                      Estado del evento
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {terminalEvent
                        ? 'El evento ya quedó en un estado terminal y no admite nuevas transiciones.'
                        : 'Puedes avanzar el estado operativo o reagendar si la agenda lo requiere.'}
                    </p>
                  </div>
                  {canReschedule && !terminalEvent && (
                    <Button type="button" variant="secondary" onClick={onOpenReschedule}>
                      Reagendar
                    </Button>
                  )}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <Select
                    id="event-transition-status"
                    label="Transición del evento"
                    value={nextEventStatus}
                    placeholder="Selecciona un estado"
                    options={eventTransitionOptions}
                    onChange={(eventChange) => setNextEventStatus(eventChange.target.value)}
                    disabled={terminalEvent || eventTransitionOptions.length === 0}
                  />
                  <Button
                    type="button"
                    className="md:self-end"
                    disabled={!nextEventStatus || terminalEvent || isEventTransitioning}
                    loading={isEventTransitioning}
                    onClick={async () => {
                      await onTransitionEventStatus(nextEventStatus as ScheduleEventStatus);
                      setNextEventStatus('');
                    }}
                  >
                    Aplicar estado
                  </Button>
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    Work order vinculada
                  </p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Si la OT existe, puedes revisar prioridad, origen y su estado operativo actual.
                  </p>
                </div>
                <Wrench className="h-5 w-5 text-iwana-primary" aria-hidden="true" />
              </div>

              {!event.workOrderId ? (
                <PortalEmptyState
                  title="Sin work order vinculada"
                  description="Este evento aún no tiene una OT ligera asociada desde la agenda del portal."
                />
              ) : !workOrder ? (
                <PortalAlert
                  variant="warning"
                  title="Work order no disponible"
                  description="La OT vinculada no pudo cargarse. Actualiza la vista para reintentar."
                />
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={getWorkOrderStatusVariant(workOrder.status)}>
                          {getWorkOrderStatusLabel(workOrder.status)}
                        </Badge>
                        <Badge variant={getWorkOrderPriorityVariant(workOrder.priority)}>
                          {getWorkOrderPriorityLabel(workOrder.priority)}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {workOrder.code}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {workOrder.summary}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Origen: {getWorkOrderSourceContextLabel(workOrder.sourceContext)}
                      </p>
                    </div>

                    <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {workOrder.notes || 'Sin notas internas para la work order.'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Referencia: {workOrder.sourceRef || 'No disponible'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Creada: {formatWfmDateRange(workOrder.createdAt, workOrder.updatedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Select
                      id="work-order-transition-status"
                      label="Transición de la work order"
                      value={nextWorkOrderStatus}
                      placeholder="Selecciona un estado"
                      options={workOrderTransitionOptions}
                      onChange={(eventChange) => setNextWorkOrderStatus(eventChange.target.value)}
                      disabled={terminalWorkOrder || workOrderTransitionOptions.length === 0}
                    />
                    <Button
                      type="button"
                      className="md:self-end"
                      disabled={
                        !nextWorkOrderStatus || terminalWorkOrder || isWorkOrderTransitioning
                      }
                      loading={isWorkOrderTransitioning}
                      onClick={async () => {
                        await onTransitionWorkOrderStatus(nextWorkOrderStatus as WorkOrderStatus);
                        setNextWorkOrderStatus('');
                      }}
                    >
                      Actualizar OT
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {actionError && (
              <PortalAlert
                variant="error"
                title="Acción operativa rechazada"
                description={actionError}
              />
            )}

            <div className="flex justify-end">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cerrar
                </Button>
              </DialogClose>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
