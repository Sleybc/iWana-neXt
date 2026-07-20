'use client';

import type { ReactNode } from 'react';
import type { InventoryDashboardSummary } from '@/lib/api-client';
import {
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  type PortalMetricCardAccent,
  portalMetricCardAccentClassName,
  portalMetricCardShellClassName,
} from '@/components/shared/portal-ui';
import { cn } from '@iwana/ui';
import {
  formatInventoryCurrency,
  formatInventoryQuantity,
  getInventoryResponsibleTypeLabel,
  getSerializedAssetStatusLabel,
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
    | 'balancesCount'
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
    key: 'itemsCount',
    eyebrow: 'Catálogo',
    title: 'Productos catalogados',
    description: 'Productos activos disponibles para compras y operación.',
    accent: 'primary',
    format: 'number',
  },
  {
    key: 'locationsCount',
    eyebrow: 'Logística',
    title: 'Bodegas y campo',
    description: 'Bodegas activas para guardar y mover material.',
    accent: 'neutral',
    format: 'number',
  },
  {
    key: 'serializedAssetsCount',
    eyebrow: 'Activos',
    title: 'Activos con serial',
    description: 'Equipos identificados por número de serial.',
    accent: 'primary',
    format: 'number',
  },
  {
    key: 'balancesCount',
    eyebrow: 'Material',
    title: 'Material registrado',
    description: 'Productos con material disponible por bodega.',
    accent: 'neutral',
    format: 'number',
  },
  {
    key: 'totalOnHand',
    eyebrow: 'Disponibilidad',
    title: 'Material disponible',
    description: 'Total de unidades disponibles.',
    accent: 'primary',
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

function SummaryMetricCard({
  eyebrow,
  value,
  title,
  description,
  accent,
  emphasized = false,
}: {
  eyebrow: string;
  value: string;
  title: string;
  description: string;
  accent: PortalMetricCardAccent;
  emphasized?: boolean;
}) {
  return (
    <article
      className={cn(
        portalMetricCardShellClassName,
        'min-h-[148px]',
        portalMetricCardAccentClassName(accent, { emphasized }),
      )}
      title={description}
    >
      <p className="portal-eyebrow-muted">{eyebrow}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p>
    </article>
  );
}

function BreakdownSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function BreakdownRow({
  primary,
  secondary,
  value,
}: {
  primary: string;
  secondary?: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2 dark:border-dark-border">
      <div>
        <p className="font-medium text-gray-900 dark:text-white">{primary}</p>
        {secondary ? <p className="text-xs text-gray-500 dark:text-gray-400">{secondary}</p> : null}
      </div>
      <p className="font-semibold tabular-nums text-iwana-primary dark:text-white">{value}</p>
    </div>
  );
}

export function InventoryDashboard({ summary, isLoading = false }: InventoryDashboardProps) {
  return (
    <PortalPanel
      eyebrow="Vista general"
      title="Resumen principal"
      description="Lectura rápida del catálogo, las bodegas y el material disponible."
      contentClassName="space-y-6"
    >
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {KPI_ITEMS.map((item) => (
            <PortalSkeletonBlock key={item.key} className="min-h-[148px] rounded-3xl" />
          ))}
        </div>
      ) : !summary ? (
        <PortalEmptyState
          title="Indicadores no disponibles"
          description="No fue posible cargar la información del módulo. Recarga la página para intentar de nuevo."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {KPI_ITEMS.map((item) => (
              <SummaryMetricCard
                key={item.key}
                eyebrow={item.eyebrow}
                value={formatKpiValue(summary[item.key], item.format)}
                title={item.title}
                description={item.description}
                accent={item.accent}
                emphasized={item.emphasized === true}
              />
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <BreakdownSection title="Bodegas con más material">
              {summary.balancesByLocation.slice(0, 5).map((entry) => (
                <BreakdownRow
                  key={entry.locationId}
                  primary={entry.locationName}
                  secondary={`${entry.locationCode} · ${formatCompactNumber(entry.uniqueItems)} productos`}
                  value={formatInventoryQuantity(entry.totalOnHand)}
                />
              ))}
            </BreakdownSection>

            <BreakdownSection title="Categorías con más material">
              {summary.balancesByCategory.slice(0, 5).map((entry) => (
                <BreakdownRow
                  key={entry.categoryId}
                  primary={entry.categoryName}
                  secondary={`${entry.categoryCodePrefix} · ${formatCompactNumber(entry.uniqueItems)} productos · ${formatInventoryCurrency(entry.estimatedValue)}`}
                  value={formatInventoryQuantity(entry.totalOnHand)}
                />
              ))}
            </BreakdownSection>

            <BreakdownSection title="Estados de activos con serial">
              {summary.serializedAssetsByStatus.slice(0, 5).map((entry) => (
                <BreakdownRow
                  key={entry.status}
                  primary={getSerializedAssetStatusLabel(entry.status)}
                  value={formatCompactNumber(entry.count)}
                />
              ))}
            </BreakdownSection>

            <BreakdownSection title="Responsables con más activos">
              {summary.serializedAssetsByResponsibleType.slice(0, 5).map((entry) => (
                <BreakdownRow
                  key={entry.responsibleType}
                  primary={getInventoryResponsibleTypeLabel(entry.responsibleType)}
                  value={formatCompactNumber(entry.count)}
                />
              ))}
            </BreakdownSection>
          </div>
        </>
      )}
    </PortalPanel>
  );
}
