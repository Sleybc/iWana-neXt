'use client';

import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@iwana/ui';
import {
  PurchaseOrderStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestStatus,
} from '@iwana/shared';
import type {
  AddSupplierQuoteDto,
  CancelPurchaseRequestDto,
  CreatePurchaseRequestAwardsDto,
  GoodsReceiptResultRecord,
  InventoryItemRecord,
  PurchaseOrderLineRecord,
  PurchaseOrderRecord,
  PurchaseRequestDetailRecord,
  PurchaseRequestLineAwardInput,
  PurchaseRequestLineRecord,
  ReceivePurchaseOrderDto,
  RejectPurchaseRequestDto,
  StockLocationRecord,
  SupplierSummaryRecord,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSectionHeader,
  PortalSkeletonBlock,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryCurrency,
  formatInventoryDate,
  getPurchaseOrderStatusLabel,
  getPurchaseRequestLineSourceLabel,
  getPurchaseRequestLineStatusLabel,
  getPurchaseRequestPriorityBadgeVariant,
  getPurchaseRequestPriorityLabel,
  getPurchaseRequestStatusBadgeVariant,
  getPurchaseRequestStatusLabel,
  getPurchaseRequestTypeLabel,
  PURCHASE_CURRENCY_OPTIONS,
  type PurchaseCurrencyOption,
} from './inventory-labels';
import { AwardLinesPanel } from './AwardLinesPanel';
import { GoodsReceiptPanel } from './GoodsReceiptPanel';
import {
  getPurchaseNextAction,
  PURCHASE_WORKBENCH_TAB_LABELS,
  type PurchaseWorkbenchTab,
} from './purchase-workbench';
import { QuoteComparisonPanel } from './QuoteComparisonPanel';
import { RfqInvitationsPanel } from './RfqInvitationsPanel';
import { SupplierPicker } from './SupplierPicker';
import { SupplierSummaryCard } from './SupplierSummaryCard';

interface PurchaseRequestWorkbenchDrawerProps {
  open: boolean;
  detail: PurchaseRequestDetailRecord | null;
  items: InventoryItemRecord[];
  locations: StockLocationRecord[];
  latestOrder: PurchaseOrderRecord | null;
  latestOrderLines: PurchaseOrderLineRecord[];
  latestReceipt: GoodsReceiptResultRecord | null;
  activeTab: PurchaseWorkbenchTab;
  onActiveTabChange: (tab: PurchaseWorkbenchTab) => void;
  isLoading: boolean;
  error: string | null;
  supplierSummary: SupplierSummaryRecord | null;
  supplierLoading: boolean;
  supplierError: string | null;
  supplierLabels?: Record<string, string>;
  isSubmittingQuote: boolean;
  isSubmittingApprove: boolean;
  isSubmittingAwards: boolean;
  isSubmittingReject: boolean;
  isSubmittingCancel: boolean;
  isSubmittingReceipt: boolean;
  quoteError: string | null;
  approveError: string | null;
  awardsError: string | null;
  rejectError: string | null;
  cancelError: string | null;
  receiptError: string | null;
  onClose: () => void;
  onAddQuote: (payload: AddSupplierQuoteDto) => Promise<void>;
  onApprove: (exceptionReason?: string) => Promise<void>;
  onCreateAwards: (payload: CreatePurchaseRequestAwardsDto) => Promise<void>;
  onReject: (payload: RejectPurchaseRequestDto) => Promise<void>;
  onCancel: (payload: CancelPurchaseRequestDto) => Promise<void>;
  onLoadSupplier: (partyRefId: string) => void;
  onOpenOrderFlow: () => void;
  onReceiveOrder: (purchaseOrderId: string, payload: ReceivePurchaseOrderDto) => Promise<void>;
  onRefreshDetail: () => Promise<void>;
}

function getLineDisplayLabel(
  line: PurchaseRequestLineRecord,
  items: InventoryItemRecord[],
): string {
  if (line.freeTextDescription?.trim()) {
    return line.freeTextDescription.trim();
  }

  if (line.inventoryItemId) {
    const item = items.find((entry) => entry.id === line.inventoryItemId);
    if (item) {
      return `${item.sku} — ${item.name}`;
    }
  }

  return getPurchaseRequestLineSourceLabel(line.sourceKind);
}

function resolveOrderForReceipt(
  detail: PurchaseRequestDetailRecord | null,
  latestOrder: PurchaseOrderRecord | null,
): PurchaseOrderRecord | null {
  if (!detail?.request) {
    return null;
  }

  if (latestOrder && latestOrder.purchaseRequestId === detail.request.id) {
    return latestOrder;
  }

  return detail.orders[0] ?? null;
}

export function PurchaseRequestWorkbenchDrawer({
  open,
  detail,
  items,
  locations,
  latestOrder,
  latestOrderLines,
  latestReceipt,
  activeTab,
  onActiveTabChange,
  isLoading,
  error,
  supplierSummary,
  supplierLoading,
  supplierError,
  supplierLabels = {},
  isSubmittingQuote,
  isSubmittingApprove,
  isSubmittingAwards,
  isSubmittingReject,
  isSubmittingCancel,
  isSubmittingReceipt,
  quoteError,
  approveError,
  awardsError,
  rejectError,
  cancelError,
  receiptError,
  onClose,
  onAddQuote,
  onApprove,
  onCreateAwards,
  onReject,
  onCancel,
  onLoadSupplier,
  onOpenOrderFlow,
  onReceiveOrder,
  onRefreshDetail,
}: PurchaseRequestWorkbenchDrawerProps) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedSupplierName, setSelectedSupplierName] = useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteCurrency, setQuoteCurrency] = useState<PurchaseCurrencyOption>('COP');
  const [exceptionReason, setExceptionReason] = useState('');
  const [awardDrafts, setAwardDrafts] = useState<PurchaseRequestLineAwardInput[]>([]);
  const [resolutionMode, setResolutionMode] = useState<'reject' | 'cancel' | null>(null);
  const [resolutionReason, setResolutionReason] = useState('');

  useEffect(() => {
    if (!open) {
      setSelectedSupplierId(null);
      setSelectedSupplierName(null);
      setQuoteNumber('');
      setQuoteAmount('');
      setQuoteCurrency('COP');
      setExceptionReason('');
      setAwardDrafts([]);
      setResolutionMode(null);
      setResolutionReason('');
    }
  }, [open]);

  const request = detail?.request;
  const nextAction = getPurchaseNextAction(detail);
  const canAddQuote = request?.status === PurchaseRequestStatus.PENDING_QUOTES;
  const canApprove =
    request &&
    [PurchaseRequestStatus.PENDING_APPROVAL, PurchaseRequestStatus.PENDING_QUOTES].includes(
      request.status,
    );
  const canReject =
    request &&
    [PurchaseRequestStatus.PENDING_QUOTES, PurchaseRequestStatus.PENDING_APPROVAL].includes(
      request.status,
    );
  const canCancel =
    request &&
    ![
      PurchaseRequestStatus.REJECTED,
      PurchaseRequestStatus.CANCELLED,
      PurchaseRequestStatus.CONVERTED_TO_PO,
    ].includes(request.status);
  const quoteAmountTouched = quoteAmount.trim().length > 0;
  const parsedQuoteAmount = quoteAmountTouched ? Number(quoteAmount) : NaN;
  const quoteAmountValid = Number.isFinite(parsedQuoteAmount) && parsedQuoteAmount > 0;
  const canCreateOrder = request?.status === PurchaseRequestStatus.APPROVED;
  const exceptionReady = exceptionReason.trim().length >= 20;
  const canSubmitApproval =
    detail?.approvalPolicy.canApprove === true ||
    (detail?.approvalPolicy.requiresException === true && exceptionReady);
  const orderForReceipt = resolveOrderForReceipt(detail, latestOrder);
  const resolutionMinLength = resolutionMode === 'reject' ? 10 : 5;
  const resolutionReady = resolutionReason.trim().length >= resolutionMinLength;
  const isResolving = isSubmittingReject || isSubmittingCancel;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden p-0">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-dark-border">
          <DialogHeader>
            <DialogTitle>Trabajar solicitud</DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? <PortalSkeletonBlock className="h-48 rounded-2xl" /> : null}
          {error ? (
            <PortalAlert
              variant="error"
              title="No se pudo cargar la solicitud"
              description={error}
            />
          ) : null}

          {request && !isLoading ? (
            <div className="space-y-4">
              {nextAction ? (
                <PortalAlert
                  variant={nextAction.terminal ? 'success' : 'info'}
                  title={
                    nextAction.terminal ? 'Estado de la solicitud' : 'Siguiente acción recomendada'
                  }
                  description={nextAction.message}
                  action={
                    nextAction.terminal ? undefined : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onActiveTabChange(nextAction.suggestedTab)}
                      >
                        Ir a {PURCHASE_WORKBENCH_TAB_LABELS[nextAction.suggestedTab].toLowerCase()}
                      </Button>
                    )
                  }
                />
              ) : null}

              <Tabs
                value={activeTab}
                onValueChange={(value) => onActiveTabChange(value as PurchaseWorkbenchTab)}
              >
                <div className="overflow-x-auto pb-1">
                  <TabsList className="inline-flex min-w-full w-max gap-1">
                    {(Object.keys(PURCHASE_WORKBENCH_TAB_LABELS) as PurchaseWorkbenchTab[]).map(
                      (tab) => (
                        <TabsTrigger key={tab} value={tab}>
                          {PURCHASE_WORKBENCH_TAB_LABELS[tab]}
                        </TabsTrigger>
                      ),
                    )}
                  </TabsList>
                </div>

                <TabsContent value="summary" className="mt-4 space-y-4">
                  <PortalSectionHeader
                    eyebrow="Resumen"
                    title={request.title}
                    description={request.requestNumber}
                  />
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-iwana-secondary-700">Tipo de compra</dt>
                      <dd className="mt-1">{getPurchaseRequestTypeLabel(request.requestType)}</dd>
                    </div>
                    <div>
                      <dt className="text-iwana-secondary-700">Prioridad</dt>
                      <dd className="mt-1">
                        <Badge variant={getPurchaseRequestPriorityBadgeVariant(request.priority)}>
                          {getPurchaseRequestPriorityLabel(request.priority)}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-iwana-secondary-700">Estado</dt>
                      <dd className="mt-1">
                        <Badge variant={getPurchaseRequestStatusBadgeVariant(request.status)}>
                          {getPurchaseRequestStatusLabel(request.status)}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-iwana-secondary-700">Fecha requerida</dt>
                      <dd className="mt-1">{formatInventoryDate(request.neededByDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-iwana-secondary-700">Monto estimado</dt>
                      <dd className="mt-1">
                        {formatInventoryCurrency(detail?.estimatedAmount ?? 0)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-iwana-secondary-700">Política</dt>
                      <dd className="mt-1">
                        {detail?.approvalPolicy.canApprove
                          ? 'Lista para aprobación'
                          : (detail?.approvalPolicy.blockingReason ?? 'Pendiente de requisitos')}
                      </dd>
                    </div>
                  </dl>
                </TabsContent>

                <TabsContent value="lines" className="mt-4 space-y-3">
                  <PortalSectionHeader eyebrow="Líneas" title="Necesidades abastecibles" />
                  <div className="space-y-2">
                    {detail?.lines.map((line) => (
                      <div
                        key={line.id}
                        className="rounded-2xl border border-gray-200 p-3 text-sm dark:border-dark-border"
                      >
                        <p className="font-medium text-gray-900 dark:text-white">
                          {getLineDisplayLabel(line, items)}
                        </p>
                        <p className="mt-1 text-gray-600 dark:text-gray-300">
                          {line.quantityRequested} {line.unitOfMeasure} ·{' '}
                          {getPurchaseRequestLineStatusLabel(line.lineStatus)}
                        </p>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="rfq" className="mt-4 space-y-4">
                  {request ? (
                    <RfqInvitationsPanel
                      purchaseRequestId={request.id}
                      requestStatus={request.status}
                      rfqDetail={detail?.rfq ?? null}
                      onRefresh={onRefreshDetail}
                    />
                  ) : null}
                </TabsContent>

                <TabsContent value="quotes" className="mt-4 space-y-4">
                  <PortalSectionHeader eyebrow="Cotizaciones" title="Comparación de ofertas" />
                  <QuoteComparisonPanel quotes={detail?.quotes ?? []} />
                  {canAddQuote ? (
                    <section className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
                      <PortalSectionHeader eyebrow="Registrar" title="Nueva oferta" />
                      {quoteError ? (
                        <PortalAlert
                          variant="error"
                          title="Error al registrar cotización"
                          description={quoteError}
                        />
                      ) : null}
                      <div className="grid gap-3 md:grid-cols-2">
                        <SupplierPicker
                          label="Proveedor de la cotización"
                          value={selectedSupplierId}
                          selectedLabel={selectedSupplierName}
                          onChange={(partyRefId, displayName) => {
                            setSelectedSupplierId(partyRefId);
                            setSelectedSupplierName(displayName);
                          }}
                          onPreview={onLoadSupplier}
                        />
                        <Input
                          id="quote-number"
                          label="Número de cotización"
                          value={quoteNumber}
                          onChange={(e) => setQuoteNumber(e.target.value)}
                        />
                        <Input
                          id="quote-amount"
                          label="Monto"
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          step="0.01"
                          value={quoteAmount}
                          onChange={(e) => setQuoteAmount(e.target.value)}
                          error={
                            quoteAmountTouched && !quoteAmountValid
                              ? 'Ingresa un monto válido mayor a cero.'
                              : undefined
                          }
                        />
                        <Select
                          label="Moneda"
                          value={quoteCurrency}
                          onChange={(event) =>
                            setQuoteCurrency(event.target.value as PurchaseCurrencyOption)
                          }
                        >
                          {PURCHASE_CURRENCY_OPTIONS.map((currency) => (
                            <option key={currency} value={currency}>
                              {currency}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </section>
                  ) : null}
                  <SupplierSummaryCard
                    summary={supplierSummary}
                    isLoading={supplierLoading}
                    error={supplierError}
                  />
                </TabsContent>

                <TabsContent value="approval" className="mt-4 space-y-3">
                  <PortalSectionHeader eyebrow="Aprobación" title="Autorizar solicitud" />
                  {approveError ? (
                    <PortalAlert
                      variant="error"
                      title="No se pudo aprobar"
                      description={approveError}
                    />
                  ) : null}
                  {!canApprove ? (
                    <PortalEmptyState
                      title="Aprobación no disponible"
                      description="La solicitud aún no está lista para autorización en esta etapa."
                    />
                  ) : (
                    <>
                      {detail?.approvalPolicy.requiresException ? (
                        <label className="block space-y-1 text-sm">
                          <span className="font-medium text-gray-900 dark:text-white">
                            Motivo de excepción
                          </span>
                          <textarea
                            aria-label="Motivo de excepción"
                            className={cn(
                              'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white',
                              interactiveFocusClassName,
                            )}
                            rows={3}
                            placeholder="Motivo de excepción auditada"
                            value={exceptionReason}
                            onChange={(e) => setExceptionReason(e.target.value)}
                          />
                        </label>
                      ) : null}
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {detail?.approvalPolicy.canApprove
                          ? 'La solicitud cumple la política vigente.'
                          : detail?.approvalPolicy.blockingReason}
                      </p>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="awards" className="mt-4 space-y-3">
                  {detail ? (
                    <AwardLinesPanel
                      detail={detail}
                      items={items}
                      supplierLabels={supplierLabels}
                      disabled={isSubmittingAwards}
                      error={awardsError}
                      onDraftsChange={setAwardDrafts}
                    />
                  ) : null}
                </TabsContent>

                <TabsContent value="orders" className="mt-4 space-y-3">
                  <PortalSectionHeader eyebrow="Órdenes" title="Órdenes de compra derivadas" />
                  {detail?.orders.length ? (
                    <div className="space-y-2">
                      {detail.orders.map((order) => (
                        <div
                          key={order.id}
                          className="rounded-2xl border border-gray-200 p-3 text-sm dark:border-dark-border"
                        >
                          <p className="font-medium text-gray-900 dark:text-white">
                            {order.orderNumber}
                          </p>
                          <p className="mt-1 text-gray-600 dark:text-gray-300">
                            {getPurchaseOrderStatusLabel(order.status)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <PortalEmptyState
                      title="Sin órdenes de compra"
                      description="Genera una orden de compra cuando la solicitud esté aprobada."
                    />
                  )}
                </TabsContent>

                <TabsContent value="receipts" className="mt-4 space-y-4">
                  <PortalSectionHeader
                    eyebrow="Recepciones"
                    title="Mercancía recibida"
                    description="Registra cantidades recibidas contra la orden de compra activa."
                  />
                  <GoodsReceiptPanel
                    variant="embedded"
                    order={orderForReceipt}
                    orderLines={latestOrderLines}
                    items={items}
                    locations={locations}
                    isSubmitting={isSubmittingReceipt}
                    error={receiptError}
                    lastReceipt={latestReceipt}
                    onSubmit={(payload) =>
                      orderForReceipt
                        ? onReceiveOrder(orderForReceipt.id, payload)
                        : Promise.resolve()
                    }
                  />
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </div>

        {request && !isLoading ? (
          <div className="space-y-3 border-t border-gray-200 bg-iwana-surface-soft px-6 py-4 dark:border-dark-border dark:bg-dark-surface-3">
            {resolutionMode ? (
              <div className="space-y-3">
                {(resolutionMode === 'reject' ? rejectError : cancelError) ? (
                  <PortalAlert
                    variant="error"
                    title={
                      resolutionMode === 'reject' ? 'No se pudo rechazar' : 'No se pudo cancelar'
                    }
                    description={resolutionMode === 'reject' ? rejectError : cancelError}
                  />
                ) : null}
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {resolutionMode === 'reject' ? 'Motivo del rechazo' : 'Motivo de cancelación'}
                  </span>
                  <textarea
                    aria-label={
                      resolutionMode === 'reject' ? 'Motivo del rechazo' : 'Motivo de cancelación'
                    }
                    className={cn(
                      'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white',
                      interactiveFocusClassName,
                    )}
                    rows={3}
                    placeholder={
                      resolutionMode === 'reject'
                        ? 'Describe el motivo (mínimo 10 caracteres)'
                        : 'Describe el motivo (mínimo 5 caracteres)'
                    }
                    value={resolutionReason}
                    onChange={(event) => setResolutionReason(event.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isResolving}
                    onClick={() => {
                      setResolutionMode(null);
                      setResolutionReason('');
                    }}
                  >
                    Volver
                  </Button>
                  <Button
                    type="button"
                    disabled={isResolving || !resolutionReady}
                    onClick={() => {
                      const payload = { reason: resolutionReason.trim() };
                      if (resolutionMode === 'reject') {
                        void onReject(payload);
                      } else {
                        void onCancel(payload);
                      }
                    }}
                  >
                    {resolutionMode === 'reject' ? 'Confirmar rechazo' : 'Confirmar cancelación'}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {activeTab === 'quotes' && canAddQuote ? (
                    <Button
                      type="button"
                      disabled={isSubmittingQuote || !selectedSupplierId || !quoteAmountValid}
                      onClick={() =>
                        void onAddQuote({
                          partyRefId: selectedSupplierId ?? '',
                          quoteNumber,
                          amount: parsedQuoteAmount,
                          currency: quoteCurrency,
                        })
                      }
                    >
                      Registrar cotización
                    </Button>
                  ) : null}
                  {activeTab === 'approval' && canApprove ? (
                    <Button
                      type="button"
                      disabled={isSubmittingApprove || !canSubmitApproval}
                      onClick={() => void onApprove(exceptionReason || undefined)}
                    >
                      Aprobar solicitud
                    </Button>
                  ) : null}
                  {activeTab === 'awards' && awardDrafts.length > 0 ? (
                    <Button
                      type="button"
                      disabled={isSubmittingAwards}
                      onClick={() => void onCreateAwards({ awards: awardDrafts })}
                    >
                      Adjudicar líneas
                    </Button>
                  ) : null}
                  {activeTab === 'orders' && canCreateOrder ? (
                    <Button type="button" onClick={onOpenOrderFlow}>
                      Generar orden de compra
                    </Button>
                  ) : null}
                  {canReject ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isResolving}
                      onClick={() => setResolutionMode('reject')}
                    >
                      Rechazar
                    </Button>
                  ) : null}
                  {canCancel ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isResolving}
                      onClick={() => setResolutionMode('cancel')}
                    >
                      Cancelar solicitud
                    </Button>
                  ) : null}
                </div>
                {activeTab === 'receipts' &&
                orderForReceipt &&
                (orderForReceipt.status === PurchaseOrderStatus.APPROVED ||
                  orderForReceipt.status === PurchaseOrderStatus.PARTIALLY_RECEIVED) ? (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Usa el formulario de recepción para registrar cantidades recibidas.
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
