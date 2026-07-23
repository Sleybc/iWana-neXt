import type { CommercialAttentionReason, CommercialDashboardSummary } from '@/lib/api-client';
import type {
  CommercialOfferStatusFilter,
  CommercialTab,
} from '@/components/commercial/commercial-tab-params';
import { formatCompactNumber } from '@/components/commercial/commercial-format';

export interface CommercialAlert {
  key: string;
  variant: 'warning' | 'error';
  title: string;
  description: string;
  ctaLabel: string;
  tab: CommercialTab;
  /** Filtro que debe aplicarse al aterrizar en `tab`; ausente si no aplica. */
  status?: CommercialOfferStatusFilter;
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

export function buildCommercialAlerts(summary: CommercialDashboardSummary): CommercialAlert[] {
  const alerts: CommercialAlert[] = [];

  if (summary.offersAtRiskCount > 0) {
    const count = formatCompactNumber(summary.offersAtRiskCount);
    alerts.push({
      key: 'offers-at-risk',
      variant: 'warning',
      title: 'Ofertas en riesgo',
      description: `${count} ${summary.offersAtRiskCount === 1 ? 'oferta vence' : 'ofertas vencen'} pronto o están cerca del límite de usos.`,
      ctaLabel: 'Ver ofertas',
      tab: resolveOffersRiskTab(summary),
      status: 'expiring',
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
