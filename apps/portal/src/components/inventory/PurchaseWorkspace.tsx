'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@iwana/ui';
import type {
  AddSupplierQuoteDto,
  CreatePurchaseOrderDto,
  CreatePurchaseRequestDto,
  GoodsReceiptResultRecord,
  InventoryCatalogOptionRecord,
  InventoryItemRecord,
  PurchaseOrderLineRecord,
  PurchaseOrderRecord,
  PurchaseRequestDetailRecord,
  PurchaseRequestRecord,
  ReceivePurchaseOrderDto,
  StockLocationRecord,
  SupplierSummaryRecord,
} from '@/lib/api-client';
import { purchasingApi } from '@/lib/api-client';
import { PortalPanel } from '@/components/shared/portal-ui';
import { PurchaseOrderDrawer } from './PurchaseOrderDrawer';
import { PurchaseRequestComposer } from './PurchaseRequestComposer';
import { PurchaseRequestWorkbenchDrawer } from './PurchaseRequestWorkbenchDrawer';
import { PurchaseRequestsTable } from './PurchaseRequestsTable';
import { PurchaseRequestsToolbar } from './PurchaseRequestsToolbar';
import { PurchaseWorkspaceSummary } from './PurchaseWorkspaceSummary';
import {
  filterPurchaseRequests,
  kpiPresetToFilters,
  type PurchaseKpiPreset,
  type PurchaseRequestFilters,
} from './purchase-filters';
import type { PurchaseWorkbenchTab } from './purchase-workbench';

function useMinWidth(minWidth: number): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [minWidth]);

  return matches;
}

interface PurchaseWorkspaceProps {
  requests: PurchaseRequestRecord[];
  items: InventoryItemRecord[];
  catalogOptions: InventoryCatalogOptionRecord[];
  supplierLabels?: Record<string, string>;
  locations: StockLocationRecord[];
  latestOrder: PurchaseOrderRecord | null;
  latestOrderLines: PurchaseOrderLineRecord[];
  latestReceipt: GoodsReceiptResultRecord | null;
  isLoading?: boolean;
  isRefreshing?: boolean;
  isSubmittingRequest: boolean;
  isSubmittingQuote: boolean;
  isSubmittingApprove: boolean;
  isSubmittingOrder: boolean;
  isSubmittingReceipt: boolean;
  createError: string | null;
  quoteError: string | null;
  approveError: string | null;
  orderError: string | null;
  receiptError: string | null;
  onCreateRequest: (payload: CreatePurchaseRequestDto) => Promise<void>;
  onAddQuote: (requestId: string, payload: AddSupplierQuoteDto) => Promise<void>;
  onApproveRequest: (requestId: string, exceptionReason?: string) => Promise<void>;
  onCreateOrder: (payload: CreatePurchaseOrderDto) => Promise<void>;
  onReceiveOrder: (purchaseOrderId: string, payload: ReceivePurchaseOrderDto) => Promise<void>;
  onPrepareOrderDrawer: (requestId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function PurchaseWorkspace({
  requests,
  items,
  catalogOptions,
  supplierLabels = {},
  locations,
  latestOrder,
  latestOrderLines,
  latestReceipt,
  isLoading = false,
  isRefreshing = false,
  isSubmittingRequest,
  isSubmittingQuote,
  isSubmittingApprove,
  isSubmittingOrder,
  isSubmittingReceipt,
  createError,
  quoteError,
  approveError,
  orderError,
  receiptError,
  onCreateRequest,
  onAddQuote,
  onApproveRequest,
  onCreateOrder,
  onReceiveOrder,
  onPrepareOrderDrawer,
  onRefresh,
}: PurchaseWorkspaceProps) {
  const [filters, setFilters] = useState<PurchaseRequestFilters>({});
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PurchaseRequestDetailRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [supplierSummary, setSupplierSummary] = useState<SupplierSummaryRecord | null>(null);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [orderDrawerOpen, setOrderDrawerOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [workbenchTab, setWorkbenchTab] = useState<PurchaseWorkbenchTab>('summary');
  const isDesktopComposer = useMinWidth(1280);

  const filteredCount = useMemo(
    () => filterPurchaseRequests(requests, filters).length,
    [requests, filters],
  );

  async function loadDetail(requestId: string) {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await purchasingApi.getRequestDetail(requestId);
      setDetail(response);
    } catch {
      setDetailError('No fue posible cargar el detalle de la solicitud.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openWorkbench(requestId: string) {
    setSelectedRequestId(requestId);
    setWorkbenchTab('summary');
    setSupplierSummary(null);
    setSupplierError(null);
    await loadDetail(requestId);
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
    } catch {
      setSupplierError('No fue posible cargar la ficha del proveedor.');
      setSupplierSummary(null);
    } finally {
      setSupplierLoading(false);
    }
  }

  function handleKpiFilterChange(preset: PurchaseKpiPreset) {
    setFilters((current) => {
      if (current.kpiPreset === preset) {
        return {};
      }
      return kpiPresetToFilters(preset);
    });
  }

  async function handleCreateRequest(payload: CreatePurchaseRequestDto) {
    await onCreateRequest(payload);
    setComposerOpen(false);
  }

  const composer = (
    <PurchaseRequestComposer
      catalogOptions={catalogOptions}
      supplierLabels={supplierLabels}
      isSubmitting={isSubmittingRequest}
      error={createError}
      layout="embedded"
      onSubmit={handleCreateRequest}
    />
  );

  return (
    <div className="space-y-6">
      <PurchaseWorkspaceSummary
        requests={requests}
        filters={filters}
        isLoading={isLoading}
        onKpiFilterChange={handleKpiFilterChange}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {isDesktopComposer ? <div>{composer}</div> : null}

        <PortalPanel
          eyebrow="Operación"
          title="Bandeja de solicitudes"
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
              onOpenComposer={() => setComposerOpen(true)}
            />
            <PurchaseRequestsTable
              requests={requests}
              filters={filters}
              selectedRequestId={selectedRequestId}
              isLoading={isLoading}
              onSelectRequest={(requestId) => void openWorkbench(requestId)}
              onCreateRequest={() => setComposerOpen(true)}
            />
          </div>
        </PortalPanel>
      </div>

      {!isDesktopComposer ? (
        <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nueva solicitud de compra</DialogTitle>
            </DialogHeader>
            {composer}
          </DialogContent>
        </Dialog>
      ) : null}

      <PurchaseRequestWorkbenchDrawer
        open={Boolean(selectedRequestId)}
        detail={detail}
        items={items}
        locations={locations}
        latestOrder={latestOrder}
        latestOrderLines={latestOrderLines}
        latestReceipt={latestReceipt}
        activeTab={workbenchTab}
        onActiveTabChange={setWorkbenchTab}
        isLoading={detailLoading}
        error={detailError}
        supplierSummary={supplierSummary}
        supplierLoading={supplierLoading}
        supplierError={supplierError}
        isSubmittingQuote={isSubmittingQuote}
        isSubmittingApprove={isSubmittingApprove}
        isSubmittingReceipt={isSubmittingReceipt}
        quoteError={quoteError}
        approveError={approveError}
        receiptError={receiptError}
        onClose={() => setSelectedRequestId(null)}
        onAddQuote={async (payload) => {
          if (!selectedRequestId) return;
          await onAddQuote(selectedRequestId, payload);
          await loadDetail(selectedRequestId);
          await onRefresh();
        }}
        onApprove={async (exceptionReason) => {
          if (!selectedRequestId) return;
          await onApproveRequest(selectedRequestId, exceptionReason);
          await loadDetail(selectedRequestId);
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
          if (selectedRequestId) {
            await loadDetail(selectedRequestId);
          }
          await onRefresh();
        }}
      />

      <PurchaseOrderDrawer
        open={orderDrawerOpen}
        request={detail?.request ?? null}
        items={items}
        latestOrder={latestOrder}
        createError={orderError}
        isSubmittingOrder={isSubmittingOrder}
        onClose={() => setOrderDrawerOpen(false)}
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
