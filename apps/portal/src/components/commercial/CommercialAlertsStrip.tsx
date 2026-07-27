'use client';

import { Button } from '@iwana/ui';
import type { CommercialDashboardSummary } from '@/lib/api-client';
import { buildCommercialAlerts } from '@/components/commercial/commercial-alerts';
import type { CommercialNavigateHandler } from '@/components/commercial/commercial-tab-params';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';

interface CommercialAlertsStripProps {
  summary: CommercialDashboardSummary | null;
  /** Reserva altura mientras llega el resumen; evita layout shift sobre los tabs. */
  isLoading?: boolean | undefined;
  onNavigateTab?: CommercialNavigateHandler | undefined;
}

/**
 * Alertas operativas del módulo, visibles desde cualquier tab.
 * Vive sobre la barra de tabs: es capa de orientación, no una sección más.
 */
export function CommercialAlertsStrip({
  summary,
  isLoading = false,
  onNavigateTab,
}: CommercialAlertsStripProps) {
  if (isLoading) {
    return (
      <section className="space-y-3" aria-busy="true" aria-label="Cargando alertas operativas">
        <PortalSkeletonBlock className="min-h-[72px] rounded-2xl" />
        <PortalSkeletonBlock className="min-h-[72px] rounded-2xl" />
      </section>
    );
  }

  if (!summary) {
    return null;
  }

  const alerts = buildCommercialAlerts(summary);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" aria-label="Alertas operativas">
      {alerts.map((alert) => (
        <PortalAlert
          key={alert.key}
          variant={alert.variant}
          title={alert.title}
          description={alert.description}
          live="off"
          {...(onNavigateTab
            ? {
                action: (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      onNavigateTab(alert.tab, {
                        ...(alert.status ? { status: alert.status } : { status: null }),
                        ...(alert.focus ? { focus: alert.focus } : {}),
                      })
                    }
                  >
                    {alert.ctaLabel}
                  </Button>
                ),
              }
            : {})}
        />
      ))}
    </section>
  );
}
