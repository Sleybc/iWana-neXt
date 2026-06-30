'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Crosshair,
  MapPin,
  Route,
  Ticket,
  Wrench,
} from 'lucide-react';
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
  formatScheduleEventCoordinates,
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
  onOpenMoveToPending: () => void;
  onTransitionEventStatus: (status: ScheduleEventStatus) => Promise<void>;
  onTransitionWorkOrderStatus: (status: WorkOrderStatus) => Promise<void>;
  canReschedule: boolean;
  isLoading: boolean;
  error: string | null;
  actionError: string | null;
  isEventTransitioning: boolean;
  isWorkOrderTransitioning: boolean;
  onRetry: () => Promise<void>;
}

type QuickEventAction = {
  status: ScheduleEventStatus;
  label: string;
  emphasized?: boolean;
};

type QuickWorkOrderAction = {
  status: WorkOrderStatus;
  label: string;
  emphasized?: boolean;
};

const QUICK_EVENT_ACTIONS: Partial<Record<ScheduleEventStatus, QuickEventAction[]>> = {
  [ScheduleEventStatus.DRAFT]: [
    { status: ScheduleEventStatus.SCHEDULED, label: 'Confirmar agenda', emphasized: true },
    { status: ScheduleEventStatus.CANCELLED, label: 'Cancelar' },
  ],
  [ScheduleEventStatus.SCHEDULED]: [
    { status: ScheduleEventStatus.EN_ROUTE, label: 'Marcar en ruta', emphasized: true },
    { status: ScheduleEventStatus.IN_PROGRESS, label: 'Iniciar atención' },
    { status: ScheduleEventStatus.NO_SHOW, label: 'Marcar sin atención' },
  ],
  [ScheduleEventStatus.RESCHEDULED]: [
    { status: ScheduleEventStatus.SCHEDULED, label: 'Confirmar nueva franja', emphasized: true },
    { status: ScheduleEventStatus.EN_ROUTE, label: 'Marcar en ruta' },
  ],
  [ScheduleEventStatus.EN_ROUTE]: [
    { status: ScheduleEventStatus.IN_PROGRESS, label: 'Iniciar atención', emphasized: true },
    { status: ScheduleEventStatus.NO_SHOW, label: 'Marcar sin atención' },
  ],
  [ScheduleEventStatus.IN_PROGRESS]: [
    { status: ScheduleEventStatus.COMPLETED, label: 'Cerrar atención', emphasized: true },
    { status: ScheduleEventStatus.NO_SHOW, label: 'Marcar sin atención' },
  ],
};

const QUICK_WORK_ORDER_ACTIONS: Partial<Record<WorkOrderStatus, QuickWorkOrderAction[]>> = {
  [WorkOrderStatus.OPEN]: [
    { status: WorkOrderStatus.ASSIGNED, label: 'Asignar', emphasized: true },
    { status: WorkOrderStatus.IN_PROGRESS, label: 'Iniciar OT' },
  ],
  [WorkOrderStatus.ASSIGNED]: [
    { status: WorkOrderStatus.IN_PROGRESS, label: 'Iniciar OT', emphasized: true },
    { status: WorkOrderStatus.DONE, label: 'Cerrar OT' },
  ],
  [WorkOrderStatus.IN_PROGRESS]: [
    { status: WorkOrderStatus.DONE, label: 'Cerrar OT', emphasized: true },
    { status: WorkOrderStatus.CANCELLED, label: 'Cancelar OT' },
  ],
};

export function ScheduleEventDrawer({
  open,
  event,
  technician,
  workOrder,
  onOpenChange,
  onOpenMoveToPending,
  onTransitionEventStatus,
  onTransitionWorkOrderStatus,
  canReschedule,
  isLoading,
  error,
  actionError,
  isEventTransitioning,
  isWorkOrderTransitioning,
  onRetry,
}: ScheduleEventDrawerProps) {
  const [nextEventStatus, setNextEventStatus] = useState('');
  const [nextWorkOrderStatus, setNextWorkOrderStatus] = useState('');
  const [isWorkOrderExpanded, setIsWorkOrderExpanded] = useState(true);

  useEffect(() => {
    if (!open) {
      setNextEventStatus('');
      setNextWorkOrderStatus('');
    }
  }, [open]);

  useEffect(() => {
    setIsWorkOrderExpanded(Boolean(event?.workOrderId));
  }, [event?.id, event?.workOrderId]);

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
  const quickEventActions = event ? (QUICK_EVENT_ACTIONS[event.status] ?? []) : [];
  const quickWorkOrderActions = workOrder ? (QUICK_WORK_ORDER_ACTIONS[workOrder.status] ?? []) : [];
  const coordinatesLabel = event ? formatScheduleEventCoordinates(event) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{event?.title || 'Detalle del evento'}</DialogTitle>
          <DialogDescription>
            Revisa el contexto operativo, resuelve la siguiente acción y consulta la OT asociada si
            aplica.
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
            action={
              <Button type="button" variant="secondary" onClick={() => void onRetry()}>
                Reintentar
              </Button>
            }
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
              <section className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
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
                      {technician
                        ? getTechnicianDisplayName(technician)
                        : 'Responsable no disponible'}
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
                  {coordinatesLabel && (
                    <p className="flex items-start gap-2">
                      <Crosshair className="mt-0.5 h-4 w-4 text-iwana-primary" aria-hidden="true" />
                      <span>
                        <span className="font-medium text-gray-700 dark:text-gray-200">
                          Coordenadas:{' '}
                        </span>
                        {coordinatesLabel}
                      </span>
                    </p>
                  )}
                  <p className="flex items-start gap-2">
                    <Ticket className="mt-0.5 h-4 w-4 text-iwana-primary" aria-hidden="true" />
                    <span>{getEventReferenceLabel(event, workOrder)}</span>
                  </p>
                </div>
                <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300">
                  {event.description || 'Sin descripción interna registrada para esta actividad.'}
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                      Estado del evento
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {terminalEvent
                        ? 'El evento ya quedó en un estado terminal y no admite nuevas transiciones.'
                        : 'Resuelve el siguiente paso operativo con acciones rápidas y mueve a pendientes si la visita debe salir de agenda.'}
                    </p>
                  </div>
                  {canReschedule && !terminalEvent && (
                    <Button type="button" variant="secondary" onClick={onOpenMoveToPending}>
                      Mover a pendientes
                    </Button>
                  )}
                </div>

                {quickEventActions.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {quickEventActions.map((action) => (
                      <Button
                        key={action.status}
                        type="button"
                        variant={action.emphasized ? undefined : 'secondary'}
                        disabled={terminalEvent || isEventTransitioning}
                        loading={isEventTransitioning && nextEventStatus === action.status}
                        onClick={async () => {
                          setNextEventStatus(action.status);
                          await onTransitionEventStatus(action.status);
                          setNextEventStatus('');
                        }}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 rounded-2xl border border-dashed border-gray-200 bg-white/70 p-3 dark:border-dark-border dark:bg-dark-surface-2/70 md:grid-cols-[minmax(0,1fr)_auto]">
                  <Select
                    id="event-transition-status"
                    label="Otra transición del evento"
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

            <section className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    Orden de trabajo vinculada
                  </p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Si la OT existe, puedes revisar prioridad, origen y su estado operativo actual.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-iwana-primary" aria-hidden="true" />
                  {event.workOrderId || event.executionOrderId ? (
                    <Button
                      type="button"
                      variant="secondary"
                      aria-expanded={isWorkOrderExpanded}
                      onClick={() => setIsWorkOrderExpanded((current) => !current)}
                    >
                      {isWorkOrderExpanded ? 'Ocultar OT' : 'Ver OT'}
                      {isWorkOrderExpanded ? (
                        <ChevronUp className="ml-2 h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  ) : null}
                </div>
              </div>

              {event.executionOrderId ? (
                <div className="mb-4">
                  <Button asChild={true} variant="secondary" size="sm">
                    <Link href={`/dashboard/operations?executionOrderId=${event.executionOrderId}`}>
                      Abrir OT de ejecución
                    </Link>
                  </Button>
                </div>
              ) : null}

              {!event.workOrderId ? (
                <PortalEmptyState
                  title="Sin orden de trabajo vinculada"
                  description="Este evento aún no tiene una OT ligera asociada desde la agenda del portal."
                />
              ) : !isWorkOrderExpanded ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300">
                  Expande la OT para revisar prioridad, origen, notas y avanzar su estado.
                </div>
              ) : !workOrder ? (
                <PortalAlert
                  variant="warning"
                  title="Orden de trabajo no disponible"
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
                        {workOrder.notes || 'Sin notas internas para la orden de trabajo.'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Referencia: {workOrder.sourceRef || 'No disponible'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Creada: {formatWfmDateRange(workOrder.createdAt, workOrder.updatedAt)}
                      </p>
                    </div>
                  </div>

                  {quickWorkOrderActions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {quickWorkOrderActions.map((action) => (
                        <Button
                          key={action.status}
                          type="button"
                          variant={action.emphasized ? undefined : 'secondary'}
                          disabled={terminalWorkOrder || isWorkOrderTransitioning}
                          loading={
                            isWorkOrderTransitioning && nextWorkOrderStatus === action.status
                          }
                          onClick={async () => {
                            setNextWorkOrderStatus(action.status);
                            await onTransitionWorkOrderStatus(action.status);
                            setNextWorkOrderStatus('');
                          }}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid gap-3 rounded-2xl border border-dashed border-gray-200 bg-white/70 p-3 dark:border-dark-border dark:bg-dark-surface-2/70 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Select
                      id="work-order-transition-status"
                      label="Otra transición de la OT"
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
