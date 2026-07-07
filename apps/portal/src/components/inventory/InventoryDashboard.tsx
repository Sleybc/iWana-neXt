'use client';

import type { InventoryDashboardSummary } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import {
  formatInventoryQuantity,
  getInventoryResponsibleTypeLabel,
  getSerializedAssetStatusLabel,
} from './inventory-labels';

interface InventoryDashboardProps {
  summary: InventoryDashboardSummary | null;
  isLoading?: boolean;
}

const KPI_ITEMS = [
  {
    key: 'itemsCount',
    title: 'Productos catalogados',
    description: 'Referencias maestras disponibles para compras y operación.',
  },
  {
    key: 'locationsCount',
    title: 'Bodegas y custodias',
    description: 'Ubicaciones activas para almacenar y mover existencias.',
  },
  {
    key: 'serializedAssetsCount',
    title: 'Activos serializados',
    description: 'Seriales trazables con estado operativo vigente.',
  },
  {
    key: 'balancesCount',
    title: 'Balances abiertos',
    description: 'Combinaciones activas de producto, ubicación y condición.',
  },
  {
    key: 'totalOnHand',
    title: 'Existencia disponible',
    description: 'Unidades agregadas registradas en el ledger del tenant.',
  },
] as const;

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value);
}

export function InventoryDashboard({ summary, isLoading = false }: InventoryDashboardProps) {
  return (
    <PortalPanel
      eyebrow="Resumen ejecutivo"
      title="KPIs de inventario"
      description="Lectura rápida del catálogo, la red de bodegas y la disponibilidad operativa."
      contentClassName="space-y-4"
    >
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {KPI_ITEMS.map((item) => (
            <PortalSkeletonBlock key={item.key} className="h-32" />
          ))}
        </div>
      ) : !summary ? (
        <PortalEmptyState
          title="Sin resumen disponible"
          description="Aún no fue posible consolidar los indicadores del módulo."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {KPI_ITEMS.map((item) => {
              const rawValue = summary[item.key];
              const value =
                item.key === 'totalOnHand'
                  ? formatInventoryQuantity(rawValue)
                  : formatCompactNumber(rawValue);

              return (
                <article
                  key={item.key}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-iwana-secondary-700 dark:text-iwana-secondary">
                    {item.title}
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-iwana-primary dark:text-white">
                    {value}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {item.description}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
              <h3 className="text-sm font-semibold text-iwana-primary dark:text-white">
                Qué bodega concentra existencias
              </h3>
              <div className="mt-3 space-y-2">
                {summary.balancesByLocation.slice(0, 5).map((entry) => (
                  <div
                    key={entry.locationId}
                    className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2 dark:border-dark-border"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {entry.locationName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {entry.locationCode} · {formatCompactNumber(entry.uniqueItems)} ítems
                      </p>
                    </div>
                    <p className="font-semibold text-iwana-primary dark:text-white">
                      {formatInventoryQuantity(entry.totalOnHand)}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
              <h3 className="text-sm font-semibold text-iwana-primary dark:text-white">
                Qué categoría demanda más stock
              </h3>
              <div className="mt-3 space-y-2">
                {summary.balancesByCategory.slice(0, 5).map((entry) => (
                  <div
                    key={entry.categoryId}
                    className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2 dark:border-dark-border"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {entry.categoryName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {entry.categoryCodePrefix} · {formatCompactNumber(entry.uniqueItems)} ítems
                      </p>
                    </div>
                    <p className="font-semibold text-iwana-primary dark:text-white">
                      {formatInventoryQuantity(entry.totalOnHand)}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
              <h3 className="text-sm font-semibold text-iwana-primary dark:text-white">
                Qué estado domina los serializados
              </h3>
              <div className="mt-3 space-y-2">
                {summary.serializedAssetsByStatus.slice(0, 5).map((entry) => (
                  <div
                    key={entry.status}
                    className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2 dark:border-dark-border"
                  >
                    <p className="font-medium text-gray-900 dark:text-white">
                      {getSerializedAssetStatusLabel(entry.status)}
                    </p>
                    <p className="font-semibold text-iwana-primary dark:text-white">
                      {formatCompactNumber(entry.count)}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
              <h3 className="text-sm font-semibold text-iwana-primary dark:text-white">
                Qué responsable concentra activos
              </h3>
              <div className="mt-3 space-y-2">
                {summary.serializedAssetsByResponsibleType.slice(0, 5).map((entry) => (
                  <div
                    key={entry.responsibleType}
                    className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2 dark:border-dark-border"
                  >
                    <p className="font-medium text-gray-900 dark:text-white">
                      {getInventoryResponsibleTypeLabel(entry.responsibleType)}
                    </p>
                    <p className="font-semibold text-iwana-primary dark:text-white">
                      {formatCompactNumber(entry.count)}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      )}
    </PortalPanel>
  );
}
