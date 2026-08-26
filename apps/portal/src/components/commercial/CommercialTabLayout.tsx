'use client';

import dynamic from 'next/dynamic';
import { PortalModuleSubnav, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import {
  COMMERCIAL_NAV_GROUPS,
  resolveCommercialNavId,
} from '@/components/commercial/commercial-nav';
import type { CommercialTab, TaxationSubTab } from '@/components/commercial/commercial-tab-params';
import { PlanCatalogPanel } from '@/components/commercial/catalog/PlanCatalogPanel';

export type { CommercialTab, TaxationSubTab };

function TabPanelFallback() {
  return (
    <div className="space-y-2" aria-busy="true" data-testid="commercial-tab-loading">
      <PortalSkeletonBlock className="h-10 rounded-xl" />
      <PortalSkeletonBlock className="h-32 rounded-xl" />
    </div>
  );
}

const AdditionalProductsPanel = dynamic(
  () =>
    import('@/components/commercial/catalog/AdditionalProductsPanel').then(
      (m) => m.AdditionalProductsPanel,
    ),
  { loading: () => <TabPanelFallback /> },
);
const AdditionalServicesPanel = dynamic(
  () =>
    import('@/components/commercial/catalog/AdditionalServicesPanel').then(
      (m) => m.AdditionalServicesPanel,
    ),
  { loading: () => <TabPanelFallback /> },
);
const BundlesManager = dynamic(
  () => import('@/components/commercial/BundlesManager').then((m) => m.BundlesManager),
  { loading: () => <TabPanelFallback /> },
);
const PromotionsManager = dynamic(
  () => import('@/components/commercial/PromotionsManager').then((m) => m.PromotionsManager),
  { loading: () => <TabPanelFallback /> },
);

interface CommercialTabLayoutProps {
  canEdit: boolean;
  activeTab: CommercialTab;
  taxationSubTab: TaxationSubTab;
  focusId?: string | null | undefined;
  onFocusConsumed?: (() => void) | undefined;
  onTabChange: (tab: CommercialTab) => void;
  onTaxationSubTabChange: (subTab: TaxationSubTab) => void;
}

export function CommercialTabLayout({
  canEdit,
  activeTab,
  taxationSubTab,
  focusId = null,
  onFocusConsumed,
  onTabChange,
}: CommercialTabLayoutProps) {
  const catalogFocus =
    activeTab === 'plans' || activeTab === 'products' || activeTab === 'services' ? focusId : null;
  const offersFocus = activeTab === 'bundles' || activeTab === 'promotions' ? focusId : null;
  const navValue = resolveCommercialNavId(activeTab, taxationSubTab);

  return (
    <div className="space-y-6">
      <PortalModuleSubnav
        groups={COMMERCIAL_NAV_GROUPS}
        value={navValue}
        onValueChange={(id) => onTabChange(id as CommercialTab)}
        ariaLabel="Secciones comerciales"
      />

      <div className="min-w-0 space-y-6">
        {activeTab === 'plans' ? (
          <PlanCatalogPanel
            canEdit={canEdit}
            focusId={catalogFocus}
            onFocusConsumed={onFocusConsumed}
          />
        ) : null}

        {activeTab === 'products' ? (
          <AdditionalProductsPanel
            canEdit={canEdit}
            focusId={catalogFocus}
            onFocusConsumed={onFocusConsumed}
          />
        ) : null}

        {activeTab === 'services' ? (
          <AdditionalServicesPanel
            canEdit={canEdit}
            focusId={catalogFocus}
            onFocusConsumed={onFocusConsumed}
          />
        ) : null}

        {activeTab === 'bundles' ? (
          <BundlesManager
            canEdit={canEdit}
            focusId={offersFocus}
            onFocusConsumed={onFocusConsumed}
          />
        ) : null}

        {activeTab === 'promotions' ? (
          <PromotionsManager
            canEdit={canEdit}
            focusId={offersFocus}
            onFocusConsumed={onFocusConsumed}
          />
        ) : null}
      </div>
    </div>
  );
}
