'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert, Ticket, TimerReset, Wrench, Workflow } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import { UserRole } from '@iwana/shared';
import type {
  AddAssuranceCommentDto,
  AssuranceDashboardSummary,
  AssuranceSlaPolicy,
  AssuranceTicket,
  AssuranceTicketComment,
  AssuranceTimelineEvent,
  AssignAssuranceTicketDto,
  InternalUser,
  LinkAssuranceWorkOrderDto,
  ListAssuranceTicketsParams,
  RequestAssuranceFieldServiceDto,
  TransitionAssuranceTicketDto,
} from '@/lib/api-client';
import { ApiError, assuranceApi, usersApi } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { PortalAlert, PortalEmptyState, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { AssuranceCreateTicketForm } from './AssuranceCreateTicketForm';
import { AssuranceTicketDrawer } from './AssuranceTicketDrawer';
import { AssuranceTicketsTable } from './AssuranceTicketsTable';
import {
  ASSURANCE_TICKET_PRIORITY_LABELS,
  ASSURANCE_TICKET_TYPE_LABELS,
  getAssuranceTicketTypeLabel,
  getAssuranceUserDisplayName,
} from './assurance-labels';
import { AssuranceSectionCard } from './assurance-ui';

const USERS_PAGE_SIZE = 100;

function mapAssuranceError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente para continuar.';
    if (error.status === 403)
      return 'No tienes permisos para operar esta vista de la mesa de ayuda.';
    if (error.status === 404) return 'El ticket consultado ya no está disponible.';
    return error.message;
  }

  return 'No fue posible completar la operación. Intenta de nuevo.';
}

function mapAssuranceViewError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'No fue posible cargar la mesa de ayuda porque el servicio no está disponible en este entorno.';
    }
  }

  return mapAssuranceError(error);
}

function buildDefaultFilters(): ListAssuranceTicketsParams {
  return { page: 1, limit: 20 };
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

export function AssuranceClient() {
  const { user, isLoading: authLoading } = useAuth();
  const [filters, setFilters] = useState<ListAssuranceTicketsParams>(() => buildDefaultFilters());
  const [searchValue, setSearchValue] = useState('');
  const [summary, setSummary] = useState<AssuranceDashboardSummary | null>(null);
  const [tickets, setTickets] = useState<AssuranceTicket[]>([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [assignees, setAssignees] = useState<InternalUser[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<AssuranceSlaPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState<AssuranceTicket | null>(null);
  const [comments, setComments] = useState<AssuranceTicketComment[]>([]);
  const [timeline, setTimeline] = useState<AssuranceTimelineEvent[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDrawerLoading, setIsDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
  const [isTransitionSubmitting, setIsTransitionSubmitting] = useState(false);
  const [isAssignmentSubmitting, setIsAssignmentSubmitting] = useState(false);
  const [isFieldServiceSubmitting, setIsFieldServiceSubmitting] = useState(false);
  const [isLinkingWorkOrder, setIsLinkingWorkOrder] = useState(false);

  const canViewAssurance =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.NOC ||
    user?.role === UserRole.SUPPORT ||
    user?.role === UserRole.TECHNICIAN ||
    user?.role === UserRole.CONTRACTOR;
  const canManageAssurance =
    user?.role === UserRole.ADMIN || user?.role === UserRole.NOC || user?.role === UserRole.SUPPORT;
  const canViewSummary = canManageAssurance;
  const assigneeLabelById = useMemo(
    () => new Map(assignees.map((user) => [user.id, getAssuranceUserDisplayName(user)])),
    [assignees],
  );

  const filteredTickets = useMemo(() => {
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

  const loadData = useCallback(async () => {
    if (!user || !canViewAssurance) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setSummaryMessage(null);

    const [ticketsResult, usersResult, summaryResult, slaResult] = await Promise.allSettled([
      assuranceApi.tickets.list(filters),
      loadOperationalUsers(),
      canViewSummary ? assuranceApi.dashboard.getSummary() : Promise.resolve(null),
      canManageAssurance ? assuranceApi.slaPolicies.list() : Promise.resolve([]),
    ]);

    if (ticketsResult.status === 'rejected') {
      setError(mapAssuranceViewError(ticketsResult.reason));
      setTickets([]);
      setTotalTickets(0);
    } else {
      setTickets(ticketsResult.value.data);
      setTotalTickets(ticketsResult.value.total);
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

    setIsLoading(false);
  }, [canManageAssurance, canViewAssurance, canViewSummary, filters, user]);

  const refreshSelectedTicket = useCallback(async (ticketId: string) => {
    const [ticketResult, commentsResult, timelineResult] = await Promise.allSettled([
      assuranceApi.tickets.get(ticketId),
      assuranceApi.tickets.listComments(ticketId),
      assuranceApi.tickets.listTimeline(ticketId),
    ]);

    if (ticketResult.status === 'rejected') {
      throw ticketResult.reason;
    }

    setSelectedTicket(ticketResult.value);
    setComments(commentsResult.status === 'fulfilled' ? commentsResult.value : []);
    setTimeline(timelineResult.status === 'fulfilled' ? timelineResult.value : []);
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user || !canViewAssurance) {
      return;
    }

    void loadData();
  }, [authLoading, canViewAssurance, loadData, user]);

  const openTicket = useCallback(
    async (ticket: AssuranceTicket) => {
      setIsDrawerOpen(true);
      setSelectedTicket(ticket);
      setComments([]);
      setTimeline([]);
      setDrawerError(null);
      setActionFeedback(null);
      setActionError(null);
      setIsDrawerLoading(true);

      try {
        await refreshSelectedTicket(ticket.id);
      } catch (drawerLoadError) {
        setDrawerError(mapAssuranceError(drawerLoadError));
      } finally {
        setIsDrawerLoading(false);
      }
    },
    [refreshSelectedTicket],
  );

  const reloadAfterAction = useCallback(
    async (ticketId: string, successMessage: string) => {
      await Promise.all([loadData(), refreshSelectedTicket(ticketId)]);
      setActionFeedback(successMessage);
      setActionError(null);
    },
    [loadData, refreshSelectedTicket],
  );

  if (authLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mesa de ayuda"
          subtitle="Cargando tickets, SLA y trazabilidad operativa del tenant autenticado"
        />
        <AssuranceSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mesa de ayuda" subtitle="Error al cargar el módulo" />
        <PortalAlert
          variant="error"
          title="Módulo temporalmente no disponible"
          description="No fue posible resolver la sesión del portal para cargar la mesa de ayuda. Inicia sesión nuevamente para recuperar el acceso."
          icon={AlertTriangle}
        />
      </div>
    );
  }

  if (!canViewAssurance) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mesa de ayuda" subtitle="Acceso restringido" />
        <PortalAlert
          variant="warning"
          title="Tu rol no tiene acceso a esta vista"
          description="La mesa de ayuda del portal solo está disponible para operación de soporte, NOC y equipos técnicos autorizados."
          icon={ShieldAlert}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mesa de ayuda"
        subtitle="Opera tickets, SLA y escalamientos a campo sin salir del portal empresarial."
        actions={
          canManageAssurance ? (
            <Button type="button" onClick={() => setIsCreateOpen(true)}>
              Nuevo ticket
            </Button>
          ) : undefined
        }
      />

      {feedback && (
        <PortalAlert variant="success" title="Operación completada" description={feedback} />
      )}
      {error && (
        <PortalAlert variant="error" title="No fue posible cargar la vista" description={error} />
      )}

      {isLoading && tickets.length === 0 ? (
        <AssuranceSkeleton />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Abiertos"
              value={summary?.openCount ?? null}
              icon={Ticket}
              description="Casos sin cierre definitivo en el tenant."
            />
            <MetricCard
              label="En progreso"
              value={summary?.inProgressCount ?? null}
              icon={Workflow}
              description="Casos actualmente gestionados por soporte o técnico."
              tone="warning"
            />
            <MetricCard
              label="En riesgo SLA"
              value={summary?.atRiskCount ?? null}
              icon={TimerReset}
              description="Tickets que requieren atención prioritaria inmediata."
              tone="secondary"
            />
            <MetricCard
              label="Trabajo de campo"
              value={summary?.fieldServicePendingCount ?? null}
              icon={Wrench}
              description="Casos ya escalados hacia visita o ejecución externa."
              tone="warning"
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
            tickets={filteredTickets}
            total={totalTickets}
            isLoading={isLoading}
            filters={filters}
            searchValue={searchValue}
            assigneeLabelById={assigneeLabelById}
            onFiltersChange={(nextFilters) => setFilters({ ...nextFilters, page: 1, limit: 20 })}
            onSearchChange={setSearchValue}
            onOpenTicket={(ticket) => {
              setFeedback(null);
              void openTicket(ticket);
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
              error={createError}
              isSubmitting={isCreateSubmitting}
              onCancel={() => setIsCreateOpen(false)}
              onSubmit={async (payload) => {
                setCreateError(null);
                setFeedback(null);
                setIsCreateSubmitting(true);
                try {
                  await assuranceApi.tickets.create(payload);
                  setIsCreateOpen(false);
                  setFeedback('El ticket quedó registrado correctamente.');
                  await loadData();
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
        ticket={selectedTicket}
        comments={comments}
        timeline={timeline}
        assignees={assignees}
        isLoading={isDrawerLoading}
        error={drawerError}
        actionFeedback={actionFeedback}
        actionError={actionError}
        isCommentSubmitting={isCommentSubmitting}
        isTransitionSubmitting={isTransitionSubmitting}
        isAssignmentSubmitting={isAssignmentSubmitting}
        isFieldServiceSubmitting={isFieldServiceSubmitting}
        isLinkingWorkOrder={isLinkingWorkOrder}
        canManage={canManageAssurance}
        canOperate={canViewAssurance}
        onClose={() => {
          setIsDrawerOpen(false);
          setActionError(null);
          setActionFeedback(null);
        }}
        onAddComment={async (payload: AddAssuranceCommentDto) => {
          if (!selectedTicket) return;
          setIsCommentSubmitting(true);
          try {
            await assuranceApi.tickets.addComment(selectedTicket.id, payload);
            await reloadAfterAction(selectedTicket.id, 'Comentario registrado.');
          } catch (commentError) {
            setActionError(mapAssuranceError(commentError));
          } finally {
            setIsCommentSubmitting(false);
          }
        }}
        onTransitionStatus={async (payload: TransitionAssuranceTicketDto) => {
          if (!selectedTicket) return;
          setIsTransitionSubmitting(true);
          try {
            await assuranceApi.tickets.transitionStatus(selectedTicket.id, payload);
            await reloadAfterAction(selectedTicket.id, 'Estado actualizado.');
          } catch (transitionError) {
            setActionError(mapAssuranceError(transitionError));
          } finally {
            setIsTransitionSubmitting(false);
          }
        }}
        onAssign={async (payload: AssignAssuranceTicketDto) => {
          if (!selectedTicket) return;
          setIsAssignmentSubmitting(true);
          try {
            await assuranceApi.tickets.assign(selectedTicket.id, payload);
            await reloadAfterAction(selectedTicket.id, 'Asignación actualizada.');
          } catch (assignError) {
            setActionError(mapAssuranceError(assignError));
          } finally {
            setIsAssignmentSubmitting(false);
          }
        }}
        onRequestFieldService={async (payload: RequestAssuranceFieldServiceDto) => {
          if (!selectedTicket) return;
          setIsFieldServiceSubmitting(true);
          try {
            await assuranceApi.tickets.requestFieldService(selectedTicket.id, payload);
            await reloadAfterAction(
              selectedTicket.id,
              'Escalamiento a trabajo de campo registrado.',
            );
          } catch (fieldServiceError) {
            setActionError(mapAssuranceError(fieldServiceError));
          } finally {
            setIsFieldServiceSubmitting(false);
          }
        }}
        onLinkWorkOrder={async (payload: LinkAssuranceWorkOrderDto) => {
          if (!selectedTicket) return;
          setIsLinkingWorkOrder(true);
          try {
            await assuranceApi.tickets.linkWorkOrder(selectedTicket.id, payload);
            await reloadAfterAction(selectedTicket.id, 'Work order vinculada al ticket.');
          } catch (linkError) {
            setActionError(mapAssuranceError(linkError));
          } finally {
            setIsLinkingWorkOrder(false);
          }
        }}
      />
    </div>
  );
}
