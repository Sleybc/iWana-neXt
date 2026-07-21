'use client';

import { Button } from '@iwana/ui';
import type {
  AssetLoanRecord,
  AssetLoanStatus,
  InventoryItemRecord,
  SerializedAssetRecord,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSkeletonBlock,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryOpaqueRef,
  formatInventoryDateTime,
  getAssetLoanStatusLabel,
} from './inventory-labels';

export type AssetLoanStatusFilter = AssetLoanStatus | 'all';

interface AssetLoansPanelProps {
  loans: AssetLoanRecord[];
  assets: SerializedAssetRecord[];
  items: InventoryItemRecord[];
  isLoading: boolean;
  error: string | null;
  statusFilter: AssetLoanStatusFilter;
  onStatusFilterChange: (status: AssetLoanStatusFilter) => void;
  onOpenAssetDetail: (assetId: string) => void;
  onRefresh: () => void;
}

const fieldClassName =
  'portal-input-surface w-full max-w-xs px-3 py-2 text-sm text-gray-900 dark:text-white';

function resolveAssetLabel(
  loan: AssetLoanRecord,
  assets: SerializedAssetRecord[],
  items: InventoryItemRecord[],
): string {
  const asset = assets.find((entry) => entry.id === loan.serializedAssetId);
  const item = items.find((entry) => entry.id === asset?.inventoryItemId);
  const sku = item?.sku ?? 'Sin SKU';
  const serial = asset?.serialNumber ?? asset?.assetTag ?? 'Sin serial';
  return `${sku} · ${serial}`;
}

export function AssetLoansPanel({
  loans,
  assets,
  items,
  isLoading,
  error,
  statusFilter,
  onStatusFilterChange,
  onOpenAssetDetail,
  onRefresh,
}: AssetLoansPanelProps) {
  return (
    <div className="space-y-4" data-testid="asset-loans-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Estado</span>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as AssetLoanStatusFilter)}
            className={fieldClassName}
            data-testid="asset-loans-status-filter"
          >
            <option value="all">Todos</option>
            <option value="abierto">Abierto</option>
            <option value="cerrado">Cerrado</option>
          </select>
        </label>
        <Button type="button" size="sm" variant="secondary" onClick={onRefresh}>
          Actualizar
        </Button>
      </div>

      {error ? (
        <PortalAlert variant="error" title="No fue posible cargar comodatos" description={error} />
      ) : null}

      {isLoading ? (
        <PortalSkeletonBlock className="h-72" />
      ) : loans.length === 0 ? (
        <PortalEmptyState
          title="Sin comodatos registrados"
          description="Los equipos instalados en clientes desde una orden de trabajo aparecerán aquí."
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
              <thead className="bg-gray-50 dark:bg-dark-surface-2">
                <tr>
                  <th className={portalDataTableHeadClassName}>Activo</th>
                  <th className={portalDataTableHeadClassName}>Suscriptor</th>
                  <th className={portalDataTableHeadClassName}>Contrato</th>
                  <th className={portalDataTableHeadClassName}>Instalado el</th>
                  <th className={portalDataTableHeadClassName}>Estado</th>
                  <th className={portalDataTableHeadClassName}>Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {loans.map((loan) => (
                  <tr key={loan.id} data-testid={`asset-loan-row-${loan.id}`}>
                    <td className={portalDataTableCellClassName}>
                      {resolveAssetLabel(loan, assets, items)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatInventoryOpaqueRef('subscriber', loan.subscriberRefId)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatInventoryOpaqueRef('contract', loan.contractRefId)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatInventoryDateTime(loan.installedAt)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {getAssetLoanStatusLabel(loan.status)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => onOpenAssetDetail(loan.serializedAssetId)}
                      >
                        Ver ficha 360
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
