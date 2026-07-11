'use client';

import { Gift, Package } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@iwana/ui';
import { BundlesManager } from '@/components/commercial/BundlesManager';
import { PromotionsManager } from '@/components/commercial/PromotionsManager';
import type { OffersSubTab } from '@/components/commercial/commercial-tab-params';
import {
  portalModuleTabTriggerClassName,
  portalModuleTabsTrackClassName,
} from '@/components/shared/portal-ui';

interface OffersManagerProps {
  canEdit: boolean;
  activeSubTab: OffersSubTab;
  onSubTabChange: (subTab: OffersSubTab) => void;
}

export function OffersManager({ canEdit, activeSubTab, onSubTabChange }: OffersManagerProps) {
  return (
    <Tabs
      value={activeSubTab}
      onValueChange={(value) => {
        onSubTabChange(value as OffersSubTab);
      }}
    >
      <TabsList
        aria-label="Subsecciones de ofertas"
        className={`${portalModuleTabsTrackClassName} h-auto w-full sm:w-auto`}
      >
        <TabsTrigger value="bundles" className={portalModuleTabTriggerClassName}>
          <Package className="mr-2 h-4 w-4" aria-hidden="true" />
          Combos
        </TabsTrigger>
        <TabsTrigger value="promotions" className={portalModuleTabTriggerClassName}>
          <Gift className="mr-2 h-4 w-4" aria-hidden="true" />
          Promociones
        </TabsTrigger>
      </TabsList>

      <TabsContent value="bundles" className="mt-4">
        <BundlesManager canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="promotions" className="mt-4">
        <PromotionsManager canEdit={canEdit} />
      </TabsContent>
    </Tabs>
  );
}
