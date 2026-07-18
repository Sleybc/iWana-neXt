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
  type InternalUser,
  inventoryApi,
  commercialApi,
  type AdditionalProduct,
  type StockIssueRecord,
  type StockIssueDetailRecord,
  type CreateStockIssueDto,
  type UpdateStockIssueDto,
  type DispatchStockIssueDto,
  type StockCountRecord,
  type StockCountDetailRecord,
  type CreateStockCountDto,
  type UpdateStockCountDto,
  type CreateStockLocationDto,
  type ListInventoryItemsParams,
  purchasingApi,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
  type PurchaseRequestRecord,
  type ReceivePurchaseOrderDto,
  type RejectPurchaseRequestDto,
  type SerializedAssetRecord,
  type StockBalanceRecord,
  type StockLocationRecord,
  type StockMovementResultRecord,
  type SupplierProfileRecord,
  type UpdateStockLocationDto,
  type UpdateInventoryItemDto,
  type UpdateInventoryCategoryDto,
  type UpdateSupplierDto,
} from '@/lib/api-client';
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
import { StockLocationFormDialog } from './StockLocationFormDialog';
import { type LocationMatrixCustodyFilter } from './StockLocationsMatrix';
import { StockLocationsPanel } from './StockLocationsPanel';
import { StockWorkspace } from './StockWorkspace';

import { StockIssuesWorkspace } from './StockIssuesWorkspace';
import { StockCountsWorkspace } from './StockCountsWorkspace';
import {
  buildTakenCodePrefixSet,
  isValidCategoryCodePrefix,
  resolveCategoryCreateValues,
  sanitizeAlnumUpper,
  suggestCategoryCodePrefix,
  suggestNextCategorySortOrder,
} from './inventory-category-code';
import {
  formatInventoryDate,
  formatInventoryQuantity,
  getSerializedAssetStatusLabel,
  getWriteOffReasonLabel,
  WRITE_OFF_REASON_LABELS,
} from './inventory-labels';
import { type CatalogFilters, EMPTY_CATALOG_FILTERS } from './catalog-filters';
import { resolveInventoryTab, shouldOpenLocationCreateFromUrl } from './inventory-tab-params';

export type InventoryTab =
  | 'summary'
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

type CatalogSubView = 'products' | 'categories';

const fieldClassName = cn(
  'portal-input-surface w-full px-3 py-2 text-sm text-gray-900 dark:text-white',
  interactiveFocusClassName,
);

const RETURN_TARGET_STATUSES = [
  SerializedAssetStatus.IN_TRANSIT,
  SerializedAssetStatus.IN_TESTING,
] as const;

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
  const { user } = useAuth();
  const canAdjustStock = user?.role === UserRole.ADMIN;
  const [activeTab, setActiveTab] = useState<InventoryTab>(resolveInventoryTab(initialTab));
  const [locationCustodyFilter, setLocationCustodyFilter] = useState<LocationMatrixCustodyFilter>(
    () => resolveLocationCustodyFilter(searchParams.get('custody')),
  );
  const [summary, setSummary] = useState<InventoryDashboardSummary | null>(null);
  const [items, setItems] = useState<InventoryItemRecord[]>([]);
  const [locations, setLocations] = useState<StockLocationRecord[]>([]);
  const [issues, setIssues] = useState<StockIssueRecord[]>([]);
  const [counts, setCounts] = useState<StockCountRecord[]>([]);
  const [tenantUsers, setTenantUsers] = useState<InternalUser[]>([]);
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null);
  const [assets, setAssets] = useState<SerializedAssetRecord[]>([]);
  const [balances, setBalances] = useState<StockBalanceRecord[]>([]);
  const [requests, setRequests] = useState<PurchaseRequestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [locationEditItem, setLocationEditItem] = useState<StockLocationRecord | null>(null);
  const [locationSubmitError, setLocationSubmitError] = useState<string | null>(null);
  const [isSubmittingLocation, setIsSubmittingLocation] = useState(false);

  const [assetDetail, setAssetDetail] = useState<SerializedAssetRecord | null>(null);
  const [assetDetailError, setAssetDetailError] = useState<string | null>(null);
  const [isLoadingAsset, setIsLoadingAsset] = useState(false);
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
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isRefreshingCategories, setIsRefreshingCategories] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [categoryEditItem, setCategoryEditItem] = useState<InventoryCategoryRecord | null>(null);
  const [categorySubmitError, setCategorySubmitError] = useState<string | null>(null);
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierProfileRecord[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [isRefreshingSuppliers, setIsRefreshingSuppliers] = useState(false);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);
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

  const lowStockItems = useMemo(() => {
    const quantityByItem = new Map<string, number>();
    balances.forEach((balance) => {
      quantityByItem.set(
        balance.itemId,
        (quantityByItem.get(balance.itemId) ?? 0) + Number.parseFloat(balance.quantityOnHand),
      );
    });

    return items
      .map((item) => ({
        item,
        total: quantityByItem.get(item.id) ?? 0,
      }))
      .filter(({ item, total }) => total <= Number.parseFloat(item.minimumStock))
      .slice(0, 6);
  }, [balances, items]);

  const monitoredAssets = useMemo(
    () =>
      assets.filter((asset) =>
        [
          SerializedAssetStatus.IN_REPAIR,
          SerializedAssetStatus.IN_TESTING,
          SerializedAssetStatus.LOST,
        ].includes(asset.currentStatus),
      ),
    [assets],
  );

  const loadData = useCallback(async (silent = false) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      const [
        dashboardResponse,
        itemsResponse,
        locationsResponse,
        issuesResponse,
        countsResponse,
        assetsResponse,
        balancesResponse,
        requestsResponse,
        usersResult,
      ] = await Promise.all([
        inventoryApi.dashboard(),
        inventoryApi.listItems(),
        inventoryApi.listLocations(),
        inventoryApi.listIssues(),
        inventoryApi.listCounts(),
        inventoryApi.listAssets(),
        inventoryApi.listBalances(),
        purchasingApi.listRequests(),
        loadTenantUsers()
          .then((users) => ({ users, error: null as string | null }))
          .catch(() => ({
            users: [] as InternalUser[],
            error: 'No fue posible cargar la lista de usuarios.',
          })),
      ]);

      setSummary(dashboardResponse);
      setItems(itemsResponse);
      setLocations(locationsResponse);
      setIssues(issuesResponse);
      setCounts(countsResponse);
      setAssets(assetsResponse);
      setBalances(balancesResponse);
      setRequests(requestsResponse);
      setTenantUsers(usersResult.users);
      setUsersLoadError(usersResult.error);
    } catch (loadError) {
      setError(mapInventoryError(loadError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');

    if (!tabFromUrl) {
      if (!initialTab) {
        setActiveTab((current) => (current === 'summary' ? current : 'summary'));
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
      const products: AdditionalProduct[] = await commercialApi.getAdditionalProducts();
      setCommercialProductOptions(
        products
          .filter((product) => product.isActive)
          .map((product) => ({ id: product.id, name: product.name })),
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
      if (nextTab === 'summary') {
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
    async (filters: CatalogFilters, silent = false) => {
      if (silent) {
        setIsRefreshingCatalog(true);
      } else {
        setIsLoadingCatalog(true);
      }

      setCatalogError(null);

      try {
        const listParams: ListInventoryItemsParams = {};
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
        setCatalogItems(response);
        await loadSupplierLabels(
          response
            .map((item) => item.preferredSupplierRefId)
            .filter((id): id is string => Boolean(id)),
        );
      } catch (loadError) {
        setCatalogError(mapInventoryError(loadError));
      } finally {
        setIsLoadingCatalog(false);
        setIsRefreshingCatalog(false);
      }
    },
    [loadSupplierLabels],
  );

  const loadCategories = useCallback(async (silent = false) => {
    if (silent) {
      setIsRefreshingCategories(true);
    } else {
      setIsLoadingCategories(true);
    }

    setCategoriesError(null);

    try {
      const response = await inventoryApi.listCategories();
      setCategories(response);
    } catch (loadError) {
      setCategoriesError(mapInventoryError(loadError));
    } finally {
      setIsLoadingCategories(false);
      setIsRefreshingCategories(false);
    }
  }, []);

  const loadSuppliers = useCallback(async (silent = false) => {
    if (silent) {
      setIsRefreshingSuppliers(true);
    } else {
      setIsLoadingSuppliers(true);
    }

    setSuppliersError(null);

    try {
      const response = await purchasingApi.listSuppliers({ page: 1, limit: 100 });
      setSuppliers(response.data);
    } catch (loadError) {
      setSuppliersError(mapInventoryError(loadError));
    } finally {
      setIsLoadingSuppliers(false);
      setIsRefreshingSuppliers(false);
    }
  }, []);

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

    void loadCategories();
  }, [activeTab, loadCategories]);

  useEffect(() => {
    if (activeTab !== 'suppliers') {
      return;
    }

    void loadSuppliers();
  }, [activeTab, loadSuppliers]);

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
        loadCatalogItems(catalogFilters, true),
        loadCategories(true),
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
        loadCatalogItems(catalogFilters, true),
        loadCategories(true),
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
        loadCatalogItems(catalogFilters, true),
        loadCategories(true),
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
      setSuppliersError(mapInventoryError(detailError));
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
      await loadSuppliers(true);
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
      await loadSuppliers(true);
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
      await loadSuppliers(true);
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
      await loadCategories(true);
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
      await loadCategories(true);
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
      await Promise.all([loadCategories(true), loadCatalogItems(catalogFilters, true)]);
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
    setAssetDetailError(null);
    setIsLoadingAsset(true);
    try {
      const asset = await inventoryApi.getAsset(assetId);
      setAssetDetail(asset);
    } catch (detailError) {
      setAssetDetailError(mapInventoryError(detailError));
      setAssetDetail(null);
    } finally {
      setIsLoadingAsset(false);
    }
  }

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
        const orders = await purchasingApi.listOrders({ purchaseRequestId: requestId });
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
    try {
      const result = await inventoryApi.writeOff({
        itemId: writeOffForm.itemId || null,
        serializedAssetId: writeOffForm.serializedAssetId || null,
        locationId: writeOffForm.locationId || null,
        quantity: Number(writeOffForm.quantity || '0'),
        reason: writeOffForm.reason,
        notes: writeOffForm.notes.trim() || null,
      });
      setMovementNotice(
        `Baja registrada. Número de movimiento: ${result.movement.movementNumber}.`,
      );
      setWriteOffForm({
        itemId: '',
        serializedAssetId: '',
        locationId: '',
        quantity: '1',
        reason: WriteOffReason.DAMAGED,
        notes: '',
      });
      await loadData(true);
    } catch (submitError) {
      setWriteOffError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingWriteOff(false);
    }
  }

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
      {isLoadingAsset && <PortalSkeletonBlock className="h-24" />}

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
              <TabsTrigger value="summary" className={portalModuleTabTriggerClassName}>
                Resumen
              </TabsTrigger>
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

        <TabsContent value="summary" className="space-y-6">
          <InventoryDashboard summary={summary} isLoading={isLoading} />

          <div className="grid gap-6 xl:grid-cols-2">
            <PortalPanel
              eyebrow="Abastecimiento"
              title="Productos bajo mínimo"
              description="Productos que ya llegaron al mínimo definido para reponer."
            >
              {isLoading ? (
                <PortalSkeletonBlock className="h-48" />
              ) : lowStockItems.length === 0 ? (
                <PortalEmptyState
                  title="Sin alertas de reposición"
                  description="El material disponible está por encima del mínimo definido."
                />
              ) : (
                <div className="space-y-3">
                  {lowStockItems.map(({ item, total }) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-gray-100 px-3 py-3 dark:border-dark-border"
                    >
                      <p className="font-medium text-gray-900 dark:text-white">{item.name}</p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {item.sku} · disponible {formatInventoryQuantity(total)} / mínimo{' '}
                        {formatInventoryQuantity(item.minimumStock)}
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
              {isLoading ? (
                <PortalSkeletonBlock className="h-48" />
              ) : monitoredAssets.length === 0 ? (
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
            isLoading={isLoading}
            onOpenCatalog={() => setActiveTab('catalog')}
          />
        </TabsContent>

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
                    onClick={() => void loadCatalogItems(catalogFilters, true)}
                  >
                    Actualizar
                  </Button>
                  <Button type="button" onClick={openCreateProductDialog}>
                    Nuevo producto
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={isRefreshingCategories}
                    onClick={() => void loadCategories(true)}
                  >
                    Actualizar
                  </Button>
                  <Button type="button" onClick={() => openCategoryDrawer()}>
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
                  totalCount={items.length}
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
                    <Button type="button" onClick={openCreateProductDialog}>
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
                  isLoading={isLoadingCategories}
                  isRefreshing={isRefreshingCategories}
                  onCreateCategory={() => openCategoryDrawer()}
                  onRowClick={(category) => void openCategoryDetail(category)}
                  createAction={
                    <Button type="button" onClick={() => openCategoryDrawer()}>
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
            requests={requests}
            items={items}
            catalogOptions={catalogOptions}
            supplierLabels={supplierLabels}
            isCatalogSearching={isCatalogSearching}
            locations={locations}
            latestOrder={latestOrder}
            latestOrderLines={latestOrderLines}
            latestReceipt={latestReceipt}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
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
            onRefresh={() => loadData(true)}
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
                  loading={isRefreshingSuppliers}
                  onClick={() => void loadSuppliers(true)}
                >
                  Actualizar
                </Button>
                <Button type="button" onClick={() => openSupplierDrawer()}>
                  Nuevo proveedor
                </Button>
              </div>
            }
            contentClassName="space-y-4"
          >
            {suppliersError ? (
              <PortalAlert
                variant="error"
                title="No fue posible cargar los proveedores"
                description={suppliersError}
              />
            ) : null}

            <SuppliersPanel
              suppliers={suppliers}
              isLoading={isLoadingSuppliers}
              isRefreshing={isRefreshingSuppliers}
              onCreate={() => openSupplierDrawer()}
              onRowClick={(supplier) => void openSupplierDetail(supplier)}
              createAction={
                <Button type="button" onClick={() => openSupplierDrawer()}>
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
            items={items}
            balances={balances}
            assets={assets}
            locations={locations}
            issues={issues}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            error={error}
            onCreate={handleCreateIssue}
            onUpdate={handleUpdateIssue}
            onCancel={handleCancelIssue}
            onDispatch={handleDispatchIssue}
            onOpenDetail={handleOpenIssueDetail}
            onRefresh={() => void loadData(true)}
          />
        </TabsContent>

        <TabsContent value="counts" className="space-y-6">
          <StockCountsWorkspace
            locations={locations}
            categories={categories}
            counts={counts}
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            error={error}
            canClose={canAdjustStock}
            onCreate={handleCreateCount}
            onUpdate={handleUpdateCount}
            onClose={handleCloseCount}
            onCancel={handleCancelCount}
            onOpenDetail={handleOpenCountDetail}
            onRefresh={() => void loadData(true)}
          />
        </TabsContent>

        <TabsContent value="assets" className="space-y-6">
          <PortalPanel
            eyebrow="Activos"
            title="Activos con serial"
            description="Equipos identificados por serial para soporte, mantenimiento y comodato."
          >
            {isLoading ? (
              <PortalSkeletonBlock className="h-72" />
            ) : assets.length === 0 ? (
              <PortalEmptyState
                title="Sin activos con serial"
                description="Recibe una compra o registra equipos con serial para verlos aquí."
              />
            ) : (
              <div className={portalDataTableShellClassName}>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
                    <thead className="bg-gray-50 dark:bg-dark-surface-2">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                          Serial
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                          Producto
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                          Ubicación
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                          Compra
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                          Acción
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                      {assets.map((asset) => (
                        <tr key={asset.id}>
                          <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                            {asset.serialNumber ?? asset.assetTag ?? 'Sin serial'}
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                            {itemMap.get(asset.inventoryItemId)?.name ?? 'Producto no encontrado'}
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                            {getSerializedAssetStatusLabel(asset.currentStatus)}
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                            {locationMap.get(asset.currentLocationId ?? '')?.name ??
                              'Sin ubicación'}
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                            {formatInventoryDate(asset.purchaseDate)}
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => void openAssetDetail(asset.id)}
                            >
                              Ver detalle
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </PortalPanel>
        </TabsContent>

        <TabsContent value="movements" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <PortalPanel
              eyebrow="Venta"
              title="Registrar venta"
              description="Descuenta unidades desde una bodega y asocia la salida a una referencia comercial."
            >
              <div className="grid gap-4">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Producto
                  </span>
                  <select
                    value={saleForm.itemId}
                    onChange={(event) =>
                      setSaleForm((current) => ({ ...current, itemId: event.target.value }))
                    }
                    className={fieldClassName}
                  >
                    <option value="">Selecciona un producto</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} · {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Ubicación
                  </span>
                  <select
                    value={saleForm.locationId}
                    onChange={(event) =>
                      setSaleForm((current) => ({ ...current, locationId: event.target.value }))
                    }
                    className={fieldClassName}
                  >
                    <option value="">Selecciona una bodega</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.code} · {location.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Cantidad"
                  type="number"
                  min="0"
                  step="0.01"
                  value={saleForm.quantity}
                  onChange={(event) =>
                    setSaleForm((current) => ({ ...current, quantity: event.target.value }))
                  }
                />
                <Input
                  label="Referencia comercial"
                  value={saleForm.commercialRefId}
                  onChange={(event) =>
                    setSaleForm((current) => ({ ...current, commercialRefId: event.target.value }))
                  }
                />
                <Input
                  label="Serial (opcional)"
                  value={saleForm.serialNumber}
                  onChange={(event) =>
                    setSaleForm((current) => ({ ...current, serialNumber: event.target.value }))
                  }
                />
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Notas
                  </span>
                  <textarea
                    rows={3}
                    value={saleForm.notes}
                    onChange={(event) =>
                      setSaleForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    className={fieldClassName}
                  />
                </label>
                <Button
                  type="button"
                  loading={isSubmittingMovement}
                  disabled={!saleForm.itemId || !saleForm.locationId || !saleForm.commercialRefId}
                  onClick={() => void handleSale()}
                >
                  Registrar venta
                </Button>
              </div>
            </PortalPanel>

            <PortalPanel
              eyebrow="Devolución"
              title="Recibir devolución"
              description="Registra material o activo devuelto por un técnico o cliente y muévelo a la bodega que corresponda."
            >
              <div className="grid gap-4">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Producto
                  </span>
                  <select
                    value={returnForm.itemId}
                    onChange={(event) =>
                      setReturnForm((current) => ({ ...current, itemId: event.target.value }))
                    }
                    className={fieldClassName}
                  >
                    <option value="">Selecciona un producto</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} · {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Bodega de origen
                  </span>
                  <select
                    value={returnForm.sourceLocationId}
                    onChange={(event) =>
                      setReturnForm((current) => ({
                        ...current,
                        sourceLocationId: event.target.value,
                      }))
                    }
                    className={fieldClassName}
                  >
                    <option value="">Selecciona una bodega</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.code} · {location.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Bodega de destino
                  </span>
                  <select
                    value={returnForm.destinationLocationId}
                    onChange={(event) =>
                      setReturnForm((current) => ({
                        ...current,
                        destinationLocationId: event.target.value,
                      }))
                    }
                    className={fieldClassName}
                  >
                    <option value="">Selecciona una bodega</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.code} · {location.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Cantidad"
                  type="number"
                  min="0"
                  step="0.01"
                  value={returnForm.quantity}
                  onChange={(event) =>
                    setReturnForm((current) => ({ ...current, quantity: event.target.value }))
                  }
                />
                <Input
                  label="Serial (opcional)"
                  value={returnForm.serialNumber}
                  onChange={(event) =>
                    setReturnForm((current) => ({ ...current, serialNumber: event.target.value }))
                  }
                />
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Estado del activo al llegar
                  </span>
                  <select
                    value={returnForm.targetStatus}
                    onChange={(event) =>
                      setReturnForm((current) => ({
                        ...current,
                        targetStatus: event.target.value as SerializedAssetStatus,
                      }))
                    }
                    className={fieldClassName}
                  >
                    {RETURN_TARGET_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {getSerializedAssetStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Notas
                  </span>
                  <textarea
                    rows={3}
                    value={returnForm.notes}
                    onChange={(event) =>
                      setReturnForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    className={fieldClassName}
                  />
                </label>
                <Button
                  type="button"
                  loading={isSubmittingMovement}
                  disabled={
                    !returnForm.itemId ||
                    !returnForm.sourceLocationId ||
                    !returnForm.destinationLocationId
                  }
                  onClick={() => void handleReturn()}
                >
                  Registrar retorno
                </Button>
              </div>
            </PortalPanel>
          </div>

          {movementError && (
            <PortalAlert
              variant="error"
              title="No fue posible registrar el movimiento"
              description={movementError}
            />
          )}
        </TabsContent>

        <TabsContent value="writeoffs" className="space-y-6">
          <PortalPanel
            eyebrow="Bajas"
            title="Registrar baja definitiva"
            description="Registra una salida definitiva por daño, pérdida u obsolescencia."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Producto
                </span>
                <select
                  value={writeOffForm.itemId}
                  onChange={(event) =>
                    setWriteOffForm((current) => ({ ...current, itemId: event.target.value }))
                  }
                  className={fieldClassName}
                >
                  <option value="">Selecciona un producto</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Equipo con serial (opcional)"
                value={writeOffForm.serializedAssetId}
                onChange={(event) =>
                  setWriteOffForm((current) => ({
                    ...current,
                    serializedAssetId: event.target.value,
                  }))
                }
              />
              <label className="space-y-1 text-sm">
                <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Ubicación
                </span>
                <select
                  value={writeOffForm.locationId}
                  onChange={(event) =>
                    setWriteOffForm((current) => ({ ...current, locationId: event.target.value }))
                  }
                  className={fieldClassName}
                >
                  <option value="">Selecciona una bodega</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} · {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Cantidad"
                type="number"
                min="0"
                step="0.01"
                value={writeOffForm.quantity}
                onChange={(event) =>
                  setWriteOffForm((current) => ({ ...current, quantity: event.target.value }))
                }
              />
              <label className="space-y-1 text-sm">
                <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Motivo
                </span>
                <select
                  value={writeOffForm.reason}
                  onChange={(event) =>
                    setWriteOffForm((current) => ({
                      ...current,
                      reason: event.target.value as WriteOffReason,
                    }))
                  }
                  className={fieldClassName}
                >
                  {Object.keys(WRITE_OFF_REASON_LABELS).map((reason) => (
                    <option key={reason} value={reason}>
                      {getWriteOffReasonLabel(reason as WriteOffReason)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm xl:col-span-3">
                <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Notas
                </span>
                <textarea
                  rows={3}
                  value={writeOffForm.notes}
                  onChange={(event) =>
                    setWriteOffForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  className={fieldClassName}
                />
              </label>
            </div>

            {writeOffError && (
              <PortalAlert
                variant="error"
                title="No fue posible registrar la baja"
                description={writeOffError}
              />
            )}

            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                loading={isSubmittingWriteOff}
                disabled={
                  !writeOffForm.locationId ||
                  (!writeOffForm.itemId && !writeOffForm.serializedAssetId)
                }
                onClick={() => void handleWriteOff()}
              >
                Registrar baja
              </Button>
            </div>
          </PortalPanel>
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
        open={Boolean(assetDetail)}
        asset={assetDetail}
        item={itemMap.get(assetDetail?.inventoryItemId ?? '') ?? null}
        location={locationMap.get(assetDetail?.currentLocationId ?? '') ?? null}
        onClose={() => setAssetDetail(null)}
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
