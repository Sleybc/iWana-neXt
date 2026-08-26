import type { CommercialAttentionReason, CommercialDashboardSummary } from '@/lib/api-client';
import type {
  CommercialOfferStatusFilter,
  CommercialTab,
} from '@/components/commercial/commercial-tab-params';
import { buildRulesSettingsHref } from '@/components/settings/rules/rules-settings-params';
import { formatGroupedNumber } from '@/components/commercial/commercial-format';

export interface CommercialAlert {
  key: string;
  variant: 'warning' | 'error';
  title: string;
  description: string;
  ctaLabel: string;
  tab: CommercialTab;
  /** Filtro que debe aplicarse al aterrizar en `tab`; ausente si no aplica. */
  status?: CommercialOfferStatusFilter;
  /** Entidad a enfocar cuando la alerta puede resolver un id representativo. */
  focus?: string;
  /** Subdestino de Tributación cuando `tab` es `taxation` (legacy). */
  taxationSubTab?: 'tax-catalog' | 'tax-rules-app' | 'tax-simulator';
  /** Destino federado fuera de Comercial (Configuración → Reglas). */
  href?: string;
}

export function resolveOffersRiskTab(summary: CommercialDashboardSummary): CommercialTab {
  const offerReasons = new Set<CommercialAttentionReason>(['expiring_soon', 'near_use_limit']);
  const offerItems = summary.attentionItems.filter((item) => offerReasons.has(item.reason));
  const promotionHits = offerItems.filter((item) => item.destinoTab === 'promotions').length;
  const bundleHits = offerItems.filter((item) => item.destinoTab === 'bundles').length;

  if (promotionHits > bundleHits) {
    return 'promotions';
  }

  return 'bundles';
}

export function resolveRulesGapTab(summary: CommercialDashboardSummary): CommercialTab {
  if (summary.activeBundlesWithInactiveItemsCount > summary.taxRulesCoverageGapCount) {
    return 'bundles';
  }

  return 'taxation';
}

/**
 * Tab destino de «Completar catálogo»: tipo con más ítems sin precio vigente.
 * Empate: plans > products > services (estable, documentado en el design spec).
 */
export function resolveCatalogIncompleteTab(summary: CommercialDashboardSummary): CommercialTab {
  const missing = summary.attentionItems.filter((item) => item.reason === 'missing_current_price');
  if (missing.length === 0) {
    return 'plans';
  }

  const counts = { plans: 0, products: 0, services: 0 };
  for (const item of missing) {
    if (item.destinoTab === 'plans') counts.plans += 1;
    else if (item.destinoTab === 'products') counts.products += 1;
    else if (item.destinoTab === 'services') counts.services += 1;
  }

  if (counts.products > counts.plans && counts.products >= counts.services) {
    return 'products';
  }
  if (counts.services > counts.plans && counts.services > counts.products) {
    return 'services';
  }
  return 'plans';
}

export function buildCommercialAlerts(summary: CommercialDashboardSummary): CommercialAlert[] {
  const alerts: CommercialAlert[] = [];

  if (summary.offersAtRiskCount > 0) {
    const count = formatGroupedNumber(summary.offersAtRiskCount);
    const tab = resolveOffersRiskTab(summary);
    const focusItem = summary.attentionItems.find(
      (item) =>
        (item.reason === 'expiring_soon' || item.reason === 'near_use_limit') &&
        item.destinoTab === tab,
    );
    alerts.push({
      key: 'offers-at-risk',
      variant: 'warning',
      title: 'Ofertas en riesgo',
      description:
        summary.offersAtRiskCount === 1
          ? `${count} oferta vence pronto o está cerca del límite de usos.`
          : `${count} ofertas vencen pronto o están cerca del límite de usos.`,
      ctaLabel: 'Ver ofertas',
      tab,
      status: 'expiring',
      ...(focusItem ? { focus: focusItem.id } : {}),
    });
  }

  if (summary.catalogIncompleteActiveCount > 0) {
    const count = formatGroupedNumber(summary.catalogIncompleteActiveCount);
    const tab = resolveCatalogIncompleteTab(summary);
    const focusItem = summary.attentionItems.find(
      (item) => item.reason === 'missing_current_price' && item.destinoTab === tab,
    );
    alerts.push({
      key: 'catalog-incomplete',
      variant: 'error',
      title: 'Catálogo incompleto',
      description: `${count} ${summary.catalogIncompleteActiveCount === 1 ? 'plan, producto o servicio activo está' : 'planes, productos o servicios activos están'} sin precio vigente.`,
      ctaLabel: 'Completar catálogo',
      tab,
      ...(focusItem ? { focus: focusItem.id } : {}),
    });
  }

  if (summary.rulesGapCount > 0) {
    const tab = resolveRulesGapTab(summary);
    const taxOnly =
      summary.taxRulesCoverageGapCount > 0 && summary.activeBundlesWithInactiveItemsCount === 0;
    const description = taxOnly
      ? 'Falta configurar reglas de aplicación de impuestos.'
      : `${formatGroupedNumber(summary.rulesGapCount)} ${summary.rulesGapCount === 1 ? 'bloqueo o riesgo' : 'bloqueos o riesgos'} en tributación o integridad de combos.`;
    alerts.push({
      key: 'rules-gap',
      variant: 'error',
      title: 'Reglas incompletas',
      description,
      ctaLabel: 'Revisar reglas',
      tab,
      ...(tab === 'taxation'
        ? {
            taxationSubTab: 'tax-rules-app' as const,
            href: buildRulesSettingsHref('tax-rules-app'),
          }
        : {}),
    });
  }

  return alerts.slice(0, 3);
}
