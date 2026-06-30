'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@iwana/ui';
import { SerializedAssetStatus, WriteOffReason } from '@iwana/shared';
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
  type ListInventoryItemsParams,
  purchasingApi,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
  type PurchaseRequestRecord,
  type ReceivePurchaseOrderDto,
  type SerializedAssetRecord,
  type StockBalanceRecord,
  type StockLocationRecord,
  type UpdateInventoryItemDto,
  type UpdateInventoryCategoryDto,
} from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { InventoryDashboard } from './InventoryDashboard';
import { InventoryCatalogDrawer } from './InventoryCatalogDrawer';
import { InventoryCategoryDrawer } from './InventoryCategoryDrawer';
import { InventoryCategoriesTable } from './InventoryCategoriesTable';
import { InventoryCatalogFilters } from './InventoryCatalogFilters';
import { InventoryCatalogSummary } from './InventoryCatalogSummary';
import { InventoryItemsTable } from './InventoryItemsTable';
import { PurchaseWorkspace } from './PurchaseWorkspace';
import { SerializedAssetDetailDrawer } from './SerializedAssetDetailDrawer';
import { StockLocationsMatrix } from './StockLocationsMatrix';
import { StockTransferDialog } from './StockTransferDialog';
import {
  formatInventoryDate,
  formatInventoryQuantity,
  getSerializedAssetStatusLabel,
  getWriteOffReasonLabel,
  SERIALIZED_ASSET_STATUS_LABELS,
  WRITE_OFF_REASON_LABELS,
} from './inventory-labels';
import { type CatalogFilters, EMPTY_CATALOG_FILTERS } from './catalog-filters';

type InventoryTab =
  | 'summary'
  | 'catalog'
  | 'purchasing'
  | 'locations'
  | 'assets'
  | 'movements'
  | 'writeoffs';

type CatalogSubView = 'products' | 'categories';

const fieldClassName =
  'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white';

function mapInventoryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para operar Inventario.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
    return error.message;
  }

  return 'No fue posible completar la operación. Intenta nuevamente.';
}

export function InventoryClient() {
  const [activeTab, setActiveTab] = useState<InventoryTab>('summary');
  const [summary, setSummary] = useState<InventoryDashboardSummary | null>(null);
  const [items, setItems] = useState<InventoryItemRecord[]>([]);
  const [locations, setLocations] = useState<StockLocationRecord[]>([]);
  const [assets, setAssets] = useState<SerializedAssetRecord[]>([]);
  const [balances, setBalances] = useState<StockBalanceRecord[]>([]);
  const [requests, setRequests] = useState<PurchaseRequestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    targetStatus: SerializedAssetStatus.AVAILABLE,
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
  const [catalogDrawerOpen, setCatalogDrawerOpen] = useState(false);
  const [catalogEditItem, setCatalogEditItem] = useState<InventoryItemRecord | null>(null);
  const [catalogSubmitError, setCatalogSubmitError] = useState<string | null>(null);
  const [isSubmittingCatalogItem, setIsSubmittingCatalogItem] = useState(false);
  const [catalogSubView, setCatalogSubView] = useState<CatalogSubView>('products');
  const [categories, setCategories] = useState<InventoryCategoryRecord[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [categoryEditItem, setCategoryEditItem] = useState<InventoryCategoryRecord | null>(null);
  const [categorySubmitError, setCategorySubmitError] = useState<string | null>(null);
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
  const [supplierLabels, setSupplierLabels] = useState<Record<string, string>>({});

  const activeCategoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
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

  const loadCatalogOptions = useCallback(async () => {
    setCatalogOptionsError(null);

    try {
      const options = await inventoryApi.listCatalogOptions();
      setCatalogOptions(options);
    } catch (loadError) {
      setCatalogOptionsError(mapInventoryError(loadError));
    }
  }, [loadSupplierLabels]);

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
    if (!silent) {
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

  function openCatalogDrawer(item?: InventoryItemRecord) {
    setCatalogSubmitError(null);
    setCatalogEditItem(item ?? null);
    setCatalogDrawerOpen(true);
  }

  async function handleCreateCatalogItem(payload: CreateInventoryItemDto) {
    setIsSubmittingCatalogItem(true);
    setCatalogSubmitError(null);
    try {
      await inventoryApi.createItem(payload);
      setCatalogDrawerOpen(false);
      setCatalogEditItem(null);
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
    } catch (submitError) {
      setCatalogSubmitError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingCatalogItem(false);
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

  function openCategoryDrawerFromProductForm() {
    setCategoryDrawerOpen(true);
    setCategoryEditItem(null);
    setCategorySubmitError(null);
  }

  async function handleCreateCategory(payload: CreateInventoryCategoryDto) {
    setIsSubmittingCategory(true);
    setCategorySubmitError(null);
    try {
      await inventoryApi.createCategory(payload);
      setCategoryDrawerOpen(false);
      setCategoryEditItem(null);
      await loadCategories(true);
    } catch (submitError) {
      setCategorySubmitError(mapInventoryError(submitError));
    } finally {
      setIsSubmittingCategory(false);
    }
  }

  async function handleUpdateCategory(id: string, payload: UpdateInventoryCategoryDto) {
    setIsSubmittingCategory(true);
    setCategorySubmitError(null);
    try {
      await inventoryApi.updateCategory(id, payload);
      setCategoryDrawerOpen(false);
      setCategoryEditItem(null);
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
      await purchasingApi.createRequest(payload);
      await loadData(true);
    } catch (submitError) {
      setCreateRequestError(mapInventoryError(submitError));
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
        targetStatus: SerializedAssetStatus.AVAILABLE,
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

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as InventoryTab)}>
        <TabsList className="flex flex-wrap rounded-2xl bg-iwana-surface-soft p-1 dark:bg-dark-surface-3">
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

          <PortalPanel
            eyebrow="Catálogo"
            title="Ítems maestros"
            description="Vista densa del catálogo base para compras, stock y trazabilidad."
          >
            {isLoading ? (
              <PortalSkeletonBlock className="h-72" />
            ) : (
              <InventoryItemsTable items={items} />
            )}
          </PortalPanel>
        </TabsContent>

        <TabsContent value="catalog" className="space-y-6">
          <InventoryCatalogSummary
            items={catalogItems}
            balances={balances}
            isLoading={isLoadingCatalog}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={catalogSubView === 'products' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setCatalogSubView('products')}
            >
              Productos
            </Button>
            <Button
              type="button"
              variant={catalogSubView === 'categories' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setCatalogSubView('categories')}
            >
              Categorías
            </Button>
          </div>

          {catalogSubView === 'products' ? (
            <>
              {catalogError ? (
                <PortalAlert
                  variant="error"
                  title="No fue posible cargar el catálogo"
                  description={catalogError}
                />
              ) : null}

              <PortalPanel
                eyebrow="Maestro de productos"
                title="Catálogo operativo"
                description="Consulta, filtra y administra productos para compras, stock y lifecycle."
                actions={
                  <Button type="button" onClick={() => openCatalogDrawer()}>
                    Nuevo producto
                  </Button>
                }
              >
                <div className="space-y-4">
                  <InventoryCatalogFilters
                    filters={catalogFilters}
                    resultCount={catalogItems.length}
                    totalCount={items.length}
                    categoryOptions={activeCategoryOptions}
                    isRefreshing={isRefreshingCatalog}
                    onFiltersChange={setCatalogFilters}
                    onRefresh={() => void loadCatalogItems(catalogFilters, true)}
                    onClearFilters={() => setCatalogFilters(EMPTY_CATALOG_FILTERS)}
                  />

                  {isLoadingCatalog ? (
                    <PortalSkeletonBlock className="h-72" />
                  ) : (
                    <InventoryItemsTable
                      items={catalogItems}
                      supplierLabels={supplierLabels}
                      showCatalogColumns
                      onRowClick={(item) => void openCatalogItemDetail(item)}
                    />
                  )}
                </div>
              </PortalPanel>
            </>
          ) : (
            <>
              {categoriesError ? (
                <PortalAlert
                  variant="error"
                  title="No fue posible cargar las categorías"
                  description={categoriesError}
                />
              ) : null}

              <PortalPanel
                eyebrow="Clasificación del catálogo"
                title="Categorías"
                description="Administra las categorías usadas por los productos operativos."
                actions={
                  <Button type="button" onClick={() => openCategoryDrawer()}>
                    Nueva categoría
                  </Button>
                }
              >
                {isLoadingCategories ? (
                  <PortalSkeletonBlock className="h-72" />
                ) : (
                  <InventoryCategoriesTable
                    categories={categories}
                    onRowClick={(category) => void openCategoryDetail(category)}
                  />
                )}
              </PortalPanel>
            </>
          )}
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
          />
        </TabsContent>

        <TabsContent value="locations" className="space-y-6">
          <PortalPanel
            eyebrow="Red logística"
            title="Matriz de bodegas"
            description="Cruza ubicaciones activas con los balances visibles para detectar saturación y dispersión."
            actions={
              <Button type="button" onClick={() => setTransferOpen(true)}>
                Transferir stock
              </Button>
            }
          >
            {isLoading ? (
              <PortalSkeletonBlock className="h-64" />
            ) : (
              <StockLocationsMatrix locations={locations} balances={balances} />
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
                    {Object.keys(SERIALIZED_ASSET_STATUS_LABELS).map((status) => (
                      <option key={status} value={status}>
                        {getSerializedAssetStatusLabel(status as SerializedAssetStatus)}
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
        onCreate={handleCreateCatalogItem}
        onUpdate={handleUpdateCatalogItem}
        onCreateCategory={openCategoryDrawerFromProductForm}
      />

      <InventoryCategoryDrawer
        open={categoryDrawerOpen}
        category={categoryEditItem}
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
    </div>
  );
}
