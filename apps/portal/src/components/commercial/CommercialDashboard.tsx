'use client';

import type { CommercialDashboardSummary } from '@/lib/api-client';
import {
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  type PortalMetricCardAccent,
  portalMetricCardAccentClassName,
  portalMetricCardShellClassName,
} from '@/components/shared/portal-ui';
import { cn } from '@iwana/ui';

interface CommercialDashboardProps {
  summary: CommercialDashboardSummary | null;
  isLoading?: boolean;
}

const KPI_ITEMS: ReadonlyArray<{
  key:
    | 'activePlansCount'
    | 'activeProductsCount'
    | 'activeServicesCount'
    | 'activeBundlesCount'
    | 'activePromotionsCount'
    | 'activeCompatibilityRulesCount'
    | 'activeTaxRulesCount';
  eyebrow: string;
  title: string;
  description: string;
  accent: PortalMetricCardAccent;
  totalKey:
    | 'plansCount'
    | 'productsCount'
    | 'servicesCount'
    | 'bundlesCount'
    | 'promotionsCount'
    | 'compatibilityRulesCount'
    | 'taxRulesCount';
  emphasized?: boolean;
}> = [
  {
    key: 'activePlansCount',
    totalKey: 'plansCount',
    eyebrow: 'Catálogo',
    title: 'Planes activos',
    description: 'Planes habilitados para venta.',
    accent: 'primary',
    emphasized: true,
  },
  {
    key: 'activeProductsCount',
    totalKey: 'productsCount',
    eyebrow: 'Catálogo',
    title: 'Productos activos',
    description: 'Productos adicionales disponibles.',
    accent: 'neutral',
  },
  {
    key: 'activeServicesCount',
    totalKey: 'servicesCount',
    eyebrow: 'Catálogo',
    title: 'Servicios activos',
    description: 'Servicios complementarios activos.',
    accent: 'neutral',
  },
  {
    key: 'activeBundlesCount',
    totalKey: 'bundlesCount',
    eyebrow: 'Ofertas',
    title: 'Combos activos',
    description: 'Combos vigentes en el catálogo.',
    accent: 'primary',
  },
  {
    key: 'activePromotionsCount',
    totalKey: 'promotionsCount',
    eyebrow: 'Ofertas',
    title: 'Promociones vigentes',
    description: 'Promociones activas y en fecha.',
    accent: 'neutral',
  },
  {
    key: 'activeCompatibilityRulesCount',
    totalKey: 'compatibilityRulesCount',
    eyebrow: 'Reglas',
    title: 'Reglas de compatibilidad',
    description: 'Reglas activas entre ítems del catálogo.',
    accent: 'neutral',
  },
  {
    key: 'activeTaxRulesCount',
    totalKey: 'taxRulesCount',
    eyebrow: 'Reglas',
    title: 'Reglas tributarias',
    description: 'Reglas de aplicación tributaria activas.',
    accent: 'primary',
  },
];

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value);
}

function SummaryMetricCard({
  eyebrow,
  value,
  total,
  title,
  description,
  accent,
  emphasized = false,
}: {
  eyebrow: string;
  value: number;
  total: number;
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
    >
      <p className="portal-eyebrow-muted">{eyebrow}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">
        {formatCompactNumber(value)}
        <span className="ml-1 text-sm font-normal text-iwana-secondary-700 dark:text-gray-400">
          / {formatCompactNumber(total)}
        </span>
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-iwana-secondary-700 dark:text-gray-300">
        {description}
      </p>
    </article>
  );
}

export function CommercialDashboard({ summary, isLoading = false }: CommercialDashboardProps) {
  return (
    <PortalPanel
      eyebrow="Operación"
      title="Resumen comercial"
      description="Lectura rápida del catálogo, las ofertas y las reglas operativas del tenant."
      contentClassName="space-y-6"
    >
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {KPI_ITEMS.map((item) => (
            <PortalSkeletonBlock key={item.key} className="min-h-[148px] rounded-3xl" />
          ))}
        </div>
      ) : !summary ? (
        <PortalEmptyState
          title="Indicadores no disponibles"
          description="No fue posible cargar el resumen comercial. Usa actualizar para reintentar."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {KPI_ITEMS.map((item) => (
            <SummaryMetricCard
              key={item.key}
              eyebrow={item.eyebrow}
              value={summary[item.key]}
              total={summary[item.totalKey]}
              title={item.title}
              description={item.description}
              accent={item.accent}
              {...(item.emphasized ? { emphasized: true } : {})}
            />
          ))}
        </div>
      )}
    </PortalPanel>
  );
}
