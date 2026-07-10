'use client';

import type { ReactNode } from 'react';
import { Badge, Button } from '@iwana/ui';
import { StockIssueStatus } from '@iwana/shared';
import type { StockIssueRecord, StockLocationRecord } from '@/lib/api-client';
import {
  PortalActionToolbar,
  PortalEmptyState,
  PortalSkeletonBlock,
  interactiveFocusClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryDateTime,
  getStockIssueStatusBadgeVariant,
  getStockIssueStatusLabel,
  getStockIssueTypeBadgeVariant,
  getStockIssueTypeLabel,
  getStockLocationTypeLabel,
} from './inventory-labels';

const DISPATCHABLE_STATUSES = new Set<StockIssueStatus>([
  StockIssueStatus.REQUESTED,
  StockIssueStatus.APPROVED,
  StockIssueStatus.PICKING,
  StockIssueStatus.READY_TO_DISPATCH,
]);

interface StockIssuesTableProps {
  issues: StockIssueRecord[];
  locationMap: Map<string, StockLocationRecord>;
  isLoading?: boolean;
  isRefreshing?: boolean;
  hasActiveFilters?: boolean;
  issuesIsEmpty?: boolean;
  onOpenDetail: (issueId: string) => void;
  emptyAction?: ReactNode;
  onClearFilters?: () => void;
}

export function StockIssuesTable({
  issues,
  locationMap,
  isLoading = false,
  isRefreshing = false,
  hasActiveFilters = false,
  issuesIsEmpty = false,
  onOpenDetail,
  emptyAction,
  onClearFilters,
}: StockIssuesTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <PortalSkeletonBlock key={index} className="h-12 rounded-xl" />
        ))}
      </div>
    );
  }

  if (issues.length === 0) {
    const emptyTitle = issuesIsEmpty
      ? 'Sin salidas registradas'
      : hasActiveFilters
        ? 'Sin resultados'
        : 'Sin salidas registradas';

    const emptyDescription = issuesIsEmpty
      ? 'Crea una salida para empezar a despachar material desde bodega principal.'
      : hasActiveFilters
        ? 'Ajusta los filtros para encontrar otra salida.'
        : 'Crea una salida para empezar a despachar material desde bodega principal.';

    const filteredEmptyAction =
      hasActiveFilters && onClearFilters ? (
        <Button type="button" variant="secondary" onClick={onClearFilters}>
          Limpiar filtros
        </Button>
      ) : (
        emptyAction
      );

    return (
      <PortalEmptyState
        className="w-full"
        title={emptyTitle}
        description={emptyDescription}
        action={filteredEmptyAction}
      />
    );
  }

  return (
    <div className="relative overflow-x-auto" aria-busy={isRefreshing}>
      <table className="w-full min-w-[960px] text-sm">
        <caption className="sr-only">Salidas de bodega</caption>
        <thead>
          <tr className="border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3">
            <th scope="col" className={portalDataTableHeadClassName}>
              Número
            </th>
            <th scope="col" className={portalDataTableHeadClassName}>
              Tipo
            </th>
            <th scope="col" className={portalDataTableHeadClassName}>
              Estado
            </th>
            <th scope="col" className={`${portalDataTableHeadClassName} hidden lg:table-cell`}>
              Origen
            </th>
            <th scope="col" className={portalDataTableHeadClassName}>
              Destino
            </th>
            <th scope="col" className={`${portalDataTableHeadClassName} hidden md:table-cell`}>
              Líneas
            </th>
            <th scope="col" className={`${portalDataTableHeadClassName} hidden xl:table-cell`}>
              Referencia
            </th>
            <th scope="col" className={`${portalDataTableHeadClassName} hidden md:table-cell`}>
              Fecha
            </th>
            <th scope="col" className={portalDataTableHeadClassName}>
              Acción
            </th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => {
            const source = locationMap.get(issue.sourceLocationId);
            const destination = issue.destinationLocationId
              ? locationMap.get(issue.destinationLocationId)
              : null;
            const destinationLabel = destination
              ? `${destination.code} · ${destination.name}`
              : (issue.destinationRefId ?? '—');
            const ref = issue.commercialRefId ?? issue.originRefId ?? issue.costCenter ?? '—';
            const canDispatch = DISPATCHABLE_STATUSES.has(issue.status);
            const linesCount = (issue as StockIssueRecord & { linesCount?: number }).linesCount;

            return (
              <tr
                key={issue.id}
                className={`border-b border-gray-100 dark:border-dark-border ${portalTableRowHoverClassName}`}
              >
                <td className={portalDataTableCellClassName}>
                  <button
                    type="button"
                    className={`font-mono text-xs font-semibold text-gray-900 underline-offset-4 hover:underline dark:text-white ${interactiveFocusClassName}`}
                    onClick={() => onOpenDetail(issue.id)}
                  >
                    {issue.id.slice(0, 8).toUpperCase()}
                  </button>
                </td>
                <td className={portalDataTableCellClassName}>
                  <Badge variant={getStockIssueTypeBadgeVariant(issue.type)}>
                    {getStockIssueTypeLabel(issue.type)}
                  </Badge>
                </td>
                <td className={portalDataTableCellClassName}>
                  <Badge variant={getStockIssueStatusBadgeVariant(issue.status)}>
                    {getStockIssueStatusLabel(issue.status)}
                  </Badge>
                </td>
                <td className={`${portalDataTableCellClassName} hidden lg:table-cell`}>
                  {source ? `${source.code} · ${source.name}` : issue.sourceLocationId}
                </td>
                <td className={portalDataTableCellClassName}>
                  <span className="block">{destinationLabel}</span>
                  {destination ? (
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      {getStockLocationTypeLabel(destination.type)}
                    </span>
                  ) : null}
                </td>
                <td className={`${portalDataTableCellClassName} hidden md:table-cell`}>
                  {typeof linesCount === 'number' ? linesCount : '—'}
                </td>
                <td className={`${portalDataTableCellClassName} hidden xl:table-cell`}>{ref}</td>
                <td className={`${portalDataTableCellClassName} hidden md:table-cell`}>
                  {formatInventoryDateTime(issue.createdAt)}
                </td>
                <td className={portalDataTableCellClassName}>
                  <PortalActionToolbar compact align="end" className="!inline-flex !w-fit">
                    <Button
                      type="button"
                      size="sm"
                      variant={canDispatch ? 'primary' : 'secondary'}
                      onClick={() => onOpenDetail(issue.id)}
                    >
                      {canDispatch ? 'Despachar' : 'Ver detalle'}
                    </Button>
                  </PortalActionToolbar>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
