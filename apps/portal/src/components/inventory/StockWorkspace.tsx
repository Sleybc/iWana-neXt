'use client';

import { useCallback, useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@iwana/ui';
import { History, Package, PackagePlus, Warehouse } from 'lucide-react';
import {
  inventoryApi,
  type InventoryItemRecord,
  type StockBalanceRecord,
  type StockLocationRecord,
} from '@/lib/api-client';
import {
  portalResourceTabIconClassName,
  portalResourceTabListClassName,
  portalResourceTabTriggerClassName,
} from '@/components/shared/portal-ui';
import type { PurchaseComposerInitialValues } from './PurchaseRequestComposer';
import { StockAdjustmentDialog } from './StockAdjustmentDialog';
import { StockByProductTable, type StockByProductServerFilters } from './StockByProductTable';
import { StockItemDetailDrawer } from './StockItemDetailDrawer';
import { StockKardexPanel } from './StockKardexPanel';
import { StockLocationsMatrix, type LocationMatrixCustodyFilter } from './StockLocationsMatrix';
import type { LocationMatrixFilters } from './location-matrix-filters';
import { StockReplenishmentPanel } from './StockReplenishmentPanel';
import type { StockKardexFilters } from './stock-kardex-filters';

export type StockSubview = 'by-product' | 'by-location' | 'kardex' | 'replenishment';

interface StockWorkspaceProps {
  items: InventoryItemRecord[];
  balances: StockBalanceRecord[];
  locations: StockLocationRecord[];
  userLabelById?: Map<string, string>;
  custodyFilter?: LocationMatrixCustodyFilter;
  canAdjust?: boolean;
  itemsTotal?: number;
  itemsHasMore?: boolean;
  locationsTotal?: number;
  locationsHasMore?: boolean;
  isLoadingMoreItems?: boolean;
  isLoadingMoreLocations?: boolean;
  onLoadMoreItems?: () => void;
  onLoadMoreLocations?: () => void;
  balancesHasMore?: boolean;
  isLoadingMoreBalances?: boolean;
  onLoadMoreBalances?: () => void;
  productFilters?: StockByProductServerFilters;
  onProductFiltersChange?: (filters: StockByProductServerFilters) => void;
  locationListFilters?: Omit<LocationMatrixFilters, 'custodyFilter'>;
  onLocationListFiltersChange?: (filters: Omit<LocationMatrixFilters, 'custodyFilter'>) => void;
  initialSubview?: StockSubview;
  initialKardexFilters?: Partial<StockKardexFilters>;
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
  itemsTotal,
  itemsHasMore = false,
  locationsTotal,
  locationsHasMore = false,
  isLoadingMoreItems = false,
  isLoadingMoreLocations = false,
  onLoadMoreItems,
  onLoadMoreLocations,
  balancesHasMore = false,
  isLoadingMoreBalances = false,
  onLoadMoreBalances,
  productFilters,
  onProductFiltersChange,
  locationListFilters,
  onLocationListFiltersChange,
  initialSubview,
  initialKardexFilters,
  onCustodyFilterChange,
  onAdjustmentRegistered,
  onGeneratePurchaseRequest,
}: StockWorkspaceProps) {
  const [subview, setSubview] = useState<StockSubview>(
    () => initialSubview ?? (custodyFilter === 'mobile' ? 'by-location' : 'by-product'),
  );
  /** Selección fuera del buffer de página: no derivar con `items.find` al paginar. */
  const [detailItem, setDetailItem] = useState<InventoryItemRecord | null>(null);
  const [adjustItemId, setAdjustItemId] = useState<string | null>(null);

  useEffect(() => {
    if (initialSubview) {
      setSubview(initialSubview);
    }
  }, [initialSubview]);

  useEffect(() => {
    if (custodyFilter === 'mobile') {
      setSubview('by-location');
    }
  }, [custodyFilter]);

  useEffect(() => {
    if (!detailItem) {
      return;
    }

    const fresh = items.find((item) => item.id === detailItem.id);
    if (fresh && fresh !== detailItem) {
      setDetailItem(fresh);
    }
  }, [detailItem, items]);

  const openDetail = useCallback(
    async (itemId: string) => {
      const fromPage = items.find((item) => item.id === itemId) ?? null;
      if (fromPage) {
        setDetailItem(fromPage);
        return;
      }

      try {
        const item = await inventoryApi.getItem(itemId);
        setDetailItem(item);
      } catch {
        setDetailItem(null);
      }
    },
    [items],
  );

  return (
    <div className="space-y-4">
      <Tabs value={subview} onValueChange={(value) => setSubview(value as StockSubview)}>
        <TabsList aria-label="Vistas de existencias" className={portalResourceTabListClassName}>
          <TabsTrigger
            value="by-product"
            className={portalResourceTabTriggerClassName(subview === 'by-product')}
          >
            <Package
              className={portalResourceTabIconClassName(subview === 'by-product')}
              aria-hidden="true"
            />
            Por producto
          </TabsTrigger>
          <TabsTrigger
            value="by-location"
            className={portalResourceTabTriggerClassName(subview === 'by-location')}
          >
            <Warehouse
              className={portalResourceTabIconClassName(subview === 'by-location')}
              aria-hidden="true"
            />
            Por bodega
          </TabsTrigger>
          <TabsTrigger
            value="kardex"
            className={portalResourceTabTriggerClassName(subview === 'kardex')}
          >
            <History
              className={portalResourceTabIconClassName(subview === 'kardex')}
              aria-hidden="true"
            />
            Kardex
          </TabsTrigger>
          <TabsTrigger
            value="replenishment"
            className={portalResourceTabTriggerClassName(subview === 'replenishment')}
          >
            <PackagePlus
              className={portalResourceTabIconClassName(subview === 'replenishment')}
              aria-hidden="true"
            />
            Reposición
          </TabsTrigger>
        </TabsList>

        <TabsContent value="by-product" className="space-y-4">
          <StockByProductTable
            items={items}
            balances={balances}
            locations={locations}
            {...(itemsTotal != null ? { totalCount: itemsTotal } : {})}
            hasMore={itemsHasMore}
            isLoadingMore={isLoadingMoreItems}
            {...(onLoadMoreItems ? { onLoadMore: onLoadMoreItems } : {})}
            {...(productFilters ? { filters: productFilters } : {})}
            {...(onProductFiltersChange ? { onFiltersChange: onProductFiltersChange } : {})}
            canAdjust={canAdjust}
            onViewDetail={(itemId) => {
              void openDetail(itemId);
            }}
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
            {...(locationsTotal != null ? { totalCount: locationsTotal } : {})}
            hasMore={locationsHasMore}
            isLoadingMore={isLoadingMoreLocations}
            {...(onLoadMoreLocations ? { onLoadMore: onLoadMoreLocations } : {})}
            balancesHasMore={balancesHasMore}
            isLoadingMoreBalances={isLoadingMoreBalances}
            {...(onLoadMoreBalances ? { onLoadMoreBalances } : {})}
            {...(onCustodyFilterChange ? { onCustodyFilterChange } : {})}
            {...(locationListFilters ? { listFilters: locationListFilters } : {})}
            {...(onLocationListFiltersChange
              ? { onListFiltersChange: onLocationListFiltersChange }
              : {})}
          />
        </TabsContent>

        <TabsContent value="kardex" className="space-y-4">
          <StockKardexPanel
            {...(initialKardexFilters ? { initialFilters: initialKardexFilters } : {})}
          />
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
        onClose={() => setDetailItem(null)}
        onAdjust={(itemId) => {
          setDetailItem(null);
          setAdjustItemId(itemId);
        }}
      />

      <StockAdjustmentDialog
        open={adjustItemId !== null}
        preselectedItemId={adjustItemId}
        onClose={() => setAdjustItemId(null)}
        onAdjustmentRegistered={onAdjustmentRegistered}
      />
    </div>
  );
}
