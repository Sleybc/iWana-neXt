'use client';

import { InventoryItemKind, InventoryItemStatus, InventoryTrackingMode } from '@iwana/shared';
import type { InventoryItemRecord, StockBalanceRecord } from '@/lib/api-client';
import { PortalSkeletonBlock } from '@/components/shared/portal-ui';

interface InventoryCatalogSummaryProps {
  items: InventoryItemRecord[];
  balances: StockBalanceRecord[];
  isLoading?: boolean;
}

interface MetricCardConfig {
  eyebrow: string;
  title: string;
  description: string;
  accent: 'neutral' | 'primary' | 'warning' | 'danger';
}

const METRIC_CARDS: MetricCardConfig[] = [
  {
    eyebrow: 'Cobertura',
    title: 'Activos',
    description: 'Referencias maestras vigentes en el catálogo.',
    accent: 'primary',
  },
  {
    eyebrow: 'Abastecimiento',
    title: 'Comprables',
    description: 'Artículos habilitados para solicitudes de compra.',
    accent: 'primary',
  },
  {
    eyebrow: 'Reposición',
    title: 'Bajo mínimo',
    description: 'Existencia agregada en o por debajo del punto de reorden.',
    accent: 'warning',
  },
  {
    eyebrow: 'Trazabilidad',
    title: 'Serializados',
    description: 'Referencias con control serial o tipo serializado.',
    accent: 'neutral',
  },
  {
    eyebrow: 'Proveeduría',
    title: 'Con proveedor sugerido',
    description: 'Artículos con proveedor preferido configurado.',
    accent: 'neutral',
  },
];

function accentClassName(accent: MetricCardConfig['accent']): string {
  return accent === 'primary'
    ? 'border-iwana-primary/20 bg-iwana-primary-50/70 dark:border-iwana-primary-400/30 dark:bg-iwana-primary-900/15'
    : accent === 'warning'
      ? 'border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-950/20'
      : accent === 'danger'
        ? 'border-rose-200 bg-rose-50/80 dark:border-rose-500/20 dark:bg-rose-950/20'
        : 'border-gray-200 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3';
}

function computeMetrics(items: InventoryItemRecord[], balances: StockBalanceRecord[]) {
  const quantityByItem = new Map<string, number>();
  balances.forEach((balance) => {
    quantityByItem.set(
      balance.itemId,
      (quantityByItem.get(balance.itemId) ?? 0) + Number.parseFloat(balance.quantityOnHand),
    );
  });

  const activeCount = items.filter((item) => item.status === InventoryItemStatus.ACTIVE).length;
  const purchasableCount = items.filter((item) => item.purchasable).length;
  const belowReorderCount = items.filter((item) => {
    const total = quantityByItem.get(item.id) ?? 0;
    const threshold = Number.parseFloat(item.reorderPoint || item.minimumStock || '0');
    return threshold > 0 && total <= threshold;
  }).length;
  const serializedCount = items.filter(
    (item) =>
      item.itemKind === InventoryItemKind.SERIALIZED ||
      item.trackingMode === InventoryTrackingMode.SERIALIZED,
  ).length;
  const withSupplierCount = items.filter((item) => Boolean(item.preferredSupplierRefId)).length;

  return [activeCount, purchasableCount, belowReorderCount, serializedCount, withSupplierCount];
}

export function InventoryCatalogSummary({
  items,
  balances,
  isLoading = false,
}: InventoryCatalogSummaryProps) {
  const values = computeMetrics(items, balances);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {METRIC_CARDS.map((card) => (
          <PortalSkeletonBlock key={card.title} className="min-h-[168px] rounded-3xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {METRIC_CARDS.map((card, index) => (
        <article
          key={card.title}
          className={`flex min-h-[168px] flex-col rounded-3xl border px-4 py-4 shadow-sm ${accentClassName(card.accent)}`}
        >
          <p className="portal-eyebrow-muted">{card.eyebrow}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {values[index]}
          </p>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{card.title}</p>
          <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
            {card.description}
          </p>
        </article>
      ))}
    </div>
  );
}
