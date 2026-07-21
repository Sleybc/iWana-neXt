'use client';

import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@iwana/ui';
import type {
  AssetLoanRecord,
  InventoryItemRecord,
  SerializedAssetRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import { portalModuleTabTriggerClassName } from '@/components/shared/portal-ui';
import {
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import { formatInventoryDate, getSerializedAssetStatusLabel } from './inventory-labels';
import { AssetLoansPanel, type AssetLoanStatusFilter } from './AssetLoansPanel';
import { UsefulLifeAlertsPanel } from './UsefulLifeAlertsPanel';

export type AssetsSubview = 'list' | 'loans' | 'useful-life';

interface AssetsWorkspaceProps {
  assets: SerializedAssetRecord[];
  items: InventoryItemRecord[];
  locations: StockLocationRecord[];
  loans: AssetLoanRecord[];
  isLoading: boolean;
  isLoadingLoans: boolean;
  loansError: string | null;
  loanStatusFilter: AssetLoanStatusFilter;
  initialSubview?: AssetsSubview;
  onSubviewChange?: (subview: AssetsSubview) => void;
  onLoanStatusFilterChange: (status: AssetLoanStatusFilter) => void;
  onOpenAssetDetail: (assetId: string) => void;
  onRefreshLoans: () => void;
  onNavigateToReplenishment?: () => void;
}

export function AssetsWorkspace({
  assets,
  items,
  locations,
  loans,
  isLoading,
  isLoadingLoans,
  loansError,
  loanStatusFilter,
  initialSubview = 'list',
  onSubviewChange,
  onLoanStatusFilterChange,
  onOpenAssetDetail,
  onRefreshLoans,
  onNavigateToReplenishment,
}: AssetsWorkspaceProps) {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const locationMap = new Map(locations.map((location) => [location.id, location]));

  return (
    <PortalPanel
      eyebrow="Activos"
      title="Activos con serial"
      description="Equipos identificados por serial para soporte, mantenimiento y comodato."
    >
      <Tabs
        value={initialSubview}
        onValueChange={(value) => onSubviewChange?.(value as AssetsSubview)}
      >
        <TabsList>
          <TabsTrigger value="list" className={portalModuleTabTriggerClassName}>
            Lista de activos
          </TabsTrigger>
          <TabsTrigger value="loans" className={portalModuleTabTriggerClassName}>
            Comodatos
          </TabsTrigger>
          <TabsTrigger value="useful-life" className={portalModuleTabTriggerClassName}>
            Vida útil
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          {isLoading ? (
            <PortalSkeletonBlock className="h-72" />
          ) : assets.length === 0 ? (
            <PortalEmptyState
              title="Sin activos con serial"
              description="Recibe una compra o registra equipos con serial para verlos aquí."
            />
          ) : (
            <div className={portalDataTableShellClassName}>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
                  <thead className="bg-gray-50 dark:bg-dark-surface-2">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                        Serial
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                        Producto
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                        Ubicación
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                        Compra
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                    {assets.map((asset) => (
                      <tr key={asset.id}>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                          {asset.serialNumber ?? asset.assetTag ?? 'Sin serial'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {itemMap.get(asset.inventoryItemId)?.name ?? 'Producto no encontrado'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {getSerializedAssetStatusLabel(asset.currentStatus)}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {locationMap.get(asset.currentLocationId ?? '')?.name ?? 'Sin ubicación'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {formatInventoryDate(asset.purchaseDate)}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => onOpenAssetDetail(asset.id)}
                          >
                            Ver detalle
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="loans" className="space-y-4">
          <AssetLoansPanel
            loans={loans}
            assets={assets}
            items={items}
            isLoading={isLoadingLoans}
            error={loansError}
            statusFilter={loanStatusFilter}
            onStatusFilterChange={onLoanStatusFilterChange}
            onOpenAssetDetail={onOpenAssetDetail}
            onRefresh={onRefreshLoans}
          />
        </TabsContent>

        <TabsContent value="useful-life" className="space-y-4">
          <UsefulLifeAlertsPanel
            onOpenAssetDetail={onOpenAssetDetail}
            {...(onNavigateToReplenishment ? { onNavigateToReplenishment } : {})}
          />
        </TabsContent>
      </Tabs>
    </PortalPanel>
  );
}
