'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@iwana/ui';
import type { CommercialDashboardSummary } from '@/lib/api-client';
import {
  buildCommercialAlerts,
  type CommercialAlert,
} from '@/components/commercial/commercial-alerts';
import type { CommercialNavigateHandler } from '@/components/commercial/commercial-tab-params';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';

interface CommercialAlertsStripProps {
  summary: CommercialDashboardSummary | null;
  /** Reserva altura mientras llega el resumen; evita layout shift sobre los tabs. */
  isLoading?: boolean | undefined;
  onNavigateTab?: CommercialNavigateHandler | undefined;
}

/**
 * Orden de prioridad de la alerta principal, fijo por dominio (PROD-UX, 2026-08-14):
 * catálogo incompleto > huecos en reglas > ofertas en riesgo. Determinista y testeable.
 */
const PRIMARY_ALERT_ORDER = ['catalog-incomplete', 'rules-gap', 'offers-at-risk'] as const;

function selectPrimaryAlert(alerts: CommercialAlert[]): CommercialAlert {
  for (const key of PRIMARY_ALERT_ORDER) {
    const match = alerts.find((alert) => alert.key === key);
    if (match) {
      return match;
    }
  }

  // Invariante: el componente solo llega aquí con `alerts.length > 0`.
  return alerts[0]!;
}

interface CommercialAlertItemProps {
  alert: CommercialAlert;
  onNavigateTab: CommercialNavigateHandler | undefined;
}

/** Render único de una alerta: PortalAlert + CTA de navegación opcional. */
function CommercialAlertItem({ alert, onNavigateTab }: CommercialAlertItemProps) {
  const router = useRouter();
  const canAct = Boolean(onNavigateTab || alert.href);

  return (
    <PortalAlert
      variant={alert.variant}
      title={alert.title}
      description={alert.description}
      live="off"
      {...(canAct
        ? {
            action: (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (alert.href) {
                    router.push(alert.href);
                    return;
                  }

                  onNavigateTab?.(alert.tab, {
                    ...(alert.status ? { status: alert.status } : { status: null }),
                    ...(alert.focus ? { focus: alert.focus } : {}),
                    ...(alert.taxationSubTab ? { taxationSubTab: alert.taxationSubTab } : {}),
                  });
                }}
              >
                {alert.ctaLabel}
              </Button>
            ),
          }
        : {})}
    />
  );
}

/**
 * Alertas operativas del módulo, visibles desde cualquier tab.
 * Vive sobre la barra de tabs: es capa de orientación, no una sección más.
 * Con varias alertas muestra solo la más severa; el resto queda tras
 * «Ver N alertas más» para no saturar la vista.
 */
export function CommercialAlertsStrip({
  summary,
  isLoading = false,
  onNavigateTab,
}: CommercialAlertsStripProps) {
  const [expanded, setExpanded] = useState(false);
  const revealedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (expanded) {
      revealedRef.current?.focus();
    }
  }, [expanded]);

  if (isLoading) {
    return (
      <section className="space-y-3" aria-busy="true" aria-label="Cargando alertas operativas">
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

  const primaryAlert = selectPrimaryAlert(alerts);
  const remainingAlerts = alerts.filter((alert) => alert !== primaryAlert);
  const hasMoreAlerts = remainingAlerts.length > 0;

  return (
    <section className="space-y-3" aria-label="Alertas operativas">
      <CommercialAlertItem alert={primaryAlert} onNavigateTab={onNavigateTab} />

      {hasMoreAlerts && !expanded ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
        >
          {remainingAlerts.length === 1
            ? 'Ver 1 alerta más'
            : `Ver ${remainingAlerts.length} alertas más`}
        </Button>
      ) : null}

      {expanded ? (
        <div ref={revealedRef} tabIndex={-1} className="space-y-3 focus:outline-none">
          {remainingAlerts.map((alert) => (
            <CommercialAlertItem key={alert.key} alert={alert} onNavigateTab={onNavigateTab} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
