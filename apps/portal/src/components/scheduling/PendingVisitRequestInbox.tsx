'use client';

import { RefreshCcw } from 'lucide-react';
import { Badge, Button, Select } from '@iwana/ui';
import { VisitRequestStatus, WorkOrderPriority, WorkOrderSourceContext } from '@iwana/shared';
import type {
  ListWfmVisitRequestsResponse,
  WfmVisitRequest,
  WfmVisitRequestFilterOptionsResponse,
} from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import {
  formatWfmDateTime,
  getWorkOrderPriorityLabel,
  getWorkOrderPriorityVariant,
  getWfmWorkTypeLabel,
} from './scheduling-ui';
import {
  formatVisitRequestTerritory,
  type PendingVisitFilters,
  getVisitRequestOriginLabel,
  getVisitRequestReferenceLabel,
  getVisitRequestStatusLabel,
  getVisitRequestStatusVariant,
} from './pending-visits-ui';

interface PendingVisitRequestInboxProps {
  filters: PendingVisitFilters;
  response: ListWfmVisitRequestsResponse | null;
  selectedVisitRequestId: string | null;
  filterOptions: WfmVisitRequestFilterOptionsResponse | null;
  isLoading: boolean;
  isLoadingFilterOptions: boolean;
  onFiltersChange: (next: PendingVisitFilters) => void;
  onSelect: (visitRequestId: string) => void;
  onRefresh: () => void;
}

const statusOptions = Object.values(VisitRequestStatus).map((value) => ({
  value,
  label: getVisitRequestStatusLabel(value),
}));

const originOptions = Object.values(WorkOrderSourceContext).map((value) => ({
  value,
  label: getVisitRequestOriginLabel(value),
}));

const priorityOptions = Object.values(WorkOrderPriority).map((value) => ({
  value,
  label: getWorkOrderPriorityLabel(value),
}));

function VisitRequestRow({
  visitRequest,
  isSelected,
  onSelect,
}: {
  visitRequest: WfmVisitRequest;
  isSelected: boolean;
  onSelect: (visitRequestId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(visitRequest.id)}
      className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
        isSelected
          ? 'border-iwana-primary bg-iwana-primary-50/60 dark:border-iwana-primary-300 dark:bg-iwana-primary-900/15'
          : 'border-gray-200 bg-white hover:border-iwana-primary/30 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:bg-dark-surface-3'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {visitRequest.title}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {getVisitRequestReferenceLabel(visitRequest)}
          </p>
        </div>
        <Badge variant={getVisitRequestStatusVariant(visitRequest.status)}>
          {getVisitRequestStatusLabel(visitRequest.status)}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="neutral">{getVisitRequestOriginLabel(visitRequest.originContext)}</Badge>
        <Badge variant={getWorkOrderPriorityVariant(visitRequest.priority)}>
          {getWorkOrderPriorityLabel(visitRequest.priority)}
        </Badge>
        <Badge variant="info">{getWfmWorkTypeLabel(visitRequest.workType)}</Badge>
      </div>

      <div className="mt-3 grid gap-1 text-xs text-gray-500 dark:text-gray-400">
        <p>{formatVisitRequestTerritory(visitRequest.municipality, visitRequest.sector)}</p>
        <p>
          {visitRequest.slaDueAt
            ? `SLA ${formatWfmDateTime(visitRequest.slaDueAt)}`
            : `Creada ${formatWfmDateTime(visitRequest.createdAt)}`}
        </p>
      </div>
    </button>
  );
}

function toTerritoryOptions(
  options: WfmVisitRequestFilterOptionsResponse | null,
  key: 'municipalities' | 'sectors',
) {
  return (options?.[key] ?? []).map((option) => ({
    value: option.value,
    label: `${option.label === 'Sin dato' ? (key === 'municipalities' ? 'Sin municipio' : 'Sin sector') : option.label} (${option.count})`,
  }));
}

export function PendingVisitRequestInbox({
  filters,
  response,
  selectedVisitRequestId,
  filterOptions,
  isLoading,
  isLoadingFilterOptions,
  onFiltersChange,
  onSelect,
  onRefresh,
}: PendingVisitRequestInboxProps) {
  const items = response?.items ?? [];
  const meta = response?.meta;
  const municipalityOptions = toTerritoryOptions(filterOptions, 'municipalities');
  const sectorOptions = toTerritoryOptions(filterOptions, 'sectors');

  return (
    <PortalPanel
      eyebrow="Bandeja"
      title="Solicitudes pendientes"
      description="Prioriza por estado, origen, prioridad y territorio antes de confirmar agenda."
      actions={
        <Button type="button" variant="secondary" onClick={onRefresh} loading={isLoading}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Actualizar
        </Button>
      }
      className="h-full"
      contentClassName="space-y-4"
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Select
          id="pending-visits-status-filter"
          label="Estado"
          value={filters.status}
          placeholder="Todos"
          options={statusOptions}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              status: event.target.value as PendingVisitFilters['status'],
              page: 1,
            })
          }
        />
        <Select
          id="pending-visits-origin-filter"
          label="Origen"
          value={filters.originContext}
          placeholder="Todos"
          options={originOptions}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              originContext: event.target.value as PendingVisitFilters['originContext'],
              page: 1,
            })
          }
        />
        <Select
          id="pending-visits-priority-filter"
          label="Prioridad"
          value={filters.priority}
          placeholder="Todas"
          options={priorityOptions}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              priority: event.target.value as PendingVisitFilters['priority'],
              page: 1,
            })
          }
        />
        <Select
          id="pending-visits-municipality-filter"
          label="Municipio"
          value={filters.municipality}
          placeholder={isLoadingFilterOptions ? 'Cargando...' : 'Todos'}
          options={municipalityOptions}
          onChange={(event) =>
            onFiltersChange({ ...filters, municipality: event.target.value, sector: '', page: 1 })
          }
        />
        <Select
          id="pending-visits-sector-filter"
          label="Sector"
          value={filters.sector}
          placeholder={isLoadingFilterOptions ? 'Cargando...' : 'Todos'}
          options={sectorOptions}
          onChange={(event) => onFiltersChange({ ...filters, sector: event.target.value, page: 1 })}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          {meta
            ? `${meta.total} solicitudes · página ${meta.page} de ${Math.max(meta.totalPages, 1)}`
            : 'Sin datos cargados'}
        </span>
      </div>

      {items.length === 0 ? (
        <PortalEmptyState
          title="No hay solicitudes en esta vista"
          description="Ajusta los filtros o espera nuevas materializaciones desde CRM, Aseguramiento o flujos manuales."
        />
      ) : (
        <div>
          <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2 lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-[0.16em] text-gray-500 dark:bg-dark-surface-3 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 text-left align-middle font-semibold">Prioridad</th>
                    <th className="px-4 py-3 text-left align-middle font-semibold">Estado</th>
                    <th className="px-4 py-3 text-left align-middle font-semibold">Origen</th>
                    <th className="px-4 py-3 text-left align-middle font-semibold">Solicitud</th>
                    <th className="px-4 py-3 text-left align-middle font-semibold">Municipio</th>
                    <th className="px-4 py-3 text-left align-middle font-semibold">SLA</th>
                    <th className="px-4 py-3 text-left align-middle font-semibold">Faltantes</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((visitRequest) => {
                    const missingCount = [
                      !visitRequest.address?.trim(),
                      !visitRequest.municipality?.trim(),
                    ].filter(Boolean).length;
                    const isSelected = visitRequest.id === selectedVisitRequestId;

                    return (
                      <tr
                        key={visitRequest.id}
                        className={`cursor-pointer border-t border-gray-100 transition-colors dark:border-dark-border ${
                          isSelected
                            ? 'bg-iwana-primary-50/70 dark:bg-iwana-primary-900/15'
                            : 'hover:bg-gray-50 dark:hover:bg-dark-surface-3'
                        }`}
                        onClick={() => onSelect(visitRequest.id)}
                      >
                        <td className="px-4 py-3 align-middle">
                          <Badge variant={getWorkOrderPriorityVariant(visitRequest.priority)}>
                            {getWorkOrderPriorityLabel(visitRequest.priority)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <Badge variant={getVisitRequestStatusVariant(visitRequest.status)}>
                            {getVisitRequestStatusLabel(visitRequest.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <Badge variant="neutral">
                            {getVisitRequestOriginLabel(visitRequest.originContext)}
                          </Badge>
                        </td>
                        <td className="max-w-[280px] px-4 py-3 align-middle">
                          <button
                            type="button"
                            className="block w-full text-left"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelect(visitRequest.id);
                            }}
                          >
                            <span className="block truncate font-semibold text-gray-900 dark:text-white">
                              {visitRequest.title}
                            </span>
                            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                              {getVisitRequestReferenceLabel(visitRequest)} ·{' '}
                              {getWfmWorkTypeLabel(visitRequest.workType)}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-3 align-middle text-sm text-gray-600 dark:text-gray-300">
                          {formatVisitRequestTerritory(
                            visitRequest.municipality,
                            visitRequest.sector,
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle text-xs text-gray-500 dark:text-gray-400">
                          {visitRequest.slaDueAt
                            ? formatWfmDateTime(visitRequest.slaDueAt)
                            : formatWfmDateTime(visitRequest.createdAt)}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <Badge variant={missingCount > 0 ? 'warning' : 'success'}>
                            {missingCount > 0
                              ? `${missingCount} faltante${missingCount === 1 ? '' : 's'}`
                              : 'Completa'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 lg:hidden">
            {items.map((visitRequest) => (
              <VisitRequestRow
                key={visitRequest.id}
                visitRequest={visitRequest}
                isSelected={visitRequest.id === selectedVisitRequestId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            disabled={meta.page <= 1}
            onClick={() => onFiltersChange({ ...filters, page: Math.max(1, filters.page - 1) })}
          >
            Página anterior
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={meta.page >= meta.totalPages}
            onClick={() =>
              onFiltersChange({
                ...filters,
                page: Math.min(meta.totalPages, filters.page + 1),
              })
            }
          >
            Siguiente página
          </Button>
        </div>
      )}
    </PortalPanel>
  );
}
