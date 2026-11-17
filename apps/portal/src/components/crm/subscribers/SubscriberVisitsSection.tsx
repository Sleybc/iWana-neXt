'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ScheduleEventStatus, VisitRequestStatus, WorkOrderSourceContext } from '@iwana/shared';
import { Badge, Button, cn, interactiveFocusClassName } from '@iwana/ui';
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
  PortalPanel,
  PortalSidePeek,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';

/** Id del panel: la franja de resumen de Tickets salta aquí («Visitas próximas»). */
export const SUBSCRIBER_VISITS_PANEL_ID = 'subscriber-visits-panel';

interface SubscriberVisitsSectionProps {
  subscriber: SubscriberRecord;
  canRead: boolean;
  /** Visitas cargadas (o `null` si fallaron): la pestaña cuenta las próximas para la franja. */
  onEntriesChange?: (entries: VisitEntry[] | null) => void;
}

export type VisitEntry = {
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
  // «Expediente» es el nombre interno; quien usa el portal lo conoce como oportunidad.
  if (expedienteId) return 'Oportunidad';
  if (contractId) return 'Contrato';
  return 'Sin oportunidad ni contrato vinculado';
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

/** Pendiente de agendar o agendada sin terminar: «abierta» para la Vista general. */
export function isOpenVisitEntry(entry: Pick<VisitEntry, 'kind' | 'status'>): boolean {
  return entry.kind === 'request'
    ? PENDING_REQUEST_STATUSES.has(entry.status as VisitRequestStatus) ||
        FUTURE_REQUEST_STATUSES.has(entry.status as VisitRequestStatus)
    : PENDING_EVENT_STATUSES.has(entry.status as ScheduleEventStatus) ||
        FUTURE_EVENT_STATUSES.has(entry.status as ScheduleEventStatus);
}

/** Visitas propias del suscriptor (sin las de tickets), ordenadas como en Soporte. */
export async function loadSubscriberVisitEntries(subscriberId: string): Promise<VisitEntry[]> {
  const [requestsResponse, eventsResponse] = await Promise.all([
    wfmApi.visitRequests.list({
      subscriberId,
      page: 1,
      limit: 100,
      scope: 'all',
    }),
    wfmApi.events.list({ subscriberId, page: 1, limit: 100 }),
  ]);
  const events = eventsResponse.data.filter((event) => !event.ticketId);
  const eventIds = new Set(events.map((event) => event.id));
  const requests = requestsResponse.items.filter(
    (request) =>
      request.originContext !== WorkOrderSourceContext.ASSURANCE &&
      !request.ticketId &&
      (!request.scheduleEventId || !eventIds.has(request.scheduleEventId)),
  );
  return sortVisits([...requests.map(fromVisitRequest), ...events.map(fromScheduleEvent)]);
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

function VisitRow({ entry, onOpen }: { entry: VisitEntry; onOpen: (entry: VisitEntry) => void }) {
  const dateLabel = validDate(entry.date) ? formatWfmDateTime(entry.date) : 'Pendiente de fecha';
  return (
    <li>
      <button
        type="button"
        className={cn(
          'flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-left transition-colors hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3',
          interactiveFocusClassName,
        )}
        aria-label={`Ver detalle de visita: ${entry.workType}, ${entry.statusLabel}`}
        onClick={(event) => {
          // PortalSidePeek devuelve el foco al elemento activo al abrir; Safari no enfoca al hacer clic.
          event.currentTarget.focus();
          onOpen(entry);
        }}
      >
        <span className="text-sm font-medium text-gray-900 dark:text-white">{entry.workType}</span>
        <Badge variant={entry.statusVariant}>{entry.statusLabel}</Badge>
        <span className="text-xs text-gray-600 dark:text-gray-300">Origen: {entry.origin}</span>
        <span className="text-xs text-gray-600 dark:text-gray-300 sm:ml-auto">{dateLabel}</span>
      </button>
    </li>
  );
}

/** Detalle de solo lectura en `PortalSidePeek`: foco, `Escape` y retorno los da la primitive (§5.4). */
function VisitDetailPanel({ entry, onClose }: { entry: VisitEntry | null; onClose: () => void }) {
  const dateLabel =
    entry && validDate(entry.date) ? formatWfmDateTime(entry.date) : 'Pendiente de fecha';
  return (
    <PortalSidePeek
      open={entry !== null}
      onClose={onClose}
      title="Detalle de la visita"
      description="Consulta de solo lectura."
    >
      {entry ? (
        <>
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
        </>
      ) : null}
    </PortalSidePeek>
  );
}

export function SubscriberVisitsSection({
  subscriber,
  canRead,
  onEntriesChange,
}: SubscriberVisitsSectionProps) {
  const [entries, setEntries] = useState<VisitEntry[]>([]);
  const [loading, setLoading] = useState(canRead);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<VisitEntry | null>(null);
  const onEntriesChangeRef = useRef(onEntriesChange);
  onEntriesChangeRef.current = onEntriesChange;

  const loadVisits = useCallback(async () => {
    if (!canRead || subscriber.privacyRestricted) return;
    setLoading(true);
    setError(false);
    try {
      const loaded = await loadSubscriberVisitEntries(subscriber.id);
      setEntries(loaded);
      onEntriesChangeRef.current?.(loaded);
    } catch {
      setError(true);
      onEntriesChangeRef.current?.(null);
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
        <div className="space-y-2" aria-label="Cargando visitas" aria-busy="true">
          <PortalSkeletonBlock className="h-11 rounded-xl" />
          <PortalSkeletonBlock className="h-11 rounded-xl" />
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
      // Vacío de una línea (§7): la sección no reserva espacio sin visitas.
      return (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Este suscriptor no tiene visitas propias. Las visitas de un ticket se ven en el ticket.
        </p>
      );
    }
    return (
      <ul
        aria-label="Visitas vinculadas"
        className="divide-y divide-gray-100 dark:divide-dark-border"
      >
        {entries.map((entry) => (
          <VisitRow key={entry.key} entry={entry} onOpen={setSelectedVisit} />
        ))}
      </ul>
    );
  }, [canRead, entries, error, loadVisits, loading, showSkeleton]);

  return (
    <>
      <PortalPanel id={SUBSCRIBER_VISITS_PANEL_ID} title="Visitas" density="dense">
        {content}
      </PortalPanel>
      <VisitDetailPanel entry={selectedVisit} onClose={closeVisit} />
    </>
  );
}
