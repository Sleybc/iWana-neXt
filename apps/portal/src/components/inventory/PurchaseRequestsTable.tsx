'use client';

import { Badge, Button } from '@iwana/ui';
import { PurchaseRequestPriority } from '@iwana/shared';
import type { PurchaseRequestRecord } from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSkeletonBlock,
  interactiveFocusClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryDate,
  getPurchaseRequestPriorityBadgeVariant,
  getPurchaseRequestPriorityLabel,
  getPurchaseRequestStatusBadgeVariant,
  getPurchaseRequestStatusLabel,
  getPurchaseRequestTypeLabel,
} from './inventory-labels';
import {
  filterPurchaseRequests,
  isPurchaseRequestOverdue,
  type PurchaseRequestFilters,
} from './purchase-filters';

export type { PurchaseRequestFilters } from './purchase-filters';

interface PurchaseRequestsTableProps {
  requests: PurchaseRequestRecord[];
  filters: PurchaseRequestFilters;
  selectedRequestId?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onSelectRequest: (requestId: string) => void;
  onCreateRequest?: () => void;
}

export function PurchaseRequestsTable({
  requests,
  filters,
  selectedRequestId = null,
  isLoading = false,
  error = null,
  onSelectRequest,
  onCreateRequest,
}: PurchaseRequestsTableProps) {
  const filtered = filterPurchaseRequests(requests, filters);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <PortalSkeletonBlock key={index} className="h-12 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <PortalAlert variant="error" title="No fue posible cargar solicitudes" description={error} />
    );
  }

  if (filtered.length === 0) {
    return (
      <PortalEmptyState
        title="No hay solicitudes con estos filtros"
        description="Ajusta los filtros o crea una nueva solicitud de compra para iniciar el flujo."
        action={
          onCreateRequest ? (
            <Button type="button" onClick={onCreateRequest}>
              Nueva solicitud
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className={portalDataTableShellClassName}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
          <thead className="bg-gray-50 dark:bg-dark-surface-2">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700">
                Solicitud
              </th>
              <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700">
                Tipo de compra
              </th>
              <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700">
                Prioridad
              </th>
              <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700">Área</th>
              <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700">Estado</th>
              <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700">
                Requerida
              </th>
              <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700">Alertas</th>
              <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
            {filtered.map((request) => {
              const isSelected = selectedRequestId === request.id;
              const isOverdue = isPurchaseRequestOverdue(request);
              const isUrgent = request.priority === PurchaseRequestPriority.URGENT;
              const hasException = Boolean(request.exceptionReason?.trim());

              return (
                <tr
                  key={request.id}
                  className={`${isSelected ? 'bg-iwana-primary-50/60 dark:bg-iwana-primary-950/30' : 'hover:bg-gray-50 dark:hover:bg-dark-surface-2'}`}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className={`text-left font-semibold text-gray-900 underline-offset-4 hover:underline dark:text-white ${interactiveFocusClassName}`}
                      onClick={() => onSelectRequest(request.id)}
                    >
                      <span className="block">{request.requestNumber}</span>
                      <span className="mt-0.5 block text-xs font-normal text-gray-600 dark:text-gray-300">
                        {request.title}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {getPurchaseRequestTypeLabel(request.requestType)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getPurchaseRequestPriorityBadgeVariant(request.priority)}>
                      {getPurchaseRequestPriorityLabel(request.priority)}
                    </Badge>
                  </td>
                  <td
                    className="px-4 py-3 text-gray-700 dark:text-gray-300"
                    title={request.requestingArea ?? undefined}
                  >
                    {request.requestingArea ?? 'Sin área'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getPurchaseRequestStatusBadgeVariant(request.status)}>
                      {getPurchaseRequestStatusLabel(request.status)}
                    </Badge>
                  </td>
                  <td
                    className={`px-4 py-3 ${isOverdue ? 'font-medium text-rose-700 dark:text-rose-300' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    {formatInventoryDate(request.neededByDate)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {isUrgent ? <Badge variant="error">Urgente</Badge> : null}
                      {isOverdue ? <Badge variant="warning">Vencida</Badge> : null}
                      {hasException ? <Badge variant="info">Excepción</Badge> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onSelectRequest(request.id)}
                    >
                      Abrir
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
