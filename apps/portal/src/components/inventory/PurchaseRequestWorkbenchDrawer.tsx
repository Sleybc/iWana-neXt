'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
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
  PurchaseRfqStatus,
} from '@iwana/shared';
import type {
  AddSupplierQuoteDto,
  CancelPurchaseOrderDto,
  CancelPurchaseRequestDto,
  CreatePurchaseRequestAwardsDto,
  CreatePurchaseRequestLineDto,
  GoodsReceiptResultRecord,
  InventoryCatalogOptionRecord,
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
  portalTextareaClassName,
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
  getSupplierDisplayLabel,
  PURCHASE_CURRENCY_OPTIONS,
  type PurchaseCurrencyOption,
} from './inventory-labels';
import { ApprovalDecisionPanel } from './ApprovalDecisionPanel';
import { AwardLinesPanel } from './AwardLinesPanel';
import { GoodsReceiptPanel } from './GoodsReceiptPanel';
import { PurchaseLinesEditor } from './PurchaseLinesEditor';
import { purchaseRequestLinesToDraft, type PurchaseDraftState } from './purchase-request-draft';
import { mapDraftLinesToUpdatePayload } from './purchase-request-submit';
import {
  canVisitPurchaseWorkbenchPhase,
  getCotizarPrimarySection,
  getPurchaseNextAction,
  getPurchaseNextActionCtaLabel,
  getPurchaseWorkbenchPhase,
  PURCHASE_WORKBENCH_PHASE_LABELS,
  PURCHASE_WORKBENCH_PHASE_ORDER,
  PURCHASE_WORKBENCH_PHASE_TABS,
  PURCHASE_WORKBENCH_TAB_LABELS,
  resolveTabForPurchaseWorkbenchPhase,
  type PurchaseWorkbenchPhase,
  type PurchaseWorkbenchTab,
} from './purchase-workbench';
import { QuoteComparisonPanel } from './QuoteComparisonPanel';
import { RfqInvitationsPanel } from './RfqInvitationsPanel';
import {
  buildQuoteLinesPayload,
  type QuoteLineUnitCostMap,
  SupplierQuoteLinesEditor,
} from './SupplierQuoteLinesEditor';
import {
  QuoteShippingFields,
  resolveShippingCost,
  type QuoteShippingValue,
} from './QuoteShippingFields';
import { SupplierPicker } from './SupplierPicker';
import { SupplierSummaryCard } from './SupplierSummaryCard';

interface PurchaseRequestWorkbenchDrawerProps {
  open: boolean;
  detail: PurchaseRequestDetailRecord | null;
  items: InventoryItemRecord[];
  catalogOptions: InventoryCatalogOptionRecord[];
  isCatalogSearching?: boolean;
  onCatalogSearch?: (search: string) => void;
  isSubmittingUpdateLines: boolean;
  updateLinesError: string | null;
  onUpdateLines: (payload: { lines: CreatePurchaseRequestLineDto[] }) => Promise<{ ok: boolean }>;
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
  isSubmittingApproveOrder: boolean;
  isSubmittingCancelOrder: boolean;
  isSubmittingCloseOrder: boolean;
  quoteError: string | null;
  approveError: string | null;
  awardsError: string | null;
  rejectError: string | null;
  cancelError: string | null;
  receiptError: string | null;
  approveOrderError: string | null;
  cancelOrderError: string | null;
  closeOrderError: string | null;
  onClose: () => void;
  onAddQuote: (payload: AddSupplierQuoteDto) => Promise<void>;
  onApprove: (payload?: { exceptionReason?: string; notes?: string }) => Promise<void>;
  onCreateAwards: (payload: CreatePurchaseRequestAwardsDto) => Promise<void>;
  onReject: (payload: RejectPurchaseRequestDto) => Promise<void>;
  onCancel: (payload: CancelPurchaseRequestDto) => Promise<void>;
  onLoadSupplier: (partyRefId: string) => void;
  onOpenOrderFlow: () => void;
  onReceiveOrder: (purchaseOrderId: string, payload: ReceivePurchaseOrderDto) => Promise<void>;
  onSelectOrder: (orderId: string) => Promise<void>;
  onRefreshDetail: () => Promise<void>;
  onEditRequest: () => void;
  onApproveOrder: (orderId: string) => Promise<void>;
  onCancelOrder: (orderId: string, payload: CancelPurchaseOrderDto) => Promise<void>;
  onCloseOrder: (orderId: string) => Promise<void>;
}

function isOrderReceivable(status: PurchaseOrderStatus): boolean {
  return [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED].includes(status);
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

function CotizarDisclosureSection({
  title,
  description,
  expanded,
  ariaLabel,
  children,
  plainExpanded = false,
}: {
  title: string;
  description?: string;
  expanded: boolean;
  ariaLabel: string;
  children: ReactNode;
  /** Cuando el panel hijo ya trae cabecera propia. */
  plainExpanded?: boolean;
}) {
  if (expanded) {
    return (
      <section className="space-y-4" aria-label={ariaLabel}>
        {!plainExpanded ? (
          <PortalSectionHeader title={title} {...(description ? { description } : {})} />
        ) : null}
        {children}
      </section>
    );
  }

  return (
    <details className="group rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary',
        )}
      >
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
          {description ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
          ) : null}
        </div>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-iwana-primary transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-4 space-y-4" aria-label={ariaLabel}>
        {children}
      </div>
    </details>
  );
}

function resolveOrderForReceipt(
  detail: PurchaseRequestDetailRecord | null,
  latestOrder: PurchaseOrderRecord | null,
): PurchaseOrderRecord | null {
  if (!detail?.request) {
    return null;
  }

  const fromDetail =
    detail.orders.find((order) => isOrderReceivable(order.status)) ?? detail.orders[0] ?? null;

  const base =
    latestOrder && latestOrder.purchaseRequestId === detail.request.id ? latestOrder : fromDetail;

  if (!base) {
    return null;
  }

  const matchingDetailOrder = detail.orders.find((order) => order.id === base.id) ?? fromDetail;
  const candidates = [
    base.expectedDeliveryDate,
    matchingDetailOrder?.expectedDeliveryDate,
    detail.request.neededByDate,
  ];
  const expectedDeliveryDate =
    candidates.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ??
    null;

  return {
    ...base,
    expectedDeliveryDate,
  };
}

export function PurchaseRequestWorkbenchDrawer({
  open,
  detail,
  items,
  catalogOptions,
  isCatalogSearching = false,
  onCatalogSearch,
  isSubmittingUpdateLines,
  updateLinesError,
  onUpdateLines,
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
  isSubmittingApproveOrder,
  isSubmittingCancelOrder,
  isSubmittingCloseOrder,
  quoteError,
  approveError,
  awardsError,
  rejectError,
  cancelError,
  receiptError,
  approveOrderError,
  cancelOrderError,
  closeOrderError,
  onClose,
  onAddQuote,
  onApprove,
  onCreateAwards,
  onReject,
  onCancel,
  onLoadSupplier,
  onOpenOrderFlow,
  onReceiveOrder,
  onSelectOrder,
  onRefreshDetail,
  onEditRequest,
  onApproveOrder,
  onCancelOrder,
  onCloseOrder,
}: PurchaseRequestWorkbenchDrawerProps) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedSupplierName, setSelectedSupplierName] = useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteUnitCosts, setQuoteUnitCosts] = useState<QuoteLineUnitCostMap>({});
  const [quoteShipping, setQuoteShipping] = useState<QuoteShippingValue>({
    isFree: false,
    amount: '',
  });
  const [quoteCurrency, setQuoteCurrency] = useState<PurchaseCurrencyOption>('COP');
  const [exceptionReason, setExceptionReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [awardDrafts, setAwardDrafts] = useState<PurchaseRequestLineAwardInput[]>([]);
  const [resolutionMode, setResolutionMode] = useState<'reject' | 'cancel' | null>(null);
  const [resolutionReason, setResolutionReason] = useState('');
  const [cancelOrderMode, setCancelOrderMode] = useState<string | null>(null);
  const [cancelOrderReason, setCancelOrderReason] = useState('');
  const [isEditingLines, setIsEditingLines] = useState(false);
  const [linesDraft, setLinesDraft] = useState<PurchaseDraftState | null>(null);
  const [linesValidationError, setLinesValidationError] = useState<string | null>(null);
  const [discardLinesConfirmOpen, setDiscardLinesConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedSupplierId(null);
      setSelectedSupplierName(null);
      setQuoteNumber('');
      setQuoteAmount('');
      setQuoteUnitCosts({});
      setQuoteShipping({ isFree: false, amount: '' });
      setQuoteCurrency('COP');
      setExceptionReason('');
      setApprovalNotes('');
      setAwardDrafts([]);
      setResolutionMode(null);
      setResolutionReason('');
      setCancelOrderMode(null);
      setCancelOrderReason('');
      setIsEditingLines(false);
      setLinesDraft(null);
      setLinesValidationError(null);
      setDiscardLinesConfirmOpen(false);
    }
  }, [open]);

  useEffect(() => {
    setIsEditingLines(false);
    setLinesDraft(null);
    setLinesValidationError(null);
  }, [detail?.request.id]);

  const request = detail?.request;
  const nextAction = getPurchaseNextAction(detail);
  const activePhase = getPurchaseWorkbenchPhase(activeTab);
  const phaseTabs = PURCHASE_WORKBENCH_PHASE_TABS[activePhase];
  const hasActiveRfq = Boolean(
    detail?.rfq &&
    [PurchaseRfqStatus.DRAFT, PurchaseRfqStatus.SENT, PurchaseRfqStatus.RECEIVING].includes(
      detail.rfq.rfq.status as PurchaseRfqStatus,
    ),
  );
  const canAddQuote =
    request &&
    [PurchaseRequestStatus.PENDING_QUOTES, PurchaseRequestStatus.DRAFT].includes(request.status) &&
    !hasActiveRfq;
  const blockedByActiveRfq = Boolean(
    request &&
    [PurchaseRequestStatus.PENDING_QUOTES, PurchaseRequestStatus.DRAFT].includes(request.status) &&
    hasActiveRfq,
  );
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
  const requestLines = detail?.lines ?? [];
  const usesQuoteLines = requestLines.length > 0;
  const quoteLinesPayload = buildQuoteLinesPayload(quoteUnitCosts, requestLines);
  const quoteAmountTouched = quoteAmount.trim().length > 0;
  const parsedQuoteAmount = quoteAmountTouched ? Number(quoteAmount) : NaN;
  const quoteAmountValid = Number.isFinite(parsedQuoteAmount) && parsedQuoteAmount > 0;
  const resolvedShippingCost = resolveShippingCost(quoteShipping);
  const quoteFormValid =
    (usesQuoteLines ? quoteLinesPayload.length > 0 : quoteAmountValid) &&
    resolvedShippingCost !== null;
  const itemLabelsById = Object.fromEntries(
    items.map((item) => [item.id, item.name?.trim() || item.sku]),
  );
  const canCreateOrder = request?.status === PurchaseRequestStatus.APPROVED;
  const canEditRequest =
    request &&
    [PurchaseRequestStatus.DRAFT, PurchaseRequestStatus.PENDING_QUOTES].includes(request.status) &&
    (detail?.quotes.length ?? 0) === 0 &&
    (detail?.awards.length ?? 0) === 0;
  const exceptionReady = exceptionReason.trim().length >= 20;
  const canSubmitApproval =
    detail?.approvalPolicy.canApprove === true ||
    (detail?.approvalPolicy.requiresException === true && exceptionReady);
  const orderForReceipt = resolveOrderForReceipt(detail, latestOrder);
  const resolutionMinLength = resolutionMode === 'reject' ? 10 : 5;
  const resolutionReady = resolutionReason.trim().length >= resolutionMinLength;
  const isResolving = isSubmittingReject || isSubmittingCancel;

  function handleStartEditingLines() {
    if (!detail) return;
    setLinesDraft(purchaseRequestLinesToDraft(detail.lines, supplierLabels, catalogOptions));
    setLinesValidationError(null);
    setIsEditingLines(true);
  }

  function handleCancelEditingLines() {
    if (linesDraft && linesDraft.lines.length > 0) {
      setDiscardLinesConfirmOpen(true);
      return;
    }

    setIsEditingLines(false);
    setLinesDraft(null);
    setLinesValidationError(null);
  }

  function confirmDiscardLines() {
    setIsEditingLines(false);
    setLinesDraft(null);
    setLinesValidationError(null);
    setDiscardLinesConfirmOpen(false);
  }

  function handleNextActionCta() {
    if (!nextAction || nextAction.terminal) {
      return;
    }
    if (nextAction.suggestedTab === 'orders' && canCreateOrder) {
      onOpenOrderFlow();
      return;
    }
    onActiveTabChange(nextAction.suggestedTab);
  }

  function handlePhaseChange(phase: PurchaseWorkbenchPhase) {
    if (!canVisitPurchaseWorkbenchPhase(phase, detail)) {
      return;
    }
    onActiveTabChange(resolveTabForPurchaseWorkbenchPhase(phase, detail, activeTab));
  }

  const cotizarPrimary = getCotizarPrimarySection({
    hasActiveRfq,
    quotesCount: detail?.quotes.length ?? 0,
    canAddQuote: Boolean(canAddQuote),
  });
  // Solo mostrar «Ronda» si existe o se puede crear (DRAFT). Evita accordion vacío «sin ronda formal».
  const showRondaSection = Boolean(detail?.rfq) || request?.status === PurchaseRequestStatus.DRAFT;

  async function handleSaveLines() {
    if (!linesDraft || linesDraft.lines.length === 0) {
      setLinesValidationError('La solicitud debe tener al menos una línea.');
      return;
    }

    setLinesValidationError(null);
    const result = await onUpdateLines({ lines: mapDraftLinesToUpdatePayload(linesDraft.lines) });
    if (result.ok) {
      setIsEditingLines(false);
      setLinesDraft(null);
    }
  }

  return (
    <>
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
                      nextAction.terminal
                        ? 'Estado de la solicitud'
                        : 'Siguiente acción recomendada'
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
                          Ir a{' '}
                          {PURCHASE_WORKBENCH_TAB_LABELS[nextAction.suggestedTab].toLowerCase()}
                        </Button>
                      )
                    }
                  />
                ) : null}

                <nav aria-label="Fase del flujo" className="overflow-x-auto pb-1">
                  <div className="inline-flex min-w-full w-max gap-1 rounded-xl bg-gray-100/80 p-1 dark:bg-dark-surface-3">
                    {PURCHASE_WORKBENCH_PHASE_ORDER.map((phase) => {
                      const enabled = canVisitPurchaseWorkbenchPhase(phase, detail);
                      const isActive = phase === activePhase;
                      return (
                        <button
                          key={phase}
                          type="button"
                          disabled={!enabled}
                          aria-current={isActive ? 'step' : undefined}
                          onClick={() => handlePhaseChange(phase)}
                          className={cn(
                            'relative inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary',
                            'disabled:cursor-not-allowed disabled:opacity-45',
                            isActive
                              ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-surface-2 dark:text-white'
                              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                          )}
                        >
                          {PURCHASE_WORKBENCH_PHASE_LABELS[phase]}
                        </button>
                      );
                    })}
                  </div>
                </nav>

                <Tabs
                  value={activeTab}
                  onValueChange={(value) => onActiveTabChange(value as PurchaseWorkbenchTab)}
                >
                  <div className="overflow-x-auto pb-1">
                    <TabsList
                      aria-label={`Sección ${PURCHASE_WORKBENCH_PHASE_LABELS[activePhase]}`}
                      className="inline-flex min-w-full w-max gap-1"
                    >
                      {phaseTabs.map((tab) => (
                        <TabsTrigger key={tab} value={tab}>
                          {PURCHASE_WORKBENCH_TAB_LABELS[tab]}
                        </TabsTrigger>
                      ))}
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
                        <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">
                          Tipo de compra
                        </dt>
                        <dd className="mt-1">{getPurchaseRequestTypeLabel(request.requestType)}</dd>
                      </div>
                      <div>
                        <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">
                          Prioridad
                        </dt>
                        <dd className="mt-1">
                          <Badge variant={getPurchaseRequestPriorityBadgeVariant(request.priority)}>
                            {getPurchaseRequestPriorityLabel(request.priority)}
                          </Badge>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">
                          Estado
                        </dt>
                        <dd className="mt-1">
                          <Badge variant={getPurchaseRequestStatusBadgeVariant(request.status)}>
                            {getPurchaseRequestStatusLabel(request.status)}
                          </Badge>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">
                          Fecha requerida
                        </dt>
                        <dd className="mt-1">{formatInventoryDate(request.neededByDate)}</dd>
                      </div>
                      <div>
                        <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">
                          Monto estimado
                        </dt>
                        <dd className="mt-1 tabular-nums">
                          {formatInventoryCurrency(detail?.estimatedAmount ?? 0)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">
                          Política
                        </dt>
                        <dd className="mt-1">
                          {detail?.approvalPolicy.canApprove
                            ? 'Lista para aprobación'
                            : (detail?.approvalPolicy.blockingReason ?? 'Pendiente de requisitos')}
                        </dd>
                      </div>
                    </dl>
                  </TabsContent>

                  <TabsContent value="lines" className="mt-4 space-y-3">
                    {isEditingLines && linesDraft ? (
                      <div className="space-y-4">
                        <PortalSectionHeader
                          eyebrow="Líneas"
                          title="Editar líneas"
                          description="Agrega, ajusta o quita productos sin salir de esta solicitud."
                        />
                        {linesValidationError || updateLinesError ? (
                          <PortalAlert
                            variant="error"
                            title="No se pudieron guardar las líneas"
                            description={linesValidationError ?? updateLinesError ?? ''}
                          />
                        ) : null}
                        <PurchaseLinesEditor
                          draft={linesDraft}
                          onDraftChange={(updater) =>
                            setLinesDraft((current) => (current ? updater(current) : current))
                          }
                          catalogOptions={catalogOptions}
                          supplierLabels={supplierLabels}
                          isCatalogSearching={isCatalogSearching}
                          isSubmitting={isSubmittingUpdateLines}
                          {...(onCatalogSearch ? { onCatalogSearch } : {})}
                        />
                        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4 dark:border-dark-border">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleCancelEditingLines}
                            disabled={isSubmittingUpdateLines}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            onClick={() => void handleSaveLines()}
                            loading={isSubmittingUpdateLines}
                          >
                            Guardar cambios
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <PortalSectionHeader
                          eyebrow="Líneas"
                          title="Necesidades abastecibles"
                          actions={
                            canEditRequest ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={handleStartEditingLines}
                              >
                                Editar líneas
                              </Button>
                            ) : undefined
                          }
                        />
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
                      </>
                    )}
                  </TabsContent>

                  <TabsContent value="cotizar" className="mt-4 space-y-4">
                    {showRondaSection ? (
                      <CotizarDisclosureSection
                        title="Ronda de cotización"
                        description="Invita proveedores y registra respuestas de la ronda."
                        expanded={cotizarPrimary === 'invitations'}
                        plainExpanded
                        ariaLabel="Invitar proveedores"
                      >
                        {request ? (
                          <RfqInvitationsPanel
                            purchaseRequestId={request.id}
                            requestStatus={request.status}
                            rfqDetail={detail?.rfq ?? null}
                            quotes={detail?.quotes ?? []}
                            requestLines={detail?.lines ?? []}
                            onRefresh={onRefreshDetail}
                          />
                        ) : null}
                      </CotizarDisclosureSection>
                    ) : null}

                    <CotizarDisclosureSection
                      title="Comparación de cotizaciones"
                      description="Compara montos y totales con envío."
                      expanded={cotizarPrimary === 'comparison'}
                      ariaLabel="Cotizaciones"
                    >
                      <QuoteComparisonPanel
                        quotes={detail?.quotes ?? []}
                        supplierLabels={supplierLabels}
                      />
                    </CotizarDisclosureSection>

                    {blockedByActiveRfq ? (
                      <PortalAlert
                        variant="info"
                        title="Cotización manual no disponible"
                        description="Hay una ronda de cotización activa. Registra la cotización desde la invitación correspondiente en «Ronda de cotización», o cierra la ronda primero."
                      />
                    ) : null}

                    {canAddQuote ? (
                      <CotizarDisclosureSection
                        title="Nueva cotización"
                        description="Registra una cotización sin ronda formal."
                        expanded={cotizarPrimary === 'manual'}
                        ariaLabel="Nueva cotización"
                      >
                        <div className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
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
                            {!usesQuoteLines ? (
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
                            ) : null}
                          </div>
                          {usesQuoteLines ? (
                            <SupplierQuoteLinesEditor
                              requestLines={requestLines}
                              value={quoteUnitCosts}
                              onChange={setQuoteUnitCosts}
                              disabled={isSubmittingQuote}
                              itemLabelsById={itemLabelsById}
                            />
                          ) : null}
                          <QuoteShippingFields
                            value={quoteShipping}
                            onChange={setQuoteShipping}
                            disabled={isSubmittingQuote}
                          />
                        </div>
                        {supplierSummary || supplierLoading || supplierError ? (
                          <SupplierSummaryCard
                            summary={supplierSummary}
                            isLoading={supplierLoading}
                            error={supplierError}
                          />
                        ) : null}
                      </CotizarDisclosureSection>
                    ) : null}

                    {!canAddQuote &&
                    !blockedByActiveRfq &&
                    (supplierSummary || supplierLoading || supplierError) ? (
                      <SupplierSummaryCard
                        summary={supplierSummary}
                        isLoading={supplierLoading}
                        error={supplierError}
                      />
                    ) : null}
                  </TabsContent>

                  <TabsContent value="approval" className="mt-4 space-y-3">
                    {detail ? (
                      <ApprovalDecisionPanel
                        detail={detail}
                        exceptionReason={exceptionReason}
                        onExceptionReasonChange={setExceptionReason}
                        approvalNotes={approvalNotes}
                        onApprovalNotesChange={setApprovalNotes}
                        approveError={approveError}
                        canApproveNow={Boolean(canApprove)}
                        supplierLabels={supplierLabels}
                      />
                    ) : (
                      <PortalEmptyState
                        title="Aprobación no disponible"
                        description="Carga el detalle de la solicitud para revisar la autorización."
                      />
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
                    {cancelOrderMode ? (
                      <div className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
                        {cancelOrderError ? (
                          <PortalAlert
                            variant="error"
                            title="No se pudo cancelar"
                            description={cancelOrderError}
                          />
                        ) : null}
                        <label className="block space-y-1 text-sm">
                          <span className="font-medium text-gray-900 dark:text-white">
                            Motivo de cancelación de la orden
                          </span>
                          <textarea
                            aria-label="Motivo de cancelación de la orden"
                            className={portalTextareaClassName}
                            rows={3}
                            placeholder="Describe el motivo (mínimo 5 caracteres)"
                            value={cancelOrderReason}
                            onChange={(e) => setCancelOrderReason(e.target.value)}
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={isSubmittingCancelOrder}
                            onClick={() => {
                              setCancelOrderMode(null);
                              setCancelOrderReason('');
                            }}
                          >
                            Volver
                          </Button>
                          <Button
                            type="button"
                            disabled={
                              isSubmittingCancelOrder || cancelOrderReason.trim().length < 5
                            }
                            onClick={() =>
                              void onCancelOrder(cancelOrderMode, {
                                reason: cancelOrderReason.trim(),
                              }).then(() => {
                                setCancelOrderMode(null);
                                setCancelOrderReason('');
                              })
                            }
                          >
                            Confirmar cancelación
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {approveOrderError ? (
                      <PortalAlert
                        variant="error"
                        title="No se pudo aprobar la orden"
                        description={approveOrderError}
                      />
                    ) : null}
                    {closeOrderError ? (
                      <PortalAlert
                        variant="error"
                        title="No se pudo cerrar la orden"
                        description={closeOrderError}
                      />
                    ) : null}
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
                              {getSupplierDisplayLabel(order.partyRefId, supplierLabels)}
                            </p>
                            <p className="mt-1 text-gray-600 dark:text-gray-300">
                              {getPurchaseOrderStatusLabel(order.status)}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {isOrderReceivable(order.status) ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    void onSelectOrder(order.id).then(() =>
                                      onActiveTabChange('receipts'),
                                    );
                                  }}
                                >
                                  Recibir
                                </Button>
                              ) : null}
                              {order.status === PurchaseOrderStatus.PENDING_APPROVAL ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isSubmittingApproveOrder}
                                  onClick={() => void onApproveOrder(order.id)}
                                >
                                  Aprobar orden
                                </Button>
                              ) : null}
                              {[
                                PurchaseOrderStatus.DRAFT,
                                PurchaseOrderStatus.PENDING_APPROVAL,
                                PurchaseOrderStatus.APPROVED,
                              ].includes(order.status) ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={isSubmittingCancelOrder}
                                  onClick={() => setCancelOrderMode(order.id)}
                                >
                                  Cancelar orden
                                </Button>
                              ) : null}
                              {order.status === PurchaseOrderStatus.FULLY_RECEIVED ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isSubmittingCloseOrder}
                                  onClick={() => void onCloseOrder(order.id)}
                                >
                                  Cerrar orden
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <PortalEmptyState
                        title="Sin órdenes de compra"
                        description={
                          request?.status === PurchaseRequestStatus.APPROVED &&
                          (detail?.awards.length ?? 0) === 0
                            ? 'Adjudica las líneas en la pestaña Adjudicación antes de generar órdenes.'
                            : (detail?.awards.length ?? 0) > 0
                              ? 'Usa Generar órdenes desde adjudicación para crear una orden por proveedor.'
                              : 'Genera una orden de compra cuando la solicitud esté aprobada.'
                        }
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="receipts" className="mt-4 space-y-4">
                    <PortalSectionHeader
                      eyebrow="Recepciones"
                      title="Mercancía recibida"
                      description="Registra cantidades recibidas contra cada orden de compra."
                    />
                    <GoodsReceiptPanel
                      variant="embedded"
                      order={orderForReceipt}
                      orders={detail?.orders ?? []}
                      orderLines={latestOrderLines}
                      items={items}
                      locations={locations}
                      supplierLabels={supplierLabels}
                      fallbackExpectedDeliveryDate={request?.neededByDate ?? null}
                      isSubmitting={isSubmittingReceipt}
                      error={receiptError}
                      lastReceipt={latestReceipt}
                      onSelectOrder={(orderId) => void onSelectOrder(orderId)}
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
                      className={portalTextareaClassName}
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
                    {nextAction && !nextAction.terminal && activeTab !== nextAction.suggestedTab ? (
                      <Button type="button" onClick={handleNextActionCta}>
                        {nextAction.suggestedTab === 'orders' && canCreateOrder
                          ? detail && detail.awards.length > 0
                            ? 'Generar órdenes desde adjudicación'
                            : 'Generar orden de compra'
                          : getPurchaseNextActionCtaLabel(nextAction)}
                      </Button>
                    ) : null}
                    {activeTab === 'cotizar' && canAddQuote ? (
                      <Button
                        type="button"
                        disabled={
                          isSubmittingQuote ||
                          !selectedSupplierId ||
                          !quoteFormValid ||
                          quoteNumber.trim().length === 0
                        }
                        onClick={() => {
                          if (resolvedShippingCost === null) {
                            return;
                          }
                          void onAddQuote({
                            partyRefId: selectedSupplierId ?? '',
                            quoteNumber,
                            currency: quoteCurrency,
                            shippingCost: resolvedShippingCost,
                            ...(usesQuoteLines
                              ? { lines: quoteLinesPayload }
                              : { amount: parsedQuoteAmount }),
                          });
                        }}
                      >
                        Registrar cotización
                      </Button>
                    ) : null}
                    {activeTab === 'approval' && canApprove ? (
                      <Button
                        type="button"
                        disabled={isSubmittingApprove || !canSubmitApproval}
                        onClick={() =>
                          void onApprove({
                            ...(exceptionReason.trim()
                              ? { exceptionReason: exceptionReason.trim() }
                              : {}),
                            ...(approvalNotes.trim() ? { notes: approvalNotes.trim() } : {}),
                          })
                        }
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
                        {detail && detail.awards.length > 0
                          ? 'Generar órdenes desde adjudicación'
                          : 'Generar orden de compra'}
                      </Button>
                    ) : null}
                    {canEditRequest ? (
                      <Button type="button" variant="secondary" onClick={onEditRequest}>
                        Editar solicitud
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

      <Dialog open={discardLinesConfirmOpen} onOpenChange={setDiscardLinesConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Descartar cambios</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Hay cambios sin guardar en las líneas. ¿Quieres descartarlos?
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDiscardLinesConfirmOpen(false)}
            >
              Seguir editando
            </Button>
            <Button type="button" onClick={confirmDiscardLines}>
              Descartar cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
