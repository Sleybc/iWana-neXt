'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
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
  portalPanelDenseTitleClassName,
} from '@/components/shared/portal-ui';

/** Id del panel: la franja de resumen de Tickets salta aquí («Visitas próximas»). */
export const SUBSCRIBER_VISITS_PANEL_ID = 'subscriber-visits-panel';

interface SubscriberVisitsSectionProps {
  subscriber: SubscriberRecord;
  canRead: boolean;
  /** Visitas cargadas (o `null` si fallaron): la pestaña cuenta las próximas para la franja. */
  onEntriesChange?: (entries: VisitEntry[] | null) => void;
  /**
   * Historial plegable (decisión del usuario 2026-11-20): cerrado salvo que la pestaña lo abra.
   * La carga ocurre igual al montar: la pestaña la usa para contar y evitar duplicados.
   */
  /** Controlado por la pestaña (cerrado por defecto). Sin control, la sección empieza abierta. */
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Ids de solicitud o evento que ya muestra la franja «Próximas visitas» (CA-14). */
  excludeIds?: ReadonlySet<string> | undefined;
}

const VISITS_HISTORY_CONTENT_ID = 'subscriber-visits-history-content';
const NO_EXCLUDED_IDS: ReadonlySet<string> = new Set();

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

/**
 * Enlace a la visita en Programación: la solicitud sin evento abre su traspaso a agendar; lo
 * demás, la agenda. Lo comparten el historial y la franja «Próximas visitas» (spec bloque I).
 */
export function buildVisitAgendaHref(visit: {
  visitRequestId: string | null;
  scheduleEventId: string | null;
  date: string | null;
}): string {
  if (visit.visitRequestId && !visit.scheduleEventId) {
    return buildPendingVisitSchedulingHref({
      source: 'pending-visits',
      visitRequestId: visit.visitRequestId,
      focusDate: validDate(visit.date) ? new Date(visit.date!).toISOString().slice(0, 10) : null,
    });
  }
  return '/dashboard/scheduling/agenda';
}

function buildAgendamientoHref(entry: VisitEntry): string {
  const request = entry.kind === 'request' ? entry.visitRequest : undefined;
  return buildVisitAgendaHref({
    visitRequestId: request?.id ?? null,
    scheduleEventId: request ? (request.scheduleEventId ?? null) : (entry.event?.id ?? null),
    date: entry.date,
  });
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
export interface VisitDetail {
  workType: string;
  statusLabel: string;
  statusVariant: VisitEntry['statusVariant'];
  origin: string;
  dateLabel: string;
  address: string | null;
  /** Enlace de la acción principal; con `actionLabel` distinto para ir al ticket. */
  href: string;
  actionLabel?: string | undefined;
}

function toVisitDetail(entry: VisitEntry): VisitDetail {
  return {
    workType: entry.workType,
    statusLabel: entry.statusLabel,
    statusVariant: entry.statusVariant,
    origin: entry.origin,
    dateLabel: validDate(entry.date) ? formatWfmDateTime(entry.date) : 'Pendiente de fecha',
    address: entry.address,
    href: buildAgendamientoHref(entry),
  };
}

function VisitDetailPanel({ entry, onClose }: { entry: VisitEntry | null; onClose: () => void }) {
  return <VisitDetailSidePeek detail={entry ? toVisitDetail(entry) : null} onClose={onClose} />;
}

/** Detalle compartido por el historial y la franja «Próximas visitas» (R9: ningún dato se pierde). */
export function VisitDetailSidePeek({
  detail: entry,
  onClose,
}: {
  detail: VisitDetail | null;
  onClose: () => void;
}) {
  const dateLabel = entry?.dateLabel ?? '';
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
            href={entry.href}
            className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-iwana-secondary-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:text-gray-200"
          >
            {entry.actionLabel ?? 'Abrir en Agendamiento'}
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
  open: controlledOpen,
  onOpenChange,
  excludeIds = NO_EXCLUDED_IDS,
}: SubscriberVisitsSectionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(true);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
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

  // Una consulta por clave: StrictMode repite el efecto en desarrollo (CA-SO-04).
  const requestedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${subscriber.id}:${canRead}:${subscriber.privacyRestricted}`;
    if (requestedKeyRef.current === key) return;
    requestedKeyRef.current = key;
    void loadVisits();
  }, [canRead, loadVisits, subscriber.id, subscriber.privacyRestricted]);

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
    // Lo que ya está en «Próximas visitas» no se repite aquí (CA-14).
    const listed = entries.filter((entry) => !excludeIds.has(entry.id));
    if (listed.length === 0) {
      // Vacío de una línea (§7): la sección no reserva espacio sin visitas.
      return (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {entries.length === 0
            ? 'Este suscriptor no tiene visitas propias. Las visitas de un ticket se ven en el ticket.'
            : 'No hay otras visitas en el historial.'}
        </p>
      );
    }
    return (
      <ul
        aria-label="Visitas vinculadas"
        className="divide-y divide-gray-100 dark:divide-dark-border"
      >
        {listed.map((entry) => (
          <VisitRow key={entry.key} entry={entry} onOpen={setSelectedVisit} />
        ))}
      </ul>
    );
  }, [canRead, entries, error, excludeIds, loadVisits, loading, showSkeleton]);

  return (
    <>
      <PortalPanel id={SUBSCRIBER_VISITS_PANEL_ID} density="dense">
        <h2 className={portalPanelDenseTitleClassName}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={VISITS_HISTORY_CONTENT_ID}
            onClick={() => setOpen(!open)}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-lg pr-2 text-left sm:min-h-9',
              interactiveFocusClassName,
            )}
          >
            <ChevronRight
              className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-90')}
              aria-hidden="true"
            />
            Historial de visitas
          </button>
        </h2>
        <div
          id={VISITS_HISTORY_CONTENT_ID}
          // Sin permiso o con error, el aviso (y «Reintentar») se ve aunque el historial esté plegado.
          hidden={canRead && !error && !open}
          className="mt-2"
        >
          {content}
        </div>
      </PortalPanel>
      <VisitDetailPanel entry={selectedVisit} onClose={closeVisit} />
    </>
  );
}
