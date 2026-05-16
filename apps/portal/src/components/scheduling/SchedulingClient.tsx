'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { WfmWorkType, WorkOrderSourceContext } from '@iwana/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import type {
  CreateWfmScheduleEventDto,
  InternalUser,
  RescheduleWfmEventDto,
  WfmDashboardSummary,
  WfmScheduleEvent,
  WfmTechnicianAvailability,
  WfmWorkOrder,
} from '@/lib/api-client';
import { ApiError, assuranceApi, crmApi, usersApi, wfmApi } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  INSTALLATION_SCHEDULING_MIN_PROGRESS,
  canScheduleInstallation,
} from '@/components/crm/expedientes/expediente-scheduling';
import { PageHeader } from '@/components/layout/PageHeader';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { ScheduleCalendar } from './ScheduleCalendar';
import { ScheduleEventDrawer } from './ScheduleEventDrawer';
import { ScheduleEventForm, type ScheduleEventFormInitialValues } from './ScheduleEventForm';
import { ScheduleList } from './ScheduleList';
import { SchedulingOverview } from './SchedulingOverview';
import { SchedulingToolbar } from './SchedulingToolbar';
import { TechnicianWorkList } from './TechnicianWorkList';
import { RescheduleEventDialog } from './RescheduleEventDialog';
import { syncExpedienteAfterScheduleEvent } from './scheduling-expediente-sync';
import {
  buildCalendarDays,
  buildDefaultSchedulingFilters,
  buildTechnicianOptions,
  canManageScheduling,
  canViewScheduling,
  canViewSchedulingCommandCenter,
  formatSchedulingExpedienteLabel,
  formatWfmDayLabel,
  getScheduleEventStatusLabel,
  getWfmWorkTypeLabel,
  isScheduleEventTerminalStatus,
  toApiDateRange,
  type SchedulingFilters,
} from './scheduling-ui';

const USERS_PAGE_SIZE = 100;
const CRM_EXPEDIENTE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapSchedulingError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente para continuar.';
    if (error.status === 403) return 'No tienes permisos para consultar esta vista del portal.';
    if (error.status === 404) return 'El registro solicitado ya no está disponible.';
    return error.message;
  }

  return 'No fue posible completar la operación. Intenta de nuevo.';
}

async function loadOperationalUsers(): Promise<InternalUser[]> {
  const collected = new Map<string, InternalUser>();
  let cursor: string | undefined;

  do {
    const response = await usersApi.list(
      cursor ? { cursor, limit: USERS_PAGE_SIZE } : { limit: USERS_PAGE_SIZE },
    );
    response.data.forEach((user) => {
      collected.set(user.id, user);
    });
    cursor = response.meta.nextCursor ?? undefined;
  } while (cursor);

  return Array.from(collected.values());
}

function buildExpedienteInitialValues(
  response: Awaited<ReturnType<typeof crmApi.getExpediente>>,
): ScheduleEventFormInitialValues {
  const expedienteShortLabel = formatSchedulingExpedienteLabel(response.data.id);
  const title = `Instalación - ${response.data.fullName}`.slice(0, 160);
  const description = `Evento originado desde CRM para la oportunidad ${expedienteShortLabel}.`;
  const workOrderSummary = `Instalación asociada al expediente ${response.data.fullName}`.slice(
    0,
    200,
  );
  const workOrderNotes = [response.data.specialAccessNotes, response.data.technicalObservations]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' | ')
    .slice(0, 500);

  return {
    type: WfmWorkType.INSTALLATION,
    title,
    description,
    address: response.data.address ?? '',
    municipality: response.data.municipality ?? '',
    sector: response.data.neighborhood ?? response.data.zoneType ?? '',
    latitude:
      response.data.latitude !== null && response.data.latitude !== undefined
        ? String(response.data.latitude)
        : '',
    longitude:
      response.data.longitude !== null && response.data.longitude !== undefined
        ? String(response.data.longitude)
        : '',
    expedienteId: response.data.id,
    createWorkOrder: true,
    workOrderType: WfmWorkType.INSTALLATION,
    workOrderSourceContext: WorkOrderSourceContext.CRM,
    workOrderSourceRef: response.data.id,
    workOrderSummary,
    workOrderNotes,
  };
}

function MetricCard({
  eyebrow,
  title,
  value,
  description,
}: {
  eyebrow: string;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
          {eyebrow}
        </p>
        <div>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
          <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-200">{title}</p>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </CardContent>
    </Card>
  );
}

function SchedulingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <PortalSkeletonBlock key={index} className="h-36" />
        ))}
      </div>
      <PortalSkeletonBlock className="h-40" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <PortalSkeletonBlock className="h-[520px]" />
        <PortalSkeletonBlock className="h-[520px]" />
      </div>
    </div>
  );
}

export function SchedulingClient() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const [filters, setFilters] = useState<SchedulingFilters>(() => buildDefaultSchedulingFilters());
  const [events, setEvents] = useState<WfmScheduleEvent[]>([]);
  const [summary, setSummary] = useState<WfmDashboardSummary | null>(null);
  const [availability, setAvailability] = useState<WfmTechnicianAvailability[]>([]);
  const [technicians, setTechnicians] = useState<InternalUser[]>([]);
  const [workOrders, setWorkOrders] = useState<WfmWorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [createInitialValues, setCreateInitialValues] = useState<
    ScheduleEventFormInitialValues | undefined
  >(undefined);
  const [createContextLabel, setCreateContextLabel] = useState<string | null>(null);
  const [expedienteContextId, setExpedienteContextId] = useState<string | null>(null);
  const [installationTicketId, setInstallationTicketId] = useState<string | null>(null);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<WfmScheduleEvent | null>(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WfmWorkOrder | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDrawerLoading, setIsDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [drawerActionError, setDrawerActionError] = useState<string | null>(null);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [isRescheduleSubmitting, setIsRescheduleSubmitting] = useState(false);
  const [isEventTransitioning, setIsEventTransitioning] = useState(false);
  const [isWorkOrderTransitioning, setIsWorkOrderTransitioning] = useState(false);

  const loadSequenceRef = useRef(0);
  const handledCreateQueryRef = useRef<string | null>(null);
  const canView = canViewScheduling(user?.role);
  const canManage = canManageScheduling(user?.role);
  const canViewCommandCenter = canViewSchedulingCommandCenter(user?.role);
  const techniciansById = useMemo(
    () => new Map(technicians.map((technician) => [technician.id, technician])),
    [technicians],
  );
  const technicianOptions = useMemo(() => buildTechnicianOptions(technicians), [technicians]);
  const calendarDays = useMemo(
    () => buildCalendarDays(events, filters),
    [events, filters.fromDate, filters.toDate],
  );
  const selectedTechnician = selectedEvent
    ? (techniciansById.get(selectedEvent.assignedUserId) ?? null)
    : null;
  const hasPendingCreateQueryContext =
    searchParams.get('open') === 'create' && Boolean(searchParams.get('expedienteId'));

  const clearCreateContext = useCallback(() => {
    setCreateInitialValues(undefined);
    setCreateContextLabel(null);
    setExpedienteContextId(null);
    setInstallationTicketId(null);
    setCreateError(null);
  }, []);

  const clearCreateQueryParams = useCallback(() => {
    if (!pathname) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('open');
    nextParams.delete('type');
    nextParams.delete('expedienteId');

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, searchParams]);

  const hydrateCreateFromExpediente = useCallback(
    async (expedienteId: string, options?: { clearQueryOnFinish?: boolean }) => {
      try {
        const response = await crmApi.getExpediente(expedienteId);
        const canSchedule = canScheduleInstallation({
          status: response.data.status,
          overallProgress:
            response.completeness?.overall ??
            response.data.completenessOverall ??
            response.data.pipelineProgress ??
            0,
          canTransition:
            response.completeness?.installationReadiness?.canTransition ??
            response.installationReadiness?.canTransition ??
            false,
        });

        if (!canSchedule) {
          setInfoMessage(
            `El expediente aún no está habilitado para agendar instalación. Debe estar en Listo para instalación y alcanzar al menos el ${INSTALLATION_SCHEDULING_MIN_PROGRESS}% de avance.`,
          );
          return false;
        }

        const expedienteEvents = await wfmApi.events.list({ expedienteId: response.data.id });
        const existingActiveEvent = expedienteEvents.find(
          (event) => !isScheduleEventTerminalStatus(event.status),
        );

        if (existingActiveEvent) {
          setInfoMessage(
            'Este expediente ya tiene un evento activo en Programación. Revisa el evento existente antes de crear uno nuevo.',
          );
          await loadEventDetails(existingActiveEvent.id);
          return false;
        }

        // Asegurar ticket operativo en Assurance (idempotente)
        let resolvedTicketId: string | null = null;
        try {
          const ticketResult = await assuranceApi.tickets.findOrCreateInstallation({
            expedienteId: response.data.id,
            expedienteFullName: response.data.fullName,
          });
          resolvedTicketId = ticketResult.ticket.id;
          setInstallationTicketId(ticketResult.ticket.id);
        } catch (ticketError) {
          setInfoMessage(
            `No fue posible asegurar el ticket de instalación. ${mapSchedulingError(ticketError)}`,
          );
          return false;
        }

        const baseInitialValues = buildExpedienteInitialValues(response);
        setCreateInitialValues({ ...baseInitialValues, ticketId: resolvedTicketId ?? '' });
        setCreateContextLabel(`Agendando instalación para ${response.data.fullName}.`);
        setExpedienteContextId(response.data.id);
        setCreateError(null);
        setIsCreateOpen(true);
        return true;
      } catch (prefillError) {
        setInfoMessage(mapSchedulingError(prefillError));
        return false;
      } finally {
        if (options?.clearQueryOnFinish) {
          clearCreateQueryParams();
        }
      }
    },
    [clearCreateQueryParams],
  );

  const loadEventDetails = useCallback(async (eventId: string) => {
    setSelectedEventId(eventId);
    setIsDrawerOpen(true);
    setIsDrawerLoading(true);
    setDrawerError(null);
    setDrawerActionError(null);

    try {
      const eventDetail = await wfmApi.events.get(eventId);
      setSelectedEvent(eventDetail);

      if (!eventDetail.workOrderId) {
        setSelectedWorkOrder(null);
        return;
      }

      try {
        const workOrderDetail = await wfmApi.workOrders.get(eventDetail.workOrderId);
        setSelectedWorkOrder(workOrderDetail);
      } catch (workOrderError) {
        setSelectedWorkOrder(null);
        setDrawerActionError(mapSchedulingError(workOrderError));
      }
    } catch (detailError) {
      setSelectedEvent(null);
      setSelectedWorkOrder(null);
      setDrawerError(mapSchedulingError(detailError));
    } finally {
      setIsDrawerLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    const requestId = loadSequenceRef.current + 1;
    loadSequenceRef.current = requestId;
    setIsLoading(true);
    setError(null);
    setInfoMessage(null);

    const range = toApiDateRange(filters);
    const eventParams = {
      from: range.from,
      to: range.to,
      ...(filters.technicianId ? { assignedUserId: filters.technicianId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };
    const availabilityParams = {
      from: range.from,
      to: range.to,
      ...(filters.technicianId ? { userId: filters.technicianId } : {}),
    };

    const summaryPromise = canViewCommandCenter
      ? wfmApi.dashboard.getSummary()
      : Promise.resolve<WfmDashboardSummary | null>(null);
    const availabilityPromise = canViewCommandCenter
      ? wfmApi.technicians.listAvailability(availabilityParams)
      : Promise.resolve<WfmTechnicianAvailability[]>([]);

    const [eventsResult, summaryResult, availabilityResult, techniciansResult, workOrdersResult] =
      await Promise.allSettled([
        wfmApi.events.list(eventParams),
        summaryPromise,
        availabilityPromise,
        loadOperationalUsers(),
        wfmApi.workOrders.list(),
      ]);

    if (requestId !== loadSequenceRef.current) {
      return;
    }

    if (eventsResult.status === 'rejected') {
      setError(mapSchedulingError(eventsResult.reason));
      setIsLoading(false);
      return;
    }

    const warnings: string[] = [];
    setEvents(Array.isArray(eventsResult.value) ? eventsResult.value : []);

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value ?? null);
    } else {
      setSummary(null);
      warnings.push('El resumen WFM no está disponible.');
    }

    if (availabilityResult.status === 'fulfilled') {
      setAvailability(Array.isArray(availabilityResult.value) ? availabilityResult.value : []);
    } else {
      setAvailability([]);
      warnings.push('La disponibilidad de técnicos no está disponible.');
    }

    if (techniciansResult.status === 'fulfilled') {
      setTechnicians(techniciansResult.value);
    } else {
      setTechnicians([]);
      warnings.push('El directorio técnico no está disponible.');
    }

    if (workOrdersResult.status === 'fulfilled') {
      setWorkOrders(Array.isArray(workOrdersResult.value) ? workOrdersResult.value : []);
    } else {
      setWorkOrders([]);
      warnings.push('La lista de work orders no está disponible.');
    }

    setInfoMessage(warnings.length > 0 ? warnings.join(' ') : null);
    setIsLoading(false);
  }, [canViewCommandCenter, filters]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    setFilters((current) => {
      if (canViewCommandCenter && current.view === 'calendar') {
        return { ...current, view: 'command-center' };
      }
      if (!canViewCommandCenter && current.view === 'command-center') {
        return { ...current, view: 'calendar' };
      }
      return current;
    });
  }, [authLoading, canViewCommandCenter, user]);

  useEffect(() => {
    if (authLoading || !user || !canView) {
      return;
    }

    if (canViewCommandCenter && filters.view !== 'command-center') {
      return;
    }

    if (!canViewCommandCenter && filters.view === 'command-center') {
      return;
    }

    void loadData();
  }, [authLoading, canView, canViewCommandCenter, filters.view, loadData, user]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    const open = searchParams.get('open');
    const type = searchParams.get('type');
    const expedienteId = searchParams.get('expedienteId');
    const queryKey = searchParams.toString();

    if (open !== 'create' || type !== WfmWorkType.INSTALLATION || !expedienteId) {
      return;
    }

    if (!canManage) {
      setInfoMessage('Tu rol actual no puede crear agendamientos desde CRM en Programación.');
      clearCreateQueryParams();
      return;
    }

    if (!CRM_EXPEDIENTE_ID_PATTERN.test(expedienteId)) {
      setInfoMessage('El identificador del expediente no es válido para abrir el agendamiento.');
      clearCreateQueryParams();
      return;
    }

    if (handledCreateQueryRef.current === queryKey) {
      return;
    }

    handledCreateQueryRef.current = queryKey;

    void hydrateCreateFromExpediente(expedienteId, { clearQueryOnFinish: true });
  }, [authLoading, canManage, hydrateCreateFromExpediente, searchParams, user]);

  if (authLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Programacion"
          subtitle="Cargando agenda operativa y datos del bloque WFM del tenant autenticado."
        />
        <SchedulingSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Programacion" subtitle="Error al cargar el módulo" />
        <PortalAlert
          variant="error"
          title="Módulo temporalmente no disponible"
          description="No fue posible resolver la sesión del portal para cargar Programacion. Inicia sesión nuevamente para recuperar el acceso al bloque WFM."
          icon={AlertTriangle}
        />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Programacion" subtitle="Acceso restringido" />
        <PortalAlert
          variant="warning"
          title="Vista no autorizada"
          description="Tu rol actual no tiene acceso a la agenda operativa del portal empresarial."
          icon={AlertTriangle}
        />
      </div>
    );
  }

  const todayLoad = summary ? String(summary.todayCount) : 'No disponible';
  const overdueLoad = summary ? String(summary.overdueCount) : 'No disponible';
  const upcomingLoad = summary ? String(summary.upcomingCount) : 'No disponible';
  const activeTechnicians = summary ? String(summary.technicianLoad.length) : 'No disponible';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programacion"
        subtitle="Coordina agenda operativa, atención técnica y work orders ligeras del tenant autenticado."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary" className="px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
              {formatWfmDayLabel(new Date())}
            </Badge>
            <Button asChild type="button" variant="secondary">
              <Link href="/dashboard/scheduling/pending-visits">Bandeja pendiente</Link>
            </Button>
          </div>
        }
      />

      {feedback && (
        <PortalAlert
          variant="success"
          title="Operación aplicada"
          description={feedback}
          icon={CheckCircle2}
        />
      )}

      {infoMessage && (
        <PortalAlert variant="info" title="Cobertura parcial" description={infoMessage} />
      )}

      {error && events.length === 0 && !isLoading ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar la programación"
          description={error}
          action={
            <Button type="button" variant="secondary" onClick={() => void loadData()}>
              Reintentar carga
            </Button>
          }
          icon={AlertTriangle}
        />
      ) : (
        <>
          {filters.view !== 'command-center' && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                eyebrow="Agenda"
                title="Eventos hoy"
                value={todayLoad}
                description="Eventos activos proyectados para la jornada actual."
              />
              <MetricCard
                eyebrow="Backlog"
                title="Eventos vencidos"
                value={overdueLoad}
                description="Pendientes cuyo cierre ya superó la franja comprometida."
              />
              <MetricCard
                eyebrow="Horizonte"
                title="Próximos 7 días"
                value={upcomingLoad}
                description="Carga operativa futura dentro de la ventana seleccionada."
              />
              <MetricCard
                eyebrow="Capacidad"
                title="Técnicos con carga"
                value={activeTechnicians}
                description="Técnicos con eventos activos reportados por el dashboard WFM."
              />
            </div>
          )}

          <SchedulingToolbar
            filters={filters}
            technicianOptions={technicianOptions}
            onFiltersChange={(next) => {
              setFeedback(null);
              setFilters(next);
            }}
            onRefresh={() => {
              setFeedback(null);
              void loadData();
            }}
            onOpenCreate={() => {
              if (hasPendingCreateQueryContext && !createInitialValues) {
                const pendingExpedienteId = searchParams.get('expedienteId');

                if (pendingExpedienteId) {
                  void hydrateCreateFromExpediente(pendingExpedienteId, {
                    clearQueryOnFinish: true,
                  });
                  return;
                }
              }

              if (!createInitialValues && !expedienteContextId && !hasPendingCreateQueryContext) {
                clearCreateContext();
              }
              setIsCreateOpen(true);
            }}
            isRefreshing={isLoading}
            canManage={canManage}
            canViewCommandCenter={canViewCommandCenter}
          />

          {isLoading && events.length === 0 ? (
            <SchedulingSkeleton />
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <div className="space-y-6">
                {filters.view === 'command-center' && canViewCommandCenter ? (
                  <SchedulingOverview
                    summary={summary}
                    events={events}
                    techniciansById={techniciansById}
                    selectedDayKey={filters.fromDate}
                    selectedTechnicianId={filters.technicianId}
                    onSelectEvent={(event) => void loadEventDetails(event.id)}
                    onFilterTechnician={(technicianId) => {
                      setFeedback(null);
                      setFilters((current) => ({ ...current, technicianId }));
                    }}
                  />
                ) : filters.view === 'calendar' ? (
                  <ScheduleCalendar
                    days={calendarDays}
                    techniciansById={techniciansById}
                    onSelectEvent={(event) => void loadEventDetails(event.id)}
                  />
                ) : (
                  <ScheduleList
                    events={events}
                    techniciansById={techniciansById}
                    onSelectEvent={(event) => void loadEventDetails(event.id)}
                  />
                )}
              </div>

              <TechnicianWorkList
                technicians={technicians}
                workOrders={workOrders}
                summary={summary}
                availability={availability}
                selectedTechnicianId={filters.technicianId}
              />
            </div>
          )}
        </>
      )}

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            clearCreateContext();
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Crear evento operativo</DialogTitle>
            <DialogDescription>
              {createContextLabel ??
                'Registra una nueva actividad técnica y, si aplica, genera una work order ligera dentro del mismo flujo.'}
            </DialogDescription>
          </DialogHeader>
          <ScheduleEventForm
            initialValues={createInitialValues}
            expedienteDisplayLabel={
              expedienteContextId ? formatSchedulingExpedienteLabel(expedienteContextId) : undefined
            }
            workOrderSourceRefDisplayLabel={
              expedienteContextId ? formatSchedulingExpedienteLabel(expedienteContextId) : undefined
            }
            technicians={technicians}
            error={createError}
            isSubmitting={isCreateSubmitting}
            onFindRecommendations={(payload) => wfmApi.recommendations.create(payload)}
            lockOperationalFlow={Boolean(expedienteContextId)}
            onCancel={() => {
              setIsCreateOpen(false);
              clearCreateContext();
            }}
            onSubmit={async (payload: CreateWfmScheduleEventDto) => {
              setCreateError(null);
              setIsCreateSubmitting(true);

              try {
                const createdEvent = await wfmApi.events.create(payload);
                let feedbackMessage = `${createdEvent.title} quedó registrado como ${getWfmWorkTypeLabel(createdEvent.type).toLowerCase()}.`;
                let transitionWarning: string | null = null;

                // Vincular work order al ticket de instalación (si ambos existen)
                if (installationTicketId && createdEvent.workOrderId) {
                  try {
                    await assuranceApi.tickets.linkWorkOrder(installationTicketId, {
                      workOrderId: createdEvent.workOrderId,
                    });
                  } catch (linkWoError) {
                    // No bloqueante: loguear pero continuar
                    console.warn(
                      'No fue posible vincular la work order al ticket de instalación:',
                      linkWoError,
                    );
                  }
                }

                // Persistir refs operativas en CRM y transicionar estado
                if (expedienteContextId && payload.expedienteId === expedienteContextId) {
                  // Persistir ticketId + workOrderId en el expediente
                  if (installationTicketId) {
                    try {
                      await crmApi.linkInstallationOperationalRefs(expedienteContextId, {
                        ticketId: installationTicketId,
                        workOrderId: createdEvent.workOrderId ?? '',
                      });
                    } catch (linkRefsError) {
                      console.warn(
                        'No fue posible persistir las refs operativas en el expediente:',
                        linkRefsError,
                      );
                    }
                  }

                  // Transicionar estado del expediente
                  try {
                    await syncExpedienteAfterScheduleEvent({
                      expedienteContextId,
                      payloadExpedienteId: payload.expedienteId,
                      transitionExpedienteStatus: crmApi.transitionExpedienteStatus,
                    });
                    feedbackMessage += ' El expediente quedó marcado como instalación agendada.';
                  } catch (transitionError) {
                    transitionWarning = `El evento se creó, pero no fue posible actualizar el expediente automáticamente. ${mapSchedulingError(transitionError)}`;
                  }
                }

                setFeedback(feedbackMessage);
                setIsCreateOpen(false);
                clearCreateContext();
                await loadData();
                await loadEventDetails(createdEvent.id);
                if (transitionWarning) {
                  setInfoMessage((current) =>
                    current ? `${current} ${transitionWarning}` : transitionWarning,
                  );
                }
              } catch (createEventError) {
                setCreateError(mapSchedulingError(createEventError));
              } finally {
                setIsCreateSubmitting(false);
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <ScheduleEventDrawer
        open={isDrawerOpen}
        event={selectedEvent}
        technician={selectedTechnician}
        workOrder={selectedWorkOrder}
        onOpenChange={(open) => {
          setIsDrawerOpen(open);
          if (!open) {
            setSelectedEventId(null);
            setSelectedEvent(null);
            setSelectedWorkOrder(null);
            setDrawerError(null);
            setDrawerActionError(null);
          }
        }}
        onOpenReschedule={() => {
          setRescheduleError(null);
          setIsRescheduleOpen(true);
        }}
        onTransitionEventStatus={async (status) => {
          if (!selectedEventId) {
            return;
          }

          setDrawerActionError(null);
          setIsEventTransitioning(true);
          try {
            await wfmApi.events.transitionStatus(selectedEventId, { status });
            setFeedback(
              `El evento pasó a estado ${getScheduleEventStatusLabel(status).toLowerCase()}.`,
            );
            await loadData();
            await loadEventDetails(selectedEventId);
          } catch (transitionError) {
            setDrawerActionError(mapSchedulingError(transitionError));
          } finally {
            setIsEventTransitioning(false);
          }
        }}
        onTransitionWorkOrderStatus={async (status) => {
          if (!selectedWorkOrder) {
            return;
          }

          setDrawerActionError(null);
          setIsWorkOrderTransitioning(true);
          try {
            await wfmApi.workOrders.transitionStatus(selectedWorkOrder.id, { status });
            setFeedback(
              `La work order quedó en estado ${status.toLowerCase().replace(/_/g, ' ')}.`,
            );
            await loadData();
            if (selectedEventId) {
              await loadEventDetails(selectedEventId);
            }
          } catch (transitionError) {
            setDrawerActionError(mapSchedulingError(transitionError));
          } finally {
            setIsWorkOrderTransitioning(false);
          }
        }}
        canReschedule={canManage}
        isLoading={isDrawerLoading}
        error={drawerError}
        actionError={drawerActionError}
        isEventTransitioning={isEventTransitioning}
        isWorkOrderTransitioning={isWorkOrderTransitioning}
      />

      <RescheduleEventDialog
        open={isRescheduleOpen}
        event={selectedEvent}
        error={rescheduleError}
        isSubmitting={isRescheduleSubmitting}
        onOpenChange={setIsRescheduleOpen}
        onSubmit={async (payload: RescheduleWfmEventDto) => {
          if (!selectedEventId) {
            return;
          }

          setRescheduleError(null);
          setDrawerActionError(null);
          setIsRescheduleSubmitting(true);
          try {
            await wfmApi.events.reschedule(selectedEventId, payload);
            setFeedback('El evento se reagendó correctamente dentro de la nueva franja.');
            setIsRescheduleOpen(false);
            await loadData();
            await loadEventDetails(selectedEventId);
          } catch (rescheduleEventError) {
            const message = mapSchedulingError(rescheduleEventError);
            setRescheduleError(message);
            setDrawerActionError(message);
          } finally {
            setIsRescheduleSubmitting(false);
          }
        }}
      />
    </div>
  );
}
