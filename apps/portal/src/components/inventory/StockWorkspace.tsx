'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@iwana/ui';
import type {
  InventoryItemRecord,
  StockBalanceRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import { portalModuleTabTriggerClassName } from '@/components/shared/portal-ui';
import type { PurchaseComposerInitialValues } from './PurchaseRequestComposer';
import { StockAdjustmentDialog } from './StockAdjustmentDialog';
import { StockByProductTable } from './StockByProductTable';
import { StockItemDetailDrawer } from './StockItemDetailDrawer';
import { StockKardexPanel } from './StockKardexPanel';
import { StockLocationsMatrix, type LocationMatrixCustodyFilter } from './StockLocationsMatrix';
import { StockReplenishmentPanel } from './StockReplenishmentPanel';

export type StockSubview = 'by-product' | 'by-location' | 'kardex' | 'replenishment';

interface StockWorkspaceProps {
  items: InventoryItemRecord[];
  balances: StockBalanceRecord[];
  locations: StockLocationRecord[];
  userLabelById?: Map<string, string>;
  custodyFilter?: LocationMatrixCustodyFilter;
  canAdjust?: boolean;
  onCustodyFilterChange?: (filter: LocationMatrixCustodyFilter) => void;
  onAdjustmentRegistered: (movementNumber: string) => void;
  onGeneratePurchaseRequest?: (values: PurchaseComposerInitialValues) => void;
}

export function StockWorkspace({
  items,
  balances,
  locations,
  userLabelById,
  custodyFilter = 'all',
  canAdjust = false,
  onCustodyFilterChange,
  onAdjustmentRegistered,
  onGeneratePurchaseRequest,
}: StockWorkspaceProps) {
  const [subview, setSubview] = useState<StockSubview>(() =>
    custodyFilter === 'mobile' ? 'by-location' : 'by-product',
  );
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [adjustItemId, setAdjustItemId] = useState<string | null>(null);

  useEffect(() => {
    if (custodyFilter === 'mobile') {
      setSubview('by-location');
    }
  }, [custodyFilter]);

  const detailItem = useMemo(
    () => items.find((item) => item.id === detailItemId) ?? null,
    [detailItemId, items],
  );

  return (
    <div className="space-y-4">
      <Tabs value={subview} onValueChange={(value) => setSubview(value as StockSubview)}>
        <TabsList>
          <TabsTrigger value="by-product" className={portalModuleTabTriggerClassName}>
            Por producto
          </TabsTrigger>
          <TabsTrigger value="by-location" className={portalModuleTabTriggerClassName}>
            Por bodega
          </TabsTrigger>
          <TabsTrigger value="kardex" className={portalModuleTabTriggerClassName}>
            Kardex
          </TabsTrigger>
          <TabsTrigger value="replenishment" className={portalModuleTabTriggerClassName}>
            Reposición
          </TabsTrigger>
        </TabsList>

        <TabsContent value="by-product" className="space-y-4">
          <StockByProductTable
            items={items}
            balances={balances}
            locations={locations}
            canAdjust={canAdjust}
            onViewDetail={setDetailItemId}
            onAdjust={setAdjustItemId}
          />
        </TabsContent>

        <TabsContent value="by-location" className="space-y-4">
          <StockLocationsMatrix
            locations={locations}
            balances={balances}
            items={items}
            {...(userLabelById ? { userLabelById } : {})}
            custodyFilter={custodyFilter}
            {...(onCustodyFilterChange ? { onCustodyFilterChange } : {})}
          />
        </TabsContent>

        <TabsContent value="kardex" className="space-y-4">
          <StockKardexPanel items={items} locations={locations} />
        </TabsContent>

        <TabsContent value="replenishment" className="space-y-4">
          <StockReplenishmentPanel
            onGeneratePurchaseRequest={onGeneratePurchaseRequest ?? (() => undefined)}
          />
        </TabsContent>
      </Tabs>

      <StockItemDetailDrawer
        open={Boolean(detailItem)}
        item={detailItem}
        balances={balances}
        locations={locations}
        canAdjust={canAdjust}
        onClose={() => setDetailItemId(null)}
        onAdjust={(itemId) => {
          setDetailItemId(null);
          setAdjustItemId(itemId);
        }}
      />

      <StockAdjustmentDialog
        open={adjustItemId !== null}
        items={items}
        locations={locations}
        preselectedItemId={adjustItemId}
        onClose={() => setAdjustItemId(null)}
        onAdjustmentRegistered={onAdjustmentRegistered}
      />
    </div>
  );
}
