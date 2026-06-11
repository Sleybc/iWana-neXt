'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { WfmWorkType, WorkOrderSourceContext } from '@iwana/shared';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import type {
  CreateWfmScheduleEventDto,
  InternalUser,
  ListWfmVisitRequestsResponse,
  UpdateWfmVisitRequestContextDto,
  RescheduleWfmEventDto,
  WfmDashboardSummary,
  WfmScheduleEvent,
  WfmScheduleRecommendation,
  WfmVisitRequest,
  WfmWorkOrder,
} from '@/lib/api-client';
import { UserRole } from '@iwana/shared';
import { ApiError, assuranceApi, crmApi, usersApi, wfmApi } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  INSTALLATION_SCHEDULING_MIN_PROGRESS,
  canScheduleInstallation,
} from '@/components/crm/expedientes/expediente-scheduling';
import { PageHeader } from '@/components/layout/PageHeader';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { ScheduleCalendar } from './ScheduleCalendar';
import { SchedulingDashboard } from './SchedulingDashboard';
import { ScheduleEventDrawer } from './ScheduleEventDrawer';
import { ScheduleEventForm, type ScheduleEventFormInitialValues } from './ScheduleEventForm';
import { ScheduleList } from './ScheduleList';
import { SchedulingSummaryStrip } from './SchedulingSummaryStrip';
import { SchedulingToolbar } from './SchedulingToolbar';
import { RescheduleEventDialog } from './RescheduleEventDialog';
import { ScheduleVisitRequestConfirmDialog } from './ScheduleVisitRequestConfirmDialog';
import type {
  ManualSchedulePayload,
  VisitRecommendationDraft,
} from './VisitRequestRecommendationPanel';
import { VisitRequestRecommendationPanel } from './VisitRequestRecommendationPanel';
import { syncExpedienteAfterScheduleEvent } from './scheduling-expediente-sync';
import { useSchedulingDerivedState } from './useSchedulingDerivedState';
import {
  buildSchedulingRangeForView,
  buildDefaultSchedulingFilters,
  canManageScheduling,
  canViewScheduling,
  formatSchedulingExpedienteLabel,
  formatWfmDayLabel,
  getScheduleEventStatusLabel,
  getWorkOrderStatusLabel,
  getWfmWorkTypeLabel,
  isScheduleEventTerminalStatus,
  toApiDateRange,
  type SchedulingFilters,
} from './scheduling-ui';
import {
  readPendingVisitSchedulingHandoff,
  clearPendingVisitSchedulingHandoff,
} from './pending-visit-scheduling-handoff';
import {
  getVisitRequestPresentationStatus,
  isTerminalVisitRequestStatus,
} from './pending-visits-ui';
import type { MatrixManualScheduleDraft } from './matrix-scheduling-selection';

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

interface ScheduleVisitRequestWithFollowUpInput {
  visitRequest: WfmVisitRequest;
  payload: ManualSchedulePayload;
  createWorkOrder: boolean;
  workOrderNotes: string | null;
}

async function scheduleVisitRequestWithFollowUp({
  visitRequest,
  payload,
  createWorkOrder,
  workOrderNotes,
}: ScheduleVisitRequestWithFollowUpInput): Promise<string> {
  const scheduledVisitRequest = await wfmApi.visitRequests.schedule(visitRequest.id, {
    assignedUserId: payload.assignedUserId,
    scheduledStartAt: payload.scheduledStartAt,
    scheduledEndAt: payload.scheduledEndAt,
    ...(visitRequest.organizationSiteId
      ? { organizationSiteId: visitRequest.organizationSiteId }
      : {}),
    createWorkOrder,
    workOrderNotes: createWorkOrder ? workOrderNotes?.trim() || null : null,
  });

  let feedbackMessage = `La solicitud ${visitRequest.title} quedó agendada correctamente.`;

  if (
    scheduledVisitRequest.originContext === WorkOrderSourceContext.CRM &&
    scheduledVisitRequest.expedienteId &&
    scheduledVisitRequest.workOrderId
  ) {
    if (scheduledVisitRequest.ticketId) {
      try {
        await assuranceApi.tickets.linkWorkOrder(scheduledVisitRequest.ticketId, {
          workOrderId: scheduledVisitRequest.workOrderId,
        });
      } catch {
        // No bloquea la agenda principal.
      }

      try {
        await crmApi.linkInstallationOperationalRefs(scheduledVisitRequest.expedienteId, {
          ticketId: scheduledVisitRequest.ticketId,
          workOrderId: scheduledVisitRequest.workOrderId,
        });
      } catch {
        // Conservamos la agenda creada aunque falle la persistencia auxiliar.
      }
    }

    try {
      const synced = await syncExpedienteAfterScheduleEvent({
        expedienteContextId: scheduledVisitRequest.expedienteId,
        payloadExpedienteId: scheduledVisitRequest.expedienteId,
        transitionExpedienteStatus: crmApi.transitionExpedienteStatus,
      });

      if (synced) {
        feedbackMessage += ' El expediente quedó marcado como instalación agendada.';
      }
    } catch {
      // La agenda ya fue creada; el warning visible se resuelve desde feedback general.
    }
  }

  return feedbackMessage;
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

interface SchedulingClientProps {
  surface?: 'dashboard' | 'agenda';
}

export function SchedulingClient({ surface = 'agenda' }: SchedulingClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const [filters, setFilters] = useState<SchedulingFilters>(() => buildDefaultSchedulingFilters());
  const [events, setEvents] = useState<WfmScheduleEvent[]>([]);
  const [summary, setSummary] = useState<WfmDashboardSummary | null>(null);
  const [technicians, setTechnicians] = useState<InternalUser[]>([]);
  const [workOrders, setWorkOrders] = useState<WfmWorkOrder[]>([]);
  const [pendingVisitResponse, setPendingVisitResponse] =
    useState<ListWfmVisitRequestsResponse | null>(null);
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
  const [selectedPendingVisitRequest, setSelectedPendingVisitRequest] =
    useState<WfmVisitRequest | null>(null);
  const [pendingVisitRecommendations, setPendingVisitRecommendations] = useState<
    WfmScheduleRecommendation[]
  >([]);
  const [selectedPendingRecommendationId, setSelectedPendingRecommendationId] = useState<
    string | null
  >(null);
  const [pendingManualSelectionDraft, setPendingManualSelectionDraft] =
    useState<MatrixManualScheduleDraft | null>(null);
  const [isPendingConfirmOpen, setIsPendingConfirmOpen] = useState(false);
  const [isPendingContextSaving, setIsPendingContextSaving] = useState(false);
  const [isPendingScheduling, setIsPendingScheduling] = useState(false);
  const [isLoadingPendingRecommendations, setIsLoadingPendingRecommendations] = useState(false);
  const [pendingRecommendationError, setPendingRecommendationError] = useState<string | null>(null);
  const [pendingScheduleCreateWorkOrder, setPendingScheduleCreateWorkOrder] = useState(true);
  const [pendingScheduleWorkOrderNotes, setPendingScheduleWorkOrderNotes] = useState('');

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
  const handledPendingVisitQueryRef = useRef<string | null>(null);
  const canView = canViewScheduling(user?.role);
  const canManage = canManageScheduling(user?.role);
  const isAgendaSurface = surface === 'agenda';
  const isDashboardSurface = surface === 'dashboard';
  const agendaPath = '/dashboard/scheduling/agenda';
  const currentQuery = searchParams.toString();
  const isExecutionRole = user?.role === UserRole.TECHNICIAN || user?.role === UserRole.CONTRACTOR;
  const hasAgendaQueryContext =
    searchParams.get('open') === 'create' ||
    Boolean(readPendingVisitSchedulingHandoff(searchParams));
  const shouldRedirectDashboardToAgenda =
    isDashboardSurface && (isExecutionRole || hasAgendaQueryContext);
  const { techniciansById, technicianOptions, calendarDays, selectedTechnician } =
    useSchedulingDerivedState({
      technicians,
      events,
      filters,
      selectedEvent,
    });
  const hasPendingCreateQueryContext =
    searchParams.get('open') === 'create' && Boolean(searchParams.get('expedienteId'));
  const selectedPendingRecommendation =
    pendingVisitRecommendations.find(
      (recommendation) =>
        `${recommendation.technicianId}::${recommendation.scheduledStartAt}` ===
        selectedPendingRecommendationId,
    ) ?? null;

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

  const clearPendingVisitQueryParams = useCallback(() => {
    if (!pathname) {
      return;
    }

    const nextParams = clearPendingVisitSchedulingHandoff(searchParams);
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
        setDrawerActionError(
          `La orden de trabajo vinculada no está disponible en este momento. ${mapSchedulingError(workOrderError)}`,
        );
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
    const summaryPromise =
      canManage && isDashboardSurface
        ? wfmApi.dashboard.getSummary()
        : Promise.resolve<WfmDashboardSummary | null>(null);
    const workOrdersPromise = isDashboardSurface
      ? wfmApi.workOrders.list()
      : Promise.resolve<WfmWorkOrder[]>([]);
    const pendingVisitPromise =
      canManage && isDashboardSurface
        ? wfmApi.visitRequests.list({ page: 1, limit: 12 })
        : Promise.resolve<ListWfmVisitRequestsResponse | null>(null);

    const [eventsResult, summaryResult, techniciansResult, workOrdersResult, pendingVisitResult] =
      await Promise.allSettled([
        wfmApi.events.list(eventParams),
        summaryPromise,
        loadOperationalUsers(),
        workOrdersPromise,
        pendingVisitPromise,
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
      warnings.push(
        'No fue posible actualizar el resumen de operaciones de campo. Se mantiene la última versión disponible.',
      );
    }

    if (techniciansResult.status === 'fulfilled') {
      setTechnicians(techniciansResult.value);
    } else {
      warnings.push(
        'No fue posible actualizar el directorio técnico. Se mantiene la última versión disponible.',
      );
    }

    if (workOrdersResult.status === 'fulfilled') {
      setWorkOrders(Array.isArray(workOrdersResult.value) ? workOrdersResult.value : []);
    } else {
      warnings.push(
        'No fue posible actualizar la lista de ordenes de trabajo. Se mantiene la última versión disponible.',
      );
    }

    if (pendingVisitResult.status === 'fulfilled') {
      setPendingVisitResponse(pendingVisitResult.value ?? null);
    } else {
      warnings.push(
        'No fue posible actualizar las decisiones pendientes. Se mantiene la última versión disponible.',
      );
    }

    setInfoMessage(warnings.length > 0 ? warnings.join(' ') : null);
    setIsLoading(false);
  }, [canManage, filters, isDashboardSurface]);

  const loadPendingVisitFromHandoff = useCallback(
    async (visitRequestId: string, focusDate?: string | null) => {
      try {
        const visitRequest = await wfmApi.visitRequests.get(visitRequestId);
        const presentationStatus = getVisitRequestPresentationStatus(visitRequest);

        if (isTerminalVisitRequestStatus(presentationStatus)) {
          setInfoMessage('La solicitud seleccionada ya no está disponible para agendar.');
          setSelectedPendingVisitRequest(null);
          clearPendingVisitQueryParams();
          return;
        }

        setSelectedPendingVisitRequest(visitRequest);
        setPendingVisitRecommendations([]);
        setSelectedPendingRecommendationId(null);
        setPendingManualSelectionDraft(null);
        setPendingRecommendationError(null);
        setFilters((current) => ({
          ...current,
          ...buildSchedulingRangeForView('day', focusDate ?? current.fromDate),
          view: 'day',
        }));
      } catch (pendingVisitError) {
        setInfoMessage(
          `No fue posible abrir la solicitud pendiente en agenda. ${mapSchedulingError(pendingVisitError)}`,
        );
        setSelectedPendingVisitRequest(null);
        clearPendingVisitQueryParams();
      }
    },
    [clearPendingVisitQueryParams],
  );

  useEffect(() => {
    if (!infoMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setInfoMessage((current) => (current === infoMessage ? null : current));
    }, 8000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [infoMessage]);

  useEffect(() => {
    if (!selectedPendingVisitRequest) {
      setPendingScheduleCreateWorkOrder(true);
      setPendingScheduleWorkOrderNotes('');
      return;
    }

    setPendingScheduleCreateWorkOrder(true);
    setPendingScheduleWorkOrderNotes(selectedPendingVisitRequest.description ?? '');
  }, [selectedPendingVisitRequest]);

  useEffect(() => {
    if (authLoading || !user || !canView) {
      return;
    }

    void loadData();
  }, [authLoading, canView, loadData, user]);

  useEffect(() => {
    if (
      authLoading ||
      !user ||
      !pathname ||
      !shouldRedirectDashboardToAgenda ||
      pathname === agendaPath
    ) {
      return;
    }

    router.replace(currentQuery ? `${agendaPath}?${currentQuery}` : agendaPath);
  }, [
    agendaPath,
    authLoading,
    currentQuery,
    pathname,
    router,
    shouldRedirectDashboardToAgenda,
    user,
  ]);

  useEffect(() => {
    if (authLoading || !user || !isAgendaSurface) {
      return;
    }

    const open = searchParams.get('open');
    const type = searchParams.get('type');
    const expedienteId = searchParams.get('expedienteId');
    const queryKey = searchParams.toString();

    if (open !== 'create') {
      return;
    }

    if (!canManage) {
      setInfoMessage('Tu rol actual no puede crear agendamientos desde CRM en Programación.');
      clearCreateQueryParams();
      return;
    }

    if (!type && !expedienteId) {
      if (handledCreateQueryRef.current === queryKey) {
        return;
      }

      handledCreateQueryRef.current = queryKey;
      clearCreateQueryParams();
      if (!createInitialValues && !expedienteContextId) {
        clearCreateContext();
      }
      setIsCreateOpen(true);
      return;
    }

    if (type !== WfmWorkType.INSTALLATION || !expedienteId) {
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
  }, [authLoading, canManage, hydrateCreateFromExpediente, isAgendaSurface, searchParams, user]);

  useEffect(() => {
    if (authLoading || !user || !canView || !isAgendaSurface) {
      return;
    }

    const handoff = readPendingVisitSchedulingHandoff(searchParams);
    const queryKey = searchParams.toString();

    if (!handoff) {
      return;
    }

    if (handledPendingVisitQueryRef.current === queryKey) {
      return;
    }

    handledPendingVisitQueryRef.current = queryKey;
    void loadPendingVisitFromHandoff(handoff.visitRequestId, handoff.focusDate);
  }, [authLoading, canView, isAgendaSurface, loadPendingVisitFromHandoff, searchParams, user]);

  const pageTitle = isAgendaSurface ? 'Agenda' : 'Programación';
  const pageSubtitle = isAgendaSurface
    ? 'Agenda operativa para consultar, crear y reajustar tareas de campo sin perder el contexto técnico.'
    : 'Resumen operativo para priorizar pendientes, revisar riesgos y coordinar la jornada.';

  if (authLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={pageTitle}
          subtitle={
            isAgendaSurface
              ? 'Cargando la agenda operativa de campo.'
              : 'Cargando el resumen operativo de programación.'
          }
        />
        <SchedulingSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title={pageTitle} subtitle="Error al cargar el módulo" />
        <PortalAlert
          variant="error"
          title="Módulo temporalmente no disponible"
          description={
            isAgendaSurface
              ? 'No fue posible resolver la sesión del portal para cargar la agenda operativa.'
              : 'No fue posible resolver la sesión del portal para cargar el resumen operativo de programación.'
          }
          icon={AlertTriangle}
        />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title={pageTitle} subtitle="Acceso restringido" />
        <PortalAlert
          variant="warning"
          title="Vista no autorizada"
          description={
            isAgendaSurface
              ? 'Tu rol actual no tiene acceso a la agenda operativa del portal empresarial.'
              : 'Tu rol actual no tiene acceso al resumen operativo de programación.'
          }
          icon={AlertTriangle}
        />
      </div>
    );
  }

  if (shouldRedirectDashboardToAgenda) {
    return (
      <div className="space-y-6">
        <PageHeader title="Programación" subtitle="Redirigiendo a la agenda operativa." />
        <SchedulingSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle}
        subtitle={pageSubtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isAgendaSurface && (
              <>
                <Button asChild type="button">
                  <Link href="/dashboard/scheduling/agenda?open=create">Programar tarea</Link>
                </Button>
                <Button asChild type="button" variant="secondary">
                  <Link href="/dashboard/scheduling/agenda">Abrir agenda</Link>
                </Button>
              </>
            )}
            <Badge variant="primary" className="px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
              {formatWfmDayLabel(new Date())}
            </Badge>
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
          {isLoading && events.length === 0 ? (
            <SchedulingSkeleton />
          ) : isDashboardSurface ? (
            <SchedulingDashboard
              summary={summary}
              events={events}
              workOrders={workOrders}
              pendingVisitRequests={pendingVisitResponse}
              techniciansById={techniciansById}
              selectedDayKey={calendarDays[0]?.key ?? filters.fromDate}
              isLoading={isLoading}
              onRefresh={() => {
                setFeedback(null);
                void loadData();
              }}
              onSelectEvent={(event) => void loadEventDetails(event.id)}
              onFilterTechnician={(technicianId) => {
                setFeedback(null);
                setFilters((current) => ({ ...current, technicianId }));
              }}
            />
          ) : (
            <>
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

                  if (
                    !createInitialValues &&
                    !expedienteContextId &&
                    !hasPendingCreateQueryContext
                  ) {
                    clearCreateContext();
                  }
                  setIsCreateOpen(true);
                }}
                isRefreshing={isLoading}
                canManage={canManage}
              />

              <div
                className={
                  selectedPendingVisitRequest
                    ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]'
                    : 'space-y-6'
                }
              >
                <div className="space-y-6">
                  {selectedPendingVisitRequest && (
                    <PortalAlert
                      variant="info"
                      title="Solicitud fijada desde pendientes"
                      description="Mantén esta solicitud visible mientras navegas entre día, semana y mes para completar el despacho."
                    />
                  )}
                  {filters.view === 'list' ? (
                    <ScheduleList
                      events={events}
                      techniciansById={techniciansById}
                      onSelectEvent={(event) => void loadEventDetails(event.id)}
                    />
                  ) : (
                    <ScheduleCalendar
                      days={calendarDays}
                      techniciansById={techniciansById}
                      view={filters.view}
                      onSelectEvent={(event) => void loadEventDetails(event.id)}
                    />
                  )}
                </div>

                {selectedPendingVisitRequest && (
                  <VisitRequestRecommendationPanel
                    selectedVisitRequest={selectedPendingVisitRequest}
                    customerDisplayName={selectedPendingVisitRequest.customerDisplayName ?? null}
                    techniciansById={techniciansById}
                    recommendations={pendingVisitRecommendations}
                    selectedRecommendationId={selectedPendingRecommendationId}
                    manualSelectionDraft={pendingManualSelectionDraft}
                    isLoadingRecommendations={isLoadingPendingRecommendations}
                    recommendationError={pendingRecommendationError}
                    isSavingContext={isPendingContextSaving}
                    presentation="inline"
                    onRecommend={async (draft: VisitRecommendationDraft) => {
                      if (technicians.length === 0) {
                        setPendingRecommendationError(
                          'No hay técnicos elegibles cargados para calcular recomendaciones.',
                        );
                        return;
                      }

                      setIsLoadingPendingRecommendations(true);
                      setPendingRecommendationError(null);

                      try {
                        const nextRecommendations = await wfmApi.visitRequests.recommend(
                          selectedPendingVisitRequest.id,
                          {
                            durationMinutes: draft.durationMinutes,
                            candidateUserIds: technicians.map((technician) => technician.id),
                            searchHorizonDays: draft.searchHorizonDays,
                            ...(selectedPendingVisitRequest.organizationSiteId
                              ? {
                                  organizationSiteId:
                                    selectedPendingVisitRequest.organizationSiteId,
                                }
                              : {}),
                            municipality: draft.municipality,
                            sector: draft.sector,
                            maxResults: 8,
                          },
                        );
                        setPendingVisitRecommendations(nextRecommendations);
                        setSelectedPendingRecommendationId(
                          nextRecommendations[0]
                            ? `${nextRecommendations[0].technicianId}::${nextRecommendations[0].scheduledStartAt}`
                            : null,
                        );
                      } catch (pendingError) {
                        setPendingRecommendationError(mapSchedulingError(pendingError));
                      } finally {
                        setIsLoadingPendingRecommendations(false);
                      }
                    }}
                    onSelectRecommendation={(recommendationId) => {
                      setSelectedPendingRecommendationId(recommendationId);
                    }}
                    onManualSelectionChange={(draft) => {
                      setPendingManualSelectionDraft(draft);
                      if (draft?.source === 'manual') {
                        setSelectedPendingRecommendationId(null);
                      }
                    }}
                    onSaveContext={async (payload: UpdateWfmVisitRequestContextDto) => {
                      setIsPendingContextSaving(true);
                      try {
                        const updated = await wfmApi.visitRequests.updateContext(
                          selectedPendingVisitRequest.id,
                          payload,
                        );
                        setSelectedPendingVisitRequest(updated);
                        setFeedback(
                          `La solicitud ${updated.title} actualizó su contexto operativo.`,
                        );
                      } catch (pendingError) {
                        throw new Error(mapSchedulingError(pendingError));
                      } finally {
                        setIsPendingContextSaving(false);
                      }
                    }}
                    onOpenConfirm={() => setIsPendingConfirmOpen(true)}
                    onClose={() => {
                      setSelectedPendingVisitRequest(null);
                      setPendingVisitRecommendations([]);
                      setSelectedPendingRecommendationId(null);
                      setPendingManualSelectionDraft(null);
                      setPendingRecommendationError(null);
                      clearPendingVisitQueryParams();
                    }}
                  />
                )}
              </div>
            </>
          )}
        </>
      )}

      <ScheduleVisitRequestConfirmDialog
        open={isPendingConfirmOpen}
        visitRequest={selectedPendingVisitRequest}
        recommendation={selectedPendingRecommendation}
        manualSelectionDraft={pendingManualSelectionDraft}
        techniciansById={techniciansById}
        isSubmitting={isPendingScheduling}
        createWorkOrder={pendingScheduleCreateWorkOrder}
        workOrderNotes={pendingScheduleWorkOrderNotes}
        onOpenChange={setIsPendingConfirmOpen}
        onCreateWorkOrderChange={setPendingScheduleCreateWorkOrder}
        onWorkOrderNotesChange={setPendingScheduleWorkOrderNotes}
        onConfirm={async () => {
          if (!selectedPendingVisitRequest) {
            return;
          }

          const manualStartAt =
            pendingManualSelectionDraft && pendingManualSelectionDraft.startTime
              ? new Date(
                  `${pendingManualSelectionDraft.date}T${pendingManualSelectionDraft.startTime}`,
                ).toISOString()
              : null;
          const manualDurationMinutes = pendingManualSelectionDraft?.duration
            ? Number(pendingManualSelectionDraft.duration)
            : null;
          const manualEndAt =
            manualStartAt &&
            manualDurationMinutes &&
            Number.isFinite(manualDurationMinutes) &&
            manualDurationMinutes >= 15
              ? new Date(
                  new Date(manualStartAt).getTime() + manualDurationMinutes * 60 * 1000,
                ).toISOString()
              : null;

          const payload = selectedPendingRecommendation
            ? {
                assignedUserId: selectedPendingRecommendation.technicianId,
                scheduledStartAt: selectedPendingRecommendation.scheduledStartAt,
                scheduledEndAt: selectedPendingRecommendation.scheduledEndAt,
              }
            : pendingManualSelectionDraft && manualStartAt && manualEndAt
              ? {
                  assignedUserId: pendingManualSelectionDraft.technicianId,
                  scheduledStartAt: manualStartAt,
                  scheduledEndAt: manualEndAt,
                }
              : null;

          if (!payload) {
            return;
          }

          setIsPendingScheduling(true);
          try {
            const feedbackMessage = await scheduleVisitRequestWithFollowUp({
              visitRequest: selectedPendingVisitRequest,
              payload,
              createWorkOrder: pendingScheduleCreateWorkOrder,
              workOrderNotes: pendingScheduleCreateWorkOrder
                ? pendingScheduleWorkOrderNotes.trim() || null
                : null,
            });
            setFeedback(feedbackMessage);
            setIsPendingConfirmOpen(false);
            setSelectedPendingVisitRequest(null);
            setPendingVisitRecommendations([]);
            setSelectedPendingRecommendationId(null);
            setPendingManualSelectionDraft(null);
            clearPendingVisitQueryParams();
            await loadData();
          } catch (pendingError) {
            setPendingRecommendationError(mapSchedulingError(pendingError));
          } finally {
            setIsPendingScheduling(false);
          }
        }}
      />

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
            <DialogTitle>Agendar tarea</DialogTitle>
            <DialogDescription>
              {createContextLabel ??
                'Registra una nueva tarea y, si aplica, crea la orden de trabajo asociada dentro del mismo flujo.'}
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

                // Vincular orden de trabajo al ticket de instalación (si ambos existen)
                if (installationTicketId && createdEvent.workOrderId) {
                  try {
                    await assuranceApi.tickets.linkWorkOrder(installationTicketId, {
                      workOrderId: createdEvent.workOrderId,
                    });
                  } catch (linkWoError) {
                    // No bloqueante: loguear pero continuar
                    console.warn(
                      'No fue posible vincular la orden de trabajo al ticket de instalación:',
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
              `La orden de trabajo quedó en estado ${getWorkOrderStatusLabel(status).toLowerCase()}.`,
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
        onRetry={() => {
          if (!selectedEventId) {
            return Promise.resolve();
          }

          return loadEventDetails(selectedEventId);
        }}
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
