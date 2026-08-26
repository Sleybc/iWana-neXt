'use client';

import type { InventoryDashboardSummary } from '@/lib/api-client';
import {
  PortalEmptyState,
  PortalMetricCard,
  PortalSkeletonBlock,
  type PortalMetricCardAccent,
} from '@/components/shared/portal-ui';
import {
  formatInventoryCurrency,
  formatInventoryQuantity,
  INVENTORY_ESTIMATED_VALUE_HELP_TEXT,
  INVENTORY_ESTIMATED_VALUE_LABEL,
} from './inventory-labels';

interface InventoryDashboardProps {
  summary: InventoryDashboardSummary | null;
  isLoading?: boolean;
}

const KPI_ITEMS: ReadonlyArray<{
  key: keyof Pick<
    InventoryDashboardSummary,
    | 'itemsCount'
    | 'locationsCount'
    | 'serializedAssetsCount'
    | 'totalOnHand'
    | 'estimatedTotalValue'
  >;
  eyebrow: string;
  title: string;
  description: string;
  accent: PortalMetricCardAccent;
  emphasized?: boolean;
  format: 'number' | 'quantity' | 'currency';
}> = [
  {
    key: 'totalOnHand',
    eyebrow: 'Existencias',
    title: 'Material disponible',
    description: 'Total de unidades disponibles.',
    accent: 'neutral',
    format: 'quantity',
  },
  {
    key: 'estimatedTotalValue',
    eyebrow: 'Valor',
    title: INVENTORY_ESTIMATED_VALUE_LABEL,
    description: INVENTORY_ESTIMATED_VALUE_HELP_TEXT,
    accent: 'primary',
    emphasized: true,
    format: 'currency',
  },
  {
    key: 'serializedAssetsCount',
    eyebrow: 'Activos',
    title: 'Activos con serial',
    description: 'Equipos identificados por número de serial.',
    accent: 'neutral',
    format: 'number',
  },
  {
    key: 'locationsCount',
    eyebrow: 'Bodegas',
    title: 'Bodegas y campo',
    description: 'Bodegas activas para guardar y mover material.',
    accent: 'neutral',
    format: 'number',
  },
  {
    key: 'itemsCount',
    eyebrow: 'Catálogo',
    title: 'Productos catalogados',
    description: 'Productos activos para compras y operación.',
    accent: 'neutral',
    format: 'number',
  },
];

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value);
}

function formatKpiValue(value: number, format: 'number' | 'quantity' | 'currency'): string {
  if (format === 'currency') {
    return formatInventoryCurrency(value);
  }
  if (format === 'quantity') {
    return formatInventoryQuantity(value);
  }
  return formatCompactNumber(value);
}

export function InventoryDashboard({ summary, isLoading = false }: InventoryDashboardProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-5">
        {KPI_ITEMS.map((item) => (
          <PortalSkeletonBlock key={item.key} className="min-h-[7.5rem] rounded-3xl" />
        ))}
      </div>
    );
  }

  if (!summary) {
    return (
      <PortalEmptyState
        title="Indicadores no disponibles"
        description="No fue posible cargar la información del módulo. Recarga la página para intentar de nuevo."
      />
    );
  }

  return (
    <div className="grid gap-3 grid-cols-2 xl:grid-cols-5">
      {KPI_ITEMS.map((item) => (
        <PortalMetricCard
          key={item.key}
          eyebrow={item.eyebrow}
          value={formatKpiValue(summary[item.key], item.format)}
          title={item.title}
          description={item.description}
          accent={item.accent}
          emphasized={item.emphasized === true}
          minHeightClassName="min-h-0"
        />
      ))}
    </div>
  );
}
