'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ScheduleEventStatus, VisitRequestStatus, WorkOrderSourceContext } from '@iwana/shared';
import { Badge, Button, ModalLayer, overlayEdgeClassName } from '@iwana/ui';
import { X } from 'lucide-react';
import type { SubscriberRecord, WfmScheduleEvent, WfmVisitRequest } from '@/lib/api-client';
import { wfmApi } from '@/lib/api-client';
import {
  formatWfmDateTime,
  getScheduleEventStatusLabel,
  getScheduleEventStatusVariant,
  getWfmWorkTypeLabel,
} from '@/components/scheduling/scheduling-ui';
import {
  getVisitRequestStatusLabel,
  getVisitRequestStatusVariant,
} from '@/components/scheduling/pending-visits-ui';
import { buildPendingVisitSchedulingHref } from '@/components/scheduling/pending-visit-scheduling-handoff';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';

interface SubscriberVisitsSectionProps {
  subscriber: SubscriberRecord;
  canRead: boolean;
}

type VisitEntry = {
  id: string;
  key: string;
  kind: 'request' | 'event';
  status: string;
  statusLabel: string;
  statusVariant: React.ComponentProps<typeof Badge>['variant'];
  workType: string;
  date: string | null;
  origin: string;
  address: string | null;
  expedienteId: string | null;
  contractId: string | null;
  createdAt: string;
  visitRequest?: WfmVisitRequest;
  event?: WfmScheduleEvent;
};

const PENDING_REQUEST_STATUSES = new Set<VisitRequestStatus>([
  VisitRequestStatus.PENDING,
  VisitRequestStatus.NEEDS_CONTEXT,
  VisitRequestStatus.READY_TO_SCHEDULE,
  VisitRequestStatus.REQUIRES_RESCHEDULE,
]);
const FUTURE_REQUEST_STATUSES = new Set<VisitRequestStatus>([
  VisitRequestStatus.SCHEDULED,
  VisitRequestStatus.IN_EXECUTION,
]);
const PENDING_EVENT_STATUSES = new Set<ScheduleEventStatus>([ScheduleEventStatus.DRAFT]);
const FUTURE_EVENT_STATUSES = new Set<ScheduleEventStatus>([
  ScheduleEventStatus.SCHEDULED,
  ScheduleEventStatus.EN_ROUTE,
  ScheduleEventStatus.IN_PROGRESS,
]);

function getOriginLabel(expedienteId: string | null, contractId: string | null): string {
  if (expedienteId) return 'Expediente';
  if (contractId) return 'Contrato';
  return 'Sin expediente o contrato vinculado';
}

function validDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function entryGroup(entry: VisitEntry, now: number): number {
  if (
    entry.kind === 'request' &&
    PENDING_REQUEST_STATUSES.has(entry.status as VisitRequestStatus)
  ) {
    return 0;
  }
  if (entry.kind === 'event' && PENDING_EVENT_STATUSES.has(entry.status as ScheduleEventStatus)) {
    return 0;
  }

  const date = validDate(entry.date);
  const isFutureStatus =
    (entry.kind === 'request' && FUTURE_REQUEST_STATUSES.has(entry.status as VisitRequestStatus)) ||
    (entry.kind === 'event' && FUTURE_EVENT_STATUSES.has(entry.status as ScheduleEventStatus));
  return date !== null && date >= now && isFutureStatus ? 1 : 2;
}

function sortVisits(entries: VisitEntry[]): VisitEntry[] {
  const now = Date.now();
  return [...entries].sort((left, right) => {
    const leftGroup = entryGroup(left, now);
    const rightGroup = entryGroup(right, now);
    if (leftGroup !== rightGroup) return leftGroup - rightGroup;
    const leftDate = validDate(left.date);
    const rightDate = validDate(right.date);
    if (leftGroup === 1)
      return (leftDate ?? Number.POSITIVE_INFINITY) - (rightDate ?? Number.POSITIVE_INFINITY);
    if (leftGroup === 2) return (rightDate ?? 0) - (leftDate ?? 0);
    const leftCreated = validDate(left.createdAt) ?? 0;
    const rightCreated = validDate(right.createdAt) ?? 0;
    return rightCreated - leftCreated;
  });
}

function fromVisitRequest(request: WfmVisitRequest): VisitEntry {
  const status = request.status;
  return {
    id: request.id,
    key: `request:${request.id}`,
    kind: 'request',
    status,
    statusLabel: getVisitRequestStatusLabel(request.status),
    statusVariant: getVisitRequestStatusVariant(request.status),
    workType: getWfmWorkTypeLabel(request.workType),
    date: request.scheduledAt ?? request.requestedWindowStartAt,
    origin: getOriginLabel(request.expedienteId, request.contractId),
    address: request.address,
    expedienteId: request.expedienteId,
    contractId: request.contractId,
    createdAt: request.createdAt,
    visitRequest: request,
  };
}

function fromScheduleEvent(event: WfmScheduleEvent): VisitEntry {
  return {
    id: event.id,
    key: `event:${event.id}`,
    kind: 'event',
    status: event.status,
    statusLabel: getScheduleEventStatusLabel(event.status),
    statusVariant: getScheduleEventStatusVariant(event.status),
    workType: getWfmWorkTypeLabel(event.type),
    date: event.scheduledStartAt,
    origin: getOriginLabel(event.expedienteId, event.contractId),
    address: event.address,
    expedienteId: event.expedienteId,
    contractId: event.contractId,
    createdAt: event.createdAt,
    event,
  };
}

function buildAgendamientoHref(entry: VisitEntry): string {
  if (entry.kind === 'request' && entry.visitRequest && !entry.visitRequest.scheduleEventId) {
    return buildPendingVisitSchedulingHref({
      source: 'pending-visits',
      visitRequestId: entry.visitRequest.id,
      focusDate: validDate(entry.date) ? new Date(entry.date!).toISOString().slice(0, 10) : null,
    });
  }
  return '/dashboard/scheduling/agenda';
}

function VisitRow({
  entry,
  onOpen,
}: {
  entry: VisitEntry;
  onOpen: (entry: VisitEntry, opener: HTMLButtonElement) => void;
}) {
  const dateLabel = validDate(entry.date) ? formatWfmDateTime(entry.date) : 'Pendiente de fecha';
  return (
    <li className="border-b border-gray-100 last:border-b-0 dark:border-dark-border">
      <button
        type="button"
        className="w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-iwana-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:hover:bg-dark-surface-3"
        aria-label={`Ver detalle de visita: ${entry.workType}, ${entry.statusLabel}`}
        onClick={(event) => onOpen(entry, event.currentTarget)}
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {entry.workType}
          </span>
          <Badge variant={entry.statusVariant}>{entry.statusLabel}</Badge>
        </span>
        <span className="mt-2 block text-xs text-gray-600 dark:text-gray-300">
          Origen: {entry.origin}
        </span>
        <span className="mt-1 block text-xs text-gray-600 dark:text-gray-300">{dateLabel}</span>
      </button>
    </li>
  );
}

function VisitDetailPanel({
  entry,
  openerRef,
  onClose,
}: {
  entry: VisitEntry;
  openerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = openerRef.current;
    const frameId = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    document.body.classList.add('overflow-hidden');
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('overflow-hidden');
      opener?.focus();
    };
  }, [onClose, openerRef]);

  const dateLabel = validDate(entry.date) ? formatWfmDateTime(entry.date) : 'Pendiente de fecha';

  return (
    <ModalLayer align="end" onVeilClick={onClose}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscriber-visit-detail-title"
        tabIndex={-1}
        className={`${overlayEdgeClassName} relative flex h-full w-full flex-col border-l bg-white shadow-iwana-soft dark:bg-dark-surface-2 md:max-w-[32rem]`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-dark-border">
          <div>
            <h2
              id="subscriber-visit-detail-title"
              className="text-base font-semibold text-gray-900 dark:text-white"
            >
              Detalle de la visita
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Consulta de solo lectura.
            </p>
          </div>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label="Cerrar detalle de la visita"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span>Cerrar</span>
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <dl className="space-y-4">
            <div>
              <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Tipo de visita
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">{entry.workType}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400">Estado</dt>
              <dd className="mt-1">
                <Badge variant={entry.statusVariant}>{entry.statusLabel}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400">Origen</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">{entry.origin}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400">Fecha</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">{dateLabel}</dd>
            </div>
            {entry.address ? (
              <div>
                <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Dirección
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white">{entry.address}</dd>
              </div>
            ) : null}
          </dl>
          <Link
            href={buildAgendamientoHref(entry)}
            className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-iwana-secondary-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:text-gray-200"
          >
            Abrir en Agendamiento
          </Link>
        </div>
      </aside>
    </ModalLayer>
  );
}

export function SubscriberVisitsSection({ subscriber, canRead }: SubscriberVisitsSectionProps) {
  const [entries, setEntries] = useState<VisitEntry[]>([]);
  const [loading, setLoading] = useState(canRead);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<VisitEntry | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const loadVisits = useCallback(async () => {
    if (!canRead || subscriber.privacyRestricted) return;
    setLoading(true);
    setError(false);
    try {
      const [requestsResponse, eventsResponse] = await Promise.all([
        wfmApi.visitRequests.list({
          subscriberId: subscriber.id,
          page: 1,
          limit: 100,
          scope: 'all',
        }),
        wfmApi.events.list({ subscriberId: subscriber.id, page: 1, limit: 100 }),
      ]);
      const events = eventsResponse.data.filter((event) => !event.ticketId);
      const eventIds = new Set(events.map((event) => event.id));
      const requests = requestsResponse.items.filter(
        (request) =>
          request.originContext !== WorkOrderSourceContext.ASSURANCE &&
          !request.ticketId &&
          (!request.scheduleEventId || !eventIds.has(request.scheduleEventId)),
      );
      setEntries(sortVisits([...requests.map(fromVisitRequest), ...events.map(fromScheduleEvent)]));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [canRead, subscriber.id, subscriber.privacyRestricted]);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);

  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setShowSkeleton(true), 300);
    return () => window.clearTimeout(timeoutId);
  }, [loading]);

  const closeVisit = useCallback(() => setSelectedVisit(null), []);

  const content = useMemo(() => {
    if (!canRead) {
      return (
        <PortalAlert
          variant="warning"
          title="No tienes acceso a las visitas"
          description="Solicita el permiso de lectura de programación para consultar esta información."
        />
      );
    }
    if (loading && showSkeleton) {
      return (
        <div className="space-y-3" aria-label="Cargando visitas" aria-busy="true">
          <PortalSkeletonBlock className="h-24 rounded-xl" />
          <PortalSkeletonBlock className="h-24 rounded-xl" />
        </div>
      );
    }
    if (loading) {
      return (
        <p className="text-sm text-gray-600 dark:text-gray-300" role="status">
          Cargando visitas…
        </p>
      );
    }
    if (error) {
      return (
        <PortalAlert
          variant="error"
          title="No fue posible cargar las visitas"
          description="Intenta de nuevo para consultar las visitas vinculadas."
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadVisits()}>
              Reintentar
            </Button>
          }
        />
      );
    }
    if (entries.length === 0) {
      return (
        <PortalEmptyState
          embedded
          title="Este suscriptor no tiene visitas"
          description="Las visitas asociadas a este suscriptor aparecerán aquí."
        />
      );
    }
    return (
      <ul
        aria-label="Visitas vinculadas"
        className="divide-y divide-gray-100 dark:divide-dark-border"
      >
        {entries.map((entry) => (
          <VisitRow
            key={entry.key}
            entry={entry}
            onOpen={(visit, opener) => {
              openerRef.current = opener;
              setSelectedVisit(visit);
            }}
          />
        ))}
      </ul>
    );
  }, [canRead, entries, error, loadVisits, loading, showSkeleton]);

  return (
    <>
      <PortalPanel
        title="Visitas"
        description="Solicitudes y eventos de programación vinculados a este suscriptor."
      >
        {content}
      </PortalPanel>
      {selectedVisit ? (
        <VisitDetailPanel entry={selectedVisit} openerRef={openerRef} onClose={closeVisit} />
      ) : null}
    </>
  );
}
