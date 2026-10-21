'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TicketStatus } from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import { ArrowUpRight } from 'lucide-react';
import type { AssuranceTicket, SubscriberRecord } from '@/lib/api-client';
import { assuranceApi } from '@/lib/api-client';
import {
  formatAssuranceDateTime,
  getAssuranceTicketPriorityLabel,
  getAssuranceTicketPriorityVariant,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketStatusVariant,
} from '@/components/assurance/assurance-labels';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';

interface SubscriberTicketsSectionProps {
  subscriber: SubscriberRecord;
  canRead: boolean;
  refreshKey: number;
  onOpenTicket: (ticket: AssuranceTicket, opener: HTMLButtonElement) => void;
}

const CLOSED_STATUSES = new Set<TicketStatus>([
  TicketStatus.RESOLVED,
  TicketStatus.CLOSED,
  TicketStatus.CANCELLED,
]);

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

function compareTickets(left: AssuranceTicket, right: AssuranceTicket): number {
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
  onOpen,
}: {
  ticket: AssuranceTicket;
  onOpen: (ticket: AssuranceTicket, opener: HTMLButtonElement) => void;
}) {
  const slaDeadline = getTicketSlaDeadline(ticket);
  const slaLabel = Number.isFinite(slaDeadline)
    ? formatAssuranceDateTime(new Date(slaDeadline))
    : 'Sin vencimiento registrado';

  return (
    <li className="border-b border-gray-100 last:border-b-0 dark:border-dark-border">
      <button
        type="button"
        className="w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-iwana-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:hover:bg-dark-surface-3"
        aria-label={`Abrir ticket ${ticket.ticketNumber}: ${ticket.subject}`}
        onClick={(event) => onOpen(ticket, event.currentTarget)}
      >
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-xs font-semibold text-iwana-secondary-700 dark:text-gray-300">
              {ticket.ticketNumber}
            </span>
            <span className="mt-1 block text-sm font-medium text-gray-900 dark:text-white">
              {ticket.subject}
            </span>
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={getAssuranceTicketStatusVariant(ticket.status)}>
            {getAssuranceTicketStatusLabel(ticket.status)}
          </Badge>
          <Badge variant={getAssuranceTicketPriorityVariant(ticket.priority)}>
            {getAssuranceTicketPriorityLabel(ticket.priority)}
          </Badge>
        </span>
        <span className="mt-2 block text-xs text-gray-600 dark:text-gray-300">
          Vencimiento SLA: {slaLabel}
        </span>
      </button>
    </li>
  );
}

export function SubscriberTicketsSection({
  subscriber,
  canRead,
  refreshKey,
  onOpenTicket,
}: SubscriberTicketsSectionProps) {
  const [tickets, setTickets] = useState<AssuranceTicket[]>([]);
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
    return (
      <ul
        aria-label="Tickets vinculados"
        className="divide-y divide-gray-100 dark:divide-dark-border"
      >
        {tickets.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} onOpen={onOpenTicket} />
        ))}
      </ul>
    );
  }, [canRead, error, loadTickets, loading, onOpenTicket, showSkeleton, tickets]);

  return (
    <PortalPanel title="Tickets" description="Casos de atención vinculados a este suscriptor.">
      {content}
    </PortalPanel>
  );
}
