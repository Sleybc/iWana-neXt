'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ClipboardList } from 'lucide-react';
import { Badge } from '@iwana/ui';
import { UserRole, WorkOrderPriority, WorkOrderSourceContext, WfmWorkType } from '@iwana/shared';
import {
  ApiError,
  assuranceApi,
  crmApi,
  type ListWfmVisitRequestsResponse,
  type UpdateWfmVisitRequestContextDto,
  type WfmVisitRequest,
  type WfmVisitRequestFilterOptionsResponse,
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
  buildDefaultPendingVisitFilters,
  canAccessPendingVisits,
  formatVisitRequestLocationLabel,
  type PendingVisitFilters,
} from './pending-visits-ui';
import {
  formatSchedulingExpedienteLabel,
  formatWfmDayLabel,
  isScheduleEventTerminalStatus,
} from './scheduling-ui';
import { PendingVisitRequestInbox } from './PendingVisitRequestInbox';
import { PendingVisitRequestDetailPanel } from './PendingVisitRequestDetailPanel';
import { buildPendingVisitSchedulingHref } from './pending-visit-scheduling-handoff';
import { toLocalDateValue } from './schedule-event-time';

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

function buildCrmVisitRequestDraft(
  response: Awaited<ReturnType<typeof crmApi.getExpediente>>,
  ticketId: string,
) {
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
  const searchPageLimit = 50;
  const searchMaxPages = 10;

  for (let page = 1; page <= searchMaxPages; page += 1) {
    const listResponse = await crmApi.listExpedientes({
      search: opportunityCode,
      view: 'all',
      includeCompleted: true,
      page,
      limit: searchPageLimit,
    });

    const matchedExpediente = listResponse.data.find((expediente) => {
      const expedienteCode = formatSchedulingExpedienteLabel(expediente.id).toUpperCase();
      return expedienteCode === opportunityCode;
    });

    if (matchedExpediente) {
      return matchedExpediente;
    }

    if (listResponse.data.length < searchPageLimit) {
      break;
    }
  }

  const fullScanPageLimit = 200;
  const fullScanMaxPages = 30;

  for (let page = 1; page <= fullScanMaxPages; page += 1) {
    const listResponse = await crmApi.listExpedientes({
      view: 'all',
      includeCompleted: true,
      page,
      limit: fullScanPageLimit,
    });

    const matchedExpediente = listResponse.data.find((expediente) => {
      const expedienteCode = formatSchedulingExpedienteLabel(expediente.id).toUpperCase();
      return expedienteCode === opportunityCode;
    });

    if (matchedExpediente) {
      return matchedExpediente;
    }

    if (listResponse.data.length < fullScanPageLimit) {
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
  const [filterOptions, setFilterOptions] = useState<WfmVisitRequestFilterOptionsResponse | null>(
    null,
  );
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [isLoadingFilterOptions, setIsLoadingFilterOptions] = useState(false);
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
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
      setFeedback(`La solicitud ${visitRequest.title} quedó abierta en la bandeja.`);

      if (!isSalesRole) {
        await loadInbox(clearedFilters, visitRequest);
        void loadFilterOptions();
      }
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
          // Conservamos el fallback visual actual si no resolvemos el nombre.
        })
        .finally(() => {
          crmCustomerLookupInFlightRef.current.delete(`id:${expedienteId}`);
        });
    });

    pendingOpportunityCodes.forEach((opportunityCode) => {
      crmCustomerLookupInFlightRef.current.add(`code:${opportunityCode}`);

      void findExpedienteByOpportunityCode(opportunityCode)
        .then((matchedExpediente) => {
          if (isCancelled || !matchedExpediente) {
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
          // Conservamos fallback visual actual si no resolvemos el código.
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

  const schedulingHref = selectedVisitRequest
    ? buildPendingVisitSchedulingHref({
        source: 'pending-visits',
        visitRequestId: selectedVisitRequest.id,
        focusDate: selectedVisitRequest.requestedWindowStartAt
          ? toLocalDateValue(selectedVisitRequest.requestedWindowStartAt)
          : null,
      })
    : null;

  if (authLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Visitas pendientes"
          subtitle="Cargando la bandeja operativa de solicitudes por despachar."
        />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_420px]">
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
        subtitle="Bandeja operativa para revisar contexto y enviar solicitudes a la agenda central."
        actions={
          <Badge variant="primary" className="px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
            {formatWfmDayLabel(new Date())}
          </Badge>
        }
      />

      {isSalesRole && (
        <PortalAlert
          variant="info"
          title="Modo CRM asistido"
          description="Como asesor comercial solo puedes operar solicitudes originadas desde CRM abiertas desde un expediente; la bandeja global queda reservada para Operaciones."
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_420px] xl:items-start">
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
          }}
          onRefresh={() => {
            setFeedback(null);
            if (!isSalesRole) {
              void loadInbox();
              void loadFilterOptions();
            }
          }}
        />

        <div className="xl:sticky xl:top-6">
          <PendingVisitRequestDetailPanel
            key={selectedVisitRequest?.id ?? 'empty'}
            selectedVisitRequest={selectedVisitRequest}
            customerDisplayName={selectedVisitRequestCustomerName}
            isSavingContext={isSavingContext}
            schedulingHref={schedulingHref}
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
          />
        </div>
      </div>
    </div>
  );
}
