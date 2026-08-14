'use client';

import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@iwana/ui';
import {
  portalModuleTabTriggerClassName,
  portalModuleTabsDividerClassName,
  portalModuleTabsGroupClassName,
  portalModuleTabsShellClassName,
  portalModuleTabsTrackClassName,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import type { CommercialTab, TaxationSubTab } from '@/components/commercial/commercial-tab-params';

export type { CommercialTab, TaxationSubTab };

function TabPanelFallback() {
  return (
    <div className="space-y-2" aria-busy="true" data-testid="commercial-tab-loading">
      <PortalSkeletonBlock className="h-10 rounded-xl" />
      <PortalSkeletonBlock className="h-32 rounded-xl" />
    </div>
  );
}

const PlanCatalogPanel = dynamic(
  () => import('@/components/commercial/catalog/PlanCatalogPanel').then((m) => m.PlanCatalogPanel),
  { loading: () => <TabPanelFallback /> },
);
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
const CompatibilityRulesManager = dynamic(
  () =>
    import('@/components/commercial/CompatibilityRulesManager').then(
      (m) => m.CompatibilityRulesManager,
    ),
  { loading: () => <TabPanelFallback /> },
);
const TaxCatalogManager = dynamic(
  () => import('@/components/commercial/TaxCatalogManager').then((m) => m.TaxCatalogManager),
  { loading: () => <TabPanelFallback /> },
);
const TaxApplicationRulesManager = dynamic(
  () =>
    import('@/components/commercial/TaxApplicationRulesManager').then(
      (m) => m.TaxApplicationRulesManager,
    ),
  { loading: () => <TabPanelFallback /> },
);
const TaxSimulatorPanel = dynamic(
  () => import('@/components/commercial/TaxSimulatorPanel').then((m) => m.TaxSimulatorPanel),
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
  onTaxationSubTabChange,
}: CommercialTabLayoutProps) {
  const catalogFocus =
    activeTab === 'plans' || activeTab === 'products' || activeTab === 'services' ? focusId : null;
  const offersFocus = activeTab === 'bundles' || activeTab === 'promotions' ? focusId : null;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        onTabChange(value as CommercialTab);
      }}
    >
      <TabsList
        aria-label="Secciones comerciales"
        className={cn(
          portalModuleTabsShellClassName,
          // Sticky bajo el TopHeader solo en md+ (header: py-3 ×2 + contenido h-11 + border-b = 69px).
          // En mobile el shell apila en columna y no debe ser sticky.
          'md:sticky md:top-[69px] z-(--z-sticky)',
        )}
      >
        <div className={portalModuleTabsGroupClassName}>
          <p className="portal-eyebrow px-1" id="commercial-tabs-catalog-label">
            Catálogo
          </p>
          <div
            role="group"
            aria-labelledby="commercial-tabs-catalog-label"
            className={portalModuleTabsTrackClassName}
          >
            <TabsTrigger value="plans" className={portalModuleTabTriggerClassName}>
              Planes
            </TabsTrigger>
            <TabsTrigger value="products" className={portalModuleTabTriggerClassName}>
              Productos adicionales
            </TabsTrigger>
            <TabsTrigger value="services" className={portalModuleTabTriggerClassName}>
              Servicios
            </TabsTrigger>
          </div>
        </div>

        <div role="separator" aria-hidden="true" className={portalModuleTabsDividerClassName} />

        <div className={portalModuleTabsGroupClassName}>
          <p className="portal-eyebrow px-1" id="commercial-tabs-offers-label">
            Ofertas
          </p>
          <div
            role="group"
            aria-labelledby="commercial-tabs-offers-label"
            className={portalModuleTabsTrackClassName}
          >
            <TabsTrigger value="bundles" className={portalModuleTabTriggerClassName}>
              Combos
            </TabsTrigger>
            <TabsTrigger value="promotions" className={portalModuleTabTriggerClassName}>
              Promociones
            </TabsTrigger>
          </div>
        </div>

        <div role="separator" aria-hidden="true" className={portalModuleTabsDividerClassName} />

        <div className={portalModuleTabsGroupClassName}>
          <p className="portal-eyebrow px-1" id="commercial-tabs-rules-label">
            Reglas
          </p>
          <div
            role="group"
            aria-labelledby="commercial-tabs-rules-label"
            className={portalModuleTabsTrackClassName}
          >
            <TabsTrigger value="compatibility" className={portalModuleTabTriggerClassName}>
              Compatibilidad
            </TabsTrigger>
            <TabsTrigger value="taxation" className={portalModuleTabTriggerClassName}>
              Tributación
            </TabsTrigger>
          </div>
        </div>
      </TabsList>

      <TabsContent value="plans" className="space-y-6">
        <PlanCatalogPanel
          canEdit={canEdit}
          focusId={activeTab === 'plans' ? catalogFocus : null}
          onFocusConsumed={onFocusConsumed}
        />
      </TabsContent>

      <TabsContent value="products" className="space-y-6">
        <AdditionalProductsPanel
          canEdit={canEdit}
          focusId={activeTab === 'products' ? catalogFocus : null}
          onFocusConsumed={onFocusConsumed}
        />
      </TabsContent>

      <TabsContent value="services" className="space-y-6">
        <AdditionalServicesPanel
          canEdit={canEdit}
          focusId={activeTab === 'services' ? catalogFocus : null}
          onFocusConsumed={onFocusConsumed}
        />
      </TabsContent>

      <TabsContent value="bundles" className="space-y-6">
        <BundlesManager
          canEdit={canEdit}
          focusId={activeTab === 'bundles' ? offersFocus : null}
          onFocusConsumed={onFocusConsumed}
        />
      </TabsContent>

      <TabsContent value="promotions" className="space-y-6">
        <PromotionsManager
          canEdit={canEdit}
          focusId={activeTab === 'promotions' ? offersFocus : null}
          onFocusConsumed={onFocusConsumed}
        />
      </TabsContent>

      <TabsContent value="compatibility" className="space-y-6">
        <CompatibilityRulesManager canEdit={canEdit} />
      </TabsContent>

      <TabsContent value="taxation" className="space-y-6">
        <Tabs
          value={taxationSubTab}
          onValueChange={(value) => {
            onTaxationSubTabChange(value as TaxationSubTab);
          }}
        >
          <TabsList
            aria-label="Subsecciones tributarias"
            className={cn(portalModuleTabsTrackClassName, 'h-auto w-full sm:w-auto')}
          >
            <TabsTrigger value="tax-catalog" className={portalModuleTabTriggerClassName}>
              Catálogo
            </TabsTrigger>
            <TabsTrigger value="tax-rules-app" className={portalModuleTabTriggerClassName}>
              Reglas de aplicación
            </TabsTrigger>
            <TabsTrigger value="tax-simulator" className={portalModuleTabTriggerClassName}>
              Simulador tributario
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tax-catalog" className="mt-4 space-y-6">
            <TaxCatalogManager canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="tax-rules-app" className="mt-4 space-y-6">
            <TaxApplicationRulesManager canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="tax-simulator" className="mt-4 space-y-6">
            <TaxSimulatorPanel />
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
