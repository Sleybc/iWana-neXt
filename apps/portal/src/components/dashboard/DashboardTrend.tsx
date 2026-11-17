// apps/portal/src/components/dashboard/DashboardTrend.tsx
'use client';

import { useState } from 'react';
import { ChartSkeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@iwana/ui';
import { PortalPanel } from '@/components/shared/portal-ui';
import { PortalChart } from '@/components/shared/portal-chart';
import type { DashboardTrendTab } from './dashboard-trend';
import type { DashboardTrendId } from './dashboard-role-composition';

const TREND_TITLE = 'Tendencia';

function TrendChart({ tab }: { tab: DashboardTrendTab }) {
  // Un caso por pestaña: cada una fija sus claves de serie.
  switch (tab.id) {
    case 'subscribers':
      return <PortalChart {...tab.chart} />;
    case 'collections':
      return <PortalChart {...tab.chart} />;
    case 'cases':
      return <PortalChart {...tab.chart} />;
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

/**
 * B2 izquierda · Tendencia con las series conmutables del rol (HLD-MOD02 v3.0 §6; contrato DS de
 * gráficas §3 «Pantalla de inicio»). Solo se ofrecen las pestañas con dato; sin ninguna, el bloque
 * no se monta. Mientras la primera lectura llega, ocupa su sitio con la silueta de la gráfica.
 */
export function DashboardTrend({
  tabs,
  loading,
}: {
  tabs: readonly DashboardTrendTab[];
  /** Alguna fuente de la tendencia aún no respondió por primera vez. */
  loading: boolean;
}) {
  const [selectedId, setSelectedId] = useState<DashboardTrendId | null>(null);

  if (tabs.length === 0) {
    if (!loading) return null;
    return (
      <PortalPanel compact title={TREND_TITLE} busy>
        <ChartSkeleton />
      </PortalPanel>
    );
  }

  const active = tabs.find((tab) => tab.id === selectedId) ?? tabs[0]!;

  if (tabs.length === 1) {
    return (
      <PortalPanel compact title={TREND_TITLE} description={active.subtitle}>
        <TrendChart tab={active} />
      </PortalPanel>
    );
  }

  return (
    <PortalPanel compact title={TREND_TITLE} description={active.subtitle}>
      <Tabs value={active.id} onValueChange={(value) => setSelectedId(value as DashboardTrendId)}>
        <TabsList aria-label="Serie de la tendencia" className="w-fit">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="min-h-11">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id}>
            <TrendChart tab={tab} />
          </TabsContent>
        ))}
      </Tabs>
    </PortalPanel>
  );
}
