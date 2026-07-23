'use client';

import { Button, cn } from '@iwana/ui';
import type {
  CommercialAttentionItem,
  CommercialAttentionReason,
  CommercialDashboardSummary,
  CommercialRecentChange,
  CommercialRecentChangeAction,
} from '@/lib/api-client';
import type {
  CommercialTab,
  CommercialNavigateHandler,
} from '@/components/commercial/commercial-tab-params';
import { formatCompactNumber } from '@/components/commercial/commercial-format';
import {
  resolveOffersRiskTab,
  resolveRulesGapTab,
} from '@/components/commercial/commercial-alerts';
import {
  PortalAlert,
  PortalEmptyState,
  PortalMetricCard,
  PortalPanel,
  PortalSkeletonBlock,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';

interface CommercialDashboardProps {
  summary: CommercialDashboardSummary | null;
  isLoading?: boolean;
  onNavigateTab?: CommercialNavigateHandler;
  onRetry?: () => void;
}

const ATTENTION_REASON_LABELS: Record<CommercialAttentionReason, string> = {
  expiring_soon: 'Vence pronto',
  near_use_limit: 'Cerca del límite de usos',
  missing_current_price: 'Sin precio vigente',
  bundle_inactive_items: 'Combo con ítems inactivos',
  tax_rules_coverage_gap: 'Sin reglas tributarias de aplicación',
};

const ENTITY_TYPE_LABELS: Record<CommercialAttentionItem['entityType'], string> = {
  plan: 'Plan',
  product: 'Producto',
  service: 'Servicio',
  bundle: 'Combo',
  promotion: 'Promoción',
};

const RECENT_ACTION_LABELS: Record<CommercialRecentChangeAction, string> = {
  created: 'creado',
  deactivated: 'desactivado',
  updated: 'actualizado',
  promotion_started: 'promoción iniciada',
  promotion_expired: 'promoción vencida',
};

const RECENT_ENTITY_TYPE_LABELS: Record<CommercialRecentChange['entityType'], string> = {
  plan: 'Plan',
  product: 'Producto',
  service: 'Servicio',
  bundle: 'Combo',
  promotion: 'Promoción',
  compatibility_rule: 'Regla de compatibilidad',
  tax_rule: 'Regla tributaria',
};

function isFirstTimeCatalog(summary: CommercialDashboardSummary): boolean {
  return summary.plansCount === 0 && summary.productsCount === 0 && summary.servicesCount === 0;
}

function buildAlerts(summary: CommercialDashboardSummary): Array<{
  key: string;
  variant: 'warning' | 'error';
  title: string;
  description: string;
  ctaLabel: string;
  tab: CommercialTab;
}> {
  const alerts: Array<{
    key: string;
    variant: 'warning' | 'error';
    title: string;
    description: string;
    ctaLabel: string;
    tab: CommercialTab;
  }> = [];

  if (summary.offersAtRiskCount > 0) {
    const count = formatCompactNumber(summary.offersAtRiskCount);
    alerts.push({
      key: 'offers-at-risk',
      variant: 'warning',
      title: 'Ofertas en riesgo',
      description: `${count} ${summary.offersAtRiskCount === 1 ? 'oferta vence' : 'ofertas vencen'} pronto o están cerca del límite de usos.`,
      ctaLabel: 'Ver ofertas',
      tab: resolveOffersRiskTab(summary),
    });
  }

  if (summary.catalogIncompleteActiveCount > 0) {
    const count = formatCompactNumber(summary.catalogIncompleteActiveCount);
    alerts.push({
      key: 'catalog-incomplete',
      variant: 'error',
      title: 'Catálogo incompleto',
      description: `${count} ${summary.catalogIncompleteActiveCount === 1 ? 'ítem activo está' : 'ítems activos están'} sin precio vigente.`,
      ctaLabel: 'Completar catálogo',
      tab: 'plans',
    });
  }

  if (summary.rulesGapCount > 0) {
    const count = formatCompactNumber(summary.rulesGapCount);
    alerts.push({
      key: 'rules-gap',
      variant: 'error',
      title: 'Huecos en reglas',
      description: `${count} ${summary.rulesGapCount === 1 ? 'bloqueo o riesgo' : 'bloqueos o riesgos'} en tributación o integridad de combos.`,
      ctaLabel: 'Revisar reglas',
      tab: resolveRulesGapTab(summary),
    });
  }

  return alerts.slice(0, 3);
}

function AttentionRow({
  item,
  onNavigate,
}: {
  item: CommercialAttentionItem;
  onNavigate?: CommercialNavigateHandler | undefined;
}) {
  const reasonLabel = ATTENTION_REASON_LABELS[item.reason];
  const entityLabel = ENTITY_TYPE_LABELS[item.entityType];
  const detailParts: string[] = [entityLabel, reasonLabel];
  if (item.validTo) {
    detailParts.push(
      `Hasta ${new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(item.validTo))}`,
    );
  }
  if (item.usesRemaining != null) {
    detailParts.push(
      `${formatCompactNumber(item.usesRemaining)} ${item.usesRemaining === 1 ? 'uso restante' : 'usos restantes'}`,
    );
  }

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 dark:text-white">{item.name}</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{detailParts.join(' · ')}</p>
      </div>
      <span className="shrink-0 text-sm font-medium text-iwana-secondary-700 dark:text-iwana-primary-300">
        Revisar
      </span>
    </>
  );

  if (onNavigate) {
    const offerRisk =
      item.reason === 'expiring_soon' || item.reason === 'near_use_limit'
        ? ({ status: 'expiring' } as const)
        : undefined;
    return (
      <button
        type="button"
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5 text-left dark:border-dark-border',
          interactiveFocusClassName,
        )}
        onClick={() => onNavigate(item.destinoTab, offerRisk)}
      >
        {body}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5 dark:border-dark-border">
      {body}
    </div>
  );
}

function RecentChangeRow({
  change,
  onNavigate,
}: {
  change: CommercialRecentChange;
  onNavigate?: CommercialNavigateHandler | undefined;
}) {
  const actionLabel = RECENT_ACTION_LABELS[change.action];
  const entityLabel = RECENT_ENTITY_TYPE_LABELS[change.entityType];
  const whenLabel = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(change.occurredAt));

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 dark:text-white">{change.entityName}</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {entityLabel} · {actionLabel} · {whenLabel}
        </p>
      </div>
      <span className="shrink-0 text-sm font-medium text-iwana-secondary-700 dark:text-iwana-primary-300">
        Ver
      </span>
    </>
  );

  if (onNavigate) {
    return (
      <button
        type="button"
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5 text-left dark:border-dark-border',
          interactiveFocusClassName,
        )}
        onClick={() => onNavigate(change.destinoTab)}
      >
        {body}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5 dark:border-dark-border">
      {body}
    </div>
  );
}

function OperationalSummaryBody({
  summary,
  onNavigateTab,
}: {
  summary: CommercialDashboardSummary;
  onNavigateTab?: CommercialNavigateHandler | undefined;
}) {
  const alerts = buildAlerts(summary);
  const recentChanges = summary.recentChanges ?? [];

  return (
    <>
      {alerts.length > 0 ? (
        <div className="space-y-3" aria-label="Alertas operativas">
          {alerts.map((alert) => (
            <PortalAlert
              key={alert.key}
              variant={alert.variant}
              title={alert.title}
              description={alert.description}
              {...(onNavigateTab
                ? {
                    action: (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (alert.key === 'offers-at-risk') {
                            onNavigateTab(alert.tab, { status: 'expiring' });
                            return;
                          }
                          onNavigateTab(alert.tab);
                        }}
                      >
                        {alert.ctaLabel}
                      </Button>
                    ),
                  }
                : {})}
            />
          ))}
        </div>
      ) : null}

      <div
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"
        aria-label="Indicadores comerciales"
      >
        <PortalMetricCard
          eyebrow="Ofertas"
          value={formatCompactNumber(summary.offersAtRiskCount)}
          title="Vencen pronto"
          description="Combos y promociones en los próximos 7 días o cerca del límite de usos."
          accent={summary.offersAtRiskCount > 0 ? 'warning' : 'neutral'}
          {...(onNavigateTab
            ? {
                onClick: () => onNavigateTab(resolveOffersRiskTab(summary), { status: 'expiring' }),
              }
            : {})}
        />
        <PortalMetricCard
          eyebrow="Catálogo"
          value={formatCompactNumber(summary.catalogSellableActiveCount)}
          total={formatCompactNumber(summary.catalogActiveCount)}
          title="Listos para vender"
          description="Planes, productos y servicios activos con precio vigente."
          accent={summary.catalogIncompleteActiveCount > 0 ? 'danger' : 'neutral'}
          {...(onNavigateTab ? { onClick: () => onNavigateTab('plans') } : {})}
        />
        <PortalMetricCard
          eyebrow="Reglas"
          value={formatCompactNumber(summary.rulesGapCount)}
          title="Huecos en reglas"
          description="Combos con ítems inactivos u oferta activa sin reglas tributarias de aplicación."
          accent={summary.rulesGapCount > 0 ? 'danger' : 'neutral'}
          {...(onNavigateTab ? { onClick: () => onNavigateTab(resolveRulesGapTab(summary)) } : {})}
        />
        <PortalMetricCard
          eyebrow="Catálogo"
          value={formatCompactNumber(summary.activePlansCount)}
          total={formatCompactNumber(summary.plansCount)}
          title="Planes activos"
          description="Planes habilitados para venta."
          accent="neutral"
          {...(onNavigateTab ? { onClick: () => onNavigateTab('plans') } : {})}
        />
        <PortalMetricCard
          eyebrow="Ofertas"
          value={formatCompactNumber(summary.activeOffersCount)}
          title="Ofertas vigentes"
          description="Combos activos en vigencia y promociones vigentes."
          accent="neutral"
          {...(onNavigateTab ? { onClick: () => onNavigateTab('bundles') } : {})}
        />
      </div>

      <section className="space-y-3" aria-label="Requiere atención">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Requiere atención</h3>
        {summary.attentionItems.length === 0 ? (
          <PortalEmptyState title="Todo al día" description="No hay ítems que requieran acción." />
        ) : (
          <div className="space-y-2">
            {summary.attentionItems.slice(0, 5).map((item) => (
              <AttentionRow key={item.id} item={item} onNavigate={onNavigateTab} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3" aria-label="Cambios recientes">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Cambios recientes</h3>
        {recentChanges.length === 0 ? (
          <PortalEmptyState
            title="Sin cambios en los últimos 7 días."
            description="La oferta comercial no tuvo altas ni cambios en esta ventana."
          />
        ) : (
          <div className="space-y-2">
            {recentChanges.slice(0, 5).map((change) => (
              <RecentChangeRow
                key={`${change.entityType}:${change.entityName}:${change.action}:${change.occurredAt}`}
                change={change}
                onNavigate={onNavigateTab}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function CommercialDashboard({
  summary,
  isLoading = false,
  onNavigateTab,
  onRetry,
}: CommercialDashboardProps) {
  return (
    <PortalPanel
      eyebrow="Operación"
      title="Resumen comercial"
      description="Qué requiere atención hoy en catálogo, ofertas y reglas — y dónde corregirlo."
      contentClassName="space-y-6"
    >
      {isLoading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Cargando resumen comercial">
          <PortalSkeletonBlock className="min-h-[72px] rounded-2xl" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <PortalSkeletonBlock key={index} className="min-h-[148px] rounded-3xl" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => (
              <PortalSkeletonBlock key={index} className="min-h-[52px] rounded-xl" />
            ))}
          </div>
        </div>
      ) : !summary ? (
        <PortalEmptyState
          title="Indicadores no disponibles"
          description="No fue posible cargar el resumen comercial. Usa actualizar para reintentar."
          {...(onRetry
            ? {
                action: (
                  <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
                    Actualizar
                  </Button>
                ),
              }
            : {})}
        />
      ) : isFirstTimeCatalog(summary) ? (
        <PortalEmptyState
          title="Arma tu oferta comercial"
          description="Crea el primer plan para empezar a vender. Luego podrás sumar productos, servicios, combos y promociones."
          {...(onNavigateTab
            ? {
                action: (
                  <Button type="button" size="sm" onClick={() => onNavigateTab('plans')}>
                    Crear plan
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <OperationalSummaryBody summary={summary} onNavigateTab={onNavigateTab} />
      )}
    </PortalPanel>
  );
}
