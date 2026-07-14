'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@iwana/ui';
import { CompatibilityRulesManager } from '@/components/commercial/CompatibilityRulesManager';
import { TaxCatalogManager } from '@/components/commercial/TaxCatalogManager';
import { TaxApplicationRulesManager } from '@/components/commercial/TaxApplicationRulesManager';
import { TaxSimulatorPanel } from '@/components/commercial/TaxSimulatorPanel';
import { OffersManager } from '@/components/commercial/OffersManager';
import { PlanCatalogPanel } from '@/components/commercial/catalog/PlanCatalogPanel';
import { AdditionalProductsPanel } from '@/components/commercial/catalog/AdditionalProductsPanel';
import { AdditionalServicesPanel } from '@/components/commercial/catalog/AdditionalServicesPanel';
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
  summary: ReactNode;
  onTabChange: (tab: CommercialTab) => void;
  onTaxationSubTabChange: (subTab: TaxationSubTab) => void;
  onOffersSubTabChange: (subTab: OffersSubTab) => void;
}

export function CommercialTabLayout({
  canEdit,
  activeTab,
  taxationSubTab,
  offersSubTab,
  summary,
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
          <p className="portal-eyebrow px-1" id="commercial-tabs-operation-label">
            Operación
          </p>
          <div
            role="group"
            aria-labelledby="commercial-tabs-operation-label"
            className={portalModuleTabsTrackClassName}
          >
            <TabsTrigger value="summary" className={portalModuleTabTriggerClassName}>
              Resumen
            </TabsTrigger>
          </div>
        </div>

        <div role="separator" aria-hidden="true" className={portalModuleTabsDividerClassName} />

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

      <TabsContent value="summary" className="space-y-6">
        {summary}
      </TabsContent>

      <TabsContent value="plans" className="space-y-6">
        <PlanCatalogPanel canEdit={canEdit} />
      </TabsContent>

      <TabsContent value="products" className="space-y-6">
        <AdditionalProductsPanel canEdit={canEdit} />
      </TabsContent>

      <TabsContent value="services" className="space-y-6">
        <AdditionalServicesPanel canEdit={canEdit} />
      </TabsContent>

      <TabsContent value="offers" className="space-y-6">
        <OffersManager
          canEdit={canEdit}
          activeSubTab={offersSubTab}
          onSubTabChange={onOffersSubTabChange}
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
