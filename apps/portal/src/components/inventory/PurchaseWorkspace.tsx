'use client';

import { useEffect, useMemo, useState } from 'react';
import { PurchaseOrderStatus } from '@iwana/shared';
import type {
  AddSupplierQuoteDto,
  CancelPurchaseOrderDto,
  CancelPurchaseRequestDto,
  CreatePurchaseOrderDto,
  CreatePurchaseRequestAwardsDto,
  CreatePurchaseRequestDto,
  CreatePurchaseRequestLineDto,
  GoodsReceiptResultRecord,
  InventoryCatalogOptionRecord,
  InventoryItemRecord,
  PurchaseOrderLineRecord,
  PurchaseOrderRecord,
  PurchaseRequestDetailRecord,
  PurchaseRequestRecord,
  ReceivePurchaseOrderDto,
  RejectPurchaseRequestDto,
  StockLocationRecord,
  StockMovementResultRecord,
  SupplierSummaryRecord,
  UpdatePurchaseRequestDto,
  CreateCounterPurchaseDto,
} from '@/lib/api-client';
import type { PurchaseComposerInitialValues } from './PurchaseRequestComposer';
import { purchasingApi } from '@/lib/api-client';
import { PortalPanel } from '@/components/shared/portal-ui';
import { PurchaseCreateModeHeader } from './PurchaseCreateModeHeader';
import { PurchaseCreateModeShell } from './PurchaseCreateModeShell';
import { PurchaseOrderDrawer } from './PurchaseOrderDrawer';
import { PurchaseRequestComposer } from './PurchaseRequestComposer';
import { PurchaseRequestWorkbenchDrawer } from './PurchaseRequestWorkbenchDrawer';
import { PurchaseRequestsTable } from './PurchaseRequestsTable';
import { PurchaseRequestsToolbar } from './PurchaseRequestsToolbar';
import { PurchaseWorkspaceSummary } from './PurchaseWorkspaceSummary';
import { CounterPurchasePanel } from './CounterPurchasePanel';
import {
  filterPurchaseRequests,
  findFirstRequestForKpiWorkbench,
  kpiPresetToFilters,
  type PurchaseKpiPreset,
  type PurchaseRequestFilters,
} from './purchase-filters';
import {
  collectPurchaseDetailSupplierIds,
  resolveMissingSupplierLabels,
  seedSupplierLabelsFromDetail,
} from './purchase-supplier-labels';
import {
  getPurchaseNextAction,
  normalizePurchaseWorkbenchTab,
  type PurchaseWorkbenchTab,
} from './purchase-workbench';

type PurchaseWorkspaceMode = 'inbox' | 'create' | 'counter-purchase';

interface PurchaseCreateRequestResult {
  ok: boolean;
  requestId?: string;
}

interface PurchaseWorkspaceProps {
  requests: PurchaseRequestRecord[];
  items: InventoryItemRecord[];
  catalogOptions: InventoryCatalogOptionRecord[];
  supplierLabels?: Record<string, string>;
  isCatalogSearching?: boolean;
  locations: StockLocationRecord[];
  latestOrder: PurchaseOrderRecord | null;
  latestOrderLines: PurchaseOrderLineRecord[];
  latestReceipt: GoodsReceiptResultRecord | null;
  isLoading?: boolean;
  isRefreshing?: boolean;
  isSubmittingRequest: boolean;
  isSubmittingQuote: boolean;
  isSubmittingApprove: boolean;
  isSubmittingAwards: boolean;
  isSubmittingReject: boolean;
  isSubmittingCancel: boolean;
  isSubmittingOrder: boolean;
  isSubmittingReceipt: boolean;
  isSubmittingUpdateRequest: boolean;
  isSubmittingApproveOrder: boolean;
  isSubmittingCancelOrder: boolean;
  isSubmittingCloseOrder: boolean;
  createError: string | null;
  quoteError: string | null;
  approveError: string | null;
  awardsError: string | null;
  rejectError: string | null;
  cancelError: string | null;
  orderError: string | null;
  receiptError: string | null;
  updateRequestError: string | null;
  approveOrderError: string | null;
  cancelOrderError: string | null;
  closeOrderError: string | null;
  counterPurchaseError?: string | null;
  latestCounterPurchase?: StockMovementResultRecord | null;
  isSubmittingCounterPurchase?: boolean;
  onCreateRequest: (payload: CreatePurchaseRequestDto) => Promise<PurchaseCreateRequestResult>;
  onAddQuote: (requestId: string, payload: AddSupplierQuoteDto) => Promise<void>;
  onApproveRequest: (
    requestId: string,
    payload?: { exceptionReason?: string; notes?: string },
  ) => Promise<void>;
  onCreateAwards: (requestId: string, payload: CreatePurchaseRequestAwardsDto) => Promise<void>;
  onRejectRequest: (requestId: string, payload: RejectPurchaseRequestDto) => Promise<void>;
  onCancelRequest: (requestId: string, payload: CancelPurchaseRequestDto) => Promise<void>;
  onUpdateRequest: (requestId: string, payload: UpdatePurchaseRequestDto) => Promise<void>;
  onCreateOrder: (payload: CreatePurchaseOrderDto) => Promise<void>;
  onReceiveOrder: (purchaseOrderId: string, payload: ReceivePurchaseOrderDto) => Promise<void>;
  onApproveOrder: (orderId: string) => Promise<void>;
  onCancelOrder: (orderId: string, payload: CancelPurchaseOrderDto) => Promise<void>;
  onCloseOrder: (orderId: string) => Promise<void>;
  onCounterPurchase?: (payload: CreateCounterPurchaseDto) => Promise<void>;
  onDismissCounterPurchaseSuccess?: () => void;
  onPrepareOrderDrawer: (requestId: string) => Promise<void>;
  onSelectOrder: (orderId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onCatalogSearch?: (search: string) => void;
}

export function PurchaseWorkspace({
  requests,
  items,
  catalogOptions,
  supplierLabels = {},
  isCatalogSearching = false,
  locations,
  latestOrder,
  latestOrderLines,
  latestReceipt,
  isLoading = false,
  isRefreshing = false,
  isSubmittingRequest,
  isSubmittingQuote,
  isSubmittingApprove,
  isSubmittingAwards,
  isSubmittingReject,
  isSubmittingCancel,
  isSubmittingOrder,
  isSubmittingReceipt,
  isSubmittingUpdateRequest,
  isSubmittingApproveOrder,
  isSubmittingCancelOrder,
  isSubmittingCloseOrder,
  createError,
  quoteError,
  approveError,
  awardsError,
  rejectError,
  cancelError,
  orderError,
  receiptError,
  updateRequestError,
  approveOrderError,
  cancelOrderError,
  closeOrderError,
  counterPurchaseError = null,
  latestCounterPurchase = null,
  isSubmittingCounterPurchase = false,
  onCreateRequest,
  onAddQuote,
  onApproveRequest,
  onCreateAwards,
  onRejectRequest,
  onCancelRequest,
  onUpdateRequest,
  onCreateOrder,
  onReceiveOrder,
  onApproveOrder,
  onCancelOrder,
  onCloseOrder,
  onCounterPurchase,
  onDismissCounterPurchaseSuccess,
  onPrepareOrderDrawer,
  onSelectOrder,
  onRefresh,
  onCatalogSearch,
}: PurchaseWorkspaceProps) {
  const [filters, setFilters] = useState<PurchaseRequestFilters>({});
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PurchaseRequestDetailRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [supplierSummary, setSupplierSummary] = useState<SupplierSummaryRecord | null>(null);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [detailSupplierLabels, setDetailSupplierLabels] = useState<Record<string, string>>({});
  const [orderDrawerOpen, setOrderDrawerOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<PurchaseWorkspaceMode>('inbox');
  const [composerDirty, setComposerDirty] = useState(false);
  const [draftLineCount, setDraftLineCount] = useState(0);
  const [workbenchTab, setWorkbenchTab] = useState<PurchaseWorkbenchTab>('summary');
  const [editingDetail, setEditingDetail] = useState<PurchaseRequestDetailRecord | null>(null);

  const filteredCount = useMemo(
    () => filterPurchaseRequests(requests, filters).length,
    [requests, filters],
  );

  const resolvedSupplierLabels = useMemo(
    () => ({ ...supplierLabels, ...detailSupplierLabels }),
    [supplierLabels, detailSupplierLabels],
  );

  async function enrichSupplierLabels(detailRecord: PurchaseRequestDetailRecord) {
    const seeded = seedSupplierLabelsFromDetail(detailRecord);
    if (Object.keys(seeded).length > 0) {
      setDetailSupplierLabels((previous) => ({ ...previous, ...seeded }));
    }

    const resolved = await resolveMissingSupplierLabels(
      collectPurchaseDetailSupplierIds(detailRecord),
      { ...supplierLabels, ...seeded },
    );
    if (Object.keys(resolved).length > 0) {
      setDetailSupplierLabels((previous) => ({ ...previous, ...resolved }));
    }
  }

  useEffect(() => {
    if (!detail?.orders.length) {
      return;
    }
    const selectedBelongs =
      latestOrder && detail.orders.some((order) => order.id === latestOrder.id);
    if (selectedBelongs) {
      return;
    }
    const receivable =
      detail.orders.find((order) =>
        [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED].includes(
          order.status,
        ),
      ) ?? detail.orders[0];
    if (receivable) {
      void onSelectOrder(receivable.id);
    }
  }, [detail?.orders, latestOrder, onSelectOrder]);

  async function loadDetail(requestId: string): Promise<PurchaseRequestDetailRecord | null> {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await purchasingApi.getRequestDetail(requestId);
      setDetail(response);
      void enrichSupplierLabels(response);
      return response;
    } catch {
      setDetailError('No fue posible cargar el detalle de la solicitud.');
      setDetail(null);
      return null;
    } finally {
      setDetailLoading(false);
    }
  }

  async function openWorkbench(requestId: string, initialTab?: PurchaseWorkbenchTab) {
    setSelectedRequestId(requestId);
    setSupplierSummary(null);
    setSupplierError(null);
    setDetailSupplierLabels({});
    const response = await loadDetail(requestId);
    const resolvedTab = initialTab ?? getPurchaseNextAction(response)?.suggestedTab ?? 'summary';
    setWorkbenchTab(normalizePurchaseWorkbenchTab(resolvedTab));
  }

  async function handleLoadSupplier(partyRefId: string) {
    if (!partyRefId.trim()) {
      return;
    }

    setSupplierLoading(true);
    setSupplierError(null);
    try {
      const summary = await purchasingApi.getProviderSummary(partyRefId.trim());
      setSupplierSummary(summary);
      setDetailSupplierLabels((previous) => ({
        ...previous,
        [partyRefId.trim()]: summary.displayName,
      }));
    } catch {
      setSupplierError('No fue posible cargar la ficha del proveedor.');
      setSupplierSummary(null);
    } finally {
      setSupplierLoading(false);
    }
  }

  function handleKpiFilterChange(preset: PurchaseKpiPreset) {
    const isToggleOff = filters.kpiPreset === preset;

    setFilters((current) => {
      if (current.kpiPreset === preset) {
        return {};
      }
      return kpiPresetToFilters(preset);
    });

    if (!isToggleOff) {
      const workbenchTarget = findFirstRequestForKpiWorkbench(preset, requests);
      if (workbenchTarget) {
        void openWorkbench(workbenchTarget.id, 'receipts');
      }
    }
  }

  function openCreateMode() {
    setSelectedRequestId(null);
    setDetail(null);
    setDetailError(null);
    setSupplierSummary(null);
    setSupplierError(null);
    setEditingDetail(null);
    setWorkspaceMode('create');
  }

  function openEditMode(requestDetail: PurchaseRequestDetailRecord) {
    setEditingDetail(requestDetail);
    setComposerDirty(false);
    setDraftLineCount(requestDetail.lines.length);
    setWorkspaceMode('create');
  }

  function closeCreateMode(force = false) {
    if (!force && composerDirty) {
      const confirmed = window.confirm(
        'Hay cambios sin guardar en la solicitud. ¿Quieres volver al listado y descartar este borrador?',
      );
      if (!confirmed) {
        return;
      }
    }

    setWorkspaceMode('inbox');
    setComposerDirty(false);
    setDraftLineCount(0);
    setEditingDetail(null);
  }

  function openCounterPurchaseMode() {
    setSelectedRequestId(null);
    setDetail(null);
    setDetailError(null);
    setSupplierSummary(null);
    setSupplierError(null);
    setWorkspaceMode('counter-purchase');
  }

  function closeCounterPurchaseMode() {
    setWorkspaceMode('inbox');
  }

  async function handleCreateRequest(
    payload: CreatePurchaseRequestDto,
  ): Promise<PurchaseCreateRequestResult> {
    const result = await onCreateRequest(payload);
    if (result.ok) {
      closeCreateMode(true);
    }
    return result;
  }

  async function handleUpdateRequest(payload: UpdatePurchaseRequestDto): Promise<{ ok: boolean }> {
    if (!editingDetail) return { ok: false };
    const requestId = editingDetail.request.id;
    try {
      await onUpdateRequest(requestId, payload);
      closeCreateMode(true);
      setSelectedRequestId(requestId);
      await loadDetail(requestId);
      await onRefresh();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async function handleUpdateLines(payload: {
    lines: CreatePurchaseRequestLineDto[];
  }): Promise<{ ok: boolean }> {
    if (!selectedRequestId) return { ok: false };
    try {
      await onUpdateRequest(selectedRequestId, payload);
      await loadDetail(selectedRequestId);
      await onRefresh();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  const composerInitialValues: PurchaseComposerInitialValues | undefined = editingDetail
    ? {
        title: editingDetail.request.title,
        requestType: editingDetail.request.requestType,
        priority: editingDetail.request.priority,
        requestingArea: editingDetail.request.requestingArea,
        justification: editingDetail.request.justification,
        neededByDate: editingDetail.request.neededByDate,
        lines: editingDetail.lines,
      }
    : undefined;

  return (
    <div className="space-y-6">
      {workspaceMode === 'inbox' ? (
        <PurchaseWorkspaceSummary
          requests={requests}
          filters={filters}
          isLoading={isLoading}
          onKpiFilterChange={handleKpiFilterChange}
        />
      ) : null}

      {workspaceMode === 'inbox' ? (
        <PortalPanel
          eyebrow="Operación"
          title="Listado de solicitudes"
          description="Tabla densa con filtros rápidos y acceso al panel lateral de trabajo."
        >
          <div className="space-y-4">
            <PurchaseRequestsToolbar
              filters={filters}
              resultCount={filteredCount}
              totalCount={requests.length}
              isRefreshing={isRefreshing}
              onFiltersChange={setFilters}
              onRefresh={() => void onRefresh()}
              onClearFilters={() => setFilters({})}
              onOpenComposer={openCreateMode}
              {...(onCounterPurchase ? { onOpenCounterPurchase: openCounterPurchaseMode } : {})}
            />
            <PurchaseRequestsTable
              requests={requests}
              filters={filters}
              selectedRequestId={selectedRequestId}
              isLoading={isLoading}
              onSelectRequest={(requestId) => void openWorkbench(requestId)}
              onCreateRequest={openCreateMode}
            />
          </div>
        </PortalPanel>
      ) : workspaceMode === 'create' ? (
        <PurchaseCreateModeShell
          header={
            <PurchaseCreateModeHeader
              draftLineCount={draftLineCount}
              onBack={() => closeCreateMode()}
            />
          }
        >
          <PurchaseRequestComposer
            key={editingDetail?.request.id ?? 'create'}
            catalogOptions={catalogOptions}
            supplierLabels={resolvedSupplierLabels}
            isCatalogSearching={isCatalogSearching}
            isSubmitting={editingDetail ? isSubmittingUpdateRequest : isSubmittingRequest}
            error={editingDetail ? updateRequestError : createError}
            layout="embedded"
            presentation="create-mode"
            {...(composerInitialValues ? { initialValues: composerInitialValues } : {})}
            onDirtyChange={setComposerDirty}
            onDraftLineCountChange={setDraftLineCount}
            {...(onCatalogSearch ? { onCatalogSearch } : {})}
            {...(editingDetail ? { onUpdate: handleUpdateRequest } : {})}
            onSubmit={handleCreateRequest}
          />
        </PurchaseCreateModeShell>
      ) : onCounterPurchase ? (
        <CounterPurchasePanel
          items={items}
          catalogOptions={catalogOptions}
          locations={locations}
          isSubmitting={isSubmittingCounterPurchase}
          error={counterPurchaseError}
          lastResult={latestCounterPurchase}
          isCatalogSearching={isCatalogSearching}
          supplierLabels={resolvedSupplierLabels}
          onBack={closeCounterPurchaseMode}
          onSubmit={onCounterPurchase}
          {...(onCatalogSearch ? { onCatalogSearch } : {})}
          {...(onDismissCounterPurchaseSuccess
            ? { onDismissSuccess: onDismissCounterPurchaseSuccess }
            : {})}
        />
      ) : null}

      <PurchaseRequestWorkbenchDrawer
        open={workspaceMode === 'inbox' && Boolean(selectedRequestId) && !orderDrawerOpen}
        detail={detail}
        items={items}
        catalogOptions={catalogOptions}
        isCatalogSearching={isCatalogSearching}
        {...(onCatalogSearch ? { onCatalogSearch } : {})}
        isSubmittingUpdateLines={isSubmittingUpdateRequest}
        updateLinesError={updateRequestError}
        onUpdateLines={handleUpdateLines}
        locations={locations}
        latestOrder={latestOrder}
        latestOrderLines={latestOrderLines}
        latestReceipt={latestReceipt}
        activeTab={workbenchTab}
        onActiveTabChange={(tab) => setWorkbenchTab(normalizePurchaseWorkbenchTab(tab))}
        isLoading={detailLoading}
        error={detailError}
        supplierSummary={supplierSummary}
        supplierLoading={supplierLoading}
        supplierError={supplierError}
        supplierLabels={resolvedSupplierLabels}
        isSubmittingQuote={isSubmittingQuote}
        isSubmittingApprove={isSubmittingApprove}
        isSubmittingAwards={isSubmittingAwards}
        isSubmittingReject={isSubmittingReject}
        isSubmittingCancel={isSubmittingCancel}
        isSubmittingReceipt={isSubmittingReceipt}
        isSubmittingApproveOrder={isSubmittingApproveOrder}
        isSubmittingCancelOrder={isSubmittingCancelOrder}
        isSubmittingCloseOrder={isSubmittingCloseOrder}
        quoteError={quoteError}
        approveError={approveError}
        awardsError={awardsError}
        rejectError={rejectError}
        cancelError={cancelError}
        receiptError={receiptError}
        approveOrderError={approveOrderError}
        cancelOrderError={cancelOrderError}
        closeOrderError={closeOrderError}
        onClose={() => setSelectedRequestId(null)}
        onAddQuote={async (payload) => {
          if (!selectedRequestId) return;
          await onAddQuote(selectedRequestId, payload);
          await loadDetail(selectedRequestId);
          await onRefresh();
        }}
        onApprove={async (payload) => {
          if (!selectedRequestId) return;
          await onApproveRequest(selectedRequestId, payload);
          await loadDetail(selectedRequestId);
          await onRefresh();
        }}
        onCreateAwards={async (payload) => {
          if (!selectedRequestId) return;
          await onCreateAwards(selectedRequestId, payload);
          await loadDetail(selectedRequestId);
          await onRefresh();
        }}
        onReject={async (payload) => {
          if (!selectedRequestId) return;
          await onRejectRequest(selectedRequestId, payload);
          await loadDetail(selectedRequestId);
          await onRefresh();
        }}
        onCancel={async (payload) => {
          if (!selectedRequestId) return;
          await onCancelRequest(selectedRequestId, payload);
          await loadDetail(selectedRequestId);
          await onRefresh();
        }}
        onEditRequest={() => {
          if (!detail) return;
          openEditMode(detail);
        }}
        onApproveOrder={async (orderId) => {
          await onApproveOrder(orderId);
          if (selectedRequestId) await loadDetail(selectedRequestId);
          await onRefresh();
        }}
        onCancelOrder={async (orderId, payload) => {
          await onCancelOrder(orderId, payload);
          if (selectedRequestId) await loadDetail(selectedRequestId);
          await onRefresh();
        }}
        onCloseOrder={async (orderId) => {
          await onCloseOrder(orderId);
          if (selectedRequestId) await loadDetail(selectedRequestId);
          await onRefresh();
        }}
        onLoadSupplier={(partyRefId) => void handleLoadSupplier(partyRefId)}
        onOpenOrderFlow={async () => {
          if (!selectedRequestId) return;
          await onPrepareOrderDrawer(selectedRequestId);
          setOrderDrawerOpen(true);
        }}
        onReceiveOrder={async (purchaseOrderId, payload) => {
          await onReceiveOrder(purchaseOrderId, payload);
          await onSelectOrder(purchaseOrderId);
          if (selectedRequestId) {
            await loadDetail(selectedRequestId);
          }
          await onRefresh();
        }}
        onSelectOrder={async (orderId) => {
          await onSelectOrder(orderId);
        }}
        onRefreshDetail={async () => {
          if (!selectedRequestId) {
            return;
          }
          await loadDetail(selectedRequestId);
          await onRefresh();
        }}
      />

      <PurchaseOrderDrawer
        open={orderDrawerOpen}
        request={detail?.request ?? null}
        detail={detail}
        items={items}
        supplierLabels={resolvedSupplierLabels}
        latestOrder={latestOrder}
        createError={orderError}
        isSubmittingOrder={isSubmittingOrder}
        onClose={() => {
          setOrderDrawerOpen(false);
          setWorkbenchTab('orders');
        }}
        onCreateOrder={async (payload) => {
          await onCreateOrder(payload);
          if (selectedRequestId) {
            await loadDetail(selectedRequestId);
          }
          await onRefresh();
        }}
        onOrderCreated={() => {
          setOrderDrawerOpen(false);
          setWorkbenchTab('receipts');
        }}
      />
    </div>
  );
}
