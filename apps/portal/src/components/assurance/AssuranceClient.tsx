'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Ticket, TimerReset, Wrench, Workflow } from 'lucide-react';
import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import { AccessPermissionKey, TicketFieldDecision } from '@iwana/shared';
import type { ListMeta } from '@iwana/shared';
import type {
  AssuranceDashboardSummary,
  AssuranceSlaPolicy,
  AssuranceTicket,
  InternalUser,
  ListAssuranceTicketsParams,
} from '@/lib/api-client';
import { ApiError, assuranceApi } from '@/lib/api-client';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePermissions } from '@/components/access-control/permissions-context';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalDashboardMetric,
  PortalEmptyState,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { AssuranceCreateTicketForm } from './AssuranceCreateTicketForm';
import type { AssuranceCreateTicketSubmitPayload } from './AssuranceCreateTicketForm';
import { AssuranceTicketDrawer } from './AssuranceTicketDrawer';
import { AssuranceTicketsTable } from './AssuranceTicketsTable';
import {
  ASSURANCE_TICKET_PRIORITY_LABELS,
  ASSURANCE_TICKET_TYPE_LABELS,
  getAssuranceTicketTypeLabel,
  getAssuranceUserDisplayName,
} from './assurance-labels';
import { AssuranceAccessState, AssuranceSectionCard } from './assurance-ui';
import { createAssuranceVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';
import { ASSURANCE_TICKET_QUERY_KEY } from './assurance-routes';
import {
  getAssuranceRoleAccess,
  loadOperationalUsers,
  mapAssuranceError,
  useAssuranceTicketDetail,
} from './use-assurance-ticket-detail';

const TICKET_FILTER_KEYS = ['status', 'priority', 'type', 'queueName', 'slaBreachStatus'] as const;
const PAGE_OUT_OF_RANGE_NOTICE = 'Esa página ya no existe. Mostrando la última página disponible.';

function mapAssuranceViewError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'No fue posible cargar la mesa de ayuda porque el servicio no está disponible en este entorno.';
    }
  }

  return mapAssuranceError(error);
}

function AssuranceSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <PortalSkeletonBlock key={index} className="h-32" />
        ))}
      </div>
      <PortalSkeletonBlock className="h-56" />
      <PortalSkeletonBlock className="h-[540px]" />
    </div>
  );
}

function AssuranceClientInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ticketIdParam = searchParams.get(ASSURANCE_TICKET_QUERY_KEY);
  const { user, isLoading: authLoading } = useAuth();
  const { hasPermission } = usePermissions();
  const canManageWfmSchedule = hasPermission(AccessPermissionKey.WFM_SCHEDULE_MANAGE);
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  const {
    page,
    pageSize,
    filters: urlFilters,
    setPage,
    setPageSize,
    setFilters,
    setQuery,
  } = useTableQueryState({
    filterKeys: TICKET_FILTER_KEYS,
    defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
  });

  const [searchValue, setSearchValue] = useState('');
  const [summary, setSummary] = useState<AssuranceDashboardSummary | null>(null);
  const [tickets, setTickets] = useState<AssuranceTicket[]>([]);
  const [ticketsMeta, setTicketsMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [assignees, setAssignees] = useState<InternalUser[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<AssuranceSlaPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const { canView: canViewAssurance, canManage: canManageAssurance } = getAssuranceRoleAccess(
    user?.role,
  );
  const canViewSummary = canManageAssurance;
  const assigneeLabelById = useMemo(
    () => new Map(assignees.map((entry) => [entry.id, getAssuranceUserDisplayName(entry)])),
    [assignees],
  );

  const randomAccess = ticketsMeta.capabilities.randomAccess === true;

  const listFilters = useMemo((): ListAssuranceTicketsParams => {
    const next: ListAssuranceTicketsParams = {
      limit: pageSize,
    };
    // En modo cursor la posición posterior vive solo en memoria; no se envía
    // una página ficticia ni se serializa el cursor en la dirección.
    if (randomAccess && page > 1) {
      next.page = page;
    }
    if (urlFilters.status) {
      next.status = urlFilters.status as ListAssuranceTicketsParams['status'];
    }
    if (urlFilters.priority) {
      next.priority = urlFilters.priority as ListAssuranceTicketsParams['priority'];
    }
    if (urlFilters.type) {
      next.type = urlFilters.type as ListAssuranceTicketsParams['type'];
    }
    if (urlFilters.queueName) {
      next.queueName = urlFilters.queueName as ListAssuranceTicketsParams['queueName'];
    }
    if (urlFilters.slaBreachStatus) {
      next.slaBreachStatus =
        urlFilters.slaBreachStatus as ListAssuranceTicketsParams['slaBreachStatus'];
    }
    return next;
  }, [page, pageSize, randomAccess, urlFilters]);

  /** Filtro local solo sobre la página actual — no miente al pie numerado. */
  const visibleTickets = useMemo(() => {
    if (!searchValue.trim()) {
      return tickets;
    }

    const normalizedQuery = searchValue.trim().toLocaleLowerCase('es-CO');
    return tickets.filter((ticket) =>
      [ticket.ticketNumber, ticket.subject, ticket.requesterRefId, ticket.subjectRefId]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase('es-CO').includes(normalizedQuery)),
    );
  }, [searchValue, tickets]);

  const loadTicketsPage = useCallback(
    async (params: ListAssuranceTicketsParams, opts?: { soft?: boolean; withChrome?: boolean }) => {
      if (!user || !canViewAssurance) {
        return;
      }

      const soft = opts?.soft === true && hasLoadedOnceRef.current;
      const withChrome = opts?.withChrome !== false;

      if (soft) {
        setRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      if (withChrome) {
        setSummaryMessage(null);
      }

      try {
        if (withChrome) {
          const [ticketsResult, usersResult, summaryResult, slaResult] = await Promise.allSettled([
            assuranceApi.tickets.list(params),
            loadOperationalUsers(),
            canViewSummary ? assuranceApi.dashboard.getSummary() : Promise.resolve(null),
            canManageAssurance ? assuranceApi.slaPolicies.list() : Promise.resolve([]),
          ]);

          if (ticketsResult.status === 'rejected') {
            setError(mapAssuranceViewError(ticketsResult.reason));
            setTickets([]);
            setTicketsMeta(EMPTY_LIST_META);
          } else {
            const result = ticketsResult.value;
            const nextMeta = normalizeListMeta(result.meta, {
              dataLength: result.data.length,
              ...(params.limit !== undefined ? { limit: params.limit } : {}),
            });
            const requestedPage = params.page ?? 1;
            const totalPages = nextMeta.totalPages ?? 0;

            if (totalPages > 0 && requestedPage > totalPages) {
              if (!outOfRangeShownRef.current) {
                outOfRangeShownRef.current = true;
                setOutOfRangeNotice(PAGE_OUT_OF_RANGE_NOTICE);
              }
              setQuery({ page: totalPages }, { history: 'replace' });
              return;
            }

            if (result.data.length === 0 && requestedPage > 1 && nextMeta.total > 0) {
              const fallback = Math.max(1, totalPages || requestedPage - 1);
              setQuery({ page: fallback }, { history: 'replace' });
              return;
            }

            setTickets(result.data);
            setTicketsMeta({
              ...nextMeta,
              page: nextMeta.page ?? requestedPage,
              total: result.total ?? nextMeta.total,
            });
            hasLoadedOnceRef.current = true;
          }

          if (usersResult.status === 'fulfilled') {
            setAssignees(usersResult.value);
          }

          if (summaryResult.status === 'fulfilled') {
            setSummary(summaryResult.value);
            if (!summaryResult.value) {
              setSummaryMessage('Resumen no disponible para tu rol actual.');
            }
          } else {
            setSummary(null);
            setSummaryMessage(mapAssuranceError(summaryResult.reason));
          }

          if (slaResult.status === 'fulfilled') {
            setSlaPolicies(slaResult.value);
          } else {
            setSlaPolicies([]);
          }
        } else {
          const result = await assuranceApi.tickets.list(params);
          const nextMeta = normalizeListMeta(result.meta, {
            dataLength: result.data.length,
            ...(params.limit !== undefined ? { limit: params.limit } : {}),
          });
          setTickets(result.data);
          setTicketsMeta({
            ...nextMeta,
            page: nextMeta.page ?? params.page ?? 1,
            total: result.total ?? nextMeta.total,
          });
          hasLoadedOnceRef.current = true;
        }
      } catch (loadError) {
        setError(mapAssuranceViewError(loadError));
        if (!soft) {
          setTickets([]);
          setTicketsMeta(EMPTY_LIST_META);
        }
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
    },
    [canManageAssurance, canViewAssurance, canViewSummary, setQuery, user],
  );

  const loadData = useCallback(async () => {
    await loadTicketsPage(listFilters, { soft: true, withChrome: true });
  }, [listFilters, loadTicketsPage]);

  const handleLoadMoreTickets = useCallback(() => {
    // El contrato actual de Assurance solo expone paginación numerada en sus
    // parámetros tipados. No simulamos páginas ni fabricamos un cursor local.
    if (!randomAccess) return;
  }, [randomAccess]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user || !canViewAssurance) {
      return;
    }

    void loadTicketsPage(listFilters, { soft: true, withChrome: !hasLoadedOnceRef.current });
  }, [authLoading, canViewAssurance, listFilters, loadTicketsPage, user]);

  const pageCount = ticketsMeta.totalPages ?? (ticketsMeta.total > 0 ? 1 : 0);
  const effectivePage = ticketsMeta.page ?? page;
  const { from, to } = listPageWindow({
    page: effectivePage,
    limit: ticketsMeta.limit || pageSize,
    total: ticketsMeta.total,
  });
  const ticketDetail = useAssuranceTicketDetail({ onAfterAction: loadData });
  const { open: openTicketDetail, clearMessages: clearTicketMessages } = ticketDetail;

  /** Escribe o quita `?ticketId=` conservando filtros, página y orden (patrón `?executionOrderId=`). */
  const writeTicketParam = useCallback(
    (ticketId: string | null, history: 'push' | 'replace') => {
      const href = withSearchParams(
        pathname,
        mergeUrlSearchParams(searchParams, { [ASSURANCE_TICKET_QUERY_KEY]: ticketId }),
      );
      if (history === 'push') router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openTicket = useCallback(
    (ticket: AssuranceTicket) => {
      setIsDrawerOpen(true);
      void openTicketDetail(ticket.id, ticket);
      // Abrir añade una entrada al historial: «Atrás» cierra el panel (spec §6 CA-11).
      writeTicketParam(ticket.id, 'push');
    },
    [openTicketDetail, writeTicketParam],
  );

  const closeTicket = useCallback(() => {
    setIsDrawerOpen(false);
    clearTicketMessages();
  }, [clearTicketMessages]);

  // La URL manda (spec §6 CA-11): recargar con `?ticketId=` reabre el panel y «Atrás» (el
  // parámetro desaparece) lo cierra. Solo se reacciona a cambios del parámetro, no a cada render.
  const lastTicketParamRef = useRef<string | null | undefined>(undefined);
  const openedTicketIdRef = useRef<string | null>(null);
  openedTicketIdRef.current = isDrawerOpen ? ticketDetail.ticketId : null;
  useEffect(() => {
    if (authLoading || !user || !canViewAssurance) return;
    const previous = lastTicketParamRef.current;
    lastTicketParamRef.current = ticketIdParam;
    if (previous === ticketIdParam) return;

    if (ticketIdParam) {
      if (openedTicketIdRef.current !== ticketIdParam) {
        setIsDrawerOpen(true);
        void openTicketDetail(ticketIdParam);
      }
    } else if (previous) {
      closeTicket();
    }
  }, [authLoading, canViewAssurance, closeTicket, openTicketDetail, ticketIdParam, user]);

  if (authLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mesa de ayuda"
          subtitle="Cargando tickets, SLA y trazabilidad operativa de la empresa autenticada"
        />
        <AssuranceSkeleton />
      </div>
    );
  }

  if (!user) {
    return <AssuranceAccessState reason="session" />;
  }

  if (!canViewAssurance) {
    return <AssuranceAccessState reason="role" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mesa de ayuda"
        subtitle="Opera tickets, SLA y escalamientos a campo sin salir del portal empresarial."
      />

      {feedback && (
        <PortalAlert variant="success" title="Operación completada" description={feedback} />
      )}
      {error && (
        <PortalAlert variant="error" title="No fue posible cargar la vista" description={error} />
      )}
      {outOfRangeNotice ? (
        <PortalAlert
          variant="warning"
          title="Página fuera de rango"
          description={outOfRangeNotice}
          live="polite"
        />
      ) : null}

      {isLoading && tickets.length === 0 ? (
        <AssuranceSkeleton />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PortalDashboardMetric
              eyebrow="Mesa de ayuda"
              label="Abiertos"
              value={summary?.openCount ?? null}
              icon={Ticket}
              description="Casos sin cierre definitivo en la empresa."
              accent="primary"
            />
            <PortalDashboardMetric
              eyebrow="Mesa de ayuda"
              label="En progreso"
              value={summary?.inProgressCount ?? null}
              icon={Workflow}
              description="Casos actualmente gestionados por soporte o técnico."
              accent="warning"
            />
            <PortalDashboardMetric
              eyebrow="Mesa de ayuda"
              label="En riesgo de incumplir"
              value={summary?.atRiskCount ?? null}
              icon={TimerReset}
              description="Casos que requieren atención prioritaria inmediata."
              accent="danger"
            />
            <PortalDashboardMetric
              eyebrow="Mesa de ayuda"
              label="Visitas técnicas"
              value={summary?.fieldServicePendingCount ?? null}
              icon={Wrench}
              description="Casos ya escalados hacia visita o ejecución externa."
              accent="warning"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <AssuranceSectionCard
              eyebrow="SLA"
              title="Lectura rápida del resumen"
              description="Usa estos contadores solo cuando el backend entregue el dato; si falta, el portal conserva estado vacío."
            >
              {summaryMessage ? (
                <PortalAlert
                  variant="info"
                  title="Resumen parcial"
                  description={summaryMessage}
                  className="mb-4"
                />
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    Por prioridad
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {summary?.byPriority && Object.keys(summary.byPriority).length > 0 ? (
                      Object.entries(summary.byPriority).map(([priority, count]) => (
                        <Badge key={priority} variant="neutral">
                          {ASSURANCE_TICKET_PRIORITY_LABELS[
                            priority as keyof typeof ASSURANCE_TICKET_PRIORITY_LABELS
                          ] ?? priority}
                          : {count}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        No disponible
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    Por tipo
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {summary?.byType && Object.keys(summary.byType).length > 0 ? (
                      Object.entries(summary.byType).map(([type, count]) => (
                        <Badge key={type} variant="neutral">
                          {ASSURANCE_TICKET_TYPE_LABELS[
                            type as keyof typeof ASSURANCE_TICKET_TYPE_LABELS
                          ] ?? getAssuranceTicketTypeLabel(type)}
                          : {count}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        No disponible
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </AssuranceSectionCard>

            <AssuranceSectionCard
              eyebrow="Gestión"
              title="Estados de salida"
              description="Indicadores adicionales entregados por el backend para seguimiento operativo del día."
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    Casos asignados
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {summary?.assignedCount ?? 'No disponible'}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    Resueltos hoy
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {summary?.resolvedTodayCount ?? 'No disponible'}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    SLA vencidos
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {summary?.breachedCount ?? 'No disponible'}
                  </p>
                </div>
              </div>
            </AssuranceSectionCard>
          </div>

          <AssuranceTicketsTable
            tickets={visibleTickets}
            total={ticketsMeta.total}
            isLoading={isLoading}
            refreshing={refreshing}
            randomAccess={randomAccess}
            page={effectivePage}
            pageCount={Math.max(1, pageCount)}
            pageSize={pageSize}
            from={from}
            to={to}
            hasMore={ticketsMeta.hasMore}
            filters={listFilters}
            searchValue={searchValue}
            assigneeLabelById={assigneeLabelById}
            onFiltersChange={(nextFilters) => {
              setFilters({
                status: nextFilters.status ?? null,
                priority: nextFilters.priority ?? null,
                type: nextFilters.type ?? null,
                queueName: nextFilters.queueName ?? null,
                slaBreachStatus: nextFilters.slaBreachStatus ?? null,
              });
            }}
            onSearchChange={setSearchValue}
            onClearFilters={() => {
              setSearchValue('');
              setFilters({
                status: null,
                priority: null,
                type: null,
                queueName: null,
                slaBreachStatus: null,
              });
            }}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onLoadMore={handleLoadMoreTickets}
            onOpenTicket={(ticket) => {
              setFeedback(null);
              openTicket(ticket);
            }}
            onOpenCreate={() => setIsCreateOpen(true)}
            canManage={canManageAssurance}
          />
        </>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crear ticket</DialogTitle>
            <DialogDescription>
              Registra un caso externo o interno usando los contratos ya expuestos por
              `/api/v1/assurance`.
            </DialogDescription>
          </DialogHeader>
          {canManageAssurance ? (
            <AssuranceCreateTicketForm
              assignees={assignees}
              slaPolicies={slaPolicies}
              allowWfmFollowUp={canManageWfmSchedule}
              error={createError}
              isSubmitting={isCreateSubmitting}
              onCancel={() => setIsCreateOpen(false)}
              onSubmit={async ({ ticket, followUpAction }: AssuranceCreateTicketSubmitPayload) => {
                setCreateError(null);
                setFeedback(null);
                setIsCreateSubmitting(true);
                try {
                  const createdTicket = await assuranceApi.tickets.create(ticket);

                  if (
                    ticket.fieldDecision !== TicketFieldDecision.FIELD_SERVICE_REQUIRED ||
                    followUpAction === 'ticket-only' ||
                    !canManageWfmSchedule
                  ) {
                    setIsCreateOpen(false);
                    setFeedback(
                      `El ticket ${createdTicket.ticketNumber ?? createdTicket.id} fue creado.`,
                    );
                    await loadData();
                    return;
                  }

                  const result = await createAssuranceVisitRequestAndRoute({
                    ticketId: createdTicket.id,
                    subject: createdTicket.subject,
                    priority: createdTicket.priority,
                    notes: createdTicket.description,
                    nextAction: followUpAction,
                  });

                  setIsCreateOpen(false);
                  router.push(result.href);
                } catch (createTicketError) {
                  setCreateError(mapAssuranceError(createTicketError));
                } finally {
                  setIsCreateSubmitting(false);
                }
              }}
            />
          ) : (
            <PortalEmptyState
              title="Creación no disponible"
              description="Tu rol puede consultar el módulo, pero no crear nuevos tickets desde el portal."
            />
          )}
        </DialogContent>
      </Dialog>

      <AssuranceTicketDrawer
        open={isDrawerOpen}
        {...ticketDetail.detailProps}
        assignees={assignees}
        canManage={canManageAssurance}
        canOperate={canViewAssurance}
        onCreateLinkedTask={() => {
          const ticketId = ticketDetail.ticketId;
          if (!ticketId) return;
          closeTicket();
          router.push(
            // Emisor actualizado a la URL canónica (F2, spec 2026-09-13 §4.2).
            `/dashboard/operations/tasks/new?ticketId=${encodeURIComponent(ticketId)}&fromAssurance=1`,
          );
        }}
        onClose={() => {
          closeTicket();
          // Cerrar quita `?ticketId=` sin añadir otra entrada al historial.
          writeTicketParam(null, 'replace');
        }}
      />
    </div>
  );
}

export function AssuranceClient() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <PageHeader
            title="Mesa de ayuda"
            subtitle="Cargando tickets, SLA y trazabilidad operativa de la empresa autenticada"
          />
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Cargando mesa de ayuda...
          </div>
        </div>
      }
    >
      <AssuranceClientInner />
    </Suspense>
  );
}
