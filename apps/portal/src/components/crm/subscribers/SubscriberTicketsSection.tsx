'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { TicketPriority, TicketType } from '@iwana/shared';
import { Button, Select, cn, interactiveFocusClassName } from '@iwana/ui';
import type { AssuranceTicket, InternalUser, SubscriberRecord } from '@/lib/api-client';
import { assuranceApi } from '@/lib/api-client';
import {
  ASSURANCE_TICKET_PRIORITY_LABELS,
  ASSURANCE_TICKET_TYPE_OPTIONS,
} from '@/components/assurance/assurance-labels';
import {
  compareTickets,
  getTicketAssigneeLabel,
  getTicketDeadline,
  getTicketDeadlineState,
  getTicketFieldWork,
  needsAttention,
} from '@/components/assurance/assurance-ticket-model';
import { TicketListItem } from '@/components/assurance/TicketListItem';
import {
  PortalAlert,
  PortalEmptyState,
  PortalFilterChip,
  PortalPanel,
  PortalSearchField,
  PortalSkeletonBlock,
  portalPanelDenseTitleClassName,
} from '@/components/shared/portal-ui';

/** Id del panel: la pestaña devuelve el foco a su encabezado al cerrar el detalle (CA-11). */
export const SUBSCRIBER_TICKETS_PANEL_ID = 'subscriber-tickets-panel';

interface SubscriberTicketsSectionProps {
  subscriber: SubscriberRecord;
  canRead: boolean;
  refreshKey: number;
  onOpenTicket: (ticket: AssuranceTicket, opener: HTMLButtonElement) => void;
  /** Acción de la cabecera del panel (p. ej. «Crear ticket»). */
  actions?: ReactNode;
  /** Usuarios internos ya cargados por la pestaña: nombre del responsable en cada fila. */
  users?: readonly InternalUser[];
  /** La pestaña aún carga los usuarios: la lista espera para no pintar un responsable provisional (CA-4). */
  usersPending?: boolean;
  /** Sin políticas de plazo la cifra «Vencidos» no se muestra (D5). */
  slaPoliciesConfigured?: boolean;
  /** Visitas próximas propias; `null` sin permiso o sin dato: la cifra no se muestra. */
  upcomingVisits?: number | null;
  onShowVisits?: () => void;
  /** Aviso sobre la lista (éxito al crear), sin empujar la franja. */
  notice?: ReactNode;
  /** Se llama al cambiar un filtro: la pestaña descarta el aviso de éxito (§7). */
  onFiltersChange?: () => void;
  highlightTicketId?: string | null;
  /** Ticket abierto en la vista dividida: su fila se marca como actual (CA-7). */
  selectedTicketId?: string | null;
  /** Lista cargada (cada consulta): la pestaña resuelve el ticket de la URL y el de entrada. */
  onTicketsLoaded?: (tickets: readonly AssuranceTicket[]) => void;
}

type TicketFilter = 'abiertos' | 'cerrados' | 'todos' | 'vencidos';

const TICKET_FILTERS = new Set<TicketFilter>(['abiertos', 'cerrados', 'todos', 'vencidos']);
const PRIORITIES = new Set<string>(Object.values(TicketPriority));
const TYPES = new Set<string>(Object.values(TicketType));
const LIST_LIMIT = 100;

const PRIORITY_OPTIONS = [
  { value: '', label: 'Todas' },
  ...[
    TicketPriority.CRITICAL,
    TicketPriority.URGENT,
    TicketPriority.HIGH,
    TicketPriority.NORMAL,
    TicketPriority.LOW,
  ].map((value) => ({ value, label: ASSURANCE_TICKET_PRIORITY_LABELS[value] })),
];
const TYPE_OPTIONS = [{ value: '', label: 'Todos' }, ...ASSURANCE_TICKET_TYPE_OPTIONS];

interface UrlFilters {
  filter: TicketFilter | null;
  priority: string;
  type: string;
}

/** Lee chips, prioridad y tipo de la URL; la búsqueda nunca va en la URL (§5.3). */
function readUrlFilters(): UrlFilters {
  if (typeof window === 'undefined') return { filter: null, priority: '', type: '' };
  const params = new URLSearchParams(window.location.search);
  const filter = params.get('tickets');
  const priority = params.get('prioridad') ?? '';
  const type = params.get('tipo') ?? '';
  return {
    filter: filter && TICKET_FILTERS.has(filter as TicketFilter) ? (filter as TicketFilter) : null,
    priority: PRIORITIES.has(priority) ? priority : '',
    type: TYPES.has(type) ? type : '',
  };
}

function writeUrlFilters({ filter, priority, type }: UrlFilters): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const entries: Array<[string, string | null]> = [
    ['tickets', filter],
    ['prioridad', priority || null],
    ['tipo', type || null],
  ];
  for (const [key, value] of entries) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href !== window.location.href) {
    window.history.replaceState(window.history.state, '', url);
  }
}

/** Mismo criterio que la fila y el orden: `slaBreachStatus` vía el modelo (no el reloj). */
function isOverdue(ticket: AssuranceTicket): boolean {
  return getTicketDeadlineState(ticket) === 'overdue';
}

function matchesSearch(ticket: AssuranceTicket, query: string): boolean {
  if (!query) return true;
  return [ticket.ticketNumber, ticket.subject, ticket.description ?? ''].some((value) =>
    value.toLocaleLowerCase('es').includes(query),
  );
}

function SummaryFigure({
  label,
  value,
  accessibleName,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: number;
  accessibleName: string;
  tone?: 'neutral' | 'error';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={accessibleName}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 min-w-0 items-baseline justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 transition-colors hover:bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-2 dark:hover:bg-dark-surface-3 sm:justify-start',
        interactiveFocusClassName,
      )}
    >
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          tone === 'error' ? 'text-error-700 dark:text-error-400' : 'text-gray-900 dark:text-white',
        )}
      >
        {value}
      </span>
      <span className="truncate text-xs text-gray-600 dark:text-gray-300">{label}</span>
    </button>
  );
}

export function SubscriberTicketsSection({
  subscriber,
  canRead,
  refreshKey,
  onOpenTicket,
  actions,
  users,
  usersPending = false,
  slaPoliciesConfigured = false,
  upcomingVisits = null,
  onShowVisits,
  notice,
  onFiltersChange,
  highlightTicketId = null,
  selectedTicketId = null,
  onTicketsLoaded,
}: SubscriberTicketsSectionProps) {
  const [tickets, setTickets] = useState<AssuranceTicket[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<TicketFilter | null>(null);
  const [priority, setPriority] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [resultsAnnouncement, setResultsAnnouncement] = useState('');
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [error, setError] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const urlReadRef = useRef(false);

  const usersById = useMemo(() => new Map((users ?? []).map((user) => [user.id, user])), [users]);
  const now = Date.now();
  const openTickets = tickets.filter(needsAttention);
  const openCount = openTickets.length;
  const closedCount = tickets.length - openCount;
  const overdueCount = tickets.filter((ticket) => isOverdue(ticket)).length;
  const noOpenDeadlines =
    openCount > 0 && openTickets.every((ticket) => getTicketDeadline(ticket) === null);
  // Por defecto los abiertos, que son los que requieren atención; si no hay, todos.
  const activeFilter: TicketFilter = filter ?? (openCount > 0 ? 'abiertos' : 'todos');
  const query = search.trim().toLocaleLowerCase('es');
  const hasRefinement = Boolean(priority || type || query);

  const visibleTickets = tickets.filter((ticket) => {
    const byChip =
      activeFilter === 'todos'
        ? true
        : activeFilter === 'abiertos'
          ? needsAttention(ticket)
          : activeFilter === 'vencidos'
            ? isOverdue(ticket)
            : !needsAttention(ticket);
    return (
      byChip &&
      (!priority || ticket.priority === priority) &&
      (!type || ticket.type === type) &&
      matchesSearch(ticket, query)
    );
  });

  useEffect(() => {
    if (urlReadRef.current) return;
    urlReadRef.current = true;
    const fromUrl = readUrlFilters();
    setFilter(fromUrl.filter);
    setPriority(fromUrl.priority);
    setType(fromUrl.type);
    if (fromUrl.priority || fromUrl.type) setFiltersOpen(true);
  }, []);

  const applyFilters = useCallback(
    (next: Partial<UrlFilters>) => {
      const merged: UrlFilters = {
        filter: next.filter !== undefined ? next.filter : filter,
        priority: next.priority ?? priority,
        type: next.type ?? type,
      };
      setFilter(merged.filter);
      setPriority(merged.priority);
      setType(merged.type);
      writeUrlFilters(merged);
      onFiltersChange?.();
    },
    [filter, onFiltersChange, priority, type],
  );

  const clearFilters = useCallback(() => {
    setSearch('');
    applyFilters({ filter: null, priority: '', type: '' });
  }, [applyFilters]);

  const showFromSummary = useCallback(
    (next: TicketFilter) => {
      applyFilters({ filter: next });
      // La franja sí lleva el foco a la lista (§3); los filtros no lo mueven (§10).
      window.requestAnimationFrame(() => listRef.current?.focus());
    },
    [applyFilters],
  );

  const loadTickets = useCallback(async () => {
    if (!canRead || subscriber.privacyRestricted) return;

    setError(false);
    try {
      const response = await assuranceApi.tickets.list({
        subscriberId: subscriber.id,
        limit: LIST_LIMIT,
        order: 'urgency',
      });
      // El servidor ya ordena por urgencia; el orden local se conserva (mismas claves, §5.1).
      const sorted = [...response.data].sort(compareTickets);
      setTickets(sorted);
      setTotal(response.meta?.total ?? response.total ?? null);
      setLoaded(true);
      onTicketsLoaded?.(sorted);
    } catch {
      setError(true);
    }
  }, [canRead, onTicketsLoaded, subscriber.id, subscriber.privacyRestricted]);

  // Una consulta al montar y una por cada `refreshKey`. La clave evita la segunda consulta
  // idéntica que StrictMode provoca al repetir el efecto en desarrollo (CA-SO-04).
  const requestedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${subscriber.id}:${refreshKey}:${canRead}:${subscriber.privacyRestricted}`;
    if (requestedKeyRef.current === key) return;
    requestedKeyRef.current = key;
    void loadTickets();
  }, [canRead, loadTickets, refreshKey, subscriber.id, subscriber.privacyRestricted]);

  const initialLoading = canRead && !error && (!loaded || usersPending);

  useEffect(() => {
    if (!initialLoading) {
      setShowSkeleton(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setShowSkeleton(true), 300);
    return () => window.clearTimeout(timeoutId);
  }, [initialLoading]);

  // El número de resultados se anuncia con retardo al filtrar (§10).
  const visibleCount = visibleTickets.length;
  const refined = hasRefinement || filter !== null;
  useEffect(() => {
    if (!loaded || !refined) {
      setResultsAnnouncement('');
      return;
    }
    const timeoutId = window.setTimeout(
      () =>
        setResultsAnnouncement(
          visibleCount === 1 ? '1 ticket coincide' : `${visibleCount} tickets coinciden`,
        ),
      500,
    );
    return () => window.clearTimeout(timeoutId);
  }, [loaded, refined, visibleCount]);

  let content: ReactNode;
  if (!canRead) {
    content = (
      <PortalAlert
        variant="warning"
        title="No tienes acceso a los tickets"
        description="Solicita el permiso de lectura de tickets para consultar esta información."
      />
    );
  } else if (error && !loaded) {
    content = (
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
  } else if (initialLoading && showSkeleton) {
    content = (
      <div className="space-y-2" aria-label="Cargando tickets" aria-busy="true">
        {[0, 1, 2, 3].map((index) => (
          <PortalSkeletonBlock key={index} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  } else if (initialLoading) {
    content = (
      <p className="text-sm text-gray-600 dark:text-gray-300" role="status">
        Cargando tickets…
      </p>
    );
  } else if (tickets.length === 0) {
    content = (
      <div className="space-y-3">
        {notice}
        <PortalEmptyState
          embedded
          title="Este suscriptor no tiene tickets"
          description="Los tickets relacionados con este suscriptor aparecerán aquí."
        />
      </div>
    );
  } else {
    content = renderList();
  }

  const showSummary = canRead && loaded && tickets.length > 0;
  const showNoDeadlineNote = showSummary && noOpenDeadlines && activeFilter !== 'cerrados';
  const figures = showSummary
    ? [
        <SummaryFigure
          key="abiertos"
          label="Abiertos"
          value={openCount}
          accessibleName={`Ver ${openCount} tickets abiertos`}
          onClick={() => showFromSummary('abiertos')}
        />,
        slaPoliciesConfigured ? (
          <SummaryFigure
            key="vencidos"
            label="Vencidos"
            value={overdueCount}
            tone={overdueCount > 0 ? 'error' : 'neutral'}
            accessibleName={`Ver ${overdueCount} tickets vencidos`}
            onClick={() => showFromSummary('vencidos')}
          />
        ) : null,
        upcomingVisits !== null && onShowVisits ? (
          <SummaryFigure
            key="visitas"
            label="Visitas próximas"
            value={upcomingVisits}
            accessibleName={`Ver ${upcomingVisits} visitas próximas`}
            onClick={onShowVisits}
          />
        ) : null,
      ].filter(Boolean)
    : [];

  function renderList() {
    const chips: Array<{ id: TicketFilter; label: string; count: number }> = [
      { id: 'abiertos', label: 'Abiertos', count: openCount },
      { id: 'cerrados', label: 'Resueltos y cerrados', count: closedCount },
      { id: 'todos', label: 'Todos', count: tickets.length },
    ];

    return (
      <div className="@container space-y-2">
        {/* Herramientas según el ancho de la lista, no del viewport (vista dividida, D1 §3): en una
            fila desde `@3xl` (CA-2); estrecho, chips desplazables + «Filtros» (§9). */}
        <div className="flex flex-wrap items-center gap-2 @3xl:flex-nowrap">
          <div
            role="group"
            aria-label="Filtrar tickets"
            className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 py-0.5 @lg:flex-none"
          >
            {chips.map((item) => (
              <PortalFilterChip
                key={item.id}
                active={activeFilter === item.id}
                onClick={() => applyFilters({ filter: item.id })}
                className="shrink-0"
              >
                {item.label} ({item.count})
              </PortalFilterChip>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11 shrink-0 gap-1.5 @lg:hidden"
            aria-expanded={filtersOpen}
            aria-controls="subscriber-ticket-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filtros
          </Button>
          <div
            id="subscriber-ticket-filters"
            role="group"
            aria-label="Más filtros de tickets"
            className={cn(
              'min-w-0 basis-full flex-col gap-2 @lg:flex @lg:flex-1 @lg:basis-auto @lg:flex-row @lg:items-center',
              filtersOpen ? 'flex' : 'hidden',
            )}
          >
            <div className="@lg:w-40 @lg:shrink-0">
              <Select
                aria-label="Prioridad"
                value={priority}
                options={PRIORITY_OPTIONS}
                onChange={(event) => applyFilters({ priority: event.target.value })}
              />
            </div>
            <div className="@lg:w-48 @lg:shrink-0">
              <Select
                aria-label="Tipo"
                value={type}
                options={TYPE_OPTIONS}
                onChange={(event) => applyFilters({ type: event.target.value })}
              />
            </div>
            <PortalSearchField
              id="subscriber-ticket-search"
              label="Buscar tickets por número o asunto"
              placeholder="Número o asunto"
              value={search}
              onChange={(value) => {
                setSearch(value);
                onFiltersChange?.();
              }}
              className="min-w-0 @lg:min-w-48 @lg:flex-1"
            />
          </div>
        </div>

        {notice}

        {visibleTickets.length === 0 ? (
          hasRefinement || activeFilter === 'vencidos' ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-gray-600 dark:text-gray-300" role="status">
                Ningún ticket coincide
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300" role="status">
              {activeFilter === 'abiertos'
                ? 'No hay tickets abiertos.'
                : 'No hay tickets resueltos ni cerrados.'}
            </p>
          )
        ) : (
          <ul
            ref={listRef}
            tabIndex={-1}
            aria-label="Tickets vinculados"
            // Contenedor de la fila (D1 §3) y, en vista dividida, desplazamiento propio (§3 E, CA-8).
            className="@container divide-y divide-gray-100 focus:outline-none dark:divide-dark-border xl:max-h-[32rem] xl:overflow-y-auto"
          >
            {visibleTickets.map((ticket) => (
              <TicketListItem
                key={ticket.id}
                ticket={ticket}
                assigneeLabel={getTicketAssigneeLabel(
                  ticket,
                  ticket.assignedUserId ? usersById.get(ticket.assignedUserId) : null,
                )}
                slaDeadline={needsAttention(ticket) ? getTicketDeadline(ticket) : null}
                fieldWork={getTicketFieldWork(ticket)}
                highlighted={ticket.id === highlightTicketId}
                selected={ticket.id === selectedTicketId}
                now={now}
                onOpen={(opener) => onOpenTicket(ticket, opener)}
              />
            ))}
          </ul>
        )}

        {total !== null && total > tickets.length ? (
          // D4: el enlace a Mesa de ayuda espera a que acepte el filtro por suscriptor en la URL.
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Se muestran {tickets.length} de {total} tickets, los más urgentes primero.
          </p>
        ) : null}

        <p className="sr-only" role="status">
          {resultsAnnouncement}
        </p>
      </div>
    );
  }

  // Cabecera propia en una banda densa: título, franja de cifras, línea «sin plazo» y «Crear
  // ticket» (CA-2 ≤ 480 px a 1440; CA-10 ≤ 160 px desde el panel a 375, §9).
  return (
    <PortalPanel
      id={SUBSCRIBER_TICKETS_PANEL_ID}
      density="dense"
      contentClassName="space-y-2 px-3 pb-3 pt-2 sm:px-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className={cn(portalPanelDenseTitleClassName, 'order-1')}>Tickets</h2>
        {figures.length > 0 ? (
          <div
            role="group"
            aria-label="Resumen de tickets"
            className="order-3 grid basis-full auto-cols-fr grid-flow-col gap-2 sm:order-2 sm:flex sm:basis-auto"
          >
            {figures}
          </div>
        ) : null}
        {showNoDeadlineNote ? (
          <p className="sr-only text-xs text-gray-600 dark:text-gray-300 sm:not-sr-only sm:order-3">
            Estos tickets no tienen plazo de atención; se ordenan por prioridad.
          </p>
        ) : null}
        {actions ? (
          <div className="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-4">
            {actions}
          </div>
        ) : null}
      </div>
      {content}
    </PortalPanel>
  );
}
