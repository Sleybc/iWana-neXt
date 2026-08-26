'use client';

import { Badge, Button, Select } from '@iwana/ui';
import type { AssuranceTicket, ListAssuranceTicketsParams } from '@/lib/api-client';
import {
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  PortalPageSizeSelect,
  PortalSearchField,
  PortalSectionHeader,
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
  ASSURANCE_TICKET_PRIORITY_OPTIONS,
  ASSURANCE_TICKET_STATUS_OPTIONS,
  ASSURANCE_TICKET_TYPE_OPTIONS,
  formatAssuranceDateTime,
  getAssuranceQueueLabel,
  getAssuranceSlaStatusLabel,
  getAssuranceSlaStatusVariant,
  getAssuranceTicketPriorityLabel,
  getAssuranceTicketPriorityVariant,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketStatusVariant,
  getAssuranceTicketTypeLabel,
  getAssuranceUserDisplayName,
} from './assurance-labels';

const TICKETS_RESOURCE = { singular: 'ticket', plural: 'tickets' } as const;

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
}: AssuranceTicketsTableProps) {
  const hasActiveFilters = Boolean(
    searchValue.trim() ||
    filters.status ||
    filters.priority ||
    filters.type ||
    filters.queueName ||
    filters.slaBreachStatus ||
    filters.requesterRefId ||
    filters.assignedUserId,
  );
  const showPager = !isLoading && total > 0;
  const showPageSize = showPager && randomAccess;

  return (
    <PortalPanel className="overflow-hidden p-0" contentClassName="p-0">
      <div className="border-b border-gray-100/80 px-5 py-5 dark:border-dark-border">
        <PortalSectionHeader
          eyebrow="Mesa de ayuda"
          title="Cola operativa de tickets"
          description="Filtra por estado, prioridad, tipo o cola para operar la bandeja de la empresa autenticada."
          actions={
            canManage ? (
              <Button type="button" variant="primary" onClick={onOpenCreate}>
                Nuevo ticket
              </Button>
            ) : undefined
          }
        />

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_220px_220px_220px_220px_auto] lg:items-end">
          <PortalSearchField
            id="assurance-search"
            label="Filtrar en esta página"
            value={searchValue}
            placeholder="Filtrar en esta página por número, asunto o referencia…"
            onChange={onSearchChange}
          />

          <Select
            id="assurance-filter-status"
            label="Estado"
            value={filters.status ?? ''}
            options={[{ value: '', label: 'Todos' }, ...ASSURANCE_TICKET_STATUS_OPTIONS]}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                status: (event.target.value || undefined) as ListAssuranceTicketsParams['status'],
              })
            }
          />

          <Select
            id="assurance-filter-priority"
            label="Prioridad"
            value={filters.priority ?? ''}
            options={[{ value: '', label: 'Todas' }, ...ASSURANCE_TICKET_PRIORITY_OPTIONS]}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                priority: (event.target.value ||
                  undefined) as ListAssuranceTicketsParams['priority'],
              })
            }
          />
          <Select
            id="assurance-filter-type"
            label="Tipo"
            value={filters.type ?? ''}
            options={[{ value: '', label: 'Todos' }, ...ASSURANCE_TICKET_TYPE_OPTIONS]}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                type: (event.target.value || undefined) as ListAssuranceTicketsParams['type'],
              })
            }
          />
          <Select
            id="assurance-filter-queue"
            label="Cola"
            value={filters.queueName ?? ''}
            options={[{ value: '', label: 'Todas' }, ...ASSURANCE_QUEUE_OPTIONS]}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                queueName: (event.target.value ||
                  undefined) as ListAssuranceTicketsParams['queueName'],
              })
            }
          />
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
            <table className="w-full min-w-[980px] text-sm" aria-label="Cola operativa de tickets">
              <thead className={portalDataTableHeadRowClassName}>
                <tr>
                  {[
                    'Ticket',
                    'Tipo',
                    'Estado',
                    'Prioridad',
                    'Cola y responsable',
                    'SLA',
                    'Actualización',
                    'Acciones',
                  ].map((label) => (
                    <PortalDataTableHead key={label}>{label}</PortalDataTableHead>
                  ))}
                </tr>
              </thead>
              <tbody className={portalDataTableBodyClassName}>
                {isLoading && tickets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className={`${portalDataTableCellClassName} py-12 text-center text-gray-500 dark:text-gray-400`}
                    >
                      Cargando tickets de la mesa de ayuda...
                    </td>
                  </tr>
                ) : null}

                {!isLoading && tickets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={`${portalDataTableCellClassName} py-12 text-center`}>
                      {hasActiveFilters ? (
                        <PortalEmptyState
                          title="Sin resultados"
                          description={
                            searchValue.trim()
                              ? 'Ningún ticket de esta página coincide con el filtro local. Limpia el texto o cambia de página.'
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

                {tickets.map((ticket) => (
                  <tr key={ticket.id} className={portalTableRowHoverClassName}>
                    <td className={portalDataTableCellClassName}>
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenTicket(ticket)}
                          className="w-fit text-left font-semibold text-iwana-primary transition hover:text-iwana-primary-700 dark:text-iwana-primary-300"
                        >
                          {ticket.ticketNumber}
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {ticket.subject}
                        </span>
                      </div>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Badge variant="primary">{getAssuranceTicketTypeLabel(ticket.type)}</Badge>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Badge variant={getAssuranceTicketStatusVariant(ticket.status)}>
                        {getAssuranceTicketStatusLabel(ticket.status)}
                      </Badge>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Badge variant={getAssuranceTicketPriorityVariant(ticket.priority)}>
                        {getAssuranceTicketPriorityLabel(ticket.priority)}
                      </Badge>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <div className="space-y-1">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {getAssuranceQueueLabel(ticket.queueName)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {ticket.assignedUserId
                            ? (assigneeLabelById.get(ticket.assignedUserId) ??
                              getAssuranceUserDisplayName(null))
                            : 'Sin asignar'}
                        </p>
                      </div>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Badge variant={getAssuranceSlaStatusVariant(ticket.slaBreachStatus)}>
                        {getAssuranceSlaStatusLabel(ticket.slaBreachStatus)}
                      </Badge>
                    </td>
                    <td
                      className={`${portalDataTableCellClassName} text-xs text-gray-500 dark:text-gray-400`}
                    >
                      {formatAssuranceDateTime(ticket.updatedAt)}
                    </td>
                    <td className={`${portalDataTableCellClassName} text-right`}>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => onOpenTicket(ticket)}
                      >
                        Ver detalle
                      </Button>
                    </td>
                  </tr>
                ))}
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
