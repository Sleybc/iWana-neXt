'use client';

import type { ReactNode } from 'react';
import { CalendarClock, ClipboardList, Paperclip } from 'lucide-react';
import { Badge, Button, Select, cn, interactiveFocusClassName } from '@iwana/ui';
import { SlaBreachStatus } from '@iwana/shared';
import type { AssuranceTicket, ListAssuranceTicketsParams } from '@/lib/api-client';
import { formatDueRelative } from '@/lib/format-relative-time';
import {
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  PortalPageSizeSelect,
  PortalSearchField,
  PortalTablePager,
  PortalTablePagination,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalDataBusyRegionClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  ASSURANCE_QUEUE_OPTIONS,
  ASSURANCE_SLA_STATUS_OPTIONS,
  ASSURANCE_TICKET_PRIORITY_OPTIONS,
  ASSURANCE_TICKET_STATUS_OPTIONS,
  ASSURANCE_TICKET_TYPE_OPTIONS,
  formatAssuranceDateTime,
  getAssuranceQueueLabel,
  getAssuranceSlaStatusLabel,
  getAssuranceSlaStatusVariant,
  getAssuranceTicketTypeLabel,
  getAssuranceAssigneeLabel,
} from './assurance-labels';
import type { AssuranceBadgeVariant } from './assurance-labels';
import {
  getTicketDeadline,
  getTicketFieldWork,
  getTicketStory,
  isTerminalTicket,
  needsAttention,
} from './assurance-ticket-model';
import { AssigneeMark } from './AssigneeMark';
import { AssigneeReassignControl, type ReassignPayload } from './AssigneeReassignControl';
import { formatTicketAttachmentCount } from './ticket-attachments';
import { TicketPriorityBadge, TicketStatusBadge } from './ticket-badges';

const TICKETS_RESOURCE = { singular: 'ticket', plural: 'tickets' } as const;
const TABLE_COLUMNS = ['Ticket', 'Estado', 'Responsable y área', 'Vence', 'Actualizado'] as const;
const BREACHED_STATUSES = new Set<string>([
  SlaBreachStatus.FIRST_RESPONSE_BREACHED,
  SlaBreachStatus.RESOLUTION_BREACHED,
]);

/** Celda «Vence» (spec §3 E): relativo con la fecha exacta en `title`; sin plazo, «Sin plazo». */
interface DueCell {
  text: string;
  title: string | undefined;
  variant: AssuranceBadgeVariant;
  /** Estado de plazo en texto para no depender solo del color (WCAG 1.4.1). */
  stateLabel: string | null;
}

function buildDueCell(ticket: AssuranceTicket, now: number): DueCell | null {
  // Regla E: «Sin plazo» solo cuando el ticket no tiene política de plazo.
  const hasPolicy = Boolean(ticket.slaPolicyId);
  const breached = BREACHED_STATUSES.has(ticket.slaBreachStatus);
  const atRisk = ticket.slaBreachStatus === SlaBreachStatus.AT_RISK;
  const stateLabel = breached || atRisk ? getAssuranceSlaStatusLabel(ticket.slaBreachStatus) : null;
  const breachedCell: DueCell = {
    text: getAssuranceSlaStatusLabel(ticket.slaBreachStatus),
    title: undefined,
    variant: 'error',
    stateLabel: null,
  };

  // Resuelto o cerrado: se conserva el resultado del plazo (spec §3 D, «ningún dato se pierde»).
  if (!needsAttention(ticket)) {
    if (breached) return breachedCell;
    if (!hasPolicy) return null;
    return { text: 'Plazo cumplido', title: undefined, variant: 'success', stateLabel: null };
  }
  if (!hasPolicy) {
    return { text: 'Sin plazo', title: undefined, variant: 'neutral', stateLabel: null };
  }
  const deadline = getTicketDeadline(ticket);
  if (deadline === null) {
    if (breached) return breachedCell;
    return { text: 'Sin plazo pendiente', title: undefined, variant: 'neutral', stateLabel };
  }
  const pastDue = deadline < now;
  let variant: AssuranceBadgeVariant = getAssuranceSlaStatusVariant(ticket.slaBreachStatus);
  if (pastDue && !breached) variant = 'warning';
  return {
    text: formatDueRelative(deadline, now),
    title: formatAssuranceDateTime(new Date(deadline)),
    variant,
    stateLabel,
  };
}

interface AssuranceTicketsTableProps {
  tickets: AssuranceTicket[];
  total: number;
  isLoading: boolean;
  refreshing?: boolean;
  /** Acceso aleatorio declarado por el servidor (`meta.capabilities.randomAccess`). */
  randomAccess: boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  from: number;
  to: number;
  hasMore: boolean;
  filters: ListAssuranceTicketsParams;
  searchValue: string;
  /** K: con `crm.subscribers.read` el servidor también busca por cliente (spec §4). */
  searchByClient?: boolean | undefined;
  assigneeLabelById: Map<string, string>;
  onFiltersChange: (filters: ListAssuranceTicketsParams) => void;
  onSearchChange: (value: string) => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onLoadMore: () => void;
  onOpenTicket: (ticket: AssuranceTicket) => void;
  onOpenCreate: () => void;
  canManage: boolean;
  /** Colas de trabajo (spec §3 B), entre la cabecera y los filtros. */
  queues?: ReactNode;
  /** Vacío propio de la cola acotada (p. ej. «Míos»); sustituye al de primera vez. */
  queueEmptyState?: ReactNode;
  /** «Asignarme» (spec §3 G); solo se ofrece con `canManage` y en tickets sin responsable. */
  onAssignToMe?: ((ticket: AssuranceTicket) => void) | undefined;
  assigningTicketId?: string | null | undefined;
  /**
   * Reasignar desde la fila (spec 2026-11-20 asignación visible, bloque C): con `canManage`, el
   * responsable es un control con los mismos usuarios que el detalle; sin él, solo se muestra.
   */
  assigneeOptions?: ReadonlyArray<{ value: string; label: string }> | undefined;
  onReassign?: ((ticket: AssuranceTicket, payload: ReassignPayload) => void) | undefined;
  /** Reloj inyectable para pruebas. */
  now?: number | undefined;
}

export function AssuranceTicketsTable({
  tickets,
  total,
  isLoading,
  refreshing = false,
  randomAccess,
  page,
  pageCount,
  pageSize,
  from,
  to,
  hasMore,
  filters,
  searchValue,
  searchByClient = false,
  assigneeLabelById,
  onFiltersChange,
  onSearchChange,
  onClearFilters,
  onPageChange,
  onPageSizeChange,
  onLoadMore,
  onOpenTicket,
  onOpenCreate,
  canManage,
  queues,
  queueEmptyState,
  onAssignToMe,
  assigningTicketId = null,
  assigneeOptions = [],
  onReassign,
  now = Date.now(),
}: AssuranceTicketsTableProps) {
  const hasActiveFilters = Boolean(
    searchValue.trim() ||
    filters.status ||
    filters.priority ||
    filters.type ||
    filters.queueName ||
    filters.slaBreachStatus ||
    filters.requesterRefId,
  );
  // Una lista acotada al responsable no es «primera vez»: puede haber tickets de otros.
  const isScopedToAssignee = filters.workQueue === 'mine' || Boolean(filters.assignedUserId);
  const showPager = !isLoading && total > 0;
  const showPageSize = showPager && randomAccess;
  const canAssignToMe = canManage && Boolean(onAssignToMe);
  const canReassign = canManage && Boolean(onReassign) && assigneeOptions.length > 0;

  const filterSelect = (
    id: string,
    label: string,
    key: 'priority' | 'type' | 'queueName' | 'status' | 'slaBreachStatus',
    allLabel: string,
    options: ReadonlyArray<{ value: string; label: string }>,
  ) => (
    <Select
      id={id}
      label={label}
      value={filters[key] ?? ''}
      options={[{ value: '', label: allLabel }, ...options]}
      onChange={(event) => onFiltersChange({ ...filters, [key]: event.target.value || undefined })}
    />
  );

  return (
    <PortalPanel className="overflow-hidden p-0" contentClassName="p-0">
      <div className="space-y-4 border-b border-gray-100/80 px-5 py-4 dark:border-dark-border">
        {/* A · Cabecera en una línea: título, conteo, búsqueda y «Nuevo ticket». */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="text-xl font-semibold text-iwana-primary dark:text-white">
              Mesa de ayuda
            </h1>
            {showPager ? (
              <span className="text-sm tabular-nums text-gray-600 dark:text-gray-300">
                {total} {total === 1 ? TICKETS_RESOURCE.singular : TICKETS_RESOURCE.plural}
              </span>
            ) : null}
          </div>
          <div className="ml-auto flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <PortalSearchField
              id="assurance-search"
              label="Buscar tickets"
              value={searchValue}
              placeholder={
                searchByClient
                  ? 'Buscar por número, asunto o cliente…'
                  : 'Buscar por número o asunto…'
              }
              onChange={onSearchChange}
              className="w-full sm:w-72"
            />
            {canManage ? (
              <Button type="button" variant="primary" onClick={onOpenCreate}>
                Nuevo ticket
              </Button>
            ) : null}
          </div>
        </div>

        {queues}

        {/* C · Filtros bajo las colas; el de plazo gana control visible. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
          {filterSelect(
            'assurance-filter-priority',
            'Prioridad',
            'priority',
            'Todas',
            ASSURANCE_TICKET_PRIORITY_OPTIONS,
          )}
          {filterSelect(
            'assurance-filter-type',
            'Tipo',
            'type',
            'Todos',
            ASSURANCE_TICKET_TYPE_OPTIONS,
          )}
          {filterSelect(
            'assurance-filter-queue',
            'Área',
            'queueName',
            'Todas',
            ASSURANCE_QUEUE_OPTIONS,
          )}
          {filterSelect(
            'assurance-filter-status',
            'Estado',
            'status',
            'Todos',
            ASSURANCE_TICKET_STATUS_OPTIONS,
          )}
          {filterSelect(
            'assurance-filter-sla',
            'Plazo',
            'slaBreachStatus',
            'Todos',
            ASSURANCE_SLA_STATUS_OPTIONS,
          )}
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onClearFilters}
              className="h-12 px-4"
            >
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className={portalDataTableShellClassName}>
          <div
            className={
              refreshing ? `overflow-x-auto ${portalDataBusyRegionClassName}` : 'overflow-x-auto'
            }
            aria-busy={refreshing || undefined}
          >
            {/* CA-8: bajo `md` la tabla se lee como lista (filas en bloque, sin cabecera). */}
            <table className="w-full text-sm max-md:block" aria-label="Bandeja">
              <thead className={cn(portalDataTableHeadRowClassName, 'max-md:sr-only')}>
                <tr>
                  {TABLE_COLUMNS.map((label) => (
                    <PortalDataTableHead key={label}>{label}</PortalDataTableHead>
                  ))}
                </tr>
              </thead>
              <tbody className={cn(portalDataTableBodyClassName, 'max-md:block')}>
                {isLoading && tickets.length === 0 ? (
                  <tr className="max-md:block">
                    <td
                      colSpan={TABLE_COLUMNS.length}
                      className={`${portalDataTableCellClassName} py-12 text-center text-gray-500 dark:text-gray-400 max-md:block`}
                    >
                      Cargando tickets de la mesa de ayuda...
                    </td>
                  </tr>
                ) : null}

                {!isLoading && tickets.length === 0 ? (
                  <tr className="max-md:block">
                    <td
                      colSpan={TABLE_COLUMNS.length}
                      className={`${portalDataTableCellClassName} py-12 text-center max-md:block`}
                    >
                      {hasActiveFilters ? (
                        <PortalEmptyState
                          title="Sin resultados"
                          description={
                            searchValue.trim()
                              ? 'Ningún ticket coincide con la búsqueda.'
                              : 'Ningún ticket coincide con los filtros actuales.'
                          }
                          className="mx-auto max-w-xl text-left"
                          action={
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={onClearFilters}
                            >
                              Limpiar filtros
                            </Button>
                          }
                        />
                      ) : queueEmptyState ? (
                        queueEmptyState
                      ) : isScopedToAssignee ? (
                        <PortalEmptyState
                          title="Sin tickets en esta cola"
                          description="Ningún ticket de esta cola está asignado a ti."
                          className="mx-auto max-w-xl text-left"
                        />
                      ) : (
                        <div className="relative w-full overflow-hidden px-6 py-2">
                          <PortalEmptyState
                            title="Aún no hay tickets"
                            description="Crea el primer ticket para operar la mesa de ayuda de tu empresa."
                            embedded
                            className="relative w-full py-4 text-left"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ) : null}

                {tickets.map((ticket) => {
                  const due = buildDueCell(ticket, now);
                  const story = getTicketStory(ticket);
                  const fieldWork = getTicketFieldWork(ticket);
                  const FieldWorkIcon = fieldWork?.kind === 'order' ? ClipboardList : CalendarClock;
                  const attachmentCount = ticket.attachmentCount ?? 0;
                  const assigneeLabel = ticket.assignedUserId
                    ? (assigneeLabelById.get(ticket.assignedUserId) ??
                      getAssuranceAssigneeLabel(ticket.assignedUserId, null))
                    : getAssuranceAssigneeLabel(null, null);
                  // Cerrado o cancelado: el responsable queda como dato (spec ticket cerrado §2).
                  const readOnlyAssignment = isTerminalTicket(ticket);
                  const showAssignToMe =
                    canAssignToMe && !ticket.assignedUserId && !readOnlyAssignment;
                  const showReassign = canReassign && !readOnlyAssignment;

                  return (
                    <tr
                      key={ticket.id}
                      // La fila entera abre el ticket con el ratón; el teclado usa el número.
                      onClick={() => onOpenTicket(ticket)}
                      className={cn(
                        portalTableRowHoverClassName,
                        'cursor-pointer max-md:block max-md:border-b max-md:border-gray-100 max-md:py-2 max-md:dark:border-dark-border',
                      )}
                    >
                      <td
                        className={cn(
                          portalDataTableCellClassName,
                          'py-2 max-md:block max-md:py-1',
                        )}
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenTicket(ticket);
                              }}
                              className={cn(
                                'w-fit rounded text-left font-mono font-semibold text-iwana-primary transition hover:text-iwana-primary-700 dark:text-iwana-primary-300',
                                interactiveFocusClassName,
                              )}
                            >
                              {ticket.ticketNumber}
                            </button>
                            <TicketPriorityBadge priority={ticket.priority} />
                            <span className="text-xs text-gray-600 dark:text-gray-300">
                              {getAssuranceTicketTypeLabel(ticket.type)}
                            </span>
                            {attachmentCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                                {formatTicketAttachmentCount(attachmentCount)}
                              </span>
                            ) : null}
                          </div>
                          {/* L: el cliente va en la línea del asunto para no perder filas (CA-2). */}
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span
                              title={ticket.subject}
                              className="line-clamp-1 min-w-0 text-sm text-gray-900 dark:text-white"
                            >
                              {ticket.subject}
                            </span>
                            {ticket.requesterDisplayName ? (
                              <span
                                title={ticket.requesterDisplayName}
                                className="max-w-[45%] shrink-0 truncate text-xs text-gray-600 dark:text-gray-300"
                              >
                                <span className="sr-only">Cliente: </span>
                                {ticket.requesterDisplayName}
                              </span>
                            ) : null}
                          </div>
                          {/* §3 G: una línea del relato bajo el asunto; texto, nunca HTML. */}
                          {story ? (
                            <span className="line-clamp-1 text-xs text-gray-600 dark:text-gray-300">
                              {story}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={cn(
                          portalDataTableCellClassName,
                          'py-2 max-md:inline-block max-md:py-1',
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <TicketStatusBadge status={ticket.status} />
                          {fieldWork ? (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                              <FieldWorkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                              {fieldWork.label}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={cn(
                          portalDataTableCellClassName,
                          'py-2 max-md:block max-md:py-1',
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <div className="flex min-w-0 items-center gap-2">
                            {showReassign ? (
                              <AssigneeReassignControl
                                ticketNumber={ticket.ticketNumber}
                                assigneeLabel={assigneeLabel}
                                currentAssigneeId={ticket.assignedUserId ?? null}
                                options={assigneeOptions}
                                disabled={assigningTicketId === ticket.id}
                                onReassign={(payload) => onReassign?.(ticket, payload)}
                                showName
                              />
                            ) : (
                              <AssigneeMark label={assigneeLabel} showName />
                            )}
                            <span className="shrink-0 text-xs text-gray-600 dark:text-gray-300">
                              {getAssuranceQueueLabel(ticket.queueName)}
                            </span>
                          </div>
                          {showAssignToMe ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Asignarme ${ticket.ticketNumber}`}
                              disabled={assigningTicketId === ticket.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                onAssignToMe?.(ticket);
                              }}
                              className="relative min-h-11 md:min-h-8"
                            >
                              Asignarme
                            </Button>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={cn(
                          portalDataTableCellClassName,
                          'py-2 max-md:inline-block max-md:py-1',
                        )}
                      >
                        {due ? (
                          <span title={due.title}>
                            <Badge variant={due.variant}>
                              {due.text}
                              {due.stateLabel ? (
                                <span className="sr-only">, {due.stateLabel}</span>
                              ) : null}
                            </Badge>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600 dark:text-gray-300">—</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          portalDataTableCellClassName,
                          'py-2 text-xs text-gray-600 dark:text-gray-300 max-md:block max-md:py-1',
                        )}
                      >
                        <span className="md:sr-only">Actualizado </span>
                        {formatAssuranceDateTime(ticket.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {showPager && randomAccess ? (
            <PortalTablePager
              page={page}
              pageCount={Math.max(1, pageCount)}
              onPageChange={onPageChange}
              from={from}
              to={to}
              total={total}
              resource={TICKETS_RESOURCE}
              loading={refreshing}
              pageSizeControl={
                showPageSize ? (
                  <PortalPageSizeSelect
                    value={pageSize}
                    onChange={onPageSizeChange}
                    disabled={refreshing}
                  />
                ) : undefined
              }
            />
          ) : null}

          {showPager && !randomAccess ? (
            <PortalTablePagination
              hasMore={hasMore}
              onLoadMore={onLoadMore}
              loading={refreshing}
              resourceLabel="tickets"
              shown={to}
              total={total}
            />
          ) : null}
        </div>
      </div>
    </PortalPanel>
  );
}
