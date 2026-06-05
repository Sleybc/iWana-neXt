'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CalendarRange, CheckCircle2, ClipboardList, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
} from '@iwana/ui';
import { UserRole, WorkOrderPriority, WorkOrderSourceContext, WfmWorkType } from '@iwana/shared';
import {
  ApiError,
  assuranceApi,
  crmApi,
  type CreateWfmVisitRequestDto,
  type InternalUser,
  type ListWfmVisitRequestsResponse,
  type UpdateWfmVisitRequestContextDto,
  type WfmVisitRequest,
  type WfmVisitRequestFilterOptionsResponse,
  type WfmScheduleEvent,
  type WfmScheduleRecommendation,
  type WfmTechnicianAvailability,
  usersApi,
  wfmApi,
} from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  INSTALLATION_SCHEDULING_MIN_PROGRESS,
  canScheduleInstallation,
} from '@/components/crm/expedientes/expediente-scheduling';
import { PageHeader } from '@/components/layout/PageHeader';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import {
  getScheduleTimeOptionsForWorkType,
  getDefaultDurationForWorkType,
  toDateFromLocalDateValue,
  toIsoFromLocalDateAndTime,
} from './schedule-event-time';
import { useOperatingWindow } from './useOperatingWindow';
import { syncExpedienteAfterScheduleEvent } from './scheduling-expediente-sync';
import {
  buildDefaultPendingVisitFilters,
  canAccessPendingVisits,
  formatVisitRequestLocationLabel,
  type PendingVisitFilters,
} from './pending-visits-ui';
import {
  filterOperationalTechnicians,
  formatSchedulingExpedienteLabel,
  formatWfmDayLabel,
  getWorkOrderPriorityLabel,
  getWfmWorkTypeLabel,
  isScheduleEventTerminalStatus,
} from './scheduling-ui';
import { PendingVisitRequestInbox } from './PendingVisitRequestInbox';
import { WeeklyTechnicianMatrix } from './WeeklyTechnicianMatrix';
import { VisitRequestRecommendationPanel } from './VisitRequestRecommendationPanel';
import type { VisitRecommendationDraft } from './VisitRequestRecommendationPanel';
import { ScheduleVisitRequestConfirmDialog } from './ScheduleVisitRequestConfirmDialog';

const USERS_PAGE_SIZE = 100;
const CRM_EXPEDIENTE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toOptionalUuid(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return CRM_EXPEDIENTE_ID_PATTERN.test(value) ? value : undefined;
}

function toOptionalFiniteNumber(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toOptionalTrimmedText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function mapPendingVisitError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente para continuar.';
    if (error.status === 403) return 'Tu rol actual no puede usar la bandeja global de visitas.';
    if (error.status === 404) return 'La solicitud ya no está disponible.';
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

  return filterOperationalTechnicians(Array.from(collected.values()));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function toMatrixRange(anchorDate: Date): { from: string; to: string; startAt: Date } {
  const startAt = startOfDay(anchorDate);
  const endAt = addDays(startAt, 6);
  endAt.setHours(23, 59, 59, 999);

  return {
    from: startAt.toISOString(),
    to: endAt.toISOString(),
    startAt,
  };
}

type CreateVisitRequestDraft = Omit<
  CreateWfmVisitRequestDto,
  'requestedWindowStartAt' | 'requestedWindowEndAt'
> & {
  requestedWindowStartDate: string;
  requestedWindowStartTime: string;
  requestedWindowEndDate: string;
  requestedWindowEndTime: string;
};

function buildCreateDraft(): CreateVisitRequestDraft {
  return {
    originContext: WorkOrderSourceContext.MANUAL,
    workType: WfmWorkType.TECHNICAL_VISIT,
    priority: WorkOrderPriority.NORMAL,
    title: '',
    description: '',
    address: '',
    municipality: '',
    sector: '',
    requestedWindowStartDate: '',
    requestedWindowStartTime: '',
    requestedWindowEndDate: '',
    requestedWindowEndTime: '',
  };
}

function buildCreatePayload(draft: CreateVisitRequestDraft): CreateWfmVisitRequestDto {
  const {
    requestedWindowStartDate,
    requestedWindowStartTime,
    requestedWindowEndDate,
    requestedWindowEndTime,
    ...payload
  } = draft;

  return {
    ...payload,
    requestedWindowStartAt: toIsoFromLocalDateAndTime(
      requestedWindowStartDate,
      requestedWindowStartTime,
    ),
    requestedWindowEndAt: toIsoFromLocalDateAndTime(requestedWindowEndDate, requestedWindowEndTime),
  };
}

function buildCrmVisitRequestDraft(
  response: Awaited<ReturnType<typeof crmApi.getExpediente>>,
  ticketId: string,
): CreateWfmVisitRequestDto {
  const expedienteLabel = formatSchedulingExpedienteLabel(response.data.id);
  const customerName = toOptionalTrimmedText(response.data.fullName) ?? expedienteLabel;
  const operationalNotes = [response.data.specialAccessNotes, response.data.technicalObservations]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' | ')
    .slice(0, 500);

  return {
    originContext: WorkOrderSourceContext.CRM,
    originRef: response.data.id,
    originLabel: `Cliente ${customerName}`.slice(0, 160),
    workType: WfmWorkType.INSTALLATION,
    priority: WorkOrderPriority.NORMAL,
    title: `Instalación para ${customerName}`.slice(0, 160),
    description:
      operationalNotes || `Solicitud creada desde CRM para ${customerName} (${expedienteLabel}).`,
    address: toOptionalTrimmedText(response.data.address),
    municipality: toOptionalTrimmedText(
      formatVisitRequestLocationLabel(response.data.municipality),
    ),
    sector: toOptionalTrimmedText(
      formatVisitRequestLocationLabel(response.data.neighborhood ?? response.data.zoneType),
    ),
    latitude: toOptionalFiniteNumber(response.data.latitude),
    longitude: toOptionalFiniteNumber(response.data.longitude),
    expedienteId: response.data.id,
    subscriberId: toOptionalUuid(response.data.subscriberSummary?.id),
    ticketId: toOptionalTrimmedText(ticketId),
  };
}

function upsertVisitRequestResponse(
  current: ListWfmVisitRequestsResponse | null,
  visitRequest: WfmVisitRequest,
): ListWfmVisitRequestsResponse {
  if (!current) {
    return {
      items: [visitRequest],
      meta: {
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    };
  }

  const items = [
    visitRequest,
    ...current.items.filter((item) => item.id !== visitRequest.id),
  ].slice(0, current.meta.limit);
  const alreadyIncluded = current.items.some((item) => item.id === visitRequest.id);
  const total = alreadyIncluded ? current.meta.total : current.meta.total + 1;

  return {
    items,
    meta: {
      ...current.meta,
      total,
      totalPages: Math.max(1, Math.ceil(total / current.meta.limit)),
    },
  };
}

function getRecommendationKey(recommendation: WfmScheduleRecommendation): string {
  return `${recommendation.technicianId}::${recommendation.scheduledStartAt}`;
}

function resolveCrmExpedienteId(visitRequest: WfmVisitRequest): string | null {
  if (visitRequest.originContext !== WorkOrderSourceContext.CRM) {
    return null;
  }

  if (visitRequest.expedienteId && CRM_EXPEDIENTE_ID_PATTERN.test(visitRequest.expedienteId)) {
    return visitRequest.expedienteId;
  }

  if (visitRequest.originRef && CRM_EXPEDIENTE_ID_PATTERN.test(visitRequest.originRef)) {
    return visitRequest.originRef;
  }

  return null;
}

function resolveCrmOpportunityCode(visitRequest: WfmVisitRequest): string | null {
  if (visitRequest.originContext !== WorkOrderSourceContext.CRM) {
    return null;
  }

  const originLabel = toOptionalTrimmedText(visitRequest.originLabel);
  if (!originLabel) {
    return null;
  }

  const match = originLabel.match(/^Oportunidad\s+([A-Za-z0-9-]+)/i);
  if (!match?.[1]) {
    return null;
  }

  return match[1].toUpperCase();
}

function toExpedienteDisplayName(expediente: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
}): string | null {
  const fullName = toOptionalTrimmedText(expediente.fullName);
  if (fullName) {
    return fullName;
  }

  const firstName = toOptionalTrimmedText(expediente.firstName);
  const lastName = toOptionalTrimmedText(expediente.lastName);
  const personName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (personName) {
    return personName;
  }

  const companyName = toOptionalTrimmedText(expediente.companyName);
  return companyName ?? null;
}

async function findExpedienteByOpportunityCode(opportunityCode: string) {
  const SEARCH_PAGE_LIMIT = 50;
  const SEARCH_MAX_PAGES = 10;

  for (let page = 1; page <= SEARCH_MAX_PAGES; page += 1) {
    const listResponse = await crmApi.listExpedientes({
      search: opportunityCode,
      view: 'all',
      includeCompleted: true,
      page,
      limit: SEARCH_PAGE_LIMIT,
    });

    const matchedExpediente = listResponse.data.find((expediente) => {
      const expedienteCode = formatSchedulingExpedienteLabel(expediente.id).toUpperCase();
      return expedienteCode === opportunityCode;
    });

    if (matchedExpediente) {
      return matchedExpediente;
    }

    if (listResponse.data.length < SEARCH_PAGE_LIMIT) {
      break;
    }
  }

  const FULL_SCAN_PAGE_LIMIT = 200;
  const FULL_SCAN_MAX_PAGES = 30;

  for (let page = 1; page <= FULL_SCAN_MAX_PAGES; page += 1) {
    const listResponse = await crmApi.listExpedientes({
      view: 'all',
      includeCompleted: true,
      page,
      limit: FULL_SCAN_PAGE_LIMIT,
    });

    const matchedExpediente = listResponse.data.find((expediente) => {
      const expedienteCode = formatSchedulingExpedienteLabel(expediente.id).toUpperCase();
      return expedienteCode === opportunityCode;
    });

    if (matchedExpediente) {
      return matchedExpediente;
    }

    if (listResponse.data.length < FULL_SCAN_PAGE_LIMIT) {
      break;
    }
  }

  return null;
}

export function PendingVisitRequestsView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const [filters, setFilters] = useState<PendingVisitFilters>(() =>
    buildDefaultPendingVisitFilters(),
  );
  const [response, setResponse] = useState<ListWfmVisitRequestsResponse | null>(null);
  const [selectedVisitRequestId, setSelectedVisitRequestId] = useState<string | null>(null);
  const [isDispatchPanelOpen, setIsDispatchPanelOpen] = useState(false);
  const [technicians, setTechnicians] = useState<InternalUser[]>([]);
  const [events, setEvents] = useState<WfmScheduleEvent[]>([]);
  const [availability, setAvailability] = useState<WfmTechnicianAvailability[]>([]);
  const [recommendations, setRecommendations] = useState<WfmScheduleRecommendation[]>([]);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'inbox' | 'matrix'>('inbox');
  const [filterOptions, setFilterOptions] = useState<WfmVisitRequestFilterOptionsResponse | null>(
    null,
  );
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [isLoadingFilterOptions, setIsLoadingFilterOptions] = useState(false);
  const [isLoadingMatrix, setIsLoadingMatrix] = useState(false);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateVisitRequestDraft>(() => buildCreateDraft());
  const [scheduleCreateWorkOrder, setScheduleCreateWorkOrder] = useState(true);
  const [scheduleWorkOrderNotes, setScheduleWorkOrderNotes] = useState('');
  const [crmCustomerNames, setCrmCustomerNames] = useState<Record<string, string>>({});
  const handledCrmBootstrapRef = useRef<string | null>(null);
  const pinnedCrmVisitRequestRef = useRef<WfmVisitRequest | null>(null);
  const crmCustomerLookupInFlightRef = useRef<Set<string>>(new Set());
  const inboxLoadSequenceRef = useRef(0);

  const canAccess = canAccessPendingVisits(user?.role);
  const isSalesRole = user?.role === UserRole.SALES;
  const selectedVisitRequest = useMemo(
    () => response?.items.find((item) => item.id === selectedVisitRequestId) ?? null,
    [response?.items, selectedVisitRequestId],
  );
  const selectedVisitRequestCustomerName = useMemo(() => {
    if (
      !selectedVisitRequest ||
      selectedVisitRequest.originContext !== WorkOrderSourceContext.CRM
    ) {
      return null;
    }

    const backendCustomerName = toOptionalTrimmedText(selectedVisitRequest.customerDisplayName);
    if (backendCustomerName) {
      return backendCustomerName;
    }

    const selectedExpedienteId = resolveCrmExpedienteId(selectedVisitRequest);
    if (selectedExpedienteId) {
      const resolvedName = crmCustomerNames[selectedExpedienteId];
      if (resolvedName) {
        return resolvedName;
      }
    }

    const selectedOpportunityCode = resolveCrmOpportunityCode(selectedVisitRequest);
    if (selectedOpportunityCode) {
      const resolvedName = crmCustomerNames[selectedOpportunityCode];
      if (resolvedName) {
        return resolvedName;
      }
    }

    const normalizedOriginLabel = toOptionalTrimmedText(selectedVisitRequest.originLabel);
    if (normalizedOriginLabel && normalizedOriginLabel.toLowerCase().startsWith('cliente ')) {
      return normalizedOriginLabel.slice('Cliente '.length).trim();
    }

    return null;
  }, [crmCustomerNames, selectedVisitRequest]);
  const selectedRecommendation = useMemo(
    () =>
      recommendations.find(
        (recommendation) => getRecommendationKey(recommendation) === selectedRecommendationId,
      ) ?? null,
    [recommendations, selectedRecommendationId],
  );
  const techniciansById = useMemo(
    () => new Map(technicians.map((technician) => [technician.id, technician])),
    [technicians],
  );
  const matrixRange = useMemo(() => {
    const anchor = selectedVisitRequest?.requestedWindowStartAt
      ? new Date(selectedVisitRequest.requestedWindowStartAt)
      : new Date();
    return toMatrixRange(anchor);
  }, [selectedVisitRequest?.requestedWindowStartAt]);
  const { operatingWindow: createOperatingWindow } = useOperatingWindow({
    workType: createDraft.workType,
    dateLocal: createDraft.requestedWindowStartDate || null,
    enabled: isCreateOpen,
  });
  const createTimeOptions = useMemo(
    () => getScheduleTimeOptionsForWorkType(createDraft.workType, createOperatingWindow),
    [createDraft.workType, createOperatingWindow],
  );

  function clearCrmQueryParams() {
    if (!pathname) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('expedienteId');
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }

  async function loadInbox(
    nextFilters: PendingVisitFilters = filters,
    pinnedVisitRequest?: WfmVisitRequest,
  ): Promise<void> {
    if (isSalesRole) {
      return;
    }

    const loadSequence = inboxLoadSequenceRef.current + 1;
    inboxLoadSequenceRef.current = loadSequence;
    setIsLoadingInbox(true);
    setError(null);

    try {
      const nextResponse = await wfmApi.visitRequests.list({
        ...(nextFilters.status ? { status: nextFilters.status } : {}),
        ...(nextFilters.originContext ? { originContext: nextFilters.originContext } : {}),
        ...(nextFilters.priority ? { priority: nextFilters.priority } : {}),
        ...(nextFilters.municipality ? { municipality: nextFilters.municipality } : {}),
        ...(nextFilters.sector ? { sector: nextFilters.sector } : {}),
        page: nextFilters.page,
        limit: nextFilters.limit,
      });

      if (loadSequence !== inboxLoadSequenceRef.current) {
        return;
      }

      const effectivePinnedVisitRequest = pinnedVisitRequest ?? pinnedCrmVisitRequestRef.current;
      const responseIncludesPinnedVisitRequest = effectivePinnedVisitRequest
        ? nextResponse.items.some((item) => item.id === effectivePinnedVisitRequest.id)
        : false;
      const visibleResponse =
        effectivePinnedVisitRequest && !responseIncludesPinnedVisitRequest
          ? upsertVisitRequestResponse(nextResponse, effectivePinnedVisitRequest)
          : nextResponse;

      if (
        effectivePinnedVisitRequest &&
        responseIncludesPinnedVisitRequest &&
        pinnedCrmVisitRequestRef.current?.id === effectivePinnedVisitRequest.id
      ) {
        pinnedCrmVisitRequestRef.current = null;
      }

      setResponse(visibleResponse);
      setSelectedVisitRequestId((current) => {
        if (effectivePinnedVisitRequest) {
          return effectivePinnedVisitRequest.id;
        }

        if (current && visibleResponse.items.some((item) => item.id === current)) {
          return current;
        }

        return visibleResponse.items[0]?.id ?? null;
      });
    } catch (loadError) {
      if (loadSequence === inboxLoadSequenceRef.current) {
        setError(mapPendingVisitError(loadError));
      }
    } finally {
      if (loadSequence === inboxLoadSequenceRef.current) {
        setIsLoadingInbox(false);
      }
    }
  }

  async function loadFilterOptions(nextMunicipality = filters.municipality): Promise<void> {
    if (isSalesRole) {
      return;
    }

    setIsLoadingFilterOptions(true);
    try {
      const nextOptions = await wfmApi.visitRequests.filterOptions(
        nextMunicipality ? { municipality: nextMunicipality } : undefined,
      );
      setFilterOptions(nextOptions);
    } catch (loadError) {
      setError(mapPendingVisitError(loadError));
    } finally {
      setIsLoadingFilterOptions(false);
    }
  }

  async function loadMatrix(): Promise<void> {
    setIsLoadingMatrix(true);
    setMatrixError(null);

    try {
      const [nextTechnicians, nextEvents, nextAvailability] = await Promise.all([
        loadOperationalUsers(),
        wfmApi.events.list({ from: matrixRange.from, to: matrixRange.to }),
        wfmApi.technicians.listAvailability({ from: matrixRange.from, to: matrixRange.to }),
      ]);

      setTechnicians(nextTechnicians);
      setEvents(Array.isArray(nextEvents) ? nextEvents : []);
      setAvailability(Array.isArray(nextAvailability) ? nextAvailability : []);
    } catch (loadError) {
      setMatrixError(mapPendingVisitError(loadError));
    } finally {
      setIsLoadingMatrix(false);
    }
  }

  async function bootstrapCrmVisitRequest(expedienteId: string): Promise<void> {
    setError(null);
    setInfoMessage(null);
    setFeedback(null);

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
        return;
      }

      const expedienteEvents = await wfmApi.events.list({ expedienteId: response.data.id });
      const existingActiveEvent = expedienteEvents.find(
        (event) => !isScheduleEventTerminalStatus(event.status),
      );

      if (existingActiveEvent) {
        setInfoMessage(
          'Este expediente ya tiene un evento activo en Programación. Revisa el evento existente antes de crear una nueva solicitud.',
        );
        return;
      }

      const ticketResult = await assuranceApi.tickets.findOrCreateInstallation({
        expedienteId: response.data.id,
        expedienteFullName: response.data.fullName,
      });

      const visitRequest = await wfmApi.visitRequests.create(
        buildCrmVisitRequestDraft(response, ticketResult.ticket.id),
      );
      pinnedCrmVisitRequestRef.current = visitRequest;

      const clearedFilters = buildDefaultPendingVisitFilters();
      setFilters(clearedFilters);
      setResponse((current) => upsertVisitRequestResponse(current, visitRequest));
      setSelectedVisitRequestId(visitRequest.id);
      setActiveMode('inbox');
      setFeedback(`La solicitud ${visitRequest.title} quedó abierta en la bandeja.`);

      if (!isSalesRole) {
        await loadInbox(clearedFilters, visitRequest);
        void loadFilterOptions();
      }

      void loadMatrix();
    } catch (bootstrapError) {
      setError(mapPendingVisitError(bootstrapError));
    }
  }

  useEffect(() => {
    if (authLoading || !user || !canAccess) {
      return;
    }

    if (user.role === UserRole.SALES) {
      return;
    }

    void loadInbox();
  }, [authLoading, canAccess, filters, user]);

  useEffect(() => {
    if (authLoading || !user || !canAccess || user.role === UserRole.SALES) {
      return;
    }

    void loadFilterOptions(filters.municipality);
  }, [authLoading, canAccess, filters.municipality, user]);

  useEffect(() => {
    if (authLoading || !user || !canAccess) {
      return;
    }

    void loadMatrix();
  }, [authLoading, canAccess, matrixRange.from, matrixRange.to, user]);

  useEffect(() => {
    setRecommendations([]);
    setSelectedRecommendationId(null);
    setRecommendationError(null);
    setActiveMode('inbox');
  }, [selectedVisitRequestId]);

  useEffect(() => {
    if (!selectedVisitRequest) {
      setScheduleCreateWorkOrder(true);
      setScheduleWorkOrderNotes('');
      return;
    }

    const defaultCreateWorkOrder = !(
      selectedVisitRequest.originContext === WorkOrderSourceContext.MANUAL &&
      selectedVisitRequest.workType === WfmWorkType.TECHNICAL_VISIT
    );

    setScheduleCreateWorkOrder(defaultCreateWorkOrder);
    setScheduleWorkOrderNotes(selectedVisitRequest.description ?? '');
  }, [selectedVisitRequest]);

  useEffect(() => {
    const items = response?.items ?? [];
    const pendingExpedienteIds = items
      .map((item) => resolveCrmExpedienteId(item))
      .filter((expedienteId): expedienteId is string => Boolean(expedienteId))
      .filter(
        (expedienteId) =>
          !crmCustomerNames[expedienteId] &&
          !crmCustomerLookupInFlightRef.current.has(`id:${expedienteId}`),
      );

    const pendingOpportunityCodes = items
      .filter((item) => !resolveCrmExpedienteId(item))
      .map((item) => resolveCrmOpportunityCode(item))
      .filter((code): code is string => Boolean(code))
      .filter(
        (code) =>
          !crmCustomerNames[code] && !crmCustomerLookupInFlightRef.current.has(`code:${code}`),
      );

    if (pendingExpedienteIds.length === 0 && pendingOpportunityCodes.length === 0) {
      return;
    }

    let isCancelled = false;

    pendingExpedienteIds.forEach((expedienteId) => {
      crmCustomerLookupInFlightRef.current.add(`id:${expedienteId}`);

      void crmApi
        .getExpediente(expedienteId)
        .then((expedienteResponse) => {
          if (isCancelled) {
            return;
          }

          const fullName = toExpedienteDisplayName(expedienteResponse.data);
          if (!fullName) {
            return;
          }

          const expedienteCode = formatSchedulingExpedienteLabel(
            expedienteResponse.data.id,
          ).toUpperCase();

          setCrmCustomerNames((current) => {
            if (current[expedienteId] === fullName && current[expedienteCode] === fullName) {
              return current;
            }

            return {
              ...current,
              [expedienteId]: fullName,
              [expedienteCode]: fullName,
            };
          });
        })
        .catch(() => {
          // Si no podemos resolver el nombre, conservamos el título operativo actual.
        })
        .finally(() => {
          crmCustomerLookupInFlightRef.current.delete(`id:${expedienteId}`);
        });
    });

    pendingOpportunityCodes.forEach((opportunityCode) => {
      crmCustomerLookupInFlightRef.current.add(`code:${opportunityCode}`);

      void findExpedienteByOpportunityCode(opportunityCode)
        .then((matchedExpediente) => {
          if (isCancelled) {
            return;
          }

          if (!matchedExpediente) {
            return;
          }

          const fullName = toExpedienteDisplayName(matchedExpediente);
          if (!fullName) {
            return;
          }

          setCrmCustomerNames((current) => {
            if (
              current[opportunityCode] === fullName &&
              current[matchedExpediente.id] === fullName
            ) {
              return current;
            }

            return {
              ...current,
              [opportunityCode]: fullName,
              [matchedExpediente.id]: fullName,
            };
          });
        })
        .catch(() => {
          // Si no podemos resolver por código de oportunidad, conservamos fallback visual actual.
        })
        .finally(() => {
          crmCustomerLookupInFlightRef.current.delete(`code:${opportunityCode}`);
        });
    });

    return () => {
      isCancelled = true;
    };
  }, [crmCustomerNames, response?.items]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    const expedienteId = searchParams.get('expedienteId');
    const queryKey = searchParams.toString();

    if (!expedienteId) {
      return;
    }

    if (!canAccess) {
      setInfoMessage('Tu rol actual no puede abrir solicitudes CRM en la bandeja global.');
      clearCrmQueryParams();
      return;
    }

    if (!CRM_EXPEDIENTE_ID_PATTERN.test(expedienteId)) {
      setError('El identificador del expediente no es válido para abrir la bandeja pendiente.');
      clearCrmQueryParams();
      return;
    }

    if (handledCrmBootstrapRef.current === queryKey) {
      return;
    }

    handledCrmBootstrapRef.current = queryKey;
    clearCrmQueryParams();
    void bootstrapCrmVisitRequest(expedienteId);
  }, [authLoading, canAccess, searchParams, user]);

  if (authLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Visitas pendientes"
          subtitle="Cargando bandeja operativa y capacidad semanal del bloque de operaciones de campo."
        />
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1.4fr)_minmax(340px,1fr)]">
          <PortalSkeletonBlock className="h-[720px]" />
          <PortalSkeletonBlock className="h-[720px]" />
          <PortalSkeletonBlock className="h-[720px]" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Visitas pendientes" subtitle="Error al cargar la bandeja" />
        <PortalAlert
          variant="error"
          title="Módulo temporalmente no disponible"
          description="No fue posible resolver la sesión del portal para cargar la bandeja de visitas pendientes."
          icon={AlertTriangle}
        />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <PageHeader title="Visitas pendientes" subtitle="Acceso restringido" />
        <PortalAlert
          variant="warning"
          title="Vista no autorizada"
          description="Tu rol actual no tiene acceso a la bandeja global de visitas pendientes del portal empresarial."
          icon={AlertTriangle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visitas pendientes"
        subtitle="Inbox operativo para completar contexto, recomendar franja y convertir solicitudes en agenda confirmada sin depender del modal de eventos."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary" className="px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
              {formatWfmDayLabel(matrixRange.startAt)}
            </Badge>
            <Button asChild type="button" variant="secondary">
              <Link href="/dashboard/scheduling">
                <CalendarRange className="h-4 w-4" aria-hidden="true" />
                Volver a agenda
              </Link>
            </Button>
            {!isSalesRole && (
              <Button type="button" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nueva solicitud manual
              </Button>
            )}
          </div>
        }
      />

      {isSalesRole && (
        <PortalAlert
          variant="info"
          title="Modo CRM asistido"
          description="Como asesor comercial solo puedes operar solicitudes originadas desde CRM abiertas desde un expediente; la bandeja global y la creación manual quedan reservadas para Operaciones."
          icon={ClipboardList}
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
        <PortalAlert
          variant="info"
          title="Seguimiento operativo"
          description={infoMessage}
          icon={ClipboardList}
        />
      )}

      {error && (
        <PortalAlert
          variant="error"
          title="No fue posible cargar la bandeja"
          description={error}
          icon={AlertTriangle}
        />
      )}

      {matrixError && (
        <PortalAlert
          variant="warning"
          title="Capacidad semanal parcial"
          description={matrixError}
          icon={ClipboardList}
        />
      )}

      <div className="space-y-4">
        {activeMode === 'matrix' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
            <span>Modo recomendación: elige una franja desde la matriz o la lista del panel.</span>
            <Button type="button" variant="secondary" onClick={() => setActiveMode('inbox')}>
              Volver a bandeja
            </Button>
          </div>
        )}

        {activeMode === 'inbox' ? (
          <PendingVisitRequestInbox
            filters={filters}
            response={response}
            crmCustomerNames={crmCustomerNames}
            selectedVisitRequestId={selectedVisitRequestId}
            filterOptions={filterOptions}
            isLoading={isLoadingInbox}
            isLoadingFilterOptions={isLoadingFilterOptions}
            onFiltersChange={(next) => {
              setFeedback(null);
              setFilters(next);
            }}
            onSelect={(visitRequestId) => {
              setSelectedVisitRequestId(visitRequestId);
              setIsDispatchPanelOpen(true);
            }}
            onRefresh={() => {
              setFeedback(null);
              if (!isSalesRole) {
                void loadInbox();
                void loadFilterOptions();
              }
              void loadMatrix();
            }}
          />
        ) : isLoadingMatrix && events.length === 0 && technicians.length === 0 ? (
          <PortalSkeletonBlock className="h-[720px]" />
        ) : (
          <WeeklyTechnicianMatrix
            technicians={technicians}
            events={events}
            availability={availability}
            rangeStart={matrixRange.startAt}
            recommendations={recommendations}
            selectedRecommendationId={selectedRecommendationId}
            onSelectRecommendation={setSelectedRecommendationId}
          />
        )}
      </div>

      {selectedVisitRequest && isDispatchPanelOpen && (
        <VisitRequestRecommendationPanel
          selectedVisitRequest={selectedVisitRequest}
          customerDisplayName={selectedVisitRequestCustomerName}
          techniciansById={techniciansById}
          recommendations={recommendations}
          selectedRecommendationId={selectedRecommendationId}
          isLoadingRecommendations={isLoadingRecommendations}
          recommendationError={recommendationError}
          isSavingContext={isSavingContext}
          onRecommend={async (draft: VisitRecommendationDraft) => {
            if (!selectedVisitRequest) {
              return;
            }

            if (technicians.length === 0) {
              setRecommendationError(
                'No hay técnicos elegibles cargados para calcular recomendaciones.',
              );
              return;
            }

            setIsLoadingRecommendations(true);
            setRecommendationError(null);

            try {
              const nextRecommendations = await wfmApi.visitRequests.recommend(
                selectedVisitRequest.id,
                {
                  durationMinutes: draft.durationMinutes,
                  candidateUserIds: technicians.map((technician) => technician.id),
                  searchHorizonDays: draft.searchHorizonDays,
                  ...(selectedVisitRequest.organizationSiteId
                    ? { organizationSiteId: selectedVisitRequest.organizationSiteId }
                    : {}),
                  municipality: draft.municipality,
                  sector: draft.sector,
                  maxResults: 8,
                },
              );
              setRecommendations(nextRecommendations);
              setSelectedRecommendationId(
                nextRecommendations[0] ? getRecommendationKey(nextRecommendations[0]) : null,
              );
              setActiveMode('matrix');
            } catch (loadError) {
              setRecommendationError(mapPendingVisitError(loadError));
            } finally {
              setIsLoadingRecommendations(false);
            }
          }}
          onSelectRecommendation={setSelectedRecommendationId}
          onSaveContext={async (payload: UpdateWfmVisitRequestContextDto) => {
            if (!selectedVisitRequest) {
              return;
            }

            setIsSavingContext(true);
            try {
              const updated = await wfmApi.visitRequests.updateContext(
                selectedVisitRequest.id,
                payload,
              );
              setFeedback(`La solicitud ${updated.title} actualizó su contexto operativo.`);
              if (isSalesRole) {
                setResponse((current) => upsertVisitRequestResponse(current, updated));
              } else {
                await loadInbox();
              }
            } catch (saveError) {
              throw new Error(mapPendingVisitError(saveError));
            } finally {
              setIsSavingContext(false);
            }
          }}
          onOpenConfirm={() => setIsConfirmOpen(true)}
          onClose={() => {
            setIsDispatchPanelOpen(false);
            setRecommendations([]);
            setSelectedRecommendationId(null);
            setRecommendationError(null);
            setActiveMode('inbox');
          }}
        />
      )}

      <ScheduleVisitRequestConfirmDialog
        open={isConfirmOpen}
        visitRequest={selectedVisitRequest}
        recommendation={selectedRecommendation}
        techniciansById={techniciansById}
        isSubmitting={isScheduling}
        createWorkOrder={scheduleCreateWorkOrder}
        workOrderNotes={scheduleWorkOrderNotes}
        onOpenChange={setIsConfirmOpen}
        onCreateWorkOrderChange={setScheduleCreateWorkOrder}
        onWorkOrderNotesChange={setScheduleWorkOrderNotes}
        onConfirm={async () => {
          if (!selectedVisitRequest || !selectedRecommendation) {
            return;
          }

          setIsScheduling(true);
          try {
            const scheduledVisitRequest = await wfmApi.visitRequests.schedule(
              selectedVisitRequest.id,
              {
                assignedUserId: selectedRecommendation.technicianId,
                scheduledStartAt: selectedRecommendation.scheduledStartAt,
                scheduledEndAt: selectedRecommendation.scheduledEndAt,
                ...(selectedVisitRequest.organizationSiteId
                  ? { organizationSiteId: selectedVisitRequest.organizationSiteId }
                  : {}),
                createWorkOrder: scheduleCreateWorkOrder,
                workOrderNotes: scheduleCreateWorkOrder
                  ? scheduleWorkOrderNotes.trim() || null
                  : null,
              },
            );
            const followUpWarnings: string[] = [];
            let feedbackMessage = `La solicitud ${selectedVisitRequest.title} quedó agendada correctamente.`;

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
                } catch (linkWorkOrderError) {
                  followUpWarnings.push(
                    `La agenda quedó creada, pero no fue posible vincular la orden de trabajo al ticket. ${mapPendingVisitError(linkWorkOrderError)}`,
                  );
                }

                try {
                  await crmApi.linkInstallationOperationalRefs(scheduledVisitRequest.expedienteId, {
                    ticketId: scheduledVisitRequest.ticketId,
                    workOrderId: scheduledVisitRequest.workOrderId,
                  });
                } catch (linkExpedienteError) {
                  followUpWarnings.push(
                    `La agenda quedó creada, pero no fue posible persistir las referencias operativas en CRM. ${mapPendingVisitError(linkExpedienteError)}`,
                  );
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
              } catch (transitionError) {
                followUpWarnings.push(
                  `La agenda quedó creada, pero no fue posible actualizar el estado del expediente. ${mapPendingVisitError(transitionError)}`,
                );
              }
            }

            setFeedback(feedbackMessage);
            setInfoMessage(followUpWarnings.length > 0 ? followUpWarnings.join(' ') : null);
            setIsConfirmOpen(false);
            setIsDispatchPanelOpen(false);

            if (isSalesRole) {
              setResponse((current) => upsertVisitRequestResponse(current, scheduledVisitRequest));
            } else {
              await loadInbox();
            }

            await loadMatrix();
          } catch (scheduleError) {
            setRecommendationError(mapPendingVisitError(scheduleError));
          } finally {
            setIsScheduling(false);
          }
        }}
      />

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nueva solicitud manual</DialogTitle>
            <DialogDescription>
              Registra una solicitud operativa antes de pasar a recomendación y agenda.
            </DialogDescription>
          </DialogHeader>

          {createError && (
            <PortalAlert
              variant="error"
              title="No fue posible crear la solicitud"
              description={createError}
            />
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              id="create-visit-request-work-type"
              label="Tipo de trabajo"
              value={createDraft.workType}
              options={Object.values(WfmWorkType).map((value) => ({
                value,
                label: getWfmWorkTypeLabel(value),
              }))}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  workType: event.target.value as WfmWorkType,
                }))
              }
            />
            <Select
              id="create-visit-request-priority"
              label="Prioridad"
              value={createDraft.priority ?? WorkOrderPriority.NORMAL}
              options={Object.values(WorkOrderPriority).map((value) => ({
                value,
                label: getWorkOrderPriorityLabel(value),
              }))}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  priority: event.target.value as WorkOrderPriority,
                }))
              }
            />
          </div>

          <Input
            id="create-visit-request-title"
            label="Título operativo"
            value={createDraft.title}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, title: event.target.value }))
            }
          />

          <Input
            id="create-visit-request-address"
            label="Dirección operativa"
            value={createDraft.address ?? ''}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, address: event.target.value }))
            }
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              id="create-visit-request-municipality"
              label="Municipio"
              value={createDraft.municipality ?? ''}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, municipality: event.target.value }))
              }
            />
            <Input
              id="create-visit-request-sector"
              label="Sector"
              value={createDraft.sector ?? ''}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, sector: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <DatePicker
                id="create-visit-request-window-start-date"
                label="Inicio de ventana"
                value={toDateFromLocalDateValue(createDraft.requestedWindowStartDate)}
                onChange={(date) =>
                  setCreateDraft((current) => ({
                    ...current,
                    requestedWindowStartDate: date
                      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                      : '',
                  }))
                }
              />
              <Select
                id="create-visit-request-window-start-time"
                label="Hora de inicio"
                value={createDraft.requestedWindowStartTime}
                placeholder="Selecciona una hora"
                options={createTimeOptions}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    requestedWindowStartTime: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <DatePicker
                id="create-visit-request-window-end-date"
                label="Fin de ventana"
                value={toDateFromLocalDateValue(createDraft.requestedWindowEndDate)}
                onChange={(date) =>
                  setCreateDraft((current) => ({
                    ...current,
                    requestedWindowEndDate: date
                      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                      : '',
                  }))
                }
              />
              <Select
                id="create-visit-request-window-end-time"
                label="Hora de fin"
                value={createDraft.requestedWindowEndTime}
                placeholder="Selecciona una hora"
                options={createTimeOptions}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    requestedWindowEndTime: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Nota operativa
            <textarea
              rows={4}
              value={createDraft.description ?? ''}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, description: event.target.value }))
              }
              className="rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-2 dark:text-white"
            />
          </label>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cerrar
            </Button>
            <Button
              type="button"
              loading={isCreateSubmitting}
              onClick={async () => {
                setCreateError(null);
                setIsCreateSubmitting(true);
                try {
                  const created = await wfmApi.visitRequests.create(
                    buildCreatePayload(createDraft),
                  );
                  setFeedback(`La solicitud ${created.title} quedó registrada en la bandeja.`);
                  setCreateDraft(buildCreateDraft());
                  setIsCreateOpen(false);
                  await loadInbox();
                  setSelectedVisitRequestId(created.id);
                } catch (createVisitError) {
                  setCreateError(mapPendingVisitError(createVisitError));
                } finally {
                  setIsCreateSubmitting(false);
                }
              }}
            >
              Crear solicitud
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
