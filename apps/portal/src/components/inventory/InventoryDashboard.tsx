'use client';

import type { InventoryDashboardSummary } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { formatInventoryQuantity } from './inventory-labels';

interface InventoryDashboardProps {
  summary: InventoryDashboardSummary | null;
  isLoading?: boolean;
}

const KPI_ITEMS = [
  {
    key: 'itemsCount',
    title: 'Ítems catalogados',
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
    description: 'Combinaciones activas de ítem, ubicación y condición.',
  },
  {
    key: 'totalOnHand',
    title: 'Existencia disponible',
    description: 'Unidades agregadas registradas en el ledger del tenant.',
  },
] as const;

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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {KPI_ITEMS.map((item) => {
            const rawValue = summary[item.key];
            const value =
              item.key === 'totalOnHand'
                ? formatInventoryQuantity(rawValue)
                : new Intl.NumberFormat('es-CO').format(rawValue);

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
      )}
    </PortalPanel>
  );
}
