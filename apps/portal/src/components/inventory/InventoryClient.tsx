'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
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
import { InventoryCategoryStatus, SerializedAssetStatus, WriteOffReason } from '@iwana/shared';
import {
  ApiError,
  type AddSupplierQuoteDto,
  type CreateInventoryItemDto,
  type CreateInventoryCategoryDto,
  type CreatePurchaseOrderDto,
  type CreatePurchaseRequestDto,
  type GoodsReceiptResultRecord,
  type InventoryDashboardSummary,
  type InventoryCatalogOptionRecord,
  type InventoryCategoryRecord,
  type InventoryItemRecord,
  inventoryApi,
  type CreateStockLocationDto,
  type ListInventoryItemsParams,
  purchasingApi,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
  type PurchaseRequestRecord,
  type ReceivePurchaseOrderDto,
  type SerializedAssetRecord,
  type StockBalanceRecord,
  type StockLocationRecord,
  type UpdateStockLocationDto,
  type UpdateInventoryItemDto,
  type UpdateInventoryCategoryDto,
} from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import { InventoryDashboard } from './InventoryDashboard';
import { InventoryCreateProductDialog } from './InventoryCreateProductDialog';
import { InventoryCatalogDrawer } from './InventoryCatalogDrawer';
import { InventoryCategoryDrawer } from './InventoryCategoryDrawer';
import { InventoryCatalogCategoriesPanel } from './InventoryCatalogCategoriesPanel';
import { InventoryCatalogProductsPanel } from './InventoryCatalogProductsPanel';
import { InventoryCatalogSummary } from './InventoryCatalogSummary';
import { InventoryCatalogSummaryPreview } from './InventoryCatalogSummaryPreview';
import { PurchaseWorkspace } from './PurchaseWorkspace';
import { buildPurchaseItemFrequency } from './purchase-composer-preferences';
import { SerializedAssetDetailDrawer } from './SerializedAssetDetailDrawer';
import { StockLocationFormDialog } from './StockLocationFormDialog';
import { StockLocationsMatrix, type LocationMatrixCustodyFilter } from './StockLocationsMatrix';
import { StockTransferDialog } from './StockTransferDialog';
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

export type InventoryTab =
  | 'summary'
  | 'catalog'
  | 'purchasing'
  | 'locations'
  | 'assets'
  | 'movements'
  | 'writeoffs';

type CatalogSubView = 'products' | 'categories';

const fieldClassName =
  'portal-input-surface w-full px-3 py-2 text-sm text-gray-900 dark:text-white';

const INVENTORY_TABS: InventoryTab[] = [
  'summary',
  'catalog',
  'purchasing',
  'locations',
  'assets',
  'movements',
  'writeoffs',
];

const RETURN_TARGET_STATUSES = [
  SerializedAssetStatus.IN_TRANSIT,
  SerializedAssetStatus.IN_TESTING,
] as const;

function resolveInventoryTab(value: string | null | undefined): InventoryTab {
  if (value && INVENTORY_TABS.includes(value as InventoryTab)) {
    return value as InventoryTab;
  }

  return 'summary';
}

function resolveLocationCustodyFilter(value: string | null): LocationMatrixCustodyFilter {
  return value === 'mobile' ? 'mobile' : 'all';
}

function mapInventoryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para operar Inventario.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
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
  const [activeTab, setActiveTab] = useState<InventoryTab>(resolveInventoryTab(initialTab));
  const [locationCustodyFilter, setLocationCustodyFilter] = useState<LocationMatrixCustodyFilter>(
    () => resolveLocationCustodyFilter(searchParams.get('custody')),
  );
  const [summary, setSummary] = useState<InventoryDashboardSummary | null>(null);
  const [items, setItems] = useState<InventoryItemRecord[]>([]);
  const [locations, setLocations] = useState<StockLocationRecord[]>([]);
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
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [assetDetail, setAssetDetail] = useState<SerializedAssetRecord | null>(null);
  const [assetDetailError, setAssetDetailError] = useState<string | null>(null);
  const [isLoadingAsset, setIsLoadingAsset] = useState(false);
  const [createRequestError, setCreateRequestError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [latestQuoteAmount, setLatestQuoteAmount] = useState<string | null>(null);
  const [latestOrder, setLatestOrder] = useState<PurchaseOrderRecord | null>(null);
  const [latestOrderLines, setLatestOrderLines] = useState<PurchaseOrderLineRecord[]>([]);
  const [latestReceipt, setLatestReceipt] = useState<GoodsReceiptResultRecord | null>(null);
  const [movementNotice, setMovementNotice] = useState<string | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
  const [isSubmittingApprove, setIsSubmittingApprove] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isSubmittingReceipt, setIsSubmittingReceipt] = useState(false);
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
  const [supplierLabels, setSupplierLabels] = useState<Record<string, string>>({});
  const [purchaseItemFrequency, setPurchaseItemFrequency] = useState<Record<string, number>>({});
  const [isCatalogSearching, setIsCatalogSearching] = useState(false);

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

  const loadPurchaseItemFrequency = useCallback(async (requestRecords: PurchaseRequestRecord[]) => {
    const recentRequests = requestRecords.slice(0, 15);

    if (recentRequests.length === 0) {
      setPurchaseItemFrequency({});
      return;
    }

    try {
      const details = await Promise.all(
        recentRequests.map((request) => purchasingApi.getRequestDetail(request.id)),
      );
      setPurchaseItemFrequency(buildPurchaseItemFrequency(details));
    } catch {
      setPurchaseItemFrequency({});
    }
  }, []);

  const loadData = useCallback(
    async (silent = false) => {
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
          assetsResponse,
          balancesResponse,
          requestsResponse,
        ] = await Promise.all([
          inventoryApi.dashboard(),
          inventoryApi.listItems(),
          inventoryApi.listLocations(),
          inventoryApi.listAssets(),
          inventoryApi.listBalances(),
          purchasingApi.listRequests(),
        ]);

        setSummary(dashboardResponse);
        setItems(itemsResponse);
        setLocations(locationsResponse);
        setAssets(assetsResponse);
        setBalances(balancesResponse);
        setRequests(requestsResponse);
        void loadPurchaseItemFrequency(requestsResponse);
      } catch (loadError) {
        setError(mapInventoryError(loadError));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [loadPurchaseItemFrequency],
  );

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

  const handleLocationCustodyFilterChange = useCallback(
    (nextFilter: LocationMatrixCustodyFilter) => {
      setLocationCustodyFilter(nextFilter);

      const nextSearchParams = new URLSearchParams(searchParams.toString());
      if (nextFilter === 'mobile') {
        nextSearchParams.set('tab', 'locations');
        nextSearchParams.set('custody', 'mobile');
      } else {
        nextSearchParams.delete('custody');
        if (nextSearchParams.get('tab') === 'locations') {
          nextSearchParams.set('tab', 'locations');
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
      setSupplierLabels({});
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

    setSupplierLabels(Object.fromEntries(entries));
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
    if (activeTab !== 'catalog') {
      return;
    }

    void loadCategories();
  }, [activeTab, loadCategories]);

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

  async function handleApproveRequest(requestId: string, exceptionReason?: string) {
    setIsSubmittingApprove(true);
    setApproveError(null);
    try {
      await purchasingApi.approveRequest(requestId, {
        notes: 'Aprobada desde el workspace de compras del portal.',
        exceptionReason: exceptionReason ?? null,
      });
      await loadData(true);
    } catch (submitError) {
      setApproveError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingApprove(false);
    }
  }

  const loadOrderDetailForRequest = useCallback(async (requestId: string) => {
    try {
      const orders = await purchasingApi.listOrders({ purchaseRequestId: requestId });
      const order = orders[0];

      if (!order) {
        setLatestOrder(null);
        setLatestOrderLines([]);
        return;
      }

      const detail = await purchasingApi.getOrder(order.id);
      setLatestOrder(detail);
      setLatestOrderLines(detail.lines);
    } catch {
      setLatestOrder(null);
      setLatestOrderLines([]);
    }
  }, []);

  async function handleCreateOrder(payload: CreatePurchaseOrderDto) {
    setIsSubmittingOrder(true);
    setOrderError(null);
    try {
      const order = await purchasingApi.createOrder(payload);
      const detail = await purchasingApi.getOrder(order.id);
      setLatestOrder(detail);
      setLatestOrderLines(detail.lines);
      await loadData(true);
    } catch (submitError) {
      setOrderError(mapInventoryError(submitError));
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

  async function handleTransfer(payload: Parameters<typeof inventoryApi.transfer>[0]) {
    setIsSubmittingTransfer(true);
    setTransferError(null);
    try {
      const result = await inventoryApi.transfer(payload);
      setMovementNotice(`Transferencia registrada en ${result.movement.movementNumber}.`);
      setTransferOpen(false);
      await loadData(true);
    } catch (submitError) {
      setTransferError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingTransfer(false);
    }
  }

  async function handleCreateLocation(payload: CreateStockLocationDto) {
    setIsSubmittingLocation(true);
    setLocationSubmitError(null);
    try {
      await inventoryApi.createLocation(payload);
      setLocationDialogOpen(false);
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
      setLocationDialogOpen(false);
      setLocationEditItem(null);
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
      setMovementNotice(`Salida por venta registrada en ${result.movement.movementNumber}.`);
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
      setMovementNotice(`Retorno registrado en ${result.movement.movementNumber}.`);
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
      setMovementNotice(`Baja registrada en ${result.movement.movementNumber}.`);
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
        subtitle="Compras, bodegas, activos y movimientos del ciclo operativo en una sola consola."
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
        <TabsList
          aria-label="Secciones de inventario"
          className="flex flex-wrap rounded-2xl bg-iwana-surface-soft p-1 dark:bg-dark-surface-3"
        >
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="catalog">Catálogo</TabsTrigger>
          <TabsTrigger value="purchasing">Compras</TabsTrigger>
          <TabsTrigger value="locations">Bodegas</TabsTrigger>
          <TabsTrigger value="assets">Activos</TabsTrigger>
          <TabsTrigger value="movements">Movimientos</TabsTrigger>
          <TabsTrigger value="writeoffs">Bajas</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          <InventoryDashboard summary={summary} isLoading={isLoading} />

          <div className="grid gap-6 xl:grid-cols-2">
            <PortalPanel
              eyebrow="Abastecimiento"
              title="Referencias bajo mínimo"
              description="Ítems cuya existencia agregada ya tocó o cayó por debajo del umbral operativo."
            >
              {isLoading ? (
                <PortalSkeletonBlock className="h-48" />
              ) : lowStockItems.length === 0 ? (
                <PortalEmptyState
                  title="Sin alertas de reposición"
                  description="Los balances visibles superan el stock mínimo configurado."
                />
              ) : (
                <div className="space-y-3">
                  {lowStockItems.map(({ item, total }) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3"
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
              description="Seriales en prueba, reparación o pérdida que requieren seguimiento del equipo operativo."
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
                      className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-iwana-primary/40 dark:border-dark-border dark:bg-dark-surface-3"
                      onClick={() => void openAssetDetail(asset.id)}
                    >
                      <p className="font-medium text-gray-900 dark:text-white">
                        {asset.serialNumber ?? asset.assetTag ?? asset.id}
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
            eyebrow="Resumen del catálogo"
            title="Cobertura operativa"
            description="Estado agregado de productos, abastecimiento y trazabilidad antes de aplicar filtros."
          >
            <InventoryCatalogSummary items={items} balances={balances} isLoading={isLoading} />
          </PortalPanel>

          <Tabs
            value={catalogSubView}
            onValueChange={(value) => setCatalogSubView(value as CatalogSubView)}
          >
            <TabsList
              aria-label="Vista del catálogo"
              className="flex w-fit gap-1 border-b border-gray-200 bg-transparent p-0 dark:border-dark-border"
            >
              <TabsTrigger
                value="products"
                className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-iwana-primary data-[state=active]:bg-transparent data-[state=active]:text-iwana-primary data-[state=active]:shadow-none"
              >
                Productos
              </TabsTrigger>
              <TabsTrigger
                value="categories"
                className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-iwana-primary data-[state=active]:bg-transparent data-[state=active]:text-iwana-primary data-[state=active]:shadow-none"
              >
                Categorías
              </TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="mt-4 space-y-4">
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
                onRefresh={() => void loadCatalogItems(catalogFilters, true)}
                onCreateProduct={openCreateProductDialog}
                onRowClick={(item) => void openCatalogItemDetail(item)}
                onDelete={handleDeleteCatalogItem}
                deletingItemId={deletingCatalogItemId}
              />
            </TabsContent>

            <TabsContent value="categories" className="mt-4 space-y-4">
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
                onRefresh={() => void loadCategories(true)}
              />
            </TabsContent>
          </Tabs>
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
            balances={balances}
            catalogOptions={catalogOptions}
            purchaseItemFrequency={purchaseItemFrequency}
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
            isSubmittingOrder={isSubmittingOrder}
            isSubmittingReceipt={isSubmittingReceipt}
            createError={createRequestError}
            quoteError={quoteError}
            approveError={approveError}
            orderError={orderError}
            receiptError={receiptError}
            onCreateRequest={handleCreateRequest}
            onAddQuote={handleAddQuote}
            onApproveRequest={handleApproveRequest}
            onCreateOrder={handleCreateOrder}
            onReceiveOrder={handleReceiveOrder}
            onPrepareOrderDrawer={loadOrderDetailForRequest}
            onRefresh={() => loadData(true)}
            onCatalogSearch={(search) => void loadCatalogOptions(search)}
          />
        </TabsContent>

        <TabsContent value="locations" className="space-y-6">
          <PortalPanel
            eyebrow="Red logística"
            title="Matriz de bodegas"
            description={
              locationCustodyFilter === 'mobile'
                ? 'Vista focalizada de custodias móviles para técnicos y cuadrillas. Consulta saldos, ocupación y responsable asignado.'
                : 'Cruza ubicaciones activas con los balances visibles para detectar saturación y dispersión.'
            }
            actions={
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setLocationEditItem(null);
                    setLocationSubmitError(null);
                    setLocationDialogOpen(true);
                  }}
                >
                  Crear bodega
                </Button>
                <Button type="button" onClick={() => setTransferOpen(true)}>
                  Transferir stock
                </Button>
              </div>
            }
          >
            {isLoading ? (
              <PortalSkeletonBlock className="h-64" />
            ) : (
              <StockLocationsMatrix
                locations={locations}
                balances={balances}
                items={items}
                custodyFilter={locationCustodyFilter}
                onCustodyFilterChange={handleLocationCustodyFilterChange}
                onEditLocation={(location) => {
                  setLocationEditItem(location);
                  setLocationSubmitError(null);
                  setLocationDialogOpen(true);
                }}
              />
            )}
          </PortalPanel>
        </TabsContent>

        <TabsContent value="assets" className="space-y-6">
          <PortalPanel
            eyebrow="Activos"
            title="Serializados"
            description="Activos con serial o MAC visibles para soporte, mantenimiento y comodato."
          >
            {isLoading ? (
              <PortalSkeletonBlock className="h-72" />
            ) : assets.length === 0 ? (
              <PortalEmptyState
                title="Sin activos serializados"
                description="Recibe una orden de compra o registra inventario serializado para poblar esta vista."
              />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
                  <thead className="bg-gray-50 dark:bg-dark-surface-2">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                        Serial
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                        Ítem
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
                          {itemMap.get(asset.inventoryItemId)?.name ?? asset.inventoryItemId}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {getSerializedAssetStatusLabel(asset.currentStatus)}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {locationMap.get(asset.currentLocationId ?? '')?.name ?? 'Sin ubicación'}
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
            )}
          </PortalPanel>
        </TabsContent>

        <TabsContent value="movements" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <PortalPanel
              eyebrow="Salida"
              title="Registrar venta"
              description="Descuenta stock desde una ubicación logística y deja referencia comercial."
            >
              <div className="grid gap-4">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Ítem
                  </span>
                  <select
                    value={saleForm.itemId}
                    onChange={(event) =>
                      setSaleForm((current) => ({ ...current, itemId: event.target.value }))
                    }
                    className={fieldClassName}
                  >
                    <option value="">Selecciona un ítem</option>
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
                    <option value="">Selecciona una ubicación</option>
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
              eyebrow="Retorno"
              title="Recibir devolución"
              description="Mueve material o activo desde origen operativo hacia una ubicación de destino."
            >
              <div className="grid gap-4">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Ítem
                  </span>
                  <select
                    value={returnForm.itemId}
                    onChange={(event) =>
                      setReturnForm((current) => ({ ...current, itemId: event.target.value }))
                    }
                    className={fieldClassName}
                  >
                    <option value="">Selecciona un ítem</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} · {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Origen
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
                    <option value="">Selecciona una ubicación</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.code} · {location.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Destino
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
                    <option value="">Selecciona una ubicación</option>
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
                    Estado destino
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
            title="Registrar baja operativa"
            description="Aplica salida definitiva por daño, pérdida u obsolescencia con trazabilidad de actor y ubicación."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Ítem
                </span>
                <select
                  value={writeOffForm.itemId}
                  onChange={(event) =>
                    setWriteOffForm((current) => ({ ...current, itemId: event.target.value }))
                  }
                  className={fieldClassName}
                >
                  <option value="">Selecciona un ítem</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Activo serializado (opcional)"
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
                  <option value="">Selecciona una ubicación</option>
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
        isSubmitting={isSubmittingLocation}
        error={locationSubmitError}
        onClose={() => {
          setLocationDialogOpen(false);
          setLocationEditItem(null);
          setLocationSubmitError(null);
        }}
        onCreate={handleCreateLocation}
        onUpdate={handleUpdateLocation}
      />

      <StockTransferDialog
        open={transferOpen}
        items={items}
        locations={locations}
        balances={balances}
        isSubmitting={isSubmittingTransfer}
        error={transferError}
        onClose={() => setTransferOpen(false)}
        onSubmit={handleTransfer}
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
                label="Prefijo de producto"
                value={createCategoryInlineCodePrefix}
                onChange={(event) => {
                  setCreateCategoryInlinePrefixTouched(true);
                  setCreateCategoryInlineCodePrefix(
                    sanitizeAlnumUpper(event.target.value).slice(0, 3),
                  );
                }}
                helperText="Se usa para autogenerar el SKU del producto."
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
              description={`Se eliminará el producto ${deleteConfirmItem.sku} y dejará de estar disponible en compras, stock y activos.`}
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
