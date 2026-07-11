'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@iwana/ui';
import { CompatibilityRulesManager } from '@/components/commercial/CompatibilityRulesManager';
import { TaxCatalogManager } from '@/components/commercial/TaxCatalogManager';
import { TaxApplicationRulesManager } from '@/components/commercial/TaxApplicationRulesManager';
import { TaxSimulatorPanel } from '@/components/commercial/TaxSimulatorPanel';
import { OffersManager } from '@/components/commercial/OffersManager';
import { AdditionalProductsManager } from '@/components/settings/AdditionalProductsManager';
import { AdditionalServicesManager } from '@/components/settings/AdditionalServicesManager';
import { PlanCatalogManager } from '@/components/settings/PlanCatalogManager';
import {
  portalModuleTabTriggerClassName,
  portalModuleTabsDividerClassName,
  portalModuleTabsGroupClassName,
  portalModuleTabsShellClassName,
  portalModuleTabsTrackClassName,
} from '@/components/shared/portal-ui';
import type {
  CommercialTab,
  OffersSubTab,
  TaxationSubTab,
} from '@/components/commercial/commercial-tab-params';

export type { CommercialTab, OffersSubTab, TaxationSubTab };

interface CommercialTabLayoutProps {
  canEdit: boolean;
  activeTab: CommercialTab;
  taxationSubTab: TaxationSubTab;
  offersSubTab: OffersSubTab;
  onTabChange: (tab: CommercialTab) => void;
  onTaxationSubTabChange: (subTab: TaxationSubTab) => void;
  onOffersSubTabChange: (subTab: OffersSubTab) => void;
}

export function CommercialTabLayout({
  canEdit,
  activeTab,
  taxationSubTab,
  offersSubTab,
  onTabChange,
  onTaxationSubTabChange,
  onOffersSubTabChange,
}: CommercialTabLayoutProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        onTabChange(value as CommercialTab);
      }}
    >
      <TabsList aria-label="Secciones comerciales" className={portalModuleTabsShellClassName}>
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
          <p className="portal-eyebrow-muted px-1" id="commercial-tabs-rules-label">
            Reglas
          </p>
          <div
            role="group"
            aria-labelledby="commercial-tabs-rules-label"
            className={portalModuleTabsTrackClassName}
          >
            <TabsTrigger value="offers" className={portalModuleTabTriggerClassName}>
              Combos y promociones
            </TabsTrigger>
            <TabsTrigger value="compatibility" className={portalModuleTabTriggerClassName}>
              Compatibilidad
            </TabsTrigger>
            <TabsTrigger value="taxation" className={portalModuleTabTriggerClassName}>
              Tributación
            </TabsTrigger>
          </div>
        </div>
      </TabsList>

      <TabsContent value="plans" className="mt-4 space-y-4">
        <PlanCatalogManager canEdit={canEdit} />
      </TabsContent>

      <TabsContent value="products" className="mt-4 space-y-4">
        <AdditionalProductsManager canEdit={canEdit} />
      </TabsContent>

      <TabsContent value="services" className="mt-4 space-y-4">
        <AdditionalServicesManager canEdit={canEdit} />
      </TabsContent>

      <TabsContent value="offers" className="mt-4 space-y-4">
        <OffersManager
          canEdit={canEdit}
          activeSubTab={offersSubTab}
          onSubTabChange={onOffersSubTabChange}
        />
      </TabsContent>

      <TabsContent value="compatibility" className="mt-4 space-y-4">
        <CompatibilityRulesManager canEdit={canEdit} />
      </TabsContent>

      <TabsContent value="taxation" className="mt-4 space-y-4">
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

          <TabsContent value="tax-catalog" className="mt-4">
            <TaxCatalogManager canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="tax-rules-app" className="mt-4">
            <TaxApplicationRulesManager canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="tax-simulator" className="mt-4">
            <TaxSimulatorPanel />
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
