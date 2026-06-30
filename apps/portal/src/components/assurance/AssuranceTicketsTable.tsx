'use client';

import { Search } from 'lucide-react';
import { Badge, Button, Select } from '@iwana/ui';
import type { AssuranceTicket, ListAssuranceTicketsParams } from '@/lib/api-client';
import { PortalEmptyState, PortalSectionHeader } from '@/components/shared/portal-ui';
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

interface AssuranceTicketsTableProps {
  tickets: AssuranceTicket[];
  total: number;
  isLoading: boolean;
  filters: ListAssuranceTicketsParams;
  searchValue: string;
  assigneeLabelById: Map<string, string>;
  onFiltersChange: (filters: ListAssuranceTicketsParams) => void;
  onSearchChange: (value: string) => void;
  onOpenTicket: (ticket: AssuranceTicket) => void;
  onOpenCreate: () => void;
  canManage: boolean;
}

export function AssuranceTicketsTable({
  tickets,
  total,
  isLoading,
  filters,
  searchValue,
  assigneeLabelById,
  onFiltersChange,
  onSearchChange,
  onOpenTicket,
  onOpenCreate,
  canManage,
}: AssuranceTicketsTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
      <div className="border-b border-gray-100/80 px-5 py-5 dark:border-dark-border">
        <PortalSectionHeader
          eyebrow="Mesa de ayuda"
          title="Cola operativa de tickets"
          description="Filtra por estado, prioridad, tipo o cola para operar la bandeja de la empresa autenticada."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="neutral"
                className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
              >
                {total} casos
              </Badge>
              {canManage && (
                <Button type="button" onClick={onOpenCreate}>
                  Nuevo ticket
                </Button>
              )}
            </div>
          }
        />

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_220px_220px_220px_220px] lg:items-end">
          <div className="relative">
            <label htmlFor="assurance-search" className="sr-only">
              Buscar ticket
            </label>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              id="assurance-search"
              type="search"
              value={searchValue}
              placeholder="Buscar por número, asunto o referencia…"
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50/70 pl-11 pr-4 text-sm text-iwana-primary shadow-sm transition-all duration-200 placeholder:text-gray-400 focus:border-iwana-secondary focus:bg-white focus:outline-none focus:ring-2 focus:ring-iwana-secondary/35 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>

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
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-[#f6f8f4] dark:border-dark-border dark:bg-dark-surface-3">
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
                <th
                  key={label}
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && tickets.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                  Cargando tickets de la mesa de ayuda...
                </td>
              </tr>
            ) : null}

            {!isLoading && tickets.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8">
                  <PortalEmptyState
                    title="Sin tickets para el filtro actual"
                    description="Ajusta los filtros o crea un ticket nuevo si el flujo lo requiere."
                  />
                </td>
              </tr>
            ) : null}

            {tickets.map((ticket) => (
              <tr
                key={ticket.id}
                className="border-b border-gray-50 transition-colors hover:bg-[#fbfcf8] dark:border-dark-border dark:hover:bg-dark-surface-3"
              >
                <td className="align-middle px-4 py-3">
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
                <td className="align-middle px-4 py-3">
                  <Badge variant="primary">{getAssuranceTicketTypeLabel(ticket.type)}</Badge>
                </td>
                <td className="align-middle px-4 py-3">
                  <Badge variant={getAssuranceTicketStatusVariant(ticket.status)}>
                    {getAssuranceTicketStatusLabel(ticket.status)}
                  </Badge>
                </td>
                <td className="align-middle px-4 py-3">
                  <Badge variant={getAssuranceTicketPriorityVariant(ticket.priority)}>
                    {getAssuranceTicketPriorityLabel(ticket.priority)}
                  </Badge>
                </td>
                <td className="align-middle px-4 py-3">
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
                <td className="align-middle px-4 py-3">
                  <Badge variant={getAssuranceSlaStatusVariant(ticket.slaBreachStatus)}>
                    {getAssuranceSlaStatusLabel(ticket.slaBreachStatus)}
                  </Badge>
                </td>
                <td className="align-middle px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                  {formatAssuranceDateTime(ticket.updatedAt)}
                </td>
                <td className="align-middle px-4 py-3 text-right">
                  <Button type="button" variant="secondary" onClick={() => onOpenTicket(ticket)}>
                    Ver detalle
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
