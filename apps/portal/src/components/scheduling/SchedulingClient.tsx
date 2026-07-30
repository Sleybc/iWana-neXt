'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { WfmWorkType, WorkOrderSourceContext, TaskOriginContext } from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import type {
  InternalUser,
  ListWfmVisitRequestsResponse,
  UpdateWfmVisitRequestContextDto,
  WfmDashboardSummary,
  WfmScheduleEvent,
  WfmScheduleRecommendation,
  WfmVisitRequest,
  WfmWorkOrder,
  ExecutionOrderRecord,
} from '@/lib/api-client';
import { UserRole } from '@iwana/shared';
import { ApiError, assuranceApi, crmApi, tasksApi, wfmApi } from '@/lib/api-client';
import { collectListPages } from '@/lib/list-meta';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  INSTALLATION_SCHEDULING_MIN_PROGRESS,
  canScheduleInstallation,
} from '@/components/crm/expedientes/expediente-scheduling';
import { PageHeader } from '@/components/layout/PageHeader';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { ScheduleCalendar } from './ScheduleCalendar';
import type { PendingVisitDropPayload, ScheduleCalendarSlotSelection } from './ScheduleCalendar';
import { SchedulingDashboard } from './SchedulingDashboard';
import { ScheduleEventDrawer } from './ScheduleEventDrawer';
import type { ScheduleEventFormInitialValues } from './ScheduleEventForm';
import { ScheduleList } from './ScheduleList';
import { SchedulingQuickCreateDialog } from './SchedulingQuickCreateDialog';
import {
  CreateTaskSchedulingDialog,
  type CreateTaskSchedulingValues,
} from './CreateTaskSchedulingDialog';
import {
  buildOrchestrationFeedback,
  createTaskWithOptionalScheduling,
} from './scheduling-task-orchestration';
import { SchedulingSummaryStrip } from './SchedulingSummaryStrip';
import { SchedulingToolbar } from './SchedulingToolbar';
import { MoveEventToPendingDialog } from './MoveEventToPendingDialog';
import { ScheduleVisitRequestConfirmDialog } from './ScheduleVisitRequestConfirmDialog';
import type {
  ManualSchedulePayload,
  VisitRecommendationDraft,
} from './VisitRequestRecommendationPanel';
import { VisitRequestRecommendationPanel } from './VisitRequestRecommendationPanel';
import {
  enrichScheduleEventWithCrmCoordinates,
  syncExpedienteAfterScheduleEvent,
} from './scheduling-expediente-sync';
import { scheduleVisitRequestWithFollowUp } from './scheduling-visit-request-sync';
import { buildSchedulingDemoState, shouldUseSchedulingDemoState } from './scheduling-demo-data';
import { useSchedulingDerivedState } from './useSchedulingDerivedState';
import { deriveDurationMinutes, toLocalDateValue, toLocalTimeValue } from './schedule-event-time';
import {
  buildDailyDraftFromDrop,
  buildDisplayWindowFromOperatingWindow,
  validateDailyDraft,
  type DailyDraftEvent,
} from './daily-schedule-draft';
import { useDailyDisplayOperatingWindow } from './useOperatingWindow';
import {
  buildSchedulingRangeForView,
  buildDefaultSchedulingFilters,
  buildTechnicianOptions,
  canManageScheduling,
  canViewScheduling,
  filterRecommendationCandidateUsers,
  filterOperationalTechnicians,
  formatSchedulingExpedienteLabel,
  formatWfmDayLabel,
  getDefaultSchedulingViewForRole,
  getRecommendedSchedulingViewForDensity,
  isHighDensityScheduleDay,
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

const CRM_EXPEDIENTE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INTERNAL_AREA_OPTIONS = [
  { value: 'operations-area', label: 'Operaciones' },
  { value: 'noc-area', label: 'NOC' },
  { value: 'support-area', label: 'Soporte' },
];

function mapSchedulingError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente para continuar.';
    if (error.status === 403) return 'No tienes permisos para consultar esta vista del portal.';
    if (error.status === 404) return 'El registro solicitado ya no está disponible.';
    return error.message;
  }

  return 'No fue posible completar la operación. Intenta de nuevo.';
}

async function loadSchedulableUsers(): Promise<InternalUser[]> {
  const response = await wfmApi.eligibleAssignees.list();
  return Array.isArray(response) ? response : [];
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
    coordinates: (() => {
      const lat = response.data.latitude;
      const lng = response.data.longitude;
      return lat !== null && lat !== undefined && lng !== null && lng !== undefined
        ? `${lat}, ${lng}`
        : '';
    })(),
    expedienteId: response.data.id,
    createWorkOrder: true,
    workOrderType: WfmWorkType.INSTALLATION,
    workOrderSourceContext: WorkOrderSourceContext.CRM,
    workOrderSourceRef: response.data.id,
    workOrderSummary,
    workOrderNotes,
  };
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
  const [filters, setFilters] = useState<SchedulingFilters>(() => {
    const base = buildDefaultSchedulingFilters(getDefaultSchedulingViewForRole());
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const technicianId = params.get('technicianId');
      if (technicianId) {
        return { ...base, technicianId };
      }
    }
    return base;
  });
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
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [createInitialValues, setCreateInitialValues] = useState<
    ScheduleEventFormInitialValues | undefined
  >(undefined);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateInitialValues, setQuickCreateInitialValues] =
    useState<ScheduleEventFormInitialValues | null>(null);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);
  const [isQuickCreateSubmitting, setIsQuickCreateSubmitting] = useState(false);
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
  const [dailyDraft, setDailyDraft] = useState<DailyDraftEvent | null>(null);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<WfmScheduleEvent | null>(null);
  const [selectedExecutionOrder, setSelectedExecutionOrder] = useState<ExecutionOrderRecord | null>(
    null,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDrawerLoading, setIsDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [drawerActionError, setDrawerActionError] = useState<string | null>(null);
  const [isMoveToPendingOpen, setIsMoveToPendingOpen] = useState(false);
  const [moveToPendingError, setMoveToPendingError] = useState<string | null>(null);
  const [isMoveToPendingSubmitting, setIsMoveToPendingSubmitting] = useState(false);
  const [shouldRestoreDrawerAfterPendingMove, setShouldRestoreDrawerAfterPendingMove] =
    useState(false);

  const loadSequenceRef = useRef(0);
  const handledCreateQueryRef = useRef<string | null>(null);
  const handledPendingVisitQueryRef = useRef<string | null>(null);
  const appliedRoleDefaultViewRef = useRef(false);
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
  const { techniciansById, assigneeOptions, calendarDays, selectedTechnician } =
    useSchedulingDerivedState({
      technicians,
      events,
      filters,
      selectedEvent,
    });
  const operationalUsers = useMemo(() => filterOperationalTechnicians(technicians), [technicians]);
  const visibleTechnicians = useMemo(() => {
    if (!filters.technicianId) {
      return operationalUsers;
    }

    const selectedUser = technicians.find((technician) => technician.id === filters.technicianId);
    return selectedUser ? [selectedUser] : [];
  }, [filters.technicianId, operationalUsers, technicians]);
  const schedulingResponsibleOptions = useMemo(
    () => buildTechnicianOptions(operationalUsers),
    [operationalUsers],
  );
  const schedulingInternalUserOptions = useMemo(
    () => buildTechnicianOptions(technicians),
    [technicians],
  );
  const dailyDisplayDateLocal = filters.view === 'day' ? filters.fromDate : null;
  const dailyDisplaySiteId =
    dailyDraft?.organizationSiteId ?? selectedPendingVisitRequest?.organizationSiteId ?? null;
  const { operatingWindow: dailyOperatingWindow } = useDailyDisplayOperatingWindow({
    dateLocal: dailyDisplayDateLocal,
    organizationSiteId: dailyDisplaySiteId,
    enabled: isAgendaSurface && filters.view === 'day' && Boolean(dailyDisplayDateLocal),
  });
  const dailyDisplayWindow = useMemo(
    () => buildDisplayWindowFromOperatingWindow(dailyOperatingWindow),
    [dailyOperatingWindow],
  );
  const isSingleDayRange = filters.fromDate === filters.toDate;
  const visibleDayTaskCount = useMemo(() => {
    if (!isSingleDayRange) {
      return 0;
    }

    return calendarDays[0]?.events.length ?? 0;
  }, [calendarDays, isSingleDayRange]);
  const recommendedDensityView = useMemo(
    () => getRecommendedSchedulingViewForDensity(filters, visibleDayTaskCount),
    [filters, visibleDayTaskCount],
  );
  const isHighDensityReferenceDay =
    isAgendaSurface &&
    isSingleDayRange &&
    isHighDensityScheduleDay(visibleDayTaskCount) &&
    recommendedDensityView === 'list';
  const showHighDensityDayAlert = filters.view === 'day' && isHighDensityReferenceDay;
  const showHighDensityListAlert = filters.view === 'list' && isHighDensityReferenceDay;

  const workOrdersById = useMemo(
    () => new Map(workOrders.map((workOrder) => [workOrder.id, workOrder])),
    [workOrders],
  );
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

  const clearQuickCreateContext = useCallback(() => {
    setQuickCreateInitialValues(null);
    setQuickCreateError(null);
  }, []);

  const handlePendingVisitDrop = useCallback(
    (payload: PendingVisitDropPayload) => {
      if (!canManage) {
        return;
      }

      const draft = buildDailyDraftFromDrop(payload);
      setDailyDraft(validateDailyDraft(draft, dailyOperatingWindow, events));

      const fromPage =
        pendingVisitResponse?.items.find((item) => item.id === payload.visitRequestId) ?? null;
      if (fromPage) {
        setSelectedPendingVisitRequest(fromPage);
        return;
      }

      if (selectedPendingVisitRequest?.id === payload.visitRequestId) {
        return;
      }

      void wfmApi.visitRequests
        .get(payload.visitRequestId)
        .then((visitRequest) => {
          setSelectedPendingVisitRequest(visitRequest);
        })
        .catch((pendingVisitError) => {
          setError(
            `No fue posible fijar la solicitud arrastrada. ${mapSchedulingError(pendingVisitError)}`,
          );
        });
    },
    [
      canManage,
      dailyOperatingWindow,
      events,
      pendingVisitResponse?.items,
      selectedPendingVisitRequest?.id,
    ],
  );

  const handleDailyDraftChange = useCallback(
    (nextDraft: DailyDraftEvent) => {
      setDailyDraft(validateDailyDraft(nextDraft, dailyOperatingWindow, events));
    },
    [dailyOperatingWindow, events],
  );

  const handleDailyDraftDiscard = useCallback(() => {
    setDailyDraft(null);
  }, []);

  const handleDailyDraftConfirm = useCallback(async () => {
    if (!dailyDraft || dailyDraft.validationState !== 'valid') {
      return;
    }

    try {
      const visitRequest =
        selectedPendingVisitRequest?.id === dailyDraft.visitRequestId
          ? selectedPendingVisitRequest
          : await wfmApi.visitRequests.get(dailyDraft.visitRequestId);

      setSelectedPendingVisitRequest(visitRequest);
      setPendingManualSelectionDraft({
        technicianId: dailyDraft.assignedUserId,
        date: dailyDraft.dayKey,
        dayLabel: formatWfmDayLabel(new Date(`${dailyDraft.dayKey}T12:00:00`)),
        availabilityLabel: 'Borrador validado en despacho diario',
        riskMessages: [],
        startTime: toLocalTimeValue(dailyDraft.scheduledStartAt),
        duration: String(dailyDraft.durationMinutes),
        source: 'manual',
      });
      setPendingVisitRecommendations([]);
      setSelectedPendingRecommendationId(null);
      setIsPendingConfirmOpen(true);
    } catch (confirmError) {
      setError(
        `No fue posible preparar la confirmación del borrador. ${mapSchedulingError(confirmError)}`,
      );
    }
  }, [dailyDraft, selectedPendingVisitRequest]);

  useEffect(() => {
    setDailyDraft((current) =>
      current ? validateDailyDraft(current, dailyOperatingWindow, events) : current,
    );
  }, [dailyOperatingWindow, events]);

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

  const clearPendingVisitSelection = useCallback(() => {
    setSelectedPendingVisitRequest(null);
    setPendingVisitRecommendations([]);
    setSelectedPendingRecommendationId(null);
    setPendingManualSelectionDraft(null);
    setPendingRecommendationError(null);
    clearPendingVisitQueryParams();
  }, [clearPendingVisitQueryParams]);

  const showPendingPanelBesideCalendar =
    Boolean(selectedPendingVisitRequest) && filters.view !== 'day';

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

        const expedienteEventsResponse = await wfmApi.events.list({
          expedienteId: response.data.id,
          page: 1,
          limit: 100,
        });
        const existingActiveEvent = expedienteEventsResponse.data.find(
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
      let workOrderDetail: WfmWorkOrder | null = null;
      let executionOrderDetail: ExecutionOrderRecord | null = null;
      const detailWarnings: string[] = [];

      if (eventDetail.workOrderId) {
        try {
          workOrderDetail = await wfmApi.workOrders.get(eventDetail.workOrderId);
        } catch (workOrderError) {
          detailWarnings.push(
            `La orden de trabajo vinculada no está disponible en este momento. ${mapSchedulingError(workOrderError)}`,
          );
        }
      }

      if (eventDetail.executionOrderId) {
        try {
          executionOrderDetail = await tasksApi.executionOrders.get(eventDetail.executionOrderId);
        } catch (executionOrderError) {
          detailWarnings.push(
            `La orden de ejecución vinculada no está disponible en este momento. ${mapSchedulingError(executionOrderError)}`,
          );
        }
      }

      const enrichedEvent = await enrichScheduleEventWithCrmCoordinates(
        eventDetail,
        workOrderDetail,
        crmApi.getExpediente,
      );
      setSelectedEvent(enrichedEvent);
      setSelectedExecutionOrder(executionOrderDetail);
      setDrawerActionError(detailWarnings.length > 0 ? detailWarnings.join(' ') : null);
    } catch (detailError) {
      setSelectedEvent(null);
      setSelectedExecutionOrder(null);
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
    const workOrdersPromise =
      canManage && (isDashboardSurface || isAgendaSurface)
        ? collectListPages((page) => wfmApi.workOrders.list({ page, limit: 100 }), {
            maxPages: 20,
            limit: 100,
          })
        : Promise.resolve({ data: [] as WfmWorkOrder[], meta: null });
    const pendingVisitPromise =
      canManage && (isDashboardSurface || (isAgendaSurface && filters.view === 'day'))
        ? wfmApi.visitRequests.list({
            page: 1,
            limit: isDashboardSurface ? 12 : 8,
          })
        : Promise.resolve<ListWfmVisitRequestsResponse | null>(null);

    const [eventsResult, summaryResult, techniciansResult, workOrdersResult, pendingVisitResult] =
      await Promise.allSettled([
        collectListPages((page) => wfmApi.events.list({ ...eventParams, page, limit: 100 }), {
          maxPages: 20,
          limit: 100,
        }),
        summaryPromise,
        loadSchedulableUsers(),
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
    const resolvedEvents = eventsResult.value.data;
    const resolvedTechnicians =
      techniciansResult.status === 'fulfilled' ? techniciansResult.value : null;
    const resolvedPendingVisitResponse =
      pendingVisitResult.status === 'fulfilled' ? (pendingVisitResult.value ?? null) : null;
    const demoState =
      resolvedTechnicians &&
      shouldUseSchedulingDemoState({
        surface,
        filters,
        events: resolvedEvents,
        technicians: resolvedTechnicians,
        pendingVisitResponse: resolvedPendingVisitResponse,
      })
        ? buildSchedulingDemoState(filters)
        : null;

    setIsDemoMode(!!demoState);
    setEvents(demoState?.events ?? resolvedEvents);

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value ?? null);
    } else {
      warnings.push(
        'No fue posible actualizar el resumen de operaciones de campo. Se mantiene la última versión disponible.',
      );
    }

    if (techniciansResult.status === 'fulfilled') {
      setTechnicians(
        Array.isArray(demoState?.technicians)
          ? demoState.technicians
          : Array.isArray(techniciansResult.value)
            ? techniciansResult.value
            : [],
      );
    } else {
      warnings.push(
        'No fue posible actualizar el directorio de responsables. Se mantiene la última versión disponible.',
      );
    }

    if (workOrdersResult.status === 'fulfilled') {
      setWorkOrders(workOrdersResult.value.data);
    } else {
      warnings.push(
        'No fue posible actualizar la lista de órdenes de trabajo. Se mantiene la última versión disponible.',
      );
    }

    if (pendingVisitResult.status === 'fulfilled') {
      setPendingVisitResponse(demoState?.pendingVisitResponse ?? pendingVisitResult.value ?? null);
    } else {
      warnings.push(
        'No fue posible actualizar las decisiones pendientes. Se mantiene la última versión disponible.',
      );
    }

    if (demoState) {
      warnings.push(demoState.infoMessage);
    }

    setInfoMessage(warnings.length > 0 ? warnings.join(' ') : null);
    setIsLoading(false);
  }, [canManage, filters, isAgendaSurface, isDashboardSurface, surface]);

  const finalizeTaskSchedulingCreate = useCallback(
    async (
      values: CreateTaskSchedulingValues,
      setErrorMessage: (message: string | null) => void,
    ) => {
      setErrorMessage(null);

      const result = await createTaskWithOptionalScheduling({
        values,
        sourceContext: expedienteContextId ? TaskOriginContext.CRM : TaskOriginContext.MANUAL,
        linkedTicketId: installationTicketId,
        linkedExpedienteId: expedienteContextId,
      });

      let feedbackMessage = buildOrchestrationFeedback(result);
      let transitionWarning: string | null = null;

      if (installationTicketId && result.event?.workOrderId) {
        try {
          await assuranceApi.tickets.linkWorkOrder(installationTicketId, {
            workOrderId: result.event.workOrderId,
          });
        } catch (linkWoError) {
          console.warn(
            'No fue posible vincular la orden de trabajo al ticket de instalación:',
            linkWoError,
          );
        }
      }

      if (expedienteContextId && result.event) {
        if (installationTicketId) {
          try {
            await crmApi.linkInstallationOperationalRefs(expedienteContextId, {
              ticketId: installationTicketId,
              workOrderId: result.event.workOrderId ?? '',
            });
          } catch (linkRefsError) {
            console.warn(
              'No fue posible persistir las refs operativas en el expediente:',
              linkRefsError,
            );
          }
        }

        try {
          await syncExpedienteAfterScheduleEvent({
            expedienteContextId,
            payloadExpedienteId: expedienteContextId,
            transitionExpedienteStatus: crmApi.transitionExpedienteStatus,
          });
          feedbackMessage += ' El expediente quedó marcado como instalación agendada.';
        } catch (transitionError) {
          transitionWarning = `La tarea se creó, pero no fue posible actualizar el expediente automáticamente. ${mapSchedulingError(transitionError)}`;
        }
      }

      setFeedback(feedbackMessage);
      setIsCreateOpen(false);
      setIsQuickCreateOpen(false);
      clearCreateContext();
      clearQuickCreateContext();
      await loadData();

      if (result.event) {
        await loadEventDetails(result.event.id);
      }

      if (transitionWarning) {
        setInfoMessage((current) =>
          current ? `${current} ${transitionWarning}` : transitionWarning,
        );
      }
    },
    [
      clearCreateContext,
      clearQuickCreateContext,
      expedienteContextId,
      installationTicketId,
      loadData,
      loadEventDetails,
    ],
  );

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
    if (authLoading || !user || appliedRoleDefaultViewRef.current) {
      return;
    }

    appliedRoleDefaultViewRef.current = true;
    const roleDefaultView = getDefaultSchedulingViewForRole(user.role);

    setFilters((current) => {
      if (current.view !== getDefaultSchedulingViewForRole() || current.view === roleDefaultView) {
        return current;
      }

      return {
        ...current,
        ...buildSchedulingRangeForView(roleDefaultView, current.fromDate),
        view: roleDefaultView,
      };
    });
  }, [authLoading, user]);

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
    ? 'Coordina visitas agendadas, pendientes por asignar y solicitudes manuales excepcionales.'
    : 'Dashboard inicial del módulo para ubicar prioridades, revisar presión operativa y decidir dónde entrar a trabajar.';

  const openQuickCreateFromSlot = useCallback(
    (selection: ScheduleCalendarSlotSelection) => {
      if (!canManage) {
        return;
      }

      setQuickCreateError(null);
      setQuickCreateInitialValues({
        title: '',
        type: WfmWorkType.TECHNICAL_VISIT,
        assignedUserId: selection.assignedUserId,
        recipientRefId: 'operations-area',
        scheduledDateLocal: toLocalDateValue(selection.scheduledStartAt),
        scheduledStartTimeLocal: toLocalTimeValue(selection.scheduledStartAt),
        durationMinutes:
          deriveDurationMinutes(selection.scheduledStartAt, selection.scheduledEndAt) || 60,
      } as ScheduleEventFormInitialValues);
      setIsQuickCreateOpen(true);
    },
    [canManage],
  );

  const openAgendaDay = useCallback((dayKey: string) => {
    setFeedback(null);
    setFilters((current) => ({
      ...current,
      ...buildSchedulingRangeForView('day', dayKey),
      view: 'day',
    }));
  }, []);

  const renderPendingDispatchPanel = (compactRail = false) => {
    if (!selectedPendingVisitRequest) {
      return null;
    }

    return (
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
        compactRail={compactRail}
        onRecommend={async (draft: VisitRecommendationDraft) => {
          const recommendationCandidates = filterRecommendationCandidateUsers(technicians);

          if (recommendationCandidates.length === 0) {
            setPendingRecommendationError(
              'No hay personas activas disponibles en agenda para calcular recomendaciones.',
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
                candidateUserIds: recommendationCandidates.map((technician) => technician.id),
                searchHorizonDays: draft.searchHorizonDays,
                ...(selectedPendingVisitRequest.organizationSiteId
                  ? {
                      organizationSiteId: selectedPendingVisitRequest.organizationSiteId,
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
            setFeedback(`La solicitud ${updated.title} actualizó su contexto operativo.`);
          } catch (pendingError) {
            throw new Error(mapSchedulingError(pendingError));
          } finally {
            setIsPendingContextSaving(false);
          }
        }}
        onOpenConfirm={() => setIsPendingConfirmOpen(true)}
        onClose={clearPendingVisitSelection}
      />
    );
  };

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
              <Button asChild type="button" variant="secondary">
                <Link href="/dashboard/scheduling/agenda">Ir a agenda</Link>
              </Button>
            )}
            <Badge variant="primary" className="px-3 py-1 text-[11px] uppercase tracking-tight">
              {formatWfmDayLabel(new Date())}
            </Badge>
          </div>
        }
      />

      {isDemoMode && (
        <PortalAlert
          variant="warning"
          title="Modo demostración activo"
          description="Los datos mostrados son de muestra y no corresponden a información real del tenant."
        />
      )}

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
              techniciansById={techniciansById}
              selectedDayKey={calendarDays[0]?.key ?? filters.fromDate}
              isLoading={isLoading}
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
                assigneeOptions={assigneeOptions}
                visibleDayTaskCount={visibleDayTaskCount}
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
                  showPendingPanelBesideCalendar
                    ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]'
                    : 'space-y-6'
                }
              >
                <div className="space-y-6">
                  {showHighDensityDayAlert ? (
                    <PortalAlert
                      variant="info"
                      title="Jornada de alto volumen"
                      description="Para revisar todas las tareas del día, usa Lista. Vuelve a Día para despachar y ajustar la jornada visible."
                    />
                  ) : null}
                  {showHighDensityListAlert ? (
                    <PortalAlert
                      variant="success"
                      title="Superficie recomendada activa"
                      description="Estás viendo la superficie recomendada para jornadas de alto volumen dentro del rango visible."
                    />
                  ) : null}
                  {selectedPendingVisitRequest && filters.view !== 'day' && (
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
                      technicians={visibleTechnicians}
                      techniciansById={techniciansById}
                      workOrdersById={workOrdersById}
                      view={filters.view}
                      pendingVisitRequests={pendingVisitResponse?.items ?? []}
                      selectedPendingVisitRequestId={selectedPendingVisitRequest?.id ?? null}
                      pendingAsideContent={
                        filters.view === 'day' ? renderPendingDispatchPanel(true) : undefined
                      }
                      displayWindow={dailyDisplayWindow}
                      dailyDraft={dailyDraft}
                      onSelectEvent={(event) => void loadEventDetails(event.id)}
                      onSelectPendingVisit={(visitRequestId) =>
                        void loadPendingVisitFromHandoff(visitRequestId, filters.fromDate)
                      }
                      onOpenPendingVisitsInbox={() => {
                        router.push('/dashboard/scheduling/pending-visits');
                      }}
                      onCreateEventSlot={canManage ? openQuickCreateFromSlot : undefined}
                      onPendingVisitDrop={canManage ? handlePendingVisitDrop : undefined}
                      onDailyDraftChange={canManage ? handleDailyDraftChange : undefined}
                      onDailyDraftConfirm={
                        canManage ? () => void handleDailyDraftConfirm() : undefined
                      }
                      onDailyDraftDiscard={canManage ? handleDailyDraftDiscard : undefined}
                      onOpenDay={openAgendaDay}
                    />
                  )}
                </div>

                {showPendingPanelBesideCalendar ? renderPendingDispatchPanel(false) : null}
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
          const scheduledVisitRequestId = selectedPendingVisitRequest.id;
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
            setDailyDraft(null);
            setPendingVisitResponse((current) => {
              if (!current) {
                return current;
              }

              const items = current.items.filter((item) => item.id !== scheduledVisitRequestId);

              return {
                ...current,
                items,
                meta: {
                  ...current.meta,
                  total: Math.max(0, current.meta.total - (current.items.length - items.length)),
                },
              };
            });
            clearPendingVisitQueryParams();
            await loadData();
          } catch (pendingError) {
            setPendingRecommendationError(mapSchedulingError(pendingError));
          } finally {
            setIsPendingScheduling(false);
          }
        }}
      />

      <CreateTaskSchedulingDialog
        open={isCreateOpen}
        contextTitle={createContextLabel ?? 'Solicitud manual de visita'}
        initialValues={createInitialValues ?? null}
        technicians={technicians}
        responsibleOptions={schedulingResponsibleOptions}
        internalAreaOptions={INTERNAL_AREA_OPTIONS}
        internalUserOptions={schedulingInternalUserOptions}
        error={createError}
        isSubmitting={isCreateSubmitting}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            clearCreateContext();
          }
        }}
        onSubmit={async (values) => {
          setIsCreateSubmitting(true);
          try {
            await finalizeTaskSchedulingCreate(values, setCreateError);
          } catch (createTaskError) {
            setCreateError(mapSchedulingError(createTaskError));
          } finally {
            setIsCreateSubmitting(false);
          }
        }}
      />

      <SchedulingQuickCreateDialog
        open={isQuickCreateOpen}
        initialValues={quickCreateInitialValues}
        technicians={visibleTechnicians}
        responsibleOptions={schedulingResponsibleOptions}
        internalAreaOptions={INTERNAL_AREA_OPTIONS}
        internalUserOptions={schedulingInternalUserOptions}
        error={quickCreateError}
        isSubmitting={isQuickCreateSubmitting}
        onOpenChange={(open) => {
          setIsQuickCreateOpen(open);
          if (!open) {
            clearQuickCreateContext();
          }
        }}
        onSubmit={async (values) => {
          setIsQuickCreateSubmitting(true);
          try {
            await finalizeTaskSchedulingCreate(values, setQuickCreateError);
          } catch (createTaskError) {
            setQuickCreateError(mapSchedulingError(createTaskError));
          } finally {
            setIsQuickCreateSubmitting(false);
          }
        }}
      />

      <ScheduleEventDrawer
        open={isDrawerOpen}
        event={selectedEvent}
        technician={selectedTechnician}
        onOpenChange={(open) => {
          setIsDrawerOpen(open);
          if (!open) {
            setSelectedEventId(null);
            setSelectedEvent(null);
            setSelectedExecutionOrder(null);
            setDrawerError(null);
            setDrawerActionError(null);
          }
        }}
        onOpenMoveToPending={() => {
          setMoveToPendingError(null);
          setShouldRestoreDrawerAfterPendingMove(isDrawerOpen);
          setIsDrawerOpen(false);
          setIsMoveToPendingOpen(true);
        }}
        canReschedule={canManage}
        isLoading={isDrawerLoading}
        error={drawerError}
        {...(selectedEventId
          ? {
              onRetry: () => loadEventDetails(selectedEventId),
              onRefreshDetail: () => loadEventDetails(selectedEventId),
            }
          : {})}
        executionOrder={selectedExecutionOrder}
        executionOrderError={drawerActionError}
      />

      <MoveEventToPendingDialog
        open={isMoveToPendingOpen}
        event={selectedEvent}
        error={moveToPendingError}
        isSubmitting={isMoveToPendingSubmitting}
        onOpenChange={(open) => {
          setIsMoveToPendingOpen(open);

          if (!open && shouldRestoreDrawerAfterPendingMove && selectedEventId) {
            setIsDrawerOpen(true);
          }

          if (!open) {
            setShouldRestoreDrawerAfterPendingMove(false);
          }
        }}
        onConfirm={async (reason) => {
          if (!selectedEventId) {
            return;
          }

          setMoveToPendingError(null);
          setDrawerActionError(null);
          setIsMoveToPendingSubmitting(true);
          try {
            await wfmApi.events.moveToPending(selectedEventId, reason ? { reason } : undefined);
            setFeedback(
              'El evento volvió a pendientes para reprocesar su nueva ventana de atención.',
            );
            setShouldRestoreDrawerAfterPendingMove(false);
            setIsMoveToPendingOpen(false);
            setSelectedEventId(null);
            setSelectedEvent(null);
            setSelectedExecutionOrder(null);
            await loadData();
          } catch (moveToPendingEventError) {
            const message = mapSchedulingError(moveToPendingEventError);
            setMoveToPendingError(message);
            setDrawerActionError(message);
          } finally {
            setIsMoveToPendingSubmitting(false);
          }
        }}
      />
    </div>
  );
}
