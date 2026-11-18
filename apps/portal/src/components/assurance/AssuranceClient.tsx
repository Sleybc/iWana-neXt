'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Loader2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import {
  AccessPermissionKey,
  AssuranceWorkQueueSchema,
  TicketFieldDecision,
  TicketListSearchSchema,
  TicketStatus,
} from '@iwana/shared';
import type { AssuranceWorkQueue, ListMeta } from '@iwana/shared';
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
  PortalEmptyState,
  PortalFilterChip,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { AssuranceCreateTicketForm } from './AssuranceCreateTicketForm';
import type { AssuranceCreateTicketSubmitPayload } from './AssuranceCreateTicketForm';
import { AssuranceTicketDrawer } from './AssuranceTicketDrawer';
import { AssuranceTicketsTable } from './AssuranceTicketsTable';
import {
  ASSURANCE_INBOX_QUEUES,
  ASSURANCE_TICKET_PRIORITY_LABELS,
  ASSURANCE_TICKET_TYPE_LABELS,
  getAssuranceDefaultInboxQueue,
  getAssuranceQueueLabel,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketTypeLabel,
  getAssuranceUserDisplayName,
} from './assurance-labels';
import type { AssuranceInboxQueue } from './assurance-labels';
import { AssuranceAccessState } from './assurance-ui';
import { createAssuranceVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';
import { ASSURANCE_TICKET_QUERY_KEY } from './assurance-routes';
import {
  getAssuranceRoleAccess,
  loadOperationalUsers,
  mapAssuranceError,
  useAssuranceTicketDetail,
} from './use-assurance-ticket-detail';

const LIST_FILTER_KEYS = ['status', 'priority', 'type', 'queueName', 'slaBreachStatus'] as const;
/** `queue` = cola de trabajo del servidor (spec §3 J); `search` = búsqueda de servidor (§3 K). */
const TICKET_FILTER_KEYS = [...LIST_FILTER_KEYS, 'queue', 'search'] as const;
const SEARCH_DEBOUNCE_MS = 300;
const CLEARED_LIST_FILTERS = {
  status: null,
  priority: null,
  type: null,
  queueName: null,
  slaBreachStatus: null,
} as const;
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
    <div className="space-y-4" aria-busy="true">
      <PortalSkeletonBlock className="h-40" />
      <PortalSkeletonBlock className="h-[540px]" />
    </div>
  );
}

/**
 * Cola activa según la URL (spec §3 B y J, CA-3, CA-4). Un `?queue=` válido manda y se pide al
 * servidor como `workQueue`. Sin filtros ni `queue`, la cola por defecto del rol (D2). Con filtros de
 * un enlace entrante (H10) y sin `queue`, no se envía cola: la lista llega igual que antes y se marca
 * la cola equivalente si la hay.
 */
function resolveInboxQueue(
  urlFilters: Record<string, string>,
  defaultQueue: 'mine' | 'all',
): { workQueue: AssuranceWorkQueue | null; active: AssuranceInboxQueue | null } {
  const queueParam = AssuranceWorkQueueSchema.safeParse(urlFilters.queue);
  if (queueParam.success) return { workQueue: queueParam.data, active: queueParam.data };
  const hasListFilters = LIST_FILTER_KEYS.some((key) => Boolean(urlFilters[key]));
  if (!hasListFilters) return { workQueue: defaultQueue, active: defaultQueue };
  const status = urlFilters.status || undefined;
  const slaBreachStatus = urlFilters.slaBreachStatus || undefined;
  const match = ASSURANCE_INBOX_QUEUES.find(
    (queue) =>
      (queue.filters.status || queue.filters.slaBreachStatus) &&
      queue.filters.status === status &&
      queue.filters.slaBreachStatus === slaBreachStatus,
  );
  if (match) return { workQueue: null, active: match.value };
  return { workQueue: null, active: !status && !slaBreachStatus ? 'all' : null };
}

function AssuranceClientInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ticketIdParam = searchParams.get(ASSURANCE_TICKET_QUERY_KEY);
  const { user, isLoading: authLoading } = useAuth();
  const { hasPermission } = usePermissions();
  const canManageWfmSchedule = hasPermission(AccessPermissionKey.WFM_SCHEDULE_MANAGE);
  // K: sin `crm.subscribers.read` el servidor solo busca por número y asunto (spec §4).
  const canSearchByClient = hasPermission(AccessPermissionKey.CRM_SUBSCRIBERS_READ);
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

  const urlSearch = urlFilters.search ?? '';
  const [searchValue, setSearchValue] = useState(urlSearch);
  /** Último valor de búsqueda escrito en (o leído de) la URL; evita pisar lo que se está tecleando. */
  const lastUrlSearchRef = useRef(urlSearch);
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
  const [assigningTicketId, setAssigningTicketId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const { canView: canViewAssurance, canManage: canManageAssurance } = getAssuranceRoleAccess(
    user?.role,
  );
  const canViewSummary = canManageAssurance;
  const assigneeLabelById = useMemo(
    () => new Map(assignees.map((entry) => [entry.id, getAssuranceUserDisplayName(entry)])),
    [assignees],
  );

  const randomAccess = ticketsMeta.capabilities.randomAccess === true;
  const inboxQueue = useMemo(
    () => resolveInboxQueue(urlFilters, getAssuranceDefaultInboxQueue(user?.role)),
    [urlFilters, user?.role],
  );

  const listFilters = useMemo((): ListAssuranceTicketsParams => {
    // H: orden de urgencia por defecto; con `order` no se envían `sortBy` ni `sortDir`.
    const next: ListAssuranceTicketsParams = {
      limit: pageSize,
      order: 'urgency',
    };
    if (inboxQueue.workQueue) {
      next.workQueue = inboxQueue.workQueue;
    }
    // Fuera de 2–100 caracteres el API responde 400: se omite (contrato TicketListSearchSchema).
    const search = TicketListSearchSchema.safeParse(urlFilters.search ?? '');
    if (search.success) {
      next.search = search.data;
    }
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
  }, [inboxQueue.workQueue, page, pageSize, randomAccess, urlFilters]);

  // K: la búsqueda va a la URL tras una pausa y de ahí al servidor (ya no filtra la página).
  useEffect(() => {
    const parsed = TicketListSearchSchema.safeParse(searchValue);
    const next = parsed.success ? parsed.data : '';
    if (next === lastUrlSearchRef.current) return undefined;
    const handle = setTimeout(() => {
      lastUrlSearchRef.current = next;
      setFilters({ search: next || null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchValue, setFilters]);

  // La URL manda: «Atrás» o un enlace con otra búsqueda actualizan el campo.
  useEffect(() => {
    if (urlSearch === lastUrlSearchRef.current) return;
    lastUrlSearchRef.current = urlSearch;
    setSearchValue(urlSearch);
  }, [urlSearch]);

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

  const selectInboxQueue = useCallback(
    (queue: AssuranceInboxQueue) => {
      // J: la cola va en la URL y al servidor; el estado y el plazo de un enlace entrante se quitan
      // para no acotarla sin que se vea. Prioridad, tipo y área se conservan.
      setFilters({ queue, status: null, slaBreachStatus: null });
    },
    [setFilters],
  );

  /** G · «Asignarme» sin abrir el ticket; la guarda es `canManage` (D4). */
  const assignToMe = useCallback(
    async (ticket: AssuranceTicket) => {
      if (!user || !canManageAssurance) return;
      setAssignError(null);
      setFeedback(null);
      setAssigningTicketId(ticket.id);
      try {
        await assuranceApi.tickets.assign(ticket.id, { assignedUserId: user.id });
        setFeedback(`El ticket ${ticket.ticketNumber} quedó asignado a ti.`);
        await loadData();
      } catch (assignTicketError) {
        setAssignError(mapAssuranceError(assignTicketError));
      } finally {
        setAssigningTicketId(null);
      }
    },
    [canManageAssurance, loadData, user],
  );

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
        <PageHeader title="Mesa de ayuda" />
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

  const queueChips = (
    // B/J · Colas de trabajo; el conteo de cada una sale de `byWorkQueue` (SQL, CA-10).
    <div className="overflow-x-auto overscroll-x-contain md:overflow-x-visible">
      <div
        role="group"
        aria-label="Colas de trabajo"
        className="flex w-max flex-nowrap gap-2 md:w-auto md:flex-wrap"
      >
        {ASSURANCE_INBOX_QUEUES.map((queue) => (
          <PortalFilterChip
            key={queue.value}
            active={inboxQueue.active === queue.value}
            onClick={() => selectInboxQueue(queue.value)}
            count={summary?.byWorkQueue?.[queue.value]}
            className="shrink-0"
          >
            {queue.label}
          </PortalFilterChip>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {feedback && (
        <PortalAlert variant="success" title="Operación completada" description={feedback} />
      )}
      {error && (
        <PortalAlert variant="error" title="No fue posible cargar la vista" description={error} />
      )}
      {assignError && (
        <PortalAlert
          variant="error"
          title="No fue posible asignarte el ticket"
          description={assignError}
        />
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
          <AssuranceTicketsTable
            tickets={tickets}
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
            searchByClient={canSearchByClient}
            assigneeLabelById={assigneeLabelById}
            queues={queueChips}
            queueEmptyState={
              inboxQueue.workQueue === 'mine' ? (
                <PortalEmptyState
                  title="No tienes tickets asignados"
                  description="Cuando te asignen un ticket aparecerá en esta cola."
                  className="mx-auto max-w-xl text-left"
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => selectInboxQueue('all')}
                    >
                      Ver todos los tickets
                    </Button>
                  }
                />
              ) : undefined
            }
            onFiltersChange={(nextFilters) => {
              setFilters({
                // QA1-D1 (CA-3): filtrar dentro de una cola la conserva en la URL.
                queue: inboxQueue.workQueue,
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
              lastUrlSearchRef.current = '';
              setFilters({ ...CLEARED_LIST_FILTERS, queue: null, search: null });
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
            onAssignToMe={(ticket) => void assignToMe(ticket)}
            assigningTicketId={assigningTicketId}
          />

          {canViewSummary ? (
            // F · Resumen plegado al pie, con el mismo alcance de rol que antes.
            <details className="group rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3 text-sm font-semibold text-gray-900 dark:text-white [&::-webkit-details-marker]:hidden">
                Resumen de la mesa de ayuda
                <ChevronDown
                  className="h-4 w-4 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="space-y-4 border-t border-gray-100 px-5 py-4 dark:border-dark-border">
                {summaryMessage ? (
                  <PortalAlert
                    variant="info"
                    title="Resumen parcial"
                    description={summaryMessage}
                  />
                ) : null}
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {(
                    [
                      [getAssuranceTicketStatusLabel(TicketStatus.OPEN), summary?.openCount],
                      [
                        getAssuranceTicketStatusLabel(TicketStatus.ASSIGNED),
                        summary?.assignedCount,
                      ],
                      [
                        getAssuranceTicketStatusLabel(TicketStatus.IN_PROGRESS),
                        summary?.inProgressCount,
                      ],
                      ['Resueltos hoy', summary?.resolvedTodayCount],
                      ['Plazo de atención vencido', summary?.breachedCount],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl bg-iwana-surface-soft px-4 py-3 dark:bg-dark-surface-3"
                    >
                      <dt className="text-xs text-gray-600 dark:text-gray-300">{label}</dt>
                      <dd className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-white">
                        {value ?? 'No disponible'}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="grid gap-4 md:grid-cols-3">
                  {(
                    [
                      [
                        'Por prioridad',
                        summary?.byPriority,
                        (key: string) =>
                          ASSURANCE_TICKET_PRIORITY_LABELS[
                            key as keyof typeof ASSURANCE_TICKET_PRIORITY_LABELS
                          ] ?? key,
                      ],
                      [
                        'Por tipo',
                        summary?.byType,
                        (key: string) =>
                          ASSURANCE_TICKET_TYPE_LABELS[
                            key as keyof typeof ASSURANCE_TICKET_TYPE_LABELS
                          ] ?? getAssuranceTicketTypeLabel(key),
                      ],
                      ['Por área', summary?.byQueue, (key: string) => getAssuranceQueueLabel(key)],
                    ] as const
                  ).map(([title, counts, labelOf]) => (
                    <div key={title}>
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                        {title}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {counts && Object.keys(counts).length > 0 ? (
                          Object.entries(counts).map(([key, count]) => (
                            <Badge key={key} variant="neutral">
                              {labelOf(key)}: {count}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            No disponible
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ) : null}
        </>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crear ticket</DialogTitle>
            <DialogDescription>
              Registra el caso de un cliente o un caso interno de la empresa.
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
          <PageHeader title="Mesa de ayuda" />
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
