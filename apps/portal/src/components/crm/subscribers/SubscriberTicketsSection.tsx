'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TicketStatus } from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import { ArrowUpRight, Paperclip } from 'lucide-react';
import type { AssuranceTicket, InternalUser, SubscriberRecord } from '@/lib/api-client';
import { assuranceApi } from '@/lib/api-client';
import {
  formatAssuranceDateTime,
  getAssuranceUserDisplayName,
  getAssuranceTicketPriorityLabel,
  getAssuranceTicketPriorityVariant,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketStatusVariant,
} from '@/components/assurance/assurance-labels';
import { formatTicketAttachmentCount } from '@/components/assurance/ticket-attachments';
import {
  PortalAlert,
  PortalEmptyState,
  PortalFilterChip,
  PortalPanel,
  PortalSkeletonBlock,
  portalFilterChipGroupClassName,
} from '@/components/shared/portal-ui';
import { formatBillingShortDate } from './billing-cycle-ui';

interface SubscriberTicketsSectionProps {
  subscriber: SubscriberRecord;
  canRead: boolean;
  refreshKey: number;
  onOpenTicket: (ticket: AssuranceTicket, opener: HTMLButtonElement) => void;
  /** Acción de la cabecera del panel (p. ej. «Crear ticket»). */
  actions?: ReactNode;
  /** Usuarios internos ya cargados por la pestaña: nombre del responsable en cada fila. */
  users?: readonly InternalUser[];
}

type TicketFilter = 'abiertos' | 'cerrados' | 'todos';

const CLOSED_STATUSES = new Set<TicketStatus>([
  TicketStatus.RESOLVED,
  TicketStatus.CLOSED,
  TicketStatus.CANCELLED,
]);

/** Ticket sin resolver, cerrar ni cancelar; lo usa también la Vista general. */
export function isActiveTicket(ticket: Pick<AssuranceTicket, 'status'>): boolean {
  return !CLOSED_STATUSES.has(ticket.status);
}

function getTicketSlaDeadline(ticket: AssuranceTicket): number {
  const deadlines = [
    !ticket.firstRespondedAt ? ticket.slaFirstResponseAt : null,
    ticket.resolvedAt || ticket.closedAt ? null : ticket.slaResolveByAt,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);

  return deadlines.length ? Math.min(...deadlines) : Number.POSITIVE_INFINITY;
}

export function compareTickets(left: AssuranceTicket, right: AssuranceTicket): number {
  const leftClosed = CLOSED_STATUSES.has(left.status);
  const rightClosed = CLOSED_STATUSES.has(right.status);
  if (leftClosed !== rightClosed) return leftClosed ? 1 : -1;

  if (!leftClosed) {
    const slaDifference = getTicketSlaDeadline(left) - getTicketSlaDeadline(right);
    if (slaDifference !== 0) return slaDifference;
  }

  const leftUpdated = Date.parse(left.closedAt ?? left.updatedAt ?? left.createdAt);
  const rightUpdated = Date.parse(right.closedAt ?? right.updatedAt ?? right.createdAt);
  return (
    (Number.isFinite(rightUpdated) ? rightUpdated : 0) -
    (Number.isFinite(leftUpdated) ? leftUpdated : 0)
  );
}

function TicketRow({
  ticket,
  assignee,
  onOpen,
}: {
  ticket: AssuranceTicket;
  assignee: InternalUser | null;
  onOpen: (ticket: AssuranceTicket, opener: HTMLButtonElement) => void;
}) {
  const active = isActiveTicket(ticket);
  // El vencimiento solo informa en tickets abiertos con SLA; en cerrados o importados es ruido.
  const slaDeadline = active ? getTicketSlaDeadline(ticket) : Number.POSITIVE_INFINITY;
  const description = ticket.description?.trim();
  const attachmentCount = ticket.attachmentCount ?? 0;
  const attachmentsLabel =
    attachmentCount > 0 ? formatTicketAttachmentCount(attachmentCount) : null;

  return (
    <li className="border-b border-gray-100 last:border-b-0 dark:border-dark-border">
      <button
        type="button"
        className="w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-iwana-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:hover:bg-dark-surface-3"
        aria-label={`Abrir ticket ${ticket.ticketNumber}: ${ticket.subject}${attachmentsLabel ? `, con ${attachmentsLabel}` : ''}`}
        onClick={(event) => onOpen(ticket, event.currentTarget)}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-gray-600 dark:text-gray-300">
              <span className="font-mono font-semibold text-iwana-secondary-700 dark:text-gray-300">
                {ticket.ticketNumber}
              </span>
              <span aria-hidden="true">·</span>
              <span>Abierto el {formatBillingShortDate(ticket.createdAt)}</span>
              {attachmentsLabel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    data-testid="ticket-attachment-clip"
                    title={`Con ${attachmentsLabel}`}
                    className="inline-flex items-center gap-1"
                  >
                    <Paperclip className="h-3.5 w-3.5" aria-hidden />
                    <span aria-hidden="true">{attachmentCount}</span>
                    <span className="sr-only">Con {attachmentsLabel}</span>
                  </span>
                </>
              ) : null}
            </span>
            <span className="mt-1 block text-sm font-medium text-gray-900 dark:text-white">
              {ticket.subject}
            </span>
            {description ? (
              <span className="mt-1 line-clamp-2 block text-xs text-gray-600 dark:text-gray-300">
                {description}
              </span>
            ) : null}
          </span>
          <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={getAssuranceTicketStatusVariant(ticket.status)}>
            {getAssuranceTicketStatusLabel(ticket.status)}
          </Badge>
          <Badge variant={getAssuranceTicketPriorityVariant(ticket.priority)}>
            {getAssuranceTicketPriorityLabel(ticket.priority)}
          </Badge>
          <span className="text-xs text-gray-600 dark:text-gray-300">
            {assignee ? `Responsable: ${getAssuranceUserDisplayName(assignee)}` : 'Sin responsable'}
          </span>
        </span>
        {Number.isFinite(slaDeadline) ? (
          <span className="mt-2 block text-xs text-gray-600 dark:text-gray-300">
            Vence el {formatAssuranceDateTime(new Date(slaDeadline))}
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function SubscriberTicketsSection({
  subscriber,
  canRead,
  refreshKey,
  onOpenTicket,
  actions,
  users,
}: SubscriberTicketsSectionProps) {
  const [tickets, setTickets] = useState<AssuranceTicket[]>([]);
  const [filter, setFilter] = useState<TicketFilter | null>(null);
  const usersById = useMemo(() => new Map((users ?? []).map((user) => [user.id, user])), [users]);
  const openCount = tickets.filter(isActiveTicket).length;
  const closedCount = tickets.length - openCount;
  // Por defecto los abiertos, que son los que requieren atención; si no hay, todos.
  const activeFilter: TicketFilter = filter ?? (openCount > 0 ? 'abiertos' : 'todos');
  const visibleTickets = tickets.filter((ticket) =>
    activeFilter === 'todos'
      ? true
      : activeFilter === 'abiertos'
        ? isActiveTicket(ticket)
        : !isActiveTicket(ticket),
  );
  const [loading, setLoading] = useState(canRead);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!canRead || subscriber.privacyRestricted) return;

    setLoading(true);
    setError(false);
    try {
      const response = await assuranceApi.tickets.list({ subscriberId: subscriber.id, limit: 100 });
      setTickets([...response.data].sort(compareTickets));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [canRead, subscriber.id, subscriber.privacyRestricted]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets, refreshKey]);

  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setShowSkeleton(true), 300);
    return () => window.clearTimeout(timeoutId);
  }, [loading]);

  const content = useMemo(() => {
    if (!canRead) {
      return (
        <PortalAlert
          variant="warning"
          title="No tienes acceso a los tickets"
          description="Solicita el permiso de lectura de tickets para consultar esta información."
        />
      );
    }
    if (loading && showSkeleton) {
      return (
        <div className="space-y-3" aria-label="Cargando tickets" aria-busy="true">
          <PortalSkeletonBlock className="h-24 rounded-xl" />
          <PortalSkeletonBlock className="h-24 rounded-xl" />
        </div>
      );
    }
    if (loading) {
      return (
        <p className="text-sm text-gray-600 dark:text-gray-300" role="status">
          Cargando tickets…
        </p>
      );
    }
    if (error) {
      return (
        <PortalAlert
          variant="error"
          title="No fue posible cargar los tickets"
          description="Intenta de nuevo para consultar los tickets vinculados."
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadTickets()}>
              Reintentar
            </Button>
          }
        />
      );
    }
    if (tickets.length === 0) {
      return (
        <PortalEmptyState
          embedded
          title="Este suscriptor no tiene tickets"
          description="Los tickets relacionados con este suscriptor aparecerán aquí."
        />
      );
    }
    const filters: Array<{ id: TicketFilter; label: string; count: number }> = [
      { id: 'abiertos', label: 'Abiertos', count: openCount },
      { id: 'cerrados', label: 'Cerrados', count: closedCount },
      { id: 'todos', label: 'Todos', count: tickets.length },
    ];
    return (
      <div className="space-y-3">
        <div role="group" aria-label="Filtrar tickets" className={portalFilterChipGroupClassName}>
          {filters.map((item) => (
            <PortalFilterChip
              key={item.id}
              active={activeFilter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label} ({item.count})
            </PortalFilterChip>
          ))}
        </div>
        {visibleTickets.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300" role="status">
            {activeFilter === 'abiertos' ? 'No hay tickets abiertos.' : 'No hay tickets cerrados.'}
          </p>
        ) : (
          <ul
            aria-label="Tickets vinculados"
            className="divide-y divide-gray-100 dark:divide-dark-border"
          >
            {visibleTickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                assignee={
                  ticket.assignedUserId ? (usersById.get(ticket.assignedUserId) ?? null) : null
                }
                onOpen={onOpenTicket}
              />
            ))}
          </ul>
        )}
      </div>
    );
  }, [
    activeFilter,
    canRead,
    closedCount,
    error,
    loadTickets,
    loading,
    onOpenTicket,
    openCount,
    showSkeleton,
    tickets,
    usersById,
    visibleTickets,
  ]);

  return (
    <PortalPanel
      title="Tickets"
      description="Casos de atención vinculados a este suscriptor."
      actions={actions}
    >
      {content}
    </PortalPanel>
  );
}
