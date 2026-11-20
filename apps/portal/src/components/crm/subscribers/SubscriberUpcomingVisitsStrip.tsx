'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, Info } from 'lucide-react';
import {
  ScheduleEventStatus,
  SubscriberUpcomingVisitsResponseSchema,
  VisitRequestStatus,
} from '@iwana/shared';
import type { SubscriberUpcomingVisitItem, SubscriberUpcomingVisitsResponse } from '@iwana/shared';
import { Badge, Button, cn, interactiveFocusClassName } from '@iwana/ui';
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
import { PortalPanel, portalPanelDenseTitleClassName } from '@/components/shared/portal-ui';
import {
  VisitDetailSidePeek,
  buildVisitAgendaHref,
  type VisitDetail,
} from './SubscriberVisitsSection';

/** Id del panel: la cifra «Visitas próximas» de la franja de Tickets salta aquí. */
export const SUBSCRIBER_UPCOMING_VISITS_PANEL_ID = 'subscriber-upcoming-visits-panel';
const UPCOMING_LIST_ID = 'subscriber-upcoming-visits-list';
/** Visitas a la vista con la franja plegada (una línea, CA-17). */
const VISIBLE_VISITS = 2;
/** Ancho de la lista por debajo del cual solo cabe una visita legible en la línea (QA3). */
const TWO_VISITS_MIN_WIDTH = 1100;

/** Visitas que caben legibles en una línea según el ancho real de la lista (2 sin medir). */
function useVisibleVisitCount(): [(node: HTMLDivElement | null) => void, number] {
  const [count, setCount] = useState(VISIBLE_VISITS);
  const observerRef = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      setCount(width >= TWO_VISITS_MIN_WIDTH ? VISIBLE_VISITS : 1);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);
  return [ref, count];
}

interface SubscriberUpcomingVisitsStripProps {
  subscriberId: string;
  /** Datos bloqueados (H-1): no se consulta ni se pinta, igual que el historial. */
  privacyRestricted?: boolean | undefined;
  /** Visitas cargadas (o `null` si fallaron): la pestaña cuenta y evita duplicados (CA-14). */
  onLoaded?: ((response: SubscriberUpcomingVisitsResponse | null) => void) | undefined;
  /** Abre el ticket de la visita en la pestaña; `false` si el ticket no está en la lista. */
  onOpenTicket?: ((ticketId: string, opener: HTMLButtonElement) => boolean) | undefined;
  /** Enlace de respaldo al ticket cuando no está en la lista (Mesa de ayuda). */
  ticketFallbackHref?: ((ticketId: string) => string | null) | undefined;
}

function getStatus(item: SubscriberUpcomingVisitItem) {
  return item.kind === 'REQUEST'
    ? {
        label: getVisitRequestStatusLabel(item.status as VisitRequestStatus),
        variant: getVisitRequestStatusVariant(item.status as VisitRequestStatus),
      }
    : {
        label: getScheduleEventStatusLabel(item.status as ScheduleEventStatus),
        variant: getScheduleEventStatusVariant(item.status as ScheduleEventStatus),
      };
}

function getOriginLabel(item: SubscriberUpcomingVisitItem): string {
  switch (item.origin.type) {
    case 'TICKET':
      return item.origin.ticketNumber ? `Ticket ${item.origin.ticketNumber}` : 'Ticket';
    case 'OPPORTUNITY':
      // «Expediente» es el nombre interno; quien usa el portal lo conoce como oportunidad.
      return 'Oportunidad';
    case 'CONTRACT':
      return 'Contrato';
    default:
      return 'Sin oportunidad ni contrato vinculado';
  }
}

function getDateLabel(item: SubscriberUpcomingVisitItem): string {
  if (item.scheduledAt) return formatWfmDateTime(item.scheduledAt);
  // Sin fecha firme, la ventana preferida que antes se mostraba como fecha (R9).
  return item.requestedWindowStartAt
    ? `Por agendar · ventana ${formatWfmDateTime(item.requestedWindowStartAt)}`
    : 'Por agendar';
}

function VisitItem({
  item,
  onOpenTicket,
  ticketFallbackHref,
  onShowDetail,
}: {
  item: SubscriberUpcomingVisitItem;
  onOpenTicket?: SubscriberUpcomingVisitsStripProps['onOpenTicket'];
  ticketFallbackHref?: SubscriberUpcomingVisitsStripProps['ticketFallbackHref'];
  onShowDetail: (detail: VisitDetail, opener: HTMLButtonElement) => void;
}) {
  const router = useRouter();
  const workType = getWfmWorkTypeLabel(item.workType);
  const status = getStatus(item);
  const origin = getOriginLabel(item);
  const dateLabel = getDateLabel(item);
  const description = [workType, status.label.toLowerCase(), dateLabel.toLowerCase(), item.address]
    .filter(Boolean)
    .join(', ');
  const body = (
    <>
      <span className="shrink-0 font-medium text-gray-900 dark:text-white">{dateLabel}</span>
      <span className="shrink-0 whitespace-nowrap">{workType}</span>
      <Badge variant={status.variant} className="shrink-0 whitespace-nowrap">
        {status.label}
      </Badge>
      <span className="shrink-0 whitespace-nowrap text-gray-600 dark:text-gray-300">{origin}</span>
      {/* La dirección no va en la línea (QA3: quedaba ilegible): nombre accesible y detalle (R9). */}
    </>
  );
  const className = cn(
    'flex min-h-11 w-full min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3 sm:min-h-9',
    interactiveFocusClassName,
  );

  const ticketId = item.origin.type === 'TICKET' ? item.origin.ticketId : null;
  const ticketName = item.origin.ticketNumber ?? 'de la visita';
  const fallback = ticketId ? (ticketFallbackHref?.(ticketId) ?? null) : null;
  const agendaHref = buildVisitAgendaHref({
    visitRequestId: item.visitRequestId,
    scheduleEventId: item.scheduleEventId,
    date: item.scheduledAt ?? item.requestedWindowStartAt,
  });
  const ticketLabel = `Ver ticket ${ticketName}: visita ${description}`;

  let main: ReactNode;
  if (ticketId && onOpenTicket) {
    main = (
      <button
        type="button"
        aria-label={ticketLabel}
        className={className}
        onClick={(event) => {
          if (onOpenTicket(ticketId, event.currentTarget)) return;
          if (fallback) router.push(fallback);
        }}
      >
        {body}
      </button>
    );
  } else if (ticketId && fallback) {
    main = (
      <Link href={fallback} aria-label={ticketLabel} className={className}>
        {body}
      </Link>
    );
  } else if (ticketId) {
    main = <span className={cn(className, 'hover:bg-transparent')}>{body}</span>;
  } else {
    main = (
      <Link
        href={agendaHref}
        aria-label={`Abrir en Agendamiento: visita ${description}, ${origin.toLowerCase()}`}
        className={className}
      >
        {body}
      </Link>
    );
  }

  // Detalle de solo lectura, como en la sección anterior (R9).
  const detail: VisitDetail = {
    workType,
    statusLabel: status.label,
    statusVariant: status.variant,
    origin,
    dateLabel,
    address: item.address,
    href: ticketId ? (fallback ?? agendaHref) : agendaHref,
    actionLabel: ticketId && fallback ? 'Abrir el ticket' : undefined,
  };

  return (
    <li className="flex min-w-0 items-center gap-1">
      {main}
      <button
        type="button"
        aria-label={`Ver detalle de visita: ${workType}, ${status.label}`}
        title="Ver detalle"
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-600 hover:bg-iwana-surface-soft dark:text-gray-300 dark:hover:bg-dark-surface-3 sm:h-9 sm:w-9',
          interactiveFocusClassName,
        )}
        onClick={(event) => {
          // PortalSidePeek devuelve el foco al elemento activo; Safari no enfoca al hacer clic.
          event.currentTarget.focus();
          onShowDetail(detail, event.currentTarget);
        }}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}
/**
 * Franja «Próximas visitas» (spec 2026-11-20 v1.1, bloque I): toda visita activa del suscriptor,
 * de cualquier origen, sobre la lista de tickets. Una línea por visita; sin visitas, una línea.
 * La pestaña la monta solo con rol y permiso de lectura de Programación (CA-15).
 */
export function SubscriberUpcomingVisitsStrip({
  subscriberId,
  privacyRestricted = false,
  onLoaded,
  onOpenTicket,
  ticketFallbackHref,
}: SubscriberUpcomingVisitsStripProps) {
  const [data, setData] = useState<SubscriberUpcomingVisitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detail, setDetail] = useState<VisitDetail | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lineRef, visibleCount] = useVisibleVisitCount();
  const closeDetail = useCallback(() => setDetail(null), []);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // La forma se valida con el contrato: una respuesta inesperada es un error, no un fallo.
      const parsed = SubscriberUpcomingVisitsResponseSchema.safeParse(
        await wfmApi.subscriberUpcomingVisits(subscriberId),
      );
      if (!parsed.success) throw new Error('Respuesta de próximas visitas inválida');
      const response = parsed.data as SubscriberUpcomingVisitsResponse;
      setData(response);
      onLoadedRef.current?.(response);
    } catch {
      setError(true);
      onLoadedRef.current?.(null);
    } finally {
      setLoading(false);
    }
  }, [subscriberId]);

  // Una consulta por suscriptor: StrictMode repite el efecto en desarrollo (CA-SO-04).
  const requestedRef = useRef<string | null>(null);
  useEffect(() => {
    if (privacyRestricted || requestedRef.current === subscriberId) return;
    requestedRef.current = subscriberId;
    void load();
  }, [load, privacyRestricted, subscriberId]);

  if (privacyRestricted) return null;

  let content;
  if (loading) {
    content = (
      <p className="text-xs text-gray-600 dark:text-gray-300" role="status">
        Cargando próximas visitas…
      </p>
    );
  } else if (error || !data) {
    content = (
      <p className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <span role="alert">No fue posible cargar las próximas visitas.</span>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
          Reintentar
        </Button>
      </p>
    );
  } else if (data.items.length === 0) {
    content = (
      <p className="text-xs text-gray-600 dark:text-gray-300">
        Este suscriptor no tiene visitas pendientes.
      </p>
    );
  } else {
    // Una sola línea (decisión del usuario, CA-17): las dos primeras y «+N más»; el resto se
    // pliega, no se pierde: se despliega con sus datos, detalle y enlaces.
    const hidden = expanded ? 0 : Math.max(0, data.items.length - visibleCount);
    const shown = hidden > 0 ? data.items.slice(0, visibleCount) : data.items;
    content = (
      <>
        <div ref={lineRef} className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center">
          <ul
            id={UPCOMING_LIST_ID}
            aria-label="Visitas pendientes"
            className={cn(
              'min-w-0 flex-1 gap-1',
              expanded ? 'grid sm:grid-cols-2 2xl:grid-cols-3' : 'flex flex-col sm:flex-row',
              !expanded && '[&>li]:min-w-0 [&>li]:flex-1',
            )}
          >
            {shown.map((item) => (
              <VisitItem
                key={item.key}
                item={item}
                onOpenTicket={onOpenTicket}
                ticketFallbackHref={ticketFallbackHref}
                onShowDetail={setDetail}
              />
            ))}
          </ul>
          {hidden > 0 || (expanded && data.items.length > visibleCount) ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-11 shrink-0 self-start sm:min-h-9 sm:self-auto"
              aria-expanded={expanded}
              aria-controls={UPCOMING_LIST_ID}
              aria-label={
                expanded
                  ? visibleCount === 1
                    ? 'Mostrar solo la primera visita'
                    : 'Mostrar solo las dos primeras visitas'
                  : `Ver ${hidden} ${hidden === 1 ? 'visita pendiente más' : 'visitas pendientes más'}`
              }
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? 'Ver menos' : `+${hidden} más`}
            </Button>
          ) : null}
        </div>
        {data.truncated ? (
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Se muestran {data.items.length} de {data.total} visitas pendientes.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PortalPanel
        id={SUBSCRIBER_UPCOMING_VISITS_PANEL_ID}
        density="dense"
        contentClassName="px-3 py-1.5 sm:px-4"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className={cn(portalPanelDenseTitleClassName, 'inline-flex items-center gap-1.5')}>
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
            Próximas visitas
          </h2>
          {/* Título y visitas en la misma línea (CA-17): una línea por visita. */}
          <div className="min-w-0 flex-1 basis-full space-y-1 sm:basis-0">{content}</div>
        </div>
      </PortalPanel>
      <VisitDetailSidePeek detail={detail} onClose={closeDetail} />
    </>
  );
}
