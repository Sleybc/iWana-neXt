'use client';

import { Badge, Button } from '@iwana/ui';
import { PurchaseRequestPriority } from '@iwana/shared';
import type { PurchaseRequestRecord } from '@/lib/api-client';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalSkeletonBlock,
  interactiveFocusClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryDate,
  getPurchaseRequestDisplayStatus,
  getPurchaseRequestPriorityBadgeVariant,
  getPurchaseRequestPriorityLabel,
  getPurchaseRequestTypeLabel,
} from './inventory-labels';
import { isPurchaseRequestOverdue } from './purchase-filters';

interface PurchaseRequestsTableProps {
  requests: PurchaseRequestRecord[];
  /** true cuando hay filtros servidor activos (empty copy distinto). */
  hasActiveFilters?: boolean;
  selectedRequestId?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onSelectRequest: (requestId: string) => void;
  onCreateRequest?: () => void;
}

export function PurchaseRequestsTable({
  requests,
  hasActiveFilters = false,
  selectedRequestId = null,
  isLoading = false,
  error = null,
  onSelectRequest,
  onCreateRequest,
}: PurchaseRequestsTableProps) {
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

  if (requests.length === 0) {
    return (
      <PortalEmptyState
        title={
          hasActiveFilters ? 'No hay solicitudes con estos filtros' : 'No hay solicitudes de compra'
        }
        description={
          hasActiveFilters
            ? 'Ajusta los filtros o crea una nueva solicitud de compra para iniciar el flujo.'
            : 'Crea una nueva solicitud de compra para iniciar el flujo.'
        }
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
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className={portalDataTableHeadRowClassName}>
          <tr>
            <PortalDataTableHead>Solicitud</PortalDataTableHead>
            <PortalDataTableHead>Tipo de compra</PortalDataTableHead>
            <PortalDataTableHead>Prioridad</PortalDataTableHead>
            <PortalDataTableHead>Área</PortalDataTableHead>
            <PortalDataTableHead>Estado</PortalDataTableHead>
            <PortalDataTableHead>Requerida</PortalDataTableHead>
            <PortalDataTableHead>Alertas</PortalDataTableHead>
            <PortalDataTableHead>Acción</PortalDataTableHead>
          </tr>
        </thead>
        <tbody className={portalDataTableBodyClassName}>
          {requests.map((request) => {
            const isSelected = selectedRequestId === request.id;
            const isOverdue = isPurchaseRequestOverdue(request);
            const isUrgent = request.priority === PurchaseRequestPriority.URGENT;
            const hasException = Boolean(request.exceptionReason?.trim());
            const displayStatus = getPurchaseRequestDisplayStatus(request);

            return (
              <tr
                key={request.id}
                className={`${portalTableRowHoverClassName} ${
                  isSelected ? 'bg-iwana-primary-50/60 dark:bg-iwana-primary-950/30' : ''
                }`}
              >
                <td className={portalDataTableCellClassName}>
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
                <td className={portalDataTableCellClassName}>
                  {getPurchaseRequestTypeLabel(request.requestType)}
                </td>
                <td className={portalDataTableCellClassName}>
                  <Badge variant={getPurchaseRequestPriorityBadgeVariant(request.priority)}>
                    {getPurchaseRequestPriorityLabel(request.priority)}
                  </Badge>
                </td>
                <td
                  className={portalDataTableCellClassName}
                  title={request.requestingArea ?? undefined}
                >
                  {request.requestingArea ?? 'Sin área'}
                </td>
                <td className={portalDataTableCellClassName}>
                  <Badge variant={displayStatus.variant}>{displayStatus.label}</Badge>
                </td>
                <td
                  className={`${portalDataTableCellClassName} ${isOverdue ? 'font-medium text-rose-700 dark:text-rose-300' : ''}`}
                >
                  {formatInventoryDate(request.neededByDate)}
                </td>
                <td className={portalDataTableCellClassName}>
                  <div className="flex flex-wrap gap-1">
                    {isUrgent ? <Badge variant="error">Urgente</Badge> : null}
                    {isOverdue ? <Badge variant="warning">Vencida</Badge> : null}
                    {hasException ? <Badge variant="info">Excepción</Badge> : null}
                  </div>
                </td>
                <td className={portalDataTableCellClassName}>
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
  );
}
