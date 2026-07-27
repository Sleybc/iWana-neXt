'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@iwana/ui';
import {
  InventoryCategoryStatus,
  PurchaseOrderStatus,
  SerializedAssetStatus,
  SupplierProfileStatus,
  UserRole,
  WriteOffReason,
  WriteOffStatus,
  StockMovementOrigin,
} from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  ApiError,
  type AddSupplierQuoteDto,
  type CancelPurchaseOrderDto,
  type CancelPurchaseRequestDto,
  type UpdatePurchaseRequestDto,
  type CreateInventoryItemDto,
  type CreateInventoryCategoryDto,
  type CreatePurchaseOrderDto,
  type CreatePurchaseRequestAwardsDto,
  type CreatePurchaseRequestDto,
  type CreateSupplierDto,
  type CreateCounterPurchaseDto,
  type GoodsReceiptResultRecord,
  type InventoryDashboardSummary,
  type InventoryCatalogOptionRecord,
  type InventoryCategoryRecord,
  type InventoryItemRecord,
  type InventoryListMeta,
  type InternalUser,
  inventoryApi,
  commercialApi,
  type StockIssueRecord,
  type StockIssueDetailRecord,
  type CreateStockIssueDto,
  type UpdateStockIssueDto,
  type DispatchStockIssueDto,
  type StockCountDetailRecord,
  type CreateStockCountDto,
  type UpdateStockCountDto,
  type CreateStockLocationDto,
  type ListInventoryItemsParams,
  type ReplenishmentSuggestionRecord,
  purchasingApi,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
  type PurchaseRequestRecord,
  type ReceivePurchaseOrderDto,
  type RejectPurchaseRequestDto,
  type SerializedAssetRecord,
  type SerializedAssetDetailRecord,
  type StockBalanceRecord,
  type StockLocationRecord,
  type StockMovementResultRecord,
  type InventoryWriteOffRecord,
  type SupplierProfileRecord,
  type UpdateStockLocationDto,
  type UpdateInventoryItemDto,
  type UpdateInventoryCategoryDto,
  type UpdateSupplierDto,
} from '@/lib/api-client';
import { EMPTY_LIST_META } from '@/lib/list-meta';
import { buildUserLabelMap, loadTenantUsers } from '@/lib/portal-user-options';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  interactiveFocusClassName,
  portalDataTableShellClassName,
  portalModuleTabTriggerClassName,
  portalModuleTabsDividerClassName,
  portalModuleTabsGroupClassName,
  portalModuleTabsShellClassName,
  portalModuleTabsTrackClassName,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import { InventoryDashboard } from './InventoryDashboard';
import { InventoryCreateProductDialog } from './InventoryCreateProductDialog';
import { InventoryCatalogDrawer } from './InventoryCatalogDrawer';
import { InventoryCategoryDrawer } from './InventoryCategoryDrawer';
import { InventoryCatalogCategoriesPanel } from './InventoryCatalogCategoriesPanel';
import { InventoryCatalogProductsPanel } from './InventoryCatalogProductsPanel';
import { InventoryCatalogSummaryPreview } from './InventoryCatalogSummaryPreview';
import { PurchaseWorkspace } from './PurchaseWorkspace';
import type { PurchaseComposerInitialValues } from './PurchaseRequestComposer';
import { SuppliersPanel } from './SuppliersPanel';
import { SupplierFormDrawer } from './SupplierFormDrawer';
import { SerializedAssetDetailDrawer } from './SerializedAssetDetailDrawer';
import { AssetsWorkspace, type AssetsSubview } from './AssetsWorkspace';
import { StockLocationFormDialog } from './StockLocationFormDialog';
import { type LocationMatrixCustodyFilter } from './StockLocationsMatrix';
import {
  EMPTY_LOCATION_MATRIX_FILTERS,
  locationMatrixFiltersToListParams,
  type LocationMatrixFilters,
} from './location-matrix-filters';
import { StockLocationsPanel } from './StockLocationsPanel';
import { StockWorkspace, type StockSubview } from './StockWorkspace';
import type { StockByProductServerFilters } from './StockByProductTable';

import { StockIssuesWorkspace } from './StockIssuesWorkspace';
import { StockCountsWorkspace } from './StockCountsWorkspace';
import { MovementsWorkspace } from './MovementsWorkspace';
import { WriteOffsPanel } from './WriteOffsPanel';
import type { StockKardexFilters } from './stock-kardex-filters';
import {
  buildTakenCodePrefixSet,
  isValidCategoryCodePrefix,
  resolveCategoryCreateValues,
  sanitizeAlnumUpper,
  suggestCategoryCodePrefix,
  suggestNextCategorySortOrder,
} from './inventory-category-code';
import {
  STOCK_AVAILABLE_LABEL,
  STOCK_RESERVED_HELP_TEXT,
  formatInventoryDate,
  formatInventoryQuantity,
  getSerializedAssetStatusLabel,
} from './inventory-labels';
import { type CatalogFilters, EMPTY_CATALOG_FILTERS } from './catalog-filters';
import { resolveInventoryTab, shouldOpenLocationCreateFromUrl } from './inventory-tab-params';
import {
  EMPTY_INVENTORY_LIST_META,
  INVENTORY_LIST_PAGE_SIZE,
  INVENTORY_SOFT_CAP_PAGE_SIZE,
  drainInventoryBalances,
  inventoryHasMore,
  mergeById,
} from './inventory-list-pagination';
import { PICKER_SOFT_CAP } from '@/lib/picker-soft-cap';

export type InventoryTab =
  | 'catalog'
  | 'stock'
  | 'purchasing'
  | 'suppliers'
  | 'locations'
  | 'issues'
  | 'counts'
  | 'assets'
  | 'movements'
  | 'writeoffs';

const ASSET_DETAIL_SECTION_LIMIT = 20;

const ASSET_DETAIL_QUERY_DEFAULTS = {
  lifecyclePage: 1,
  lifecycleLimit: ASSET_DETAIL_SECTION_LIMIT,
  movementsPage: 1,
  movementsLimit: ASSET_DETAIL_SECTION_LIMIT,
} as const;

type CatalogSubView = 'products' | 'categories';

function resolveLocationCustodyFilter(value: string | null): LocationMatrixCustodyFilter {
  return value === 'mobile' ? 'mobile' : 'all';
}

function mapValidationDetails(details: unknown): string | null {
  if (!details || typeof details !== 'object') {
    return null;
  }

  const fieldErrors = (details as { fieldErrors?: Record<string, string[] | undefined> })
    .fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== 'object') {
    return null;
  }

  const messages = Object.values(fieldErrors)
    .flatMap((entries) => entries ?? [])
    .map((message) => message.trim())
    .filter((message) => message.length > 0);

  if (messages.length === 0) {
    return null;
  }

  return messages.slice(0, 3).join(' ');
}

function mapInventoryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para operar Inventario.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
    if (error.code === 'VALIDATION_ERROR') {
      const detailMessage = mapValidationDetails(error.details);
      if (detailMessage) {
        return detailMessage;
      }
    }
    return error.message;
  }

  return 'No fue posible completar la operación. Intenta nuevamente.';
}

interface InventoryClientProps {
  initialTab?: string;
}

export function InventoryClient({ initialTab }: InventoryClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const kardexAssetIdFromUrl = useMemo(
    () => searchParams.get('serializedAssetId')?.trim() ?? '',
    [searchParams],
  );
  const { user } = useAuth();
  const canAdjustStock = user?.role === UserRole.ADMIN;
  // Contrato: no reutilizar canAdjustStock para bajas — flag de aprobación independiente.
  const canApproveWriteOff = user?.role === UserRole.ADMIN;
  const [activeTab, setActiveTab] = useState<InventoryTab>(resolveInventoryTab(initialTab));
  const [locationCustodyFilter, setLocationCustodyFilter] = useState<LocationMatrixCustodyFilter>(
    () => resolveLocationCustodyFilter(searchParams.get('custody')),
  );
  const [summary, setSummary] = useState<InventoryDashboardSummary | null>(null);
  const [items, setItems] = useState<InventoryItemRecord[]>([]);
  const [locations, setLocations] = useState<StockLocationRecord[]>([]);
  const [issues, setIssues] = useState<StockIssueRecord[]>([]);
  const [tenantUsers, setTenantUsers] = useState<InternalUser[]>([]);
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null);
  const [assets, setAssets] = useState<SerializedAssetRecord[]>([]);
  const [balances, setBalances] = useState<StockBalanceRecord[]>([]);
  const [requests, setRequests] = useState<PurchaseRequestRecord[]>([]);
  const [itemsMeta, setItemsMeta] = useState<InventoryListMeta>(EMPTY_INVENTORY_LIST_META);
  const [balancesMeta, setBalancesMeta] = useState<InventoryListMeta>(EMPTY_INVENTORY_LIST_META);
  const [locationsMeta, setLocationsMeta] = useState<InventoryListMeta>(EMPTY_INVENTORY_LIST_META);
  const [issuesMeta, setIssuesMeta] = useState<InventoryListMeta>(EMPTY_INVENTORY_LIST_META);
  const [requestsMeta, setRequestsMeta] = useState<InventoryListMeta>(EMPTY_INVENTORY_LIST_META);
  const [catalogMeta, setCatalogMeta] = useState<InventoryListMeta>(EMPTY_INVENTORY_LIST_META);
  const [isLoadingMoreCatalog, setIsLoadingMoreCatalog] = useState(false);
  const [isLoadingMoreItems, setIsLoadingMoreItems] = useState(false);
  const [isLoadingMoreLocations, setIsLoadingMoreLocations] = useState(false);
  const [isLoadingMoreBalances, setIsLoadingMoreBalances] = useState(false);
  const [isLoadingMoreIssues, setIsLoadingMoreIssues] = useState(false);
  const [isLoadingMoreRequests, setIsLoadingMoreRequests] = useState(false);
  const [isLoadingTabLists, setIsLoadingTabLists] = useState(false);
  const [replenishmentPreview, setReplenishmentPreview] = useState<ReplenishmentSuggestionRecord[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [locationEditItem, setLocationEditItem] = useState<StockLocationRecord | null>(null);
  const [locationSubmitError, setLocationSubmitError] = useState<string | null>(null);
  const [isSubmittingLocation, setIsSubmittingLocation] = useState(false);

  const [assetDetail, setAssetDetail] = useState<SerializedAssetDetailRecord | null>(null);
  const [assetDetailTargetId, setAssetDetailTargetId] = useState<string | null>(null);
  const [assetDetailError, setAssetDetailError] = useState<string | null>(null);
  const [isLoadingAsset, setIsLoadingAsset] = useState(false);
  const [isLoadingMoreAssetLifecycle, setIsLoadingMoreAssetLifecycle] = useState(false);
  const [isLoadingMoreAssetMovements, setIsLoadingMoreAssetMovements] = useState(false);
  const [assetsSubview, setAssetsSubview] = useState<AssetsSubview>('list');
  const [stockSubviewPrefill, setStockSubviewPrefill] = useState<StockSubview | null>(null);
  const [createRequestError, setCreateRequestError] = useState<string | null>(null);
  const [pendingComposerPrefill, setPendingComposerPrefill] =
    useState<PurchaseComposerInitialValues | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [awardsError, setAwardsError] = useState<string | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [updateRequestError, setUpdateRequestError] = useState<string | null>(null);
  const [approveOrderError, setApproveOrderError] = useState<string | null>(null);
  const [cancelOrderError, setCancelOrderError] = useState<string | null>(null);
  const [closeOrderError, setCloseOrderError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [latestQuoteAmount, setLatestQuoteAmount] = useState<string | null>(null);
  const [latestOrder, setLatestOrder] = useState<PurchaseOrderRecord | null>(null);
  const [latestOrderLines, setLatestOrderLines] = useState<PurchaseOrderLineRecord[]>([]);
  const [latestReceipt, setLatestReceipt] = useState<GoodsReceiptResultRecord | null>(null);
  const [latestCounterPurchase, setLatestCounterPurchase] =
    useState<StockMovementResultRecord | null>(null);
  const [counterPurchaseError, setCounterPurchaseError] = useState<string | null>(null);
  const [movementNotice, setMovementNotice] = useState<string | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
  const [isSubmittingApprove, setIsSubmittingApprove] = useState(false);
  const [isSubmittingAwards, setIsSubmittingAwards] = useState(false);
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [isSubmittingUpdateRequest, setIsSubmittingUpdateRequest] = useState(false);
  const [isSubmittingApproveOrder, setIsSubmittingApproveOrder] = useState(false);
  const [isSubmittingCancelOrder, setIsSubmittingCancelOrder] = useState(false);
  const [isSubmittingCloseOrder, setIsSubmittingCloseOrder] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isSubmittingReceipt, setIsSubmittingReceipt] = useState(false);
  const [isSubmittingCounterPurchase, setIsSubmittingCounterPurchase] = useState(false);
  const [isSubmittingMovement, setIsSubmittingMovement] = useState(false);
  const [isSubmittingWriteOff, setIsSubmittingWriteOff] = useState(false);
  const [saleForm, setSaleForm] = useState({
    itemId: '',
    locationId: '',
    quantity: '1',
    commercialRefId: '',
    serialNumber: '',
    notes: '',
  });
  const [returnForm, setReturnForm] = useState({
    itemId: '',
    sourceLocationId: '',
    destinationLocationId: '',
    quantity: '1',
    serialNumber: '',
    targetStatus: SerializedAssetStatus.IN_TRANSIT,
    notes: '',
  });
  const [writeOffForm, setWriteOffForm] = useState({
    itemId: '',
    serializedAssetId: '',
    locationId: '',
    quantity: '1',
    reason: WriteOffReason.DAMAGED,
    notes: '',
  });
  const [movementError, setMovementError] = useState<string | null>(null);
  const [writeOffError, setWriteOffError] = useState<string | null>(null);
  const [writeOffSuccess, setWriteOffSuccess] = useState<string | null>(null);
  const [pendingWriteOffs, setPendingWriteOffs] = useState<InventoryWriteOffRecord[]>([]);
  const [writeOffHistoryRevision, setWriteOffHistoryRevision] = useState(0);
  const [purchaseListRevision, setPurchaseListRevision] = useState(0);
  const [issuesListRevision, setIssuesListRevision] = useState(0);
  const [countsListRevision, setCountsListRevision] = useState(0);
  const [suppliersListRevision, setSuppliersListRevision] = useState(0);
  const [assetsListRevision, setAssetsListRevision] = useState(0);
  const [stockProductFilters, setStockProductFilters] = useState<StockByProductServerFilters>({
    search: '',
    onlyBelowMinimum: false,
    stockLocationId: '',
  });
  const [locationListFilters, setLocationListFilters] = useState<
    Omit<LocationMatrixFilters, 'custodyFilter'>
  >({
    search: EMPTY_LOCATION_MATRIX_FILTERS.search,
    typeFilter: EMPTY_LOCATION_MATRIX_FILTERS.typeFilter,
    statusFilter: EMPTY_LOCATION_MATRIX_FILTERS.statusFilter,
    stockFilter: EMPTY_LOCATION_MATRIX_FILTERS.stockFilter,
  });
  const [isLoadingPendingWriteOffs, setIsLoadingPendingWriteOffs] = useState(false);
  const [pendingWriteOffsError, setPendingWriteOffsError] = useState<string | null>(null);
  const [writeOffActionError, setWriteOffActionError] = useState<string | null>(null);
  const [processingWriteOffId, setProcessingWriteOffId] = useState<string | null>(null);
  const [stockKardexPrefill, setStockKardexPrefill] = useState<Partial<StockKardexFilters> | null>(
    null,
  );
  const [catalogOptions, setCatalogOptions] = useState<InventoryCatalogOptionRecord[]>([]);
  const [catalogOptionsError, setCatalogOptionsError] = useState<string | null>(null);
  const [catalogItems, setCatalogItems] = useState<InventoryItemRecord[]>([]);
  const [catalogFilters, setCatalogFilters] = useState<CatalogFilters>(EMPTY_CATALOG_FILTERS);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [catalogDrawerOpen, setCatalogDrawerOpen] = useState(false);
  const [catalogEditItem, setCatalogEditItem] = useState<InventoryItemRecord | null>(null);
  const [catalogSubmitError, setCatalogSubmitError] = useState<string | null>(null);
  const [catalogFeedback, setCatalogFeedback] = useState<string | null>(null);
  const [isSubmittingCatalogItem, setIsSubmittingCatalogItem] = useState(false);
  const [deletingCatalogItemId, setDeletingCatalogItemId] = useState<string | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<InventoryItemRecord | null>(null);
  const [deleteConfirmError, setDeleteConfirmError] = useState<string | null>(null);
  const [createCategoryInlineOpen, setCreateCategoryInlineOpen] = useState(false);
  const [createCategoryInlineName, setCreateCategoryInlineName] = useState('');
  const [createCategoryInlineCodePrefix, setCreateCategoryInlineCodePrefix] = useState('');
  const [createCategoryInlineDescription, setCreateCategoryInlineDescription] = useState('');
  const [createCategoryInlinePrefixTouched, setCreateCategoryInlinePrefixTouched] = useState(false);
  const [createCategoryInlineError, setCreateCategoryInlineError] = useState<string | null>(null);
  const [createCategoryInlineApiError, setCreateCategoryInlineApiError] = useState<string | null>(
    null,
  );
  const [createCategorySelectionOverride, setCreateCategorySelectionOverride] = useState<
    string | null
  >(null);
  const [createCategorySuggestedSortOrder, setCreateCategorySuggestedSortOrder] = useState<
    number | null
  >(null);
  const [isSubmittingInlineCategory, setIsSubmittingInlineCategory] = useState(false);
  const [catalogSubView, setCatalogSubView] = useState<CatalogSubView>('products');
  const [categories, setCategories] = useState<InventoryCategoryRecord[]>([]);
  const [categoriesMeta, setCategoriesMeta] =
    useState<InventoryListMeta>(EMPTY_INVENTORY_LIST_META);
  const [categoriesSearch, setCategoriesSearch] = useState('');
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isRefreshingCategories, setIsRefreshingCategories] = useState(false);
  const [isLoadingMoreCategories, setIsLoadingMoreCategories] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [categoryEditItem, setCategoryEditItem] = useState<InventoryCategoryRecord | null>(null);
  const [categorySubmitError, setCategorySubmitError] = useState<string | null>(null);
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
  const [supplierDrawerOpen, setSupplierDrawerOpen] = useState(false);
  const [supplierEditItem, setSupplierEditItem] = useState<SupplierProfileRecord | null>(null);
  const [supplierSubmitError, setSupplierSubmitError] = useState<string | null>(null);
  const [isSubmittingSupplier, setIsSubmittingSupplier] = useState(false);
  const [supplierLabels, setSupplierLabels] = useState<Record<string, string>>({});
  const [isCatalogSearching, setIsCatalogSearching] = useState(false);
  const [commercialProductOptions, setCommercialProductOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const activeCategoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [categories],
  );

  const takenCategoryCodePrefixes = useMemo(
    () => buildTakenCodePrefixSet(categories),
    [categories],
  );

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );
  const userLabelById = useMemo(() => buildUserLabelMap(tenantUsers), [tenantUsers]);
  const stockKardexInitial = useMemo(() => {
    if (stockSubviewPrefill) {
      return {
        initialSubview: stockSubviewPrefill,
      };
    }

    if (stockKardexPrefill) {
      return {
        initialSubview: 'kardex' as const,
        initialKardexFilters: stockKardexPrefill,
      };
    }

    if (kardexAssetIdFromUrl) {
      return {
        initialSubview: 'kardex' as const,
        initialKardexFilters: { serializedAssetId: kardexAssetIdFromUrl },
      };
    }

    return {};
  }, [kardexAssetIdFromUrl, stockKardexPrefill, stockSubviewPrefill]);

  const navigateToReplenishment = useCallback(() => {
    setStockSubviewPrefill('replenishment');
    setActiveTab('stock');
  }, []);

  // Resumen: reposición desde API dedicada (no materializa catálogo+balances).
  const lowStockItems = useMemo(
    () =>
      replenishmentPreview
        .filter((row) => row.criticality === 'out' || row.criticality === 'below-minimum')
        .slice(0, 6),
    [replenishmentPreview],
  );

  const monitoredAssets = useMemo(
    () =>
      assets
        .filter((asset) =>
          [
            SerializedAssetStatus.IN_REPAIR,
            SerializedAssetStatus.IN_TESTING,
            SerializedAssetStatus.LOST,
          ].includes(asset.currentStatus),
        )
        .slice(0, 6),
    [assets],
  );

  const loadBootstrap = useCallback(async (silent = false) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      const [dashboardResponse, usersResult, previewItems, replenishment, previewAssets] =
        await Promise.all([
          inventoryApi.dashboard(),
          loadTenantUsers()
            .then((users) => ({ users, error: null as string | null }))
            .catch(() => ({
              users: [] as InternalUser[],
              error: 'No fue posible cargar la lista de usuarios.',
            })),
          inventoryApi.listItems({ limit: 6 }),
          inventoryApi
            .listReplenishmentSuggestions()
            .catch(() => [] as ReplenishmentSuggestionRecord[]),
          inventoryApi.listAssets({ limit: INVENTORY_LIST_PAGE_SIZE }),
        ]);

      setSummary(dashboardResponse);
      setItems(previewItems.data);
      setItemsMeta(
        previewItems.meta ?? {
          ...EMPTY_LIST_META,
          nextCursor: null,
          total: previewItems.data.length,
        },
      );
      setReplenishmentPreview(replenishment);
      setAssets(previewAssets.data);
      setTenantUsers(usersResult.users);
      setUsersLoadError(usersResult.error);
    } catch (loadError) {
      setError(mapInventoryError(loadError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  /**
   * ADR-064 matriz: ocupación completa → drenar balances (limit 100, tope 50 págs).
   * Bodegas/productos siguen page++ load-more; balances no van a medias con esas páginas.
   * Ola 6: filtros de ítems (search/belowMinimum) van al servidor.
   */
  const loadStockLists = useCallback(
    async (options?: { appendItems?: boolean; appendLocations?: boolean }) => {
      const appendItems = options?.appendItems === true;
      const appendLocations = options?.appendLocations === true;
      const itemListParams = {
        limit: INVENTORY_LIST_PAGE_SIZE,
        ...(stockProductFilters.search.trim() ? { search: stockProductFilters.search.trim() } : {}),
        ...(stockProductFilters.onlyBelowMinimum ? { belowMinimum: true as const } : {}),
        ...(stockProductFilters.onlyBelowMinimum && stockProductFilters.stockLocationId
          ? { stockLocationId: stockProductFilters.stockLocationId }
          : {}),
      };

      if (appendItems) {
        if (!itemsMeta.nextCursor || isLoadingMoreItems) return;
        setIsLoadingMoreItems(true);
      }
      if (appendLocations) {
        if (!locationsMeta.nextCursor || isLoadingMoreLocations) return;
        setIsLoadingMoreLocations(true);
      }

      try {
        if (appendItems) {
          const itemsCursor = itemsMeta.nextCursor;
          const itemsResponse = await inventoryApi.listItems({
            ...itemListParams,
            ...(itemsCursor ? { cursor: itemsCursor } : {}),
          });
          setItems((prev) => mergeById(prev, itemsResponse.data));
          setItemsMeta(itemsResponse.meta);
          return;
        }

        if (appendLocations) {
          const locationsCursor = locationsMeta.nextCursor;
          const locationsResponse = await inventoryApi.listLocations({
            limit: INVENTORY_LIST_PAGE_SIZE,
            ...locationMatrixFiltersToListParams({
              ...locationListFilters,
              custodyFilter: locationCustodyFilter,
            }),
            ...(locationsCursor ? { cursor: locationsCursor } : {}),
          });
          setLocations((prev) => mergeById(prev, locationsResponse.data));
          setLocationsMeta(locationsResponse.meta);
          return;
        }

        const [itemsResponse, locationsResponse, balancesDrain] = await Promise.all([
          inventoryApi.listItems(itemListParams),
          inventoryApi.listLocations({
            limit: INVENTORY_LIST_PAGE_SIZE,
            ...locationMatrixFiltersToListParams({
              ...locationListFilters,
              custodyFilter: locationCustodyFilter,
            }),
          }),
          drainInventoryBalances((params) => inventoryApi.listBalances(params)),
        ]);
        setItems(itemsResponse.data);
        setItemsMeta(itemsResponse.meta);
        setLocations(locationsResponse.data);
        setLocationsMeta(locationsResponse.meta);
        setBalances(balancesDrain.data);
        setBalancesMeta(balancesDrain.meta);
      } catch (loadError) {
        setError(mapInventoryError(loadError));
      } finally {
        setIsLoadingMoreItems(false);
        setIsLoadingMoreLocations(false);
      }
    },
    [
      isLoadingMoreItems,
      isLoadingMoreLocations,
      itemsMeta.nextCursor,
      locationCustodyFilter,
      locationListFilters,
      locationsMeta.nextCursor,
      stockProductFilters,
    ],
  );

  const loadMoreBalances = useCallback(async () => {
    if (!balancesMeta.nextCursor || isLoadingMoreBalances) {
      return;
    }
    setIsLoadingMoreBalances(true);
    try {
      const drain = await drainInventoryBalances((params) => inventoryApi.listBalances(params), {
        initialCursor: balancesMeta.nextCursor,
      });
      setBalances((prev) => mergeById(prev, drain.data));
      setBalancesMeta(drain.meta);
    } catch (loadError) {
      setError(mapInventoryError(loadError));
    } finally {
      setIsLoadingMoreBalances(false);
    }
  }, [balancesMeta.nextCursor, isLoadingMoreBalances]);

  const loadLocationsTab = useCallback(
    async (append = false) => {
      if (append) {
        if (!locationsMeta.nextCursor || isLoadingMoreLocations) return;
        setIsLoadingMoreLocations(true);
      }

      try {
        const locationsResponse = await inventoryApi.listLocations({
          limit: INVENTORY_LIST_PAGE_SIZE,
          ...locationMatrixFiltersToListParams({
            ...locationListFilters,
            custodyFilter: locationCustodyFilter,
          }),
          ...(append && locationsMeta.nextCursor ? { cursor: locationsMeta.nextCursor } : {}),
        });

        setLocations((prev) =>
          append ? mergeById(prev, locationsResponse.data) : locationsResponse.data,
        );
        setLocationsMeta(locationsResponse.meta);

        if (!append) {
          const balancesDrain = await drainInventoryBalances((params) =>
            inventoryApi.listBalances(params),
          );
          setBalances(balancesDrain.data);
          setBalancesMeta(balancesDrain.meta);
        }
      } catch (loadError) {
        setError(mapInventoryError(loadError));
      } finally {
        setIsLoadingMoreLocations(false);
      }
    },
    [isLoadingMoreLocations, locationCustodyFilter, locationListFilters, locationsMeta.nextCursor],
  );

  const loadIssuesList = useCallback(
    async (append = false) => {
      if (append) {
        if (!issuesMeta.nextCursor || isLoadingMoreIssues) return;
        setIsLoadingMoreIssues(true);
      }

      try {
        const issuesResponse = await inventoryApi.listIssues({
          limit: INVENTORY_LIST_PAGE_SIZE,
          ...(append && issuesMeta.nextCursor ? { cursor: issuesMeta.nextCursor } : {}),
        });

        setIssues((prev) => (append ? mergeById(prev, issuesResponse.data) : issuesResponse.data));
        setIssuesMeta(issuesResponse.meta);
      } catch (loadError) {
        setError(mapInventoryError(loadError));
      } finally {
        setIsLoadingMoreIssues(false);
      }
    },
    [isLoadingMoreIssues, issuesMeta.nextCursor],
  );

  const loadRequestsList = useCallback(
    async (append = false) => {
      if (append) {
        if (!requestsMeta.nextCursor || isLoadingMoreRequests) return;
        setIsLoadingMoreRequests(true);
      }

      try {
        const requestsResponse = await purchasingApi.listRequests({
          limit: INVENTORY_LIST_PAGE_SIZE,
          ...(append && requestsMeta.nextCursor ? { cursor: requestsMeta.nextCursor } : {}),
        });
        setRequests((prev) =>
          append ? mergeById(prev, requestsResponse.data) : requestsResponse.data,
        );
        setRequestsMeta(requestsResponse.meta);
      } catch (loadError) {
        setError(mapInventoryError(loadError));
      } finally {
        setIsLoadingMoreRequests(false);
      }
    },
    [isLoadingMoreRequests, requestsMeta.nextCursor],
  );

  const loadTabData = useCallback(
    async (tab: InventoryTab) => {
      setIsLoadingTabLists(true);
      try {
        switch (tab) {
          case 'stock':
            await loadStockLists();
            break;
          case 'locations':
            await loadLocationsTab(false);
            break;
          case 'assets':
            // Listado self-fetch en AssetsWorkspace (Ola 6 pager).
            break;
          case 'issues':
            // Listado self-fetch en StockIssuesWorkspace (Ola 6 pager).
            break;
          case 'counts':
            // Listado self-fetch en StockCountsWorkspace (Ola 6 pager).
            break;
          case 'purchasing':
            // Listado self-fetch en PurchaseWorkspace (Ola 6 pager).
            break;
          case 'suppliers':
            // Listado self-fetch en SuppliersPanel (Ola 6 pager).
            break;
          case 'writeoffs':
            // Pickers E-4: sin prefetch soft-cap de entidades.
            break;
          default:
            break;
        }
      } finally {
        setIsLoadingTabLists(false);
      }
    },
    [loadLocationsTab, loadStockLists],
  );

  const loadData = useCallback(
    async (silent = false) => {
      await loadBootstrap(silent);
      await loadTabData(activeTab);
    },
    [activeTab, loadBootstrap, loadTabData],
  );

  const loadPendingWriteOffs = useCallback(async () => {
    setIsLoadingPendingWriteOffs(true);
    setPendingWriteOffsError(null);
    try {
      const response = await inventoryApi.writeOffs.list({
        status: WriteOffStatus.PENDING_APPROVAL,
        page: 1,
        limit: INVENTORY_SOFT_CAP_PAGE_SIZE,
      });
      setPendingWriteOffs(response.data);
    } catch (loadError) {
      setPendingWriteOffsError(mapInventoryError(loadError));
      setPendingWriteOffs([]);
    } finally {
      setIsLoadingPendingWriteOffs(false);
    }
  }, []);

  const bumpWriteOffHistory = useCallback(() => {
    setWriteOffHistoryRevision((current) => current + 1);
  }, []);

  const loadWriteOffs = useCallback(async () => {
    await loadPendingWriteOffs();
    bumpWriteOffHistory();
  }, [bumpWriteOffHistory, loadPendingWriteOffs]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    void loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  useEffect(() => {
    if (activeTab === 'stock' || !stockSubviewPrefill) {
      return;
    }

    setStockSubviewPrefill(null);
  }, [activeTab, stockSubviewPrefill]);

  useEffect(() => {
    if (activeTab !== 'writeoffs') {
      return;
    }

    void loadPendingWriteOffs();
  }, [activeTab, loadPendingWriteOffs]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');

    if (!tabFromUrl) {
      if (!initialTab) {
        setActiveTab((current) => (current === 'catalog' ? current : 'catalog'));
      }
      return;
    }

    const nextTab = resolveInventoryTab(tabFromUrl);
    setActiveTab((current) => (current === nextTab ? current : nextTab));
  }, [initialTab, searchParams]);

  useEffect(() => {
    const custodyFromUrl = resolveLocationCustodyFilter(searchParams.get('custody'));
    setLocationCustodyFilter((current) => (current === custodyFromUrl ? current : custodyFromUrl));
  }, [searchParams]);

  useEffect(() => {
    const commercialRefFromUrl = searchParams.get('commercialRef')?.trim();
    if (!commercialRefFromUrl) {
      return;
    }

    setActiveTab('catalog');
    setCatalogSubView('products');
    setCatalogFilters((current) =>
      current.commercialReferenceId === commercialRefFromUrl
        ? current
        : { ...current, commercialReferenceId: commercialRefFromUrl },
    );
  }, [searchParams]);

  useEffect(() => {
    if (!kardexAssetIdFromUrl) {
      return;
    }

    setActiveTab('stock');
  }, [kardexAssetIdFromUrl]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    const custodyFromUrl = searchParams.get('custody');
    if (tabFromUrl !== 'locations' || custodyFromUrl !== 'mobile') {
      return;
    }

    setActiveTab('stock');
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set('tab', 'stock');
    nextSearchParams.set('custody', 'mobile');
    const nextQuery = nextSearchParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const loadCommercialProductOptions = useCallback(async () => {
    try {
      const products = await commercialApi.getAdditionalProducts({
        // Residual E-4: sin lookup commercial embebido en drawer; soft-cap con aviso pendiente.
        limit: PICKER_SOFT_CAP,
        isActive: true,
      });
      setCommercialProductOptions(
        products.data.map((product) => ({ id: product.id, name: product.name })),
      );
    } catch {
      setCommercialProductOptions([]);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'catalog' && !catalogDrawerOpen) {
      return;
    }

    void loadCommercialProductOptions();
  }, [activeTab, catalogDrawerOpen, loadCommercialProductOptions]);

  const openLocationCreateDialog = useCallback(() => {
    setLocationEditItem(null);
    setLocationSubmitError(null);
    setLocationDialogOpen(true);

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set('tab', 'locations');
    nextSearchParams.set('action', 'create');
    const nextQuery = nextSearchParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const closeLocationDialog = useCallback(() => {
    setLocationDialogOpen(false);
    setLocationEditItem(null);
    setLocationSubmitError(null);

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete('action');
    const tabParam = nextSearchParams.get('tab');
    if (tabParam?.includes('/')) {
      nextSearchParams.set('tab', 'locations');
    }
    const nextQuery = nextSearchParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    const actionFromUrl = searchParams.get('action');

    if (shouldOpenLocationCreateFromUrl(tabFromUrl, actionFromUrl)) {
      setLocationEditItem(null);
      setLocationSubmitError(null);
      setLocationDialogOpen(true);
      return;
    }

    if (actionFromUrl === 'create' && resolveInventoryTab(tabFromUrl) !== 'locations') {
      setLocationDialogOpen(false);
    }
  }, [searchParams]);

  const handleLocationCustodyFilterChange = useCallback(
    (nextFilter: LocationMatrixCustodyFilter) => {
      setLocationCustodyFilter(nextFilter);

      const nextSearchParams = new URLSearchParams(searchParams.toString());
      if (nextFilter === 'mobile') {
        nextSearchParams.set('tab', 'stock');
        nextSearchParams.set('custody', 'mobile');
      } else {
        nextSearchParams.delete('custody');
        if (nextSearchParams.get('tab') === 'stock') {
          nextSearchParams.set('tab', 'stock');
        }
      }

      const nextQuery = nextSearchParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handleTabChange = useCallback(
    (value: string) => {
      const nextTab = resolveInventoryTab(value);
      setActiveTab(nextTab);

      const nextSearchParams = new URLSearchParams(searchParams.toString());
      if (nextTab === 'catalog') {
        nextSearchParams.delete('tab');
      } else {
        nextSearchParams.set('tab', nextTab);
      }

      const nextQuery = nextSearchParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const loadSupplierLabels = useCallback(async (supplierIds: string[]) => {
    const uniqueIds = [...new Set(supplierIds.filter(Boolean))];

    if (uniqueIds.length === 0) {
      return;
    }

    const entries = await Promise.all(
      uniqueIds.map(async (partyRefId) => {
        try {
          const summary = await purchasingApi.getProviderSummary(partyRefId);
          return [partyRefId, summary.displayName] as const;
        } catch {
          return [partyRefId, 'Proveedor asignado'] as const;
        }
      }),
    );

    setSupplierLabels((previous) => ({ ...previous, ...Object.fromEntries(entries) }));
  }, []);

  const loadCatalogOptions = useCallback(async (search?: string) => {
    setCatalogOptionsError(null);
    setIsCatalogSearching(Boolean(search?.trim()));

    try {
      const options = await inventoryApi.listCatalogOptions(
        search?.trim() ? { search: search.trim() } : undefined,
      );
      setCatalogOptions(options);
    } catch (loadError) {
      setCatalogOptionsError(mapInventoryError(loadError));
    } finally {
      setIsCatalogSearching(false);
    }
  }, []);

  const handleCatalogSearch = useCallback(
    (search: string) => {
      void loadCatalogOptions(search);
    },
    [loadCatalogOptions],
  );

  const loadCatalogItems = useCallback(
    async (filters: CatalogFilters, options?: { silent?: boolean; append?: boolean }) => {
      const silent = options?.silent === true;
      const append = options?.append === true;

      if (append) {
        if (!catalogMeta.nextCursor || isLoadingMoreCatalog) {
          return;
        }
        setIsLoadingMoreCatalog(true);
      } else if (silent) {
        setIsRefreshingCatalog(true);
      } else {
        setIsLoadingCatalog(true);
      }

      setCatalogError(null);

      try {
        const listParams: ListInventoryItemsParams = {
          limit: INVENTORY_LIST_PAGE_SIZE,
          ...(append && catalogMeta.nextCursor ? { cursor: catalogMeta.nextCursor } : {}),
        };
        const trimmedSearch = filters.search?.trim();
        if (trimmedSearch) {
          listParams.search = trimmedSearch;
        }
        if (filters.categoryId) {
          listParams.categoryId = filters.categoryId;
        }
        if (filters.itemKind) {
          listParams.itemKind = filters.itemKind;
        }
        if (filters.trackingMode) {
          listParams.trackingMode = filters.trackingMode;
        }
        if (filters.status) {
          listParams.status = filters.status;
        }
        if (filters.purchasable !== undefined) {
          listParams.purchasable = filters.purchasable;
        }
        if (filters.commercialReferenceId) {
          listParams.commercialReferenceId = filters.commercialReferenceId;
        }

        const response = await inventoryApi.listItems(listParams);
        const page = response.data ?? [];
        setCatalogItems((prev) => (append ? mergeById(prev, page) : page));
        setCatalogMeta(
          response.meta ?? { ...EMPTY_LIST_META, nextCursor: null, total: page.length },
        );
        await loadSupplierLabels(
          page.map((item) => item.preferredSupplierRefId).filter((id): id is string => Boolean(id)),
        );
      } catch (loadError) {
        setCatalogError(mapInventoryError(loadError));
      } finally {
        setIsLoadingCatalog(false);
        setIsRefreshingCatalog(false);
        setIsLoadingMoreCatalog(false);
      }
    },
    [catalogMeta.nextCursor, isLoadingMoreCatalog, loadSupplierLabels],
  );

  const loadCategories = useCallback(
    async (options?: { silent?: boolean; append?: boolean; search?: string }) => {
      const silent = options?.silent === true;
      const append = options?.append === true;
      const onCategoriesPanel = activeTab === 'catalog' && catalogSubView === 'categories';
      const search = onCategoriesPanel ? (options?.search ?? categoriesSearch) : '';
      // Residual E-4: no hay GET /inventory/categories/search; soft-cap solo para Select de categoría.
      const limit = onCategoriesPanel ? INVENTORY_LIST_PAGE_SIZE : PICKER_SOFT_CAP;

      if (append) {
        if (!categoriesMeta.nextCursor || isLoadingMoreCategories) {
          return;
        }
        setIsLoadingMoreCategories(true);
      } else if (silent) {
        setIsRefreshingCategories(true);
      } else {
        setIsLoadingCategories(true);
      }

      setCategoriesError(null);

      try {
        const response = await inventoryApi.listCategories({
          limit,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(append && categoriesMeta.nextCursor ? { cursor: categoriesMeta.nextCursor } : {}),
        });
        const page = response.data ?? [];
        setCategories((prev) => (append ? mergeById(prev, page) : page));
        setCategoriesMeta(
          response.meta ?? { ...EMPTY_LIST_META, nextCursor: null, total: page.length },
        );
      } catch (loadError) {
        setCategoriesError(mapInventoryError(loadError));
      } finally {
        setIsLoadingCategories(false);
        setIsRefreshingCategories(false);
        setIsLoadingMoreCategories(false);
      }
    },
    [
      activeTab,
      catalogSubView,
      categoriesMeta.nextCursor,
      categoriesSearch,
      isLoadingMoreCategories,
    ],
  );

  useEffect(() => {
    if (activeTab !== 'catalog') {
      return;
    }

    const handle = window.setTimeout(
      () => {
        void loadCatalogItems(catalogFilters);
      },
      catalogFilters.search ? 300 : 0,
    );

    return () => window.clearTimeout(handle);
  }, [activeTab, catalogFilters, loadCatalogItems]);

  useEffect(() => {
    if (activeTab !== 'catalog' && activeTab !== 'counts') {
      return;
    }

    const onCategoriesPanel = activeTab === 'catalog' && catalogSubView === 'categories';
    const handle = window.setTimeout(
      () => {
        void loadCategories({ search: onCategoriesPanel ? categoriesSearch : '' });
      },
      onCategoriesPanel && categoriesSearch.trim() ? 300 : 0,
    );

    return () => window.clearTimeout(handle);
  }, [activeTab, catalogSubView, categoriesSearch, loadCategories]);

  useEffect(() => {
    if (activeTab !== 'stock') {
      return;
    }
    const handle = window.setTimeout(
      () => {
        void loadStockLists();
      },
      stockProductFilters.search.trim() ? 300 : 0,
    );
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtros producto
  }, [stockProductFilters]);

  useEffect(() => {
    if (activeTab !== 'locations' && activeTab !== 'stock') {
      return;
    }
    if (activeTab === 'locations') {
      void loadLocationsTab(false);
    } else {
      void loadStockLists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtros ubicaciones + custody
  }, [locationListFilters, locationCustodyFilter]);

  useEffect(() => {
    if (activeTab !== 'purchasing') {
      return;
    }

    void loadCatalogOptions();
  }, [activeTab, loadCatalogOptions]);

  useEffect(() => {
    if (!createProductOpen || !createCategoryInlineOpen || !createCategoryInlineName.trim()) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const trimmedName = createCategoryInlineName.trim();

      void inventoryApi
        .suggestCategoryPrefix({
          name: trimmedName,
          ...(createCategoryInlinePrefixTouched && createCategoryInlineCodePrefix.trim()
            ? { codePrefix: createCategoryInlineCodePrefix.trim() }
            : {}),
        })
        .then((suggestion) => {
          setCreateCategorySuggestedSortOrder(suggestion.sortOrder);
          if (!createCategoryInlinePrefixTouched) {
            setCreateCategoryInlineCodePrefix(suggestion.codePrefix);
          }
        })
        .catch(() => {
          setCreateCategorySuggestedSortOrder(suggestNextCategorySortOrder(categories));
          if (!createCategoryInlinePrefixTouched) {
            setCreateCategoryInlineCodePrefix(
              suggestCategoryCodePrefix(trimmedName, takenCategoryCodePrefixes),
            );
          }
        });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [
    categories,
    createCategoryInlineCodePrefix,
    createCategoryInlineName,
    createCategoryInlineOpen,
    createCategoryInlinePrefixTouched,
    createProductOpen,
    takenCategoryCodePrefixes,
  ]);

  function resetInlineCategoryState() {
    setCreateCategoryInlineOpen(false);
    setCreateCategoryInlineName('');
    setCreateCategoryInlineCodePrefix('');
    setCreateCategoryInlineDescription('');
    setCreateCategoryInlinePrefixTouched(false);
    setCreateCategoryInlineError(null);
    setCreateCategoryInlineApiError(null);
    setCreateCategorySelectionOverride(null);
    setCreateCategorySuggestedSortOrder(null);
  }

  function openCreateProductDialog() {
    setCatalogFeedback(null);
    setCatalogSubmitError(null);
    resetInlineCategoryState();
    setCreateProductOpen(true);
  }

  function openCatalogDrawer(item: InventoryItemRecord) {
    setCatalogFeedback(null);
    setCatalogSubmitError(null);
    setCatalogEditItem(item);
    setCatalogDrawerOpen(true);
  }

  async function handleCreateCatalogItem(payload: CreateInventoryItemDto) {
    setIsSubmittingCatalogItem(true);
    setCatalogSubmitError(null);
    try {
      await inventoryApi.createItem(payload);
      setCreateProductOpen(false);
      setCatalogFeedback(
        'Producto creado. Ya puedes usarlo en el catálogo y completar su configuración después.',
      );
      resetInlineCategoryState();
      await Promise.all([
        loadData(true),
        loadCatalogItems(catalogFilters, { silent: true }),
        loadCategories({ silent: true }),
      ]);
    } catch (submitError) {
      setCatalogSubmitError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingCatalogItem(false);
    }
  }

  async function handleUpdateCatalogItem(id: string, payload: UpdateInventoryItemDto) {
    setIsSubmittingCatalogItem(true);
    setCatalogSubmitError(null);
    try {
      await inventoryApi.updateItem(id, payload);
      setCatalogDrawerOpen(false);
      setCatalogEditItem(null);
      await Promise.all([
        loadData(true),
        loadCatalogItems(catalogFilters, { silent: true }),
        loadCategories({ silent: true }),
      ]);
      setCatalogFeedback('Producto actualizado.');
    } catch (submitError) {
      setCatalogSubmitError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingCatalogItem(false);
    }
  }

  function handleDeleteCatalogItem(item: InventoryItemRecord) {
    setDeleteConfirmError(null);
    setDeleteConfirmItem(item);
  }

  async function confirmDeleteCatalogItem() {
    if (!deleteConfirmItem) {
      return;
    }

    const item = deleteConfirmItem;
    setDeletingCatalogItemId(item.id);
    setDeleteConfirmError(null);
    try {
      await inventoryApi.deleteItem(item.id);
      if (catalogEditItem?.id === item.id) {
        setCatalogDrawerOpen(false);
        setCatalogEditItem(null);
      }
      setDeleteConfirmItem(null);
      setCatalogFeedback(`Producto "${item.name}" eliminado.`);
      await Promise.all([
        loadData(true),
        loadCatalogItems(catalogFilters, { silent: true }),
        loadCategories({ silent: true }),
        loadCatalogOptions(),
      ]);
    } catch (deleteError) {
      setDeleteConfirmError(mapInventoryError(deleteError));
    } finally {
      setDeletingCatalogItemId(null);
    }
  }

  async function openCatalogItemDetail(item: InventoryItemRecord) {
    setCatalogSubmitError(null);
    try {
      const detail = await inventoryApi.getItem(item.id);
      openCatalogDrawer(detail);
    } catch (detailError) {
      setCatalogError(mapInventoryError(detailError));
    }
  }

  function openCategoryDrawer(category?: InventoryCategoryRecord) {
    setCategorySubmitError(null);
    setCategoryEditItem(category ?? null);
    setCategoryDrawerOpen(true);
  }

  function openSupplierDrawer(supplier?: SupplierProfileRecord) {
    setSupplierSubmitError(null);
    setSupplierEditItem(supplier ?? null);
    setSupplierDrawerOpen(true);
  }

  async function openSupplierDetail(supplier: SupplierProfileRecord) {
    setSupplierSubmitError(null);
    try {
      const detail = await purchasingApi.getSupplier(supplier.partyRefId);
      openSupplierDrawer(detail);
    } catch (detailError) {
      setSupplierSubmitError(mapInventoryError(detailError));
    }
  }

  async function handleCreateSupplier(payload: CreateSupplierDto) {
    setIsSubmittingSupplier(true);
    setSupplierSubmitError(null);
    try {
      await purchasingApi.createSupplier(payload);
      setSupplierDrawerOpen(false);
      setSupplierEditItem(null);
      setMovementNotice('Proveedor registrado.');
      setSuppliersListRevision((value) => value + 1);
    } catch (submitError) {
      setSupplierSubmitError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingSupplier(false);
    }
  }

  async function handleUpdateSupplier(partyRefId: string, payload: UpdateSupplierDto) {
    setIsSubmittingSupplier(true);
    setSupplierSubmitError(null);
    try {
      const updated = await purchasingApi.updateSupplier(partyRefId, payload);
      setSupplierEditItem(updated);
      setMovementNotice('Proveedor actualizado.');
      setSuppliersListRevision((value) => value + 1);
    } catch (submitError) {
      setSupplierSubmitError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingSupplier(false);
    }
  }

  async function handleSetSupplierStatus(partyRefId: string, status: SupplierProfileStatus) {
    setIsSubmittingSupplier(true);
    setSupplierSubmitError(null);
    try {
      const updated = await purchasingApi.setSupplierStatus(partyRefId, { status });
      setSupplierEditItem(updated);
      setMovementNotice('Estado del proveedor actualizado.');
      setSuppliersListRevision((value) => value + 1);
    } catch (submitError) {
      setSupplierSubmitError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingSupplier(false);
    }
  }

  async function handleCreateCategory(payload: CreateInventoryCategoryDto) {
    setIsSubmittingCategory(true);
    setCategorySubmitError(null);
    try {
      await inventoryApi.createCategory(payload);
      setCategoryDrawerOpen(false);
      setCategoryEditItem(null);
      setCatalogFeedback('Categoría creada.');
      await loadCategories({ silent: true });
    } catch (submitError) {
      setCategorySubmitError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingCategory(false);
    }
  }

  async function handleCreateInlineCategory(
    payload: CreateInventoryCategoryDto,
  ): Promise<InventoryCategoryRecord> {
    setCategorySubmitError(null);

    try {
      const createdCategory = await inventoryApi.createCategory(payload);
      await loadCategories({ silent: true });
      return createdCategory;
    } catch (submitError) {
      throw submitError instanceof Error ? submitError : new Error(mapInventoryError(submitError));
    }
  }

  async function handleSubmitInlineCategory() {
    if (!createCategoryInlineName.trim()) {
      setCreateCategoryInlineError('Completa el nombre de la categoría.');
      return;
    }

    const sanitizedPrefix = sanitizeAlnumUpper(createCategoryInlineCodePrefix).slice(0, 3);
    if (sanitizedPrefix && !isValidCategoryCodePrefix(sanitizedPrefix)) {
      setCreateCategoryInlineError(
        'El prefijo de producto debe tener entre 2 y 3 caracteres alfanuméricos en mayúscula.',
      );
      return;
    }

    const { code, codePrefix } = resolveCategoryCreateValues(
      createCategoryInlineName,
      sanitizedPrefix,
      takenCategoryCodePrefixes,
      !sanitizedPrefix,
    );

    if (!isValidCategoryCodePrefix(codePrefix)) {
      setCreateCategoryInlineError(
        'El prefijo de producto debe tener entre 2 y 3 caracteres alfanuméricos en mayúscula.',
      );
      return;
    }

    setCreateCategoryInlineError(null);
    setCreateCategoryInlineApiError(null);
    setIsSubmittingInlineCategory(true);

    try {
      const createdCategory = await handleCreateInlineCategory({
        code,
        codePrefix,
        name: createCategoryInlineName.trim(),
        description: createCategoryInlineDescription.trim() || null,
        status: InventoryCategoryStatus.ACTIVE,
        sortOrder: createCategorySuggestedSortOrder ?? suggestNextCategorySortOrder(categories),
      });
      setCreateCategorySelectionOverride(createdCategory.id);
      setCreateCategoryInlineName('');
      setCreateCategoryInlineCodePrefix('');
      setCreateCategoryInlineDescription('');
      setCreateCategoryInlinePrefixTouched(false);
      setCreateCategoryInlineError(null);
      setCreateCategoryInlineApiError(null);
      setCreateCategoryInlineOpen(false);
      setCreateCategorySuggestedSortOrder(null);
    } catch (submitError) {
      setCreateCategoryInlineApiError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingInlineCategory(false);
    }
  }

  async function handleUpdateCategory(id: string, payload: UpdateInventoryCategoryDto) {
    setIsSubmittingCategory(true);
    setCategorySubmitError(null);
    try {
      await inventoryApi.updateCategory(id, payload);
      setCategoryDrawerOpen(false);
      setCategoryEditItem(null);
      setCatalogFeedback('Categoría actualizada.');
      await Promise.all([
        loadCategories({ silent: true }),
        loadCatalogItems(catalogFilters, { silent: true }),
      ]);
    } catch (submitError) {
      setCategorySubmitError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingCategory(false);
    }
  }

  async function openCategoryDetail(category: InventoryCategoryRecord) {
    setCategorySubmitError(null);
    try {
      const detail = await inventoryApi.getCategory(category.id);
      openCategoryDrawer(detail);
    } catch (detailError) {
      setCategoriesError(mapInventoryError(detailError));
    }
  }

  async function openAssetDetail(assetId: string) {
    setAssetDetailTargetId(assetId);
    setAssetDetailError(null);
    setIsLoadingAsset(true);
    try {
      const asset = await inventoryApi.getAsset(assetId, ASSET_DETAIL_QUERY_DEFAULTS);
      setAssetDetail(asset);
    } catch (detailError) {
      setAssetDetailError(mapInventoryError(detailError));
      setAssetDetail(null);
      setAssetDetailTargetId(null);
    } finally {
      setIsLoadingAsset(false);
    }
  }

  async function loadMoreAssetLifecycle() {
    if (!assetDetail) {
      return;
    }

    setIsLoadingMoreAssetLifecycle(true);
    try {
      const nextPage = assetDetail.lifecycle.page + 1;
      const next = await inventoryApi.getAsset(assetDetail.id, {
        ...ASSET_DETAIL_QUERY_DEFAULTS,
        lifecyclePage: nextPage,
        lifecycleLimit: assetDetail.lifecycle.limit,
        movementsPage: 1,
        movementsLimit: assetDetail.movements.limit,
      });
      setAssetDetail((current) => {
        if (!current || current.id !== next.id) {
          return current;
        }

        return {
          ...next,
          lifecycle: {
            ...next.lifecycle,
            data: [...current.lifecycle.data, ...next.lifecycle.data],
          },
          movements: current.movements,
        };
      });
    } catch (detailError) {
      setAssetDetailError(mapInventoryError(detailError));
    } finally {
      setIsLoadingMoreAssetLifecycle(false);
    }
  }

  async function loadMoreAssetMovements() {
    if (!assetDetail) {
      return;
    }

    setIsLoadingMoreAssetMovements(true);
    try {
      const nextPage = assetDetail.movements.page + 1;
      const next = await inventoryApi.getAsset(assetDetail.id, {
        ...ASSET_DETAIL_QUERY_DEFAULTS,
        lifecyclePage: 1,
        lifecycleLimit: assetDetail.lifecycle.limit,
        movementsPage: nextPage,
        movementsLimit: assetDetail.movements.limit,
      });
      setAssetDetail((current) => {
        if (!current || current.id !== next.id) {
          return current;
        }

        return {
          ...next,
          lifecycle: current.lifecycle,
          movements: {
            ...next.movements,
            data: [...current.movements.data, ...next.movements.data],
          },
        };
      });
    } catch (detailError) {
      setAssetDetailError(mapInventoryError(detailError));
    } finally {
      setIsLoadingMoreAssetMovements(false);
    }
  }

  const handleOpenAssetKardex = useCallback(
    (assetId: string) => {
      setAssetDetail(null);
      setAssetDetailTargetId(null);
      setActiveTab('stock');
      const nextSearchParams = new URLSearchParams(searchParams.toString());
      nextSearchParams.set('tab', 'stock');
      nextSearchParams.set('serializedAssetId', assetId);
      const nextQuery = nextSearchParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  async function handleCreateRequest(payload: CreatePurchaseRequestDto) {
    setIsSubmittingRequest(true);
    setCreateRequestError(null);
    try {
      const request = await purchasingApi.createRequest(payload);
      await loadData(true);
      return { ok: true as const, requestId: request.id };
    } catch (submitError) {
      setCreateRequestError(mapInventoryError(submitError));
      return { ok: false as const };
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  async function handleAddQuote(requestId: string, payload: AddSupplierQuoteDto) {
    setIsSubmittingQuote(true);
    setQuoteError(null);
    try {
      const quote = await purchasingApi.addQuote(requestId, payload);
      setLatestQuoteAmount(quote.amount);
      await loadData(true);
    } catch (submitError) {
      setQuoteError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingQuote(false);
    }
  }

  async function handleApproveRequest(
    requestId: string,
    payload?: { exceptionReason?: string; notes?: string },
  ) {
    setIsSubmittingApprove(true);
    setApproveError(null);
    try {
      await purchasingApi.approveRequest(requestId, {
        notes: payload?.notes?.trim() || 'Aprobada desde el workspace de compras del portal.',
        exceptionReason: payload?.exceptionReason ?? null,
      });
      await loadData(true);
    } catch (submitError) {
      setApproveError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingApprove(false);
    }
  }

  async function handleCreateAwards(requestId: string, payload: CreatePurchaseRequestAwardsDto) {
    setIsSubmittingAwards(true);
    setAwardsError(null);
    try {
      await purchasingApi.createAwards(requestId, payload);
      await loadData(true);
    } catch (submitError) {
      setAwardsError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingAwards(false);
    }
  }

  async function handleRejectRequest(requestId: string, payload: RejectPurchaseRequestDto) {
    setIsSubmittingReject(true);
    setRejectError(null);
    try {
      await purchasingApi.rejectRequest(requestId, payload);
      await loadData(true);
    } catch (submitError) {
      setRejectError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingReject(false);
    }
  }

  async function handleCancelRequest(requestId: string, payload: CancelPurchaseRequestDto) {
    setIsSubmittingCancel(true);
    setCancelError(null);
    try {
      await purchasingApi.cancelRequest(requestId, payload);
      await loadData(true);
    } catch (submitError) {
      setCancelError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingCancel(false);
    }
  }

  async function handleUpdateRequest(requestId: string, payload: UpdatePurchaseRequestDto) {
    setIsSubmittingUpdateRequest(true);
    setUpdateRequestError(null);
    try {
      await purchasingApi.updateRequest(requestId, payload);
      await loadData(true);
    } catch (submitError) {
      setUpdateRequestError(mapInventoryError(submitError));
      throw submitError;
    } finally {
      setIsSubmittingUpdateRequest(false);
    }
  }

  async function handleApproveOrder(orderId: string) {
    setIsSubmittingApproveOrder(true);
    setApproveOrderError(null);
    try {
      await purchasingApi.approveOrder(orderId);
      await loadData(true);
    } catch (submitError) {
      setApproveOrderError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingApproveOrder(false);
    }
  }

  async function handleCancelOrder(orderId: string, payload: CancelPurchaseOrderDto) {
    setIsSubmittingCancelOrder(true);
    setCancelOrderError(null);
    try {
      await purchasingApi.cancelOrder(orderId, payload);
      await loadData(true);
    } catch (submitError) {
      setCancelOrderError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingCancelOrder(false);
    }
  }

  async function handleCloseOrder(orderId: string) {
    setIsSubmittingCloseOrder(true);
    setCloseOrderError(null);
    try {
      await purchasingApi.closeOrder(orderId);
      await loadData(true);
    } catch (submitError) {
      setCloseOrderError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingCloseOrder(false);
    }
  }

  const loadOrderDetail = useCallback(async (orderId: string) => {
    try {
      const detail = await purchasingApi.getOrder(orderId);
      setLatestOrder(detail);
      setLatestOrderLines(detail.lines);
    } catch {
      setLatestOrder(null);
      setLatestOrderLines([]);
    }
  }, []);

  const loadOrderDetailForRequest = useCallback(
    async (requestId: string) => {
      try {
        const ordersResponse = await purchasingApi.listOrders({
          purchaseRequestId: requestId,
          page: 1,
          limit: 100,
        });
        const orders = ordersResponse.data;
        const receivable =
          orders.find((order) =>
            [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED].includes(
              order.status,
            ),
          ) ?? orders[0];

        if (!receivable) {
          setLatestOrder(null);
          setLatestOrderLines([]);
          return;
        }

        await loadOrderDetail(receivable.id);
      } catch {
        setLatestOrder(null);
        setLatestOrderLines([]);
      }
    },
    [loadOrderDetail],
  );

  async function handleCreateOrder(payload: CreatePurchaseOrderDto) {
    setIsSubmittingOrder(true);
    setOrderError(null);
    try {
      const result = await purchasingApi.createOrder(payload);
      const createdOrders =
        'orders' in result && Array.isArray(result.orders)
          ? result.orders
          : 'id' in result
            ? [result]
            : [];

      const primaryOrder =
        createdOrders.find((order) =>
          [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED].includes(
            order.status,
          ),
        ) ??
        createdOrders[0] ??
        null;

      if (primaryOrder) {
        await loadOrderDetail(primaryOrder.id);
      } else {
        setLatestOrder(null);
        setLatestOrderLines([]);
      }
      await loadData(true);
    } catch (submitError) {
      setOrderError(mapInventoryError(submitError));
      throw submitError;
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  async function handleReceiveOrder(purchaseOrderId: string, payload: ReceivePurchaseOrderDto) {
    setIsSubmittingReceipt(true);
    setReceiptError(null);
    try {
      const receipt = await purchasingApi.receiveOrder(purchaseOrderId, payload);
      setLatestReceipt(receipt);
      const detail = await purchasingApi.getOrder(purchaseOrderId);
      setLatestOrder(detail);
      setLatestOrderLines(detail.lines);
      await loadData(true);
    } catch (submitError) {
      setReceiptError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingReceipt(false);
    }
  }

  async function handleCounterPurchase(payload: CreateCounterPurchaseDto) {
    setIsSubmittingCounterPurchase(true);
    setCounterPurchaseError(null);
    try {
      const result = await inventoryApi.createCounterPurchase(payload);
      setLatestCounterPurchase(result);
      await loadData(true);
    } catch (submitError) {
      setCounterPurchaseError(mapInventoryError(submitError));
      throw submitError instanceof Error ? submitError : new Error(mapInventoryError(submitError));
    } finally {
      setIsSubmittingCounterPurchase(false);
    }
  }

  async function handleCreateIssue(payload: CreateStockIssueDto) {
    setMovementNotice(null);
    setError(null);
    try {
      await inventoryApi.createIssue(payload);
      setMovementNotice('Salida creada. Puedes despacharla cuando esté lista.');
      setIssuesListRevision((value) => value + 1);
      await loadData(true);
    } catch (submitError) {
      setError(mapInventoryError(submitError));
      throw submitError instanceof Error ? submitError : new Error(mapInventoryError(submitError));
    }
  }

  async function handleDispatchIssue(issueId: string, payload: DispatchStockIssueDto) {
    setMovementNotice(null);
    setError(null);
    try {
      const result = await inventoryApi.dispatchIssue(issueId, payload);
      setMovementNotice('Salida despachada y registrada en el historial.');
      await loadData(true);
    } catch (submitError) {
      setError(mapInventoryError(submitError));
      throw submitError instanceof Error ? submitError : new Error(mapInventoryError(submitError));
    }
  }

  async function handleOpenIssueDetail(issueId: string): Promise<StockIssueDetailRecord> {
    return inventoryApi.getIssue(issueId);
  }

  async function handleUpdateIssue(issueId: string, payload: UpdateStockIssueDto) {
    setMovementNotice(null);
    setError(null);
    try {
      await inventoryApi.updateIssue(issueId, payload);
      setMovementNotice('Salida actualizada.');
      await loadData(true);
    } catch (submitError) {
      setError(mapInventoryError(submitError));
      throw submitError instanceof Error ? submitError : new Error(mapInventoryError(submitError));
    }
  }

  async function handleCancelIssue(issueId: string) {
    setMovementNotice(null);
    setError(null);
    try {
      await inventoryApi.cancelIssue(issueId);
      setMovementNotice('Salida cancelada.');
      await loadData(true);
    } catch (submitError) {
      setError(mapInventoryError(submitError));
      throw submitError instanceof Error ? submitError : new Error(mapInventoryError(submitError));
    }
  }

  async function handleCreateCount(payload: CreateStockCountDto): Promise<StockCountDetailRecord> {
    setMovementNotice(null);
    setError(null);
    try {
      const created = await inventoryApi.createCount(payload);
      setMovementNotice(`Conteo ${created.countNumber} creado.`);
      await loadData(true);
      return created;
    } catch (submitError) {
      setError(mapInventoryError(submitError));
      throw submitError instanceof Error ? submitError : new Error(mapInventoryError(submitError));
    }
  }

  async function handleUpdateCount(
    countId: string,
    payload: UpdateStockCountDto,
  ): Promise<StockCountDetailRecord> {
    setError(null);
    try {
      return await inventoryApi.updateCount(countId, payload);
    } catch (submitError) {
      setError(mapInventoryError(submitError));
      throw submitError instanceof Error ? submitError : new Error(mapInventoryError(submitError));
    }
  }

  async function handleCloseCount(countId: string) {
    setMovementNotice(null);
    setError(null);
    try {
      await inventoryApi.closeCount(countId);
      setMovementNotice('Conteo cerrado y ajuste aplicado al inventario.');
      await loadData(true);
    } catch (submitError) {
      setError(mapInventoryError(submitError));
      throw submitError instanceof Error ? submitError : new Error(mapInventoryError(submitError));
    }
  }

  async function handleCancelCount(countId: string) {
    setMovementNotice(null);
    setError(null);
    try {
      await inventoryApi.cancelCount(countId);
      setMovementNotice('Conteo cancelado.');
      await loadData(true);
    } catch (submitError) {
      setError(mapInventoryError(submitError));
      throw submitError instanceof Error ? submitError : new Error(mapInventoryError(submitError));
    }
  }

  async function handleOpenCountDetail(countId: string): Promise<StockCountDetailRecord> {
    return inventoryApi.getCount(countId);
  }

  async function handleCreateLocation(payload: CreateStockLocationDto) {
    setIsSubmittingLocation(true);
    setLocationSubmitError(null);
    try {
      await inventoryApi.createLocation(payload);
      closeLocationDialog();
      await loadData(true);
    } catch (submitError) {
      setLocationSubmitError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingLocation(false);
    }
  }

  async function handleUpdateLocation(id: string, payload: UpdateStockLocationDto) {
    setIsSubmittingLocation(true);
    setLocationSubmitError(null);
    try {
      await inventoryApi.updateLocation(id, payload);
      closeLocationDialog();
      await loadData(true);
    } catch (submitError) {
      setLocationSubmitError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingLocation(false);
    }
  }

  async function handleSale() {
    setIsSubmittingMovement(true);
    setMovementError(null);
    try {
      const result = await inventoryApi.sale({
        itemId: saleForm.itemId,
        locationId: saleForm.locationId,
        quantity: Number(saleForm.quantity || '0'),
        commercialRefId: saleForm.commercialRefId,
        serialNumber: saleForm.serialNumber.trim() || null,
        notes: saleForm.notes.trim() || null,
      });
      setMovementNotice(
        `Venta registrada. Número de movimiento: ${result.movement.movementNumber}.`,
      );
      setSaleForm({
        itemId: '',
        locationId: '',
        quantity: '1',
        commercialRefId: '',
        serialNumber: '',
        notes: '',
      });
      await loadData(true);
    } catch (submitError) {
      setMovementError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingMovement(false);
    }
  }

  async function handleReturn() {
    setIsSubmittingMovement(true);
    setMovementError(null);
    try {
      const result = await inventoryApi.registerReturn({
        itemId: returnForm.itemId,
        sourceLocationId: returnForm.sourceLocationId,
        destinationLocationId: returnForm.destinationLocationId,
        quantity: Number(returnForm.quantity || '0'),
        serialNumber: returnForm.serialNumber.trim() || null,
        targetStatus: returnForm.targetStatus,
        notes: returnForm.notes.trim() || null,
      });
      setMovementNotice(
        `Devolución registrada. Número de movimiento: ${result.movement.movementNumber}.`,
      );
      setReturnForm({
        itemId: '',
        sourceLocationId: '',
        destinationLocationId: '',
        quantity: '1',
        serialNumber: '',
        targetStatus: SerializedAssetStatus.IN_TRANSIT,
        notes: '',
      });
      await loadData(true);
    } catch (submitError) {
      setMovementError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingMovement(false);
    }
  }

  async function handleWriteOff() {
    setIsSubmittingWriteOff(true);
    setWriteOffError(null);
    setWriteOffSuccess(null);
    try {
      await inventoryApi.writeOff({
        itemId: writeOffForm.itemId || null,
        serializedAssetId: writeOffForm.serializedAssetId || null,
        locationId: writeOffForm.locationId || null,
        quantity: Number(writeOffForm.quantity || '0'),
        reason: writeOffForm.reason,
        notes: writeOffForm.notes.trim() || null,
      });
      setWriteOffSuccess('Solicitud registrada — pendiente de aprobación');
      setWriteOffForm({
        itemId: '',
        serializedAssetId: '',
        locationId: '',
        quantity: '1',
        reason: WriteOffReason.DAMAGED,
        notes: '',
      });
      await loadWriteOffs();
    } catch (submitError) {
      setWriteOffError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingWriteOff(false);
    }
  }

  async function handleApproveWriteOff(writeOffId: string) {
    setProcessingWriteOffId(writeOffId);
    setWriteOffActionError(null);
    try {
      const result = await inventoryApi.writeOffs.approve(writeOffId);
      setMovementNotice(
        result.movementNumber
          ? `Baja aprobada. Número de movimiento: ${result.movementNumber}.`
          : 'Baja aprobada y aplicada al inventario.',
      );
      await Promise.all([loadWriteOffs(), loadData(true)]);
    } catch (submitError) {
      setWriteOffActionError(mapInventoryError(submitError));
    } finally {
      setProcessingWriteOffId(null);
    }
  }

  async function handleRejectWriteOff(writeOffId: string, rejectionNotes?: string | null) {
    setProcessingWriteOffId(writeOffId);
    setWriteOffActionError(null);
    try {
      await inventoryApi.writeOffs.reject(writeOffId, {
        rejectionNotes: rejectionNotes ?? null,
      });
      setMovementNotice('Solicitud de baja rechazada.');
      await loadWriteOffs();
    } catch (submitError) {
      setWriteOffActionError(mapInventoryError(submitError));
    } finally {
      setProcessingWriteOffId(null);
    }
  }

  const handleOpenWriteOffMovement = useCallback(
    async (stockMovementId: string) => {
      try {
        const movement = await inventoryApi.getMovement(stockMovementId);
        setStockKardexPrefill({
          search: movement.movementNumber,
          origin: StockMovementOrigin.WRITE_OFF,
        });
        setActiveTab('stock');
        const nextSearchParams = new URLSearchParams(searchParams.toString());
        nextSearchParams.set('tab', 'stock');
        const nextQuery = nextSearchParams.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
      } catch (submitError) {
        setWriteOffActionError(mapInventoryError(submitError));
      }
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario"
        subtitle="Compras, bodegas, activos y movimientos en un solo lugar."
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadData(true)}
            loading={isRefreshing}
          >
            Actualizar
          </Button>
        }
      />

      {error && (
        <PortalAlert variant="error" title="No fue posible cargar Inventario" description={error} />
      )}
      {movementNotice && (
        <PortalAlert variant="success" title="Operación registrada" description={movementNotice} />
      )}
      {assetDetailError && (
        <PortalAlert
          variant="warning"
          title="No fue posible abrir el activo"
          description={assetDetailError}
        />
      )}

      {!isLoading && summary && (
        <div className="space-y-6 mb-6">
          <InventoryDashboard summary={summary} isLoading={isLoading} />

          <div className="grid gap-6 xl:grid-cols-2">
            <PortalPanel
              eyebrow="Abastecimiento"
              title="Productos bajo mínimo"
              description={`Productos cuyo disponible ya llegó al mínimo definido para reponer. ${STOCK_RESERVED_HELP_TEXT}`}
              actions={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={navigateToReplenishment}
                  data-testid="summary-replenishment-cta"
                >
                  Ver reposición
                </Button>
              }
            >
              {lowStockItems.length === 0 ? (
                <PortalEmptyState
                  title="Sin alertas de reposición"
                  description="El material disponible está por encima del mínimo definido."
                />
              ) : (
                <div className="space-y-3">
                  {lowStockItems.map((row) => (
                    <div
                      key={row.itemId}
                      className="rounded-xl border border-gray-100 px-3 py-3 dark:border-dark-border"
                    >
                      <p className="font-medium text-gray-900 dark:text-white">{row.itemName}</p>
                      <p className="mt-1 text-sm tabular-nums text-gray-500 dark:text-gray-400">
                        {row.itemSku} · {STOCK_AVAILABLE_LABEL.toLowerCase()}{' '}
                        {formatInventoryQuantity(row.available)} · mínimo{' '}
                        {formatInventoryQuantity(row.minimumStock)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </PortalPanel>

            <PortalPanel
              eyebrow="Riesgos"
              title="Activos a vigilar"
              description="Seriales en prueba, reparación o pérdida que requieren seguimiento inmediato."
            >
              {monitoredAssets.length === 0 ? (
                <PortalEmptyState
                  title="Sin activos críticos"
                  description="No hay activos en estados que demanden seguimiento inmediato."
                />
              ) : (
                <div className="space-y-3">
                  {monitoredAssets.slice(0, 6).map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      className={cn(
                        'w-full rounded-xl border border-gray-100 px-3 py-3 text-left transition hover:border-iwana-primary/40 dark:border-dark-border',
                        interactiveFocusClassName,
                      )}
                      onClick={() => void openAssetDetail(asset.id)}
                    >
                      <p className="font-medium text-gray-900 dark:text-white">
                        {asset.serialNumber ?? asset.assetTag ?? 'Sin código'}
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {getSerializedAssetStatusLabel(asset.currentStatus)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </PortalPanel>
          </div>

          <InventoryCatalogSummaryPreview
            items={items}
            totalCount={itemsMeta.total}
            isLoading={isLoading}
            onOpenCatalog={() => setActiveTab('catalog')}
          />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList aria-label="Secciones de inventario" className={portalModuleTabsShellClassName}>
          <div className={portalModuleTabsGroupClassName}>
            <p className="portal-eyebrow px-1" id="inventory-tabs-operation-label">
              Operación
            </p>
            <div
              role="group"
              aria-labelledby="inventory-tabs-operation-label"
              className={portalModuleTabsTrackClassName}
            >
              <TabsTrigger value="catalog" className={portalModuleTabTriggerClassName}>
                Catálogo
              </TabsTrigger>
              <TabsTrigger value="stock" className={portalModuleTabTriggerClassName}>
                Existencias
              </TabsTrigger>
              <TabsTrigger value="purchasing" className={portalModuleTabTriggerClassName}>
                Compras
              </TabsTrigger>
              <TabsTrigger value="suppliers" className={portalModuleTabTriggerClassName}>
                Proveedores
              </TabsTrigger>
              <TabsTrigger value="locations" className={portalModuleTabTriggerClassName}>
                Bodegas
              </TabsTrigger>
              <TabsTrigger value="issues" className={portalModuleTabTriggerClassName}>
                Salidas
              </TabsTrigger>
              <TabsTrigger value="counts" className={portalModuleTabTriggerClassName}>
                Conteos
              </TabsTrigger>
            </div>
          </div>
          <div role="separator" aria-hidden="true" className={portalModuleTabsDividerClassName} />
          <div className={portalModuleTabsGroupClassName}>
            <p className="portal-eyebrow-muted px-1" id="inventory-tabs-traceability-label">
              Seguimiento
            </p>
            <div
              role="group"
              aria-labelledby="inventory-tabs-traceability-label"
              className={portalModuleTabsTrackClassName}
            >
              <TabsTrigger value="assets" className={portalModuleTabTriggerClassName}>
                Activos
              </TabsTrigger>
              <TabsTrigger value="movements" className={portalModuleTabTriggerClassName}>
                Movimientos
              </TabsTrigger>
              <TabsTrigger value="writeoffs" className={portalModuleTabTriggerClassName}>
                Bajas
              </TabsTrigger>
            </div>
          </div>
        </TabsList>

        <TabsContent value="catalog" className="space-y-6">
          {catalogFeedback ? (
            <PortalAlert
              variant="success"
              title="Catálogo actualizado"
              description={catalogFeedback}
            />
          ) : null}

          <PortalPanel
            eyebrow="Catálogo"
            title={
              catalogSubView === 'products' ? 'Catálogo de productos' : 'Categorías del catálogo'
            }
            description={
              catalogSubView === 'products'
                ? 'Consulta, filtra y administra productos para compras e inventario. Maestro operativo: SKU, stock y trazabilidad.'
                : 'Administra las categorías usadas por los productos del catálogo.'
            }
            actions={
              catalogSubView === 'products' ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={isRefreshingCatalog}
                    onClick={() => void loadCatalogItems(catalogFilters, { silent: true })}
                  >
                    Actualizar
                  </Button>
                  <Button type="button" variant="primary" onClick={openCreateProductDialog}>
                    Nuevo producto
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={isRefreshingCategories}
                    onClick={() => void loadCategories({ silent: true })}
                  >
                    Actualizar
                  </Button>
                  <Button type="button" variant="primary" onClick={() => openCategoryDrawer()}>
                    Nueva categoría
                  </Button>
                </div>
              )
            }
            contentClassName="space-y-4"
          >
            <Tabs
              value={catalogSubView}
              onValueChange={(value) => setCatalogSubView(value as CatalogSubView)}
            >
              <TabsList
                aria-label="Vista del catálogo"
                className="flex h-auto w-full max-w-md justify-start border-0 bg-transparent p-0 shadow-none"
              >
                <div className={cn(portalModuleTabsTrackClassName, 'w-full')}>
                  <TabsTrigger value="products" className={portalModuleTabTriggerClassName}>
                    Productos
                  </TabsTrigger>
                  <TabsTrigger value="categories" className={portalModuleTabTriggerClassName}>
                    Categorías
                  </TabsTrigger>
                </div>
              </TabsList>

              <TabsContent value="products" className="mt-4">
                {catalogError ? (
                  <PortalAlert
                    variant="error"
                    title="No fue posible cargar el catálogo"
                    description={catalogError}
                  />
                ) : null}

                <InventoryCatalogProductsPanel
                  filters={catalogFilters}
                  items={catalogItems}
                  totalCount={catalogMeta.total}
                  hasMore={inventoryHasMore(catalogMeta)}
                  isLoadingMore={isLoadingMoreCatalog}
                  onLoadMore={() => void loadCatalogItems(catalogFilters, { append: true })}
                  categoryOptions={activeCategoryOptions}
                  supplierLabels={supplierLabels}
                  isLoading={isLoadingCatalog}
                  isRefreshing={isRefreshingCatalog}
                  onFiltersChange={setCatalogFilters}
                  onClearFilters={() => setCatalogFilters(EMPTY_CATALOG_FILTERS)}
                  onCreateProduct={openCreateProductDialog}
                  onRowClick={(item) => void openCatalogItemDetail(item)}
                  onDelete={handleDeleteCatalogItem}
                  deletingItemId={deletingCatalogItemId}
                  createAction={
                    <Button type="button" variant="primary" onClick={openCreateProductDialog}>
                      Nuevo producto
                    </Button>
                  }
                />
              </TabsContent>

              <TabsContent value="categories" className="mt-4">
                {categoriesError ? (
                  <PortalAlert
                    variant="error"
                    title="No fue posible cargar las categorías"
                    description={categoriesError}
                  />
                ) : null}

                <InventoryCatalogCategoriesPanel
                  categories={categories}
                  totalCount={categoriesMeta.total}
                  hasMore={inventoryHasMore(categoriesMeta)}
                  isLoadingMore={isLoadingMoreCategories}
                  onLoadMore={() => void loadCategories({ append: true })}
                  search={categoriesSearch}
                  onSearchChange={setCategoriesSearch}
                  isLoading={isLoadingCategories}
                  isRefreshing={isRefreshingCategories}
                  onCreateCategory={() => openCategoryDrawer()}
                  onRowClick={(category) => void openCategoryDetail(category)}
                  createAction={
                    <Button type="button" variant="primary" onClick={() => openCategoryDrawer()}>
                      Nueva categoría
                    </Button>
                  }
                />
              </TabsContent>
            </Tabs>
          </PortalPanel>
        </TabsContent>

        <TabsContent value="purchasing" className="space-y-6">
          {catalogOptionsError ? (
            <PortalAlert
              variant="error"
              title="No fue posible cargar el catálogo de compras"
              description={catalogOptionsError}
            />
          ) : null}
          <PurchaseWorkspace
            items={items}
            catalogOptions={catalogOptions}
            supplierLabels={supplierLabels}
            isCatalogSearching={isCatalogSearching}
            locations={locations}
            latestOrder={latestOrder}
            latestOrderLines={latestOrderLines}
            latestReceipt={latestReceipt}
            listRevision={purchaseListRevision}
            isSubmittingRequest={isSubmittingRequest}
            isSubmittingQuote={isSubmittingQuote}
            isSubmittingApprove={isSubmittingApprove}
            isSubmittingAwards={isSubmittingAwards}
            isSubmittingReject={isSubmittingReject}
            isSubmittingCancel={isSubmittingCancel}
            isSubmittingOrder={isSubmittingOrder}
            isSubmittingReceipt={isSubmittingReceipt}
            isSubmittingUpdateRequest={isSubmittingUpdateRequest}
            isSubmittingApproveOrder={isSubmittingApproveOrder}
            isSubmittingCancelOrder={isSubmittingCancelOrder}
            isSubmittingCloseOrder={isSubmittingCloseOrder}
            createError={createRequestError}
            quoteError={quoteError}
            approveError={approveError}
            awardsError={awardsError}
            rejectError={rejectError}
            cancelError={cancelError}
            orderError={orderError}
            receiptError={receiptError}
            updateRequestError={updateRequestError}
            approveOrderError={approveOrderError}
            cancelOrderError={cancelOrderError}
            closeOrderError={closeOrderError}
            counterPurchaseError={counterPurchaseError}
            latestCounterPurchase={latestCounterPurchase}
            isSubmittingCounterPurchase={isSubmittingCounterPurchase}
            onCreateRequest={handleCreateRequest}
            onAddQuote={handleAddQuote}
            onApproveRequest={handleApproveRequest}
            onCreateAwards={handleCreateAwards}
            onRejectRequest={handleRejectRequest}
            onCancelRequest={handleCancelRequest}
            onUpdateRequest={handleUpdateRequest}
            onCreateOrder={handleCreateOrder}
            onReceiveOrder={handleReceiveOrder}
            onApproveOrder={handleApproveOrder}
            onCancelOrder={handleCancelOrder}
            onCloseOrder={handleCloseOrder}
            onCounterPurchase={handleCounterPurchase}
            onDismissCounterPurchaseSuccess={() => {
              setLatestCounterPurchase(null);
              setCounterPurchaseError(null);
            }}
            onPrepareOrderDrawer={loadOrderDetailForRequest}
            onSelectOrder={loadOrderDetail}
            onRefresh={async () => {
              setPurchaseListRevision((value) => value + 1);
              await loadData(true);
            }}
            onCatalogSearch={handleCatalogSearch}
            createInitialValues={pendingComposerPrefill}
            onCreateInitialValuesConsumed={() => setPendingComposerPrefill(null)}
          />
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-6">
          <PortalPanel
            eyebrow="Abastecimiento"
            title="Proveedores"
            description="Administra la ficha comercial de los proveedores vinculados a compras."
            actions={
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSuppliersListRevision((value) => value + 1)}
                >
                  Actualizar
                </Button>
                <Button type="button" variant="primary" onClick={() => openSupplierDrawer()}>
                  Nuevo proveedor
                </Button>
              </div>
            }
            contentClassName="space-y-4"
          >
            <SuppliersPanel
              listRevision={suppliersListRevision}
              onCreate={() => openSupplierDrawer()}
              onRowClick={(supplier) => void openSupplierDetail(supplier)}
              createAction={
                <Button type="button" variant="primary" onClick={() => openSupplierDrawer()}>
                  Nuevo proveedor
                </Button>
              }
            />
          </PortalPanel>
        </TabsContent>

        <TabsContent value="stock" className="space-y-6">
          <PortalPanel
            eyebrow="Operación"
            title="Existencias"
            description="Consulta saldos por producto o bodega y audita el kardex de movimientos."
            contentClassName="space-y-4"
          >
            <StockWorkspace
              items={items}
              balances={balances}
              locations={locations}
              userLabelById={userLabelById}
              custodyFilter={locationCustodyFilter}
              canAdjust={canAdjustStock}
              itemsTotal={itemsMeta.total}
              itemsHasMore={inventoryHasMore(itemsMeta)}
              locationsTotal={locationsMeta.total}
              locationsHasMore={inventoryHasMore(locationsMeta)}
              isLoadingMoreItems={isLoadingMoreItems}
              isLoadingMoreLocations={isLoadingMoreLocations}
              onLoadMoreItems={() => void loadStockLists({ appendItems: true })}
              onLoadMoreLocations={() => void loadStockLists({ appendLocations: true })}
              balancesHasMore={inventoryHasMore(balancesMeta)}
              isLoadingMoreBalances={isLoadingMoreBalances}
              onLoadMoreBalances={() => void loadMoreBalances()}
              productFilters={stockProductFilters}
              onProductFiltersChange={setStockProductFilters}
              locationListFilters={locationListFilters}
              onLocationListFiltersChange={setLocationListFilters}
              {...stockKardexInitial}
              onCustodyFilterChange={handleLocationCustodyFilterChange}
              onAdjustmentRegistered={(movementNumber) => {
                setMovementNotice(`Ajuste registrado: ${movementNumber}`);
                void loadData(true);
              }}
              onGeneratePurchaseRequest={(values) => {
                setPendingComposerPrefill(values);
                handleTabChange('purchasing');
              }}
            />
          </PortalPanel>
        </TabsContent>

        <TabsContent value="locations" className="space-y-6">
          <PortalPanel
            eyebrow="Red logística"
            title="Bodegas"
            description="Administra bodegas, capacidad y responsables. Las existencias viven en la pestaña Existencias."
            actions={
              <Button type="button" variant="secondary" onClick={() => setActiveTab('stock')}>
                Ir a existencias
              </Button>
            }
            contentClassName="space-y-4"
          >
            <StockLocationsPanel
              locations={locations}
              balances={balances}
              userLabelById={userLabelById}
              totalCount={locationsMeta.total}
              hasMore={inventoryHasMore(locationsMeta)}
              isLoadingMore={isLoadingMoreLocations}
              onLoadMore={() => void loadLocationsTab(true)}
              balancesHasMore={inventoryHasMore(balancesMeta)}
              isLoadingMoreBalances={isLoadingMoreBalances}
              onLoadMoreBalances={() => void loadMoreBalances()}
              onCreateLocation={openLocationCreateDialog}
              onEditLocation={(location) => {
                setLocationEditItem(location);
                setLocationSubmitError(null);
                setLocationDialogOpen(true);
              }}
            />
          </PortalPanel>
        </TabsContent>

        <TabsContent value="issues" className="space-y-6">
          <StockIssuesWorkspace
            error={error}
            listRevision={issuesListRevision}
            onCreate={handleCreateIssue}
            onUpdate={handleUpdateIssue}
            onCancel={handleCancelIssue}
            onDispatch={handleDispatchIssue}
            onOpenDetail={handleOpenIssueDetail}
            onRefresh={async () => {
              setIssuesListRevision((value) => value + 1);
              await loadData(true);
            }}
          />
        </TabsContent>

        <TabsContent value="counts" className="space-y-6">
          <StockCountsWorkspace
            locations={locations}
            categories={categories}
            canClose={canAdjustStock}
            listRevision={countsListRevision}
            error={error}
            onCreate={handleCreateCount}
            onUpdate={handleUpdateCount}
            onClose={handleCloseCount}
            onCancel={handleCancelCount}
            onOpenDetail={handleOpenCountDetail}
            onRefresh={async () => {
              setCountsListRevision((value) => value + 1);
              await loadData(true);
            }}
          />
        </TabsContent>

        <TabsContent value="assets" className="space-y-6">
          <AssetsWorkspace
            items={items}
            locations={locations}
            enrichmentAssets={assets}
            listRevision={assetsListRevision}
            initialSubview={assetsSubview}
            onSubviewChange={setAssetsSubview}
            onOpenAssetDetail={(assetId) => void openAssetDetail(assetId)}
            onNavigateToReplenishment={navigateToReplenishment}
          />
        </TabsContent>

        <TabsContent value="movements" className="space-y-6">
          <MovementsWorkspace
            saleForm={saleForm}
            onSaleFormChange={setSaleForm}
            returnForm={returnForm}
            onReturnFormChange={setReturnForm}
            isSubmittingMovement={isSubmittingMovement}
            movementError={movementError}
            onSale={() => void handleSale()}
            onReturn={() => void handleReturn()}
          />
        </TabsContent>

        <TabsContent value="writeoffs" className="space-y-6">
          <WriteOffsPanel
            pending={pendingWriteOffs}
            requestForm={writeOffForm}
            onRequestFormChange={setWriteOffForm}
            isSubmittingRequest={isSubmittingWriteOff}
            requestError={writeOffError}
            requestSuccess={writeOffSuccess}
            onSubmitRequest={() => void handleWriteOff()}
            userLabelById={userLabelById}
            {...(user?.id ? { currentUserId: user.id } : {})}
            isLoadingPending={isLoadingPendingWriteOffs}
            pendingError={pendingWriteOffsError}
            actionError={writeOffActionError}
            processingWriteOffId={processingWriteOffId}
            canApprove={canApproveWriteOff}
            onRefreshPending={() => void loadPendingWriteOffs()}
            historyRevision={writeOffHistoryRevision}
            onApprove={(writeOffId) => void handleApproveWriteOff(writeOffId)}
            onReject={(writeOffId, rejectionNotes) =>
              void handleRejectWriteOff(writeOffId, rejectionNotes)
            }
            onOpenMovement={(stockMovementId) => void handleOpenWriteOffMovement(stockMovementId)}
          />
        </TabsContent>
      </Tabs>

      <StockLocationFormDialog
        open={locationDialogOpen}
        location={locationEditItem}
        existingLocations={locations}
        operationalUsers={tenantUsers}
        isLoadingUsers={isLoading}
        usersLoadError={usersLoadError}
        isSubmitting={isSubmittingLocation}
        error={locationSubmitError}
        onClose={closeLocationDialog}
        onCreate={handleCreateLocation}
        onUpdate={handleUpdateLocation}
      />

      <SerializedAssetDetailDrawer
        open={Boolean(assetDetailTargetId)}
        detail={assetDetail}
        isLoading={isLoadingAsset}
        isLoadingMoreLifecycle={isLoadingMoreAssetLifecycle}
        isLoadingMoreMovements={isLoadingMoreAssetMovements}
        onClose={() => {
          setAssetDetail(null);
          setAssetDetailTargetId(null);
        }}
        onLoadMoreLifecycle={() => void loadMoreAssetLifecycle()}
        onLoadMoreMovements={() => void loadMoreAssetMovements()}
        onOpenKardex={handleOpenAssetKardex}
      />

      <InventoryCreateProductDialog
        open={createProductOpen}
        categories={categories}
        isSubmitting={isSubmittingCatalogItem}
        error={catalogSubmitError}
        onCreateCategoryClick={() => {
          setCreateCategoryInlineError(null);
          setCreateCategoryInlineApiError(null);
          setCreateCategoryInlineOpen((current) => !current);
        }}
        categorySelectionOverride={createCategorySelectionOverride}
        categoryInlineContent={
          createCategoryInlineOpen ? (
            <div className="space-y-4">
              {createCategoryInlineError ? (
                <PortalAlert
                  variant="warning"
                  title="Revisa la categoría"
                  description={createCategoryInlineError}
                />
              ) : null}
              {createCategoryInlineApiError ? (
                <PortalAlert
                  variant="error"
                  title="No fue posible crear la categoría"
                  description={createCategoryInlineApiError}
                />
              ) : null}

              <Input
                label="Nombre de la categoría"
                value={createCategoryInlineName}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setCreateCategoryInlineName(nextName);

                  if (!createCategoryInlinePrefixTouched && nextName.trim()) {
                    setCreateCategoryInlineCodePrefix(
                      suggestCategoryCodePrefix(nextName.trim(), takenCategoryCodePrefixes),
                    );
                  }
                }}
              />
              <Input
                label="Prefijo de código"
                value={createCategoryInlineCodePrefix}
                onChange={(event) => {
                  setCreateCategoryInlinePrefixTouched(true);
                  setCreateCategoryInlineCodePrefix(
                    sanitizeAlnumUpper(event.target.value).slice(0, 3),
                  );
                }}
                helperText="Se usa para generar el código del producto automáticamente."
              />
              <label className="space-y-1 text-sm">
                <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Descripción corta
                </span>
                <textarea
                  value={createCategoryInlineDescription}
                  onChange={(event) => setCreateCategoryInlineDescription(event.target.value)}
                  className={portalTextareaClassName}
                />
              </label>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={resetInlineCategoryState}
                >
                  Cancelar categoría
                </Button>
                <Button
                  type="button"
                  size="sm"
                  loading={isSubmittingInlineCategory}
                  onClick={() => void handleSubmitInlineCategory()}
                >
                  Guardar categoría
                </Button>
              </div>
            </div>
          ) : null
        }
        onClose={() => {
          setCreateProductOpen(false);
          setCatalogSubmitError(null);
          resetInlineCategoryState();
        }}
        onSubmit={handleCreateCatalogItem}
      />

      {catalogEditItem ? (
        <InventoryCatalogDrawer
          open={catalogDrawerOpen}
          item={catalogEditItem}
          categories={categories}
          commercialProductOptions={commercialProductOptions}
          isSubmitting={isSubmittingCatalogItem}
          error={catalogSubmitError}
          onClose={() => {
            setCatalogDrawerOpen(false);
            setCatalogEditItem(null);
            setCatalogSubmitError(null);
          }}
          onUpdate={handleUpdateCatalogItem}
        />
      ) : null}

      <InventoryCategoryDrawer
        open={categoryDrawerOpen}
        category={categoryEditItem}
        existingCategories={categories}
        isSubmitting={isSubmittingCategory}
        error={categorySubmitError}
        onClose={() => {
          setCategoryDrawerOpen(false);
          setCategoryEditItem(null);
          setCategorySubmitError(null);
        }}
        onCreate={handleCreateCategory}
        onUpdate={handleUpdateCategory}
      />

      <SupplierFormDrawer
        open={supplierDrawerOpen}
        supplier={supplierEditItem}
        isSubmitting={isSubmittingSupplier}
        error={supplierSubmitError}
        onClose={() => {
          setSupplierDrawerOpen(false);
          setSupplierEditItem(null);
          setSupplierSubmitError(null);
        }}
        onCreate={handleCreateSupplier}
        onUpdate={handleUpdateSupplier}
        onSetStatus={handleSetSupplierStatus}
      />

      <Dialog
        open={deleteConfirmItem !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteConfirmItem(null);
            setDeleteConfirmError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <p className="portal-eyebrow">Catálogo</p>
            <DialogTitle className="mt-1">Eliminar producto</DialogTitle>
            <DialogDescription>
              {deleteConfirmItem
                ? `¿Eliminar el producto "${deleteConfirmItem.name}"? Esta acción no se puede deshacer.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {deleteConfirmItem ? (
            <PortalAlert
              variant="warning"
              title="Confirmación requerida"
              description={`Se eliminará el producto ${deleteConfirmItem.sku} y dejará de estar disponible en compras, material y activos.`}
            />
          ) : null}
          {deleteConfirmError ? (
            <PortalAlert
              variant="error"
              title="No fue posible eliminar el producto"
              description={deleteConfirmError}
            />
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={deletingCatalogItemId !== null}
              onClick={() => setDeleteConfirmItem(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={deletingCatalogItemId !== null}
              onClick={() => void confirmDeleteCatalogItem()}
            >
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
