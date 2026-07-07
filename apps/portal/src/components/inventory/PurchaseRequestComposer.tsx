'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, DatePicker, Input, Select } from '@iwana/ui';
import {
  PurchaseRequestLineSourceKind,
  PurchaseRequestPriority,
  PurchaseRequestType,
} from '@iwana/shared';
import type {
  CreatePurchaseRequestDto,
  InventoryCatalogOptionRecord,
  InventoryItemRecord,
  StockBalanceRecord,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSectionHeader,
} from '@/components/shared/portal-ui';
import {
  formatInventoryCurrency,
  getPurchaseRequestPriorityLabel,
  getPurchaseRequestTypeHelperLabel,
  getPurchaseRequestTypeLabel,
} from './inventory-labels';
import { toDateFromLocalDateValue, toLocalDateValue } from './inventory-date';
import {
  addCatalogSelectionToDraft,
  applyBulkQuantityToDraftLines,
  applyBulkSupplierToDraftLines,
  createEmptyPurchaseDraft,
  removeDraftLine,
  removeDraftLines,
  type PurchaseDraftState,
} from './purchase-request-draft';
import {
  buildCatalogBulkRowLabel,
  resolveCatalogSupplierLabel,
  resolveCatalogUnitOfMeasure,
} from './purchase-catalog-selector';
import { buildCatalogUnitCostMap, estimatePurchaseDraftTotal } from './purchase-draft-estimate';
import {
  readStoredPurchaseSourceTab,
  writeStoredPurchaseSourceTab,
  type PurchaseSourceTab,
} from './purchase-composer-preferences';
import { buildPurchaseSuggestions } from './purchase-suggestions';
import { buildCreatePurchaseRequestPayload } from './purchase-request-submit';
import { PurchaseCatalogBulkTable } from './PurchaseCatalogBulkTable';
import { PurchaseDraftLinesTable } from './PurchaseDraftLinesTable';
import { PurchaseSelectionBar } from './PurchaseSelectionBar';
import { PurchaseSourceTabs } from './PurchaseSourceTabs';
import { PurchaseSuggestionList } from './PurchaseSuggestionList';

interface PurchaseComposerSubmitResult {
  ok: boolean;
  requestId?: string;
}

interface PurchaseRequestComposerProps {
  catalogOptions: InventoryCatalogOptionRecord[];
  items?: InventoryItemRecord[];
  balances?: StockBalanceRecord[];
  purchaseItemFrequency?: Record<string, number>;
  supplierLabels?: Record<string, string>;
  isCatalogSearching?: boolean;
  isSubmitting: boolean;
  error: string | null;
  layout?: 'panel' | 'embedded';
  presentation?: 'default' | 'create-mode';
  onDirtyChange?: (isDirty: boolean) => void;
  onDraftLineCountChange?: (lineCount: number) => void;
  onCatalogSearch?: (search: string) => void;
  onSubmit: (payload: CreatePurchaseRequestDto) => Promise<PurchaseComposerSubmitResult>;
}

const TYPE_OPTIONS = Object.values(PurchaseRequestType).map((value) => ({
  value,
  label: getPurchaseRequestTypeLabel(value),
}));

const PRIORITY_OPTIONS = Object.values(PurchaseRequestPriority).map((value) => ({
  value,
  label: getPurchaseRequestPriorityLabel(value),
}));

const SUGGESTION_LIMIT = 8;

function resolveDefaultSourceTab(requestType: PurchaseRequestType): PurchaseSourceTab {
  if (
    requestType === PurchaseRequestType.REPLENISHMENT ||
    requestType === PurchaseRequestType.URGENT_OPERATION
  ) {
    return 'suggestions';
  }

  return 'catalog';
}

function createManualDraftLine(): PurchaseDraftState['lines'][number] {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `manual-${crypto.randomUUID()}`
      : `manual-${Date.now()}`;

  return {
    id,
    sourceKind: PurchaseRequestLineSourceKind.FREE_TEXT,
    inventoryItemId: '',
    productLabel: '',
    quantityRequested: '1',
    unitOfMeasure: 'unidad',
    suggestedPartyRefId: '',
    suggestedPartyName: '',
    notes: '',
  };
}

function mapCatalogSelection(
  option: InventoryCatalogOptionRecord,
  supplierLabels: Record<string, string>,
) {
  const supplier = resolveCatalogSupplierLabel(option, supplierLabels);
  return {
    id: option.id,
    sku: option.sku,
    name: option.name,
    unitOfMeasure: option.unitOfMeasure,
    purchaseUnitOfMeasure: option.purchaseUnitOfMeasure,
    preferredSupplierRefId: option.preferredSupplierRefId,
    preferredSupplierName:
      option.preferredSupplierName ??
      (option.preferredSupplierRefId
        ? (supplierLabels[option.preferredSupplierRefId] ?? supplier)
        : null),
  };
}

function useMinWidth(minWidth: number): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setMatches(true);
      return;
    }

    const mediaQuery = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [minWidth]);

  return matches;
}

export function PurchaseRequestComposer({
  catalogOptions,
  items = [],
  balances = [],
  purchaseItemFrequency = {},
  supplierLabels = {},
  isCatalogSearching = false,
  isSubmitting,
  error,
  layout = 'panel',
  presentation = 'default',
  onDirtyChange,
  onDraftLineCountChange,
  onCatalogSearch,
  onSubmit,
}: PurchaseRequestComposerProps) {
  const [title, setTitle] = useState('');
  const [requestType, setRequestType] = useState<PurchaseRequestType>(
    PurchaseRequestType.REPLENISHMENT,
  );
  const [priority, setPriority] = useState<PurchaseRequestPriority>(PurchaseRequestPriority.NORMAL);
  const [requestingArea, setRequestingArea] = useState('');
  const [justification, setJustification] = useState('');
  const [neededByDate, setNeededByDate] = useState('');
  const [sourceTab, setSourceTab] = useState<PurchaseSourceTab>(
    () => readStoredPurchaseSourceTab() ?? 'suggestions',
  );
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const [selectedDraftLineIds, setSelectedDraftLineIds] = useState<string[]>([]);
  const [draft, setDraft] = useState(createEmptyPurchaseDraft());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mobileStep, setMobileStep] = useState<'capture' | 'review'>('capture');
  const requestTypeInitialized = useRef(false);
  const isDesktopLayout = useMinWidth(768);
  const isCreateMode = presentation === 'create-mode';
  const isMobileCreateFlow = isCreateMode && !isDesktopLayout;

  const selectionCount = selectedSuggestionIds.length + selectedCatalogIds.length;
  const catalogById = useMemo(
    () => new Map(catalogOptions.map((option) => [option.id, option])),
    [catalogOptions],
  );

  const suggestionRecords = useMemo(
    () =>
      buildPurchaseSuggestions({
        items: items.map((item) => ({
          id: item.id,
          minimumStock: item.minimumStock,
          reorderPoint: item.reorderPoint,
          targetStock: item.targetStock,
          purchasable: item.purchasable,
        })),
        balances: balances.map((balance) => ({
          itemId: balance.itemId,
          quantityOnHand: balance.quantityOnHand,
        })),
        purchaseItemFrequency,
        limit: SUGGESTION_LIMIT,
      }),
    [items, balances, purchaseItemFrequency],
  );

  const suggestionRows = useMemo(
    () =>
      suggestionRecords.map((suggestion) => {
        const catalogOption = catalogById.get(suggestion.itemId);
        const productLabel = catalogOption
          ? buildCatalogBulkRowLabel(catalogOption)
          : suggestion.itemId;
        const supplierSuffix =
          catalogOption &&
          resolveCatalogSupplierLabel(catalogOption, supplierLabels) !== 'Sin proveedor sugerido'
            ? ` · Proveedor sugerido: ${resolveCatalogSupplierLabel(catalogOption, supplierLabels)}`
            : '';

        return {
          itemId: suggestion.itemId,
          productLabel,
          helperLabel: `${suggestion.reason} · Stock: ${suggestion.quantityOnHand}${supplierSuffix}`,
          selected: selectedSuggestionIds.includes(suggestion.itemId),
        };
      }),
    [suggestionRecords, catalogById, supplierLabels, selectedSuggestionIds],
  );

  const catalogRows = useMemo(
    () =>
      catalogOptions.map((option) => ({
        id: option.id,
        productLabel: buildCatalogBulkRowLabel(option),
        categoryName: option.categoryName,
        unitLabel: resolveCatalogUnitOfMeasure(option),
        supplierLabel: resolveCatalogSupplierLabel(option, supplierLabels),
        selected: selectedCatalogIds.includes(option.id),
      })),
    [catalogOptions, supplierLabels, selectedCatalogIds],
  );

  const unitCostByItemId = useMemo(() => buildCatalogUnitCostMap(catalogOptions), [catalogOptions]);

  const draftEstimate = useMemo(
    () => estimatePurchaseDraftTotal(draft.lines, unitCostByItemId),
    [draft.lines, unitCostByItemId],
  );

  const summaryLabel = useMemo(() => {
    const estimateSuffix =
      draftEstimate.coveredLines > 0
        ? ` · Total estimado: ${formatInventoryCurrency(draftEstimate.total)}`
        : '';

    return `${getPurchaseRequestTypeLabel(requestType)} · ${getPurchaseRequestPriorityLabel(priority)} · ${draft.lines.length} linea${draft.lines.length === 1 ? '' : 's'}${estimateSuffix}`;
  }, [requestType, priority, draft.lines.length, draftEstimate]);

  const hasUnsavedChanges = useMemo(
    () =>
      Boolean(
        title.trim() ||
        requestingArea.trim() ||
        justification.trim() ||
        neededByDate ||
        catalogSearch.trim() ||
        selectedSuggestionIds.length > 0 ||
        selectedCatalogIds.length > 0 ||
        draft.lines.length > 0,
      ),
    [
      title,
      requestingArea,
      justification,
      neededByDate,
      catalogSearch,
      selectedSuggestionIds.length,
      selectedCatalogIds.length,
      draft.lines.length,
    ],
  );

  useEffect(() => {
    if (requestTypeInitialized.current) {
      return;
    }

    requestTypeInitialized.current = true;
    if (!readStoredPurchaseSourceTab()) {
      setSourceTab(resolveDefaultSourceTab(requestType));
    }
  }, [requestType]);

  useEffect(() => {
    setSourceTab((current) => {
      if (readStoredPurchaseSourceTab()) {
        return current;
      }

      return resolveDefaultSourceTab(requestType);
    });
  }, [requestType]);

  useEffect(() => {
    writeStoredPurchaseSourceTab(sourceTab);
  }, [sourceTab]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    onDraftLineCountChange?.(draft.lines.length);
  }, [draft.lines.length, onDraftLineCountChange]);

  useEffect(() => {
    if (!onCatalogSearch) {
      return;
    }

    const handle = window.setTimeout(
      () => {
        onCatalogSearch(catalogSearch);
      },
      catalogSearch.trim() ? 300 : 0,
    );

    return () => window.clearTimeout(handle);
  }, [catalogSearch, onCatalogSearch]);

  function handleAddSelectedProducts() {
    const selectedFromSuggestions = suggestionRecords
      .filter((suggestion) => selectedSuggestionIds.includes(suggestion.itemId))
      .map((suggestion) => catalogById.get(suggestion.itemId))
      .filter((option): option is InventoryCatalogOptionRecord => Boolean(option))
      .map((option) => mapCatalogSelection(option, supplierLabels));

    const selectedFromCatalog = catalogOptions
      .filter((option) => selectedCatalogIds.includes(option.id))
      .map((option) => mapCatalogSelection(option, supplierLabels));

    setDraft((current) =>
      addCatalogSelectionToDraft(
        addCatalogSelectionToDraft(
          current,
          selectedFromSuggestions,
          PurchaseRequestLineSourceKind.REPLENISHMENT_SUGGESTION,
        ),
        selectedFromCatalog,
        PurchaseRequestLineSourceKind.INVENTORY_ITEM,
      ),
    );

    setSelectedSuggestionIds([]);
    setSelectedCatalogIds([]);
  }

  function handleAddManualLine() {
    setDraft((current) => ({
      lines: [...current.lines, createManualDraftLine()],
    }));
    if (isMobileCreateFlow) {
      setMobileStep('review');
    }
  }

  function handleToggleDraftLine(lineId: string) {
    setSelectedDraftLineIds((current) =>
      current.includes(lineId) ? current.filter((value) => value !== lineId) : [...current, lineId],
    );
  }

  function handleToggleAllDraftLines(checked: boolean) {
    setSelectedDraftLineIds(checked ? draft.lines.map((line) => line.id) : []);
  }

  function handleRemoveSelectedDraftLines() {
    setDraft((current) => removeDraftLines(current, selectedDraftLineIds));
    setSelectedDraftLineIds([]);
  }

  function resetComposer() {
    setTitle('');
    setRequestingArea('');
    setJustification('');
    setNeededByDate('');
    setDraft(createEmptyPurchaseDraft());
    setSelectedSuggestionIds([]);
    setSelectedCatalogIds([]);
    setSelectedDraftLineIds([]);
    setCatalogSearch('');
    setValidationError(null);
    setMobileStep('capture');
  }

  async function handleSubmit() {
    const result = buildCreatePurchaseRequestPayload({
      title,
      requestType,
      priority,
      requestingArea,
      justification,
      neededByDate,
      lines: draft.lines.map((line) => ({
        sourceKind: line.sourceKind,
        inventoryItemId: line.inventoryItemId,
        productLabel: line.productLabel,
        freeTextDescription: line.productLabel,
        quantityRequested: line.quantityRequested,
        unitOfMeasure: line.unitOfMeasure,
        suggestedPartyRefId: line.suggestedPartyRefId,
        notes: line.notes,
      })),
    });

    if (!result.payload) {
      setValidationError(result.error);
      return;
    }

    setValidationError(null);
    const submitResult = await onSubmit(result.payload);
    if (!submitResult.ok) {
      return;
    }

    resetComposer();
  }

  const requestContextSection = (
    <section className="space-y-3">
      <PortalSectionHeader
        eyebrow="Solicitud"
        title="Datos de la solicitud"
        description="Contexto minimo para capturar la compra sin convertir esta vista en un formulario largo."
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Select
          id="purchase-type"
          label="Tipo de compra"
          value={requestType}
          helperText={getPurchaseRequestTypeHelperLabel(requestType)}
          onChange={(event) => setRequestType(event.target.value as PurchaseRequestType)}
          options={TYPE_OPTIONS}
        />
        <Input
          id="purchase-area"
          label="Área solicitante"
          value={requestingArea}
          onChange={(event) => setRequestingArea(event.target.value)}
        />
        <Select
          id="purchase-priority"
          label="Prioridad"
          value={priority}
          onChange={(event) => setPriority(event.target.value as PurchaseRequestPriority)}
          options={PRIORITY_OPTIONS}
        />
        <DatePicker
          id="purchase-needed-by"
          label="Fecha requerida"
          placeholder="Seleccionar fecha"
          value={toDateFromLocalDateValue(neededByDate)}
          onChange={(date) => setNeededByDate(toLocalDateValue(date))}
          disabled={isSubmitting}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Input
          id="purchase-title"
          label="Título"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
    </section>
  );

  const captureSection = (
    <section className="space-y-4">
      <PortalSectionHeader
        eyebrow="Productos"
        title="Agregar productos"
        description="Selecciona primero y ajusta después."
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={handleAddManualLine}>
            Agregar línea manual
          </Button>
        }
      />

      <PurchaseSourceTabs
        value={sourceTab}
        suggestionCount={suggestionRows.length}
        catalogCount={catalogOptions.length}
        onValueChange={setSourceTab}
      />

      {sourceTab === 'suggestions' ? (
        <PurchaseSuggestionList
          suggestions={suggestionRows}
          isLoading={isLoadingSuggestions(items, balances)}
          onToggle={(itemId) =>
            setSelectedSuggestionIds((current) =>
              current.includes(itemId)
                ? current.filter((value) => value !== itemId)
                : [...current, itemId],
            )
          }
        />
      ) : (
        <div className="space-y-3">
          <Input
            id="purchase-catalog-search"
            label="Buscar producto"
            placeholder="SKU o nombre"
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
          />
          <PurchaseCatalogBulkTable
            rows={catalogRows}
            isLoading={isCatalogSearching}
            onToggle={(itemId) =>
              setSelectedCatalogIds((current) =>
                current.includes(itemId)
                  ? current.filter((value) => value !== itemId)
                  : [...current, itemId],
              )
            }
          />
        </div>
      )}

      <PurchaseSelectionBar
        count={selectionCount}
        disabled={isSubmitting}
        onClear={() => {
          setSelectedSuggestionIds([]);
          setSelectedCatalogIds([]);
        }}
        onAdd={() => {
          handleAddSelectedProducts();
          if (isMobileCreateFlow) {
            setMobileStep('review');
          }
        }}
      />
    </section>
  );

  const draftSection = (
    <section className="space-y-4">
      <PortalSectionHeader
        eyebrow="Borrador"
        title="Líneas seleccionadas"
        description="Aquí ajustas cantidades y revisas el cierre de la solicitud."
      />

      {draft.lines.length === 0 ? (
        <PortalEmptyState
          title="Aún no hay líneas en el borrador"
          description="Selecciona productos desde Sugeridos o Catálogo para construir la solicitud."
        />
      ) : (
        <PurchaseDraftLinesTable
          lines={draft.lines}
          selectedLineIds={selectedDraftLineIds}
          onLabelChange={(lineId, value) =>
            setDraft((current) => ({
              lines: current.lines.map((line) =>
                line.id === lineId ? { ...line, productLabel: value } : line,
              ),
            }))
          }
          onQuantityChange={(lineId, value) =>
            setDraft((current) => ({
              lines: current.lines.map((line) =>
                line.id === lineId ? { ...line, quantityRequested: value } : line,
              ),
            }))
          }
          onToggleLine={handleToggleDraftLine}
          onToggleAll={handleToggleAllDraftLines}
          onRemove={(lineId) => {
            setDraft((current) => removeDraftLine(current, lineId));
            setSelectedDraftLineIds((current) => current.filter((value) => value !== lineId));
          }}
          onRemoveSelected={handleRemoveSelectedDraftLines}
          onApplyBulkQuantity={(quantity) =>
            setDraft((current) =>
              applyBulkQuantityToDraftLines(current, selectedDraftLineIds, quantity),
            )
          }
          onApplyBulkSupplier={(partyRefId, displayName) =>
            setDraft((current) =>
              applyBulkSupplierToDraftLines(current, selectedDraftLineIds, partyRefId, displayName),
            )
          }
        />
      )}
    </section>
  );

  const justificationSection = (
    <section className="space-y-4">
      <PortalSectionHeader
        eyebrow="Control"
        title="Justificación"
        description="Explica la necesidad operativa que respalda la solicitud."
      />
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-gray-900 dark:text-white">Justificación</span>
        <textarea
          aria-label="Justificacion"
          className="w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white"
          rows={3}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
        />
      </label>
    </section>
  );

  const summaryFooter = (
    <div className="sticky bottom-0 z-20 rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 text-sm shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
      <p className="font-medium text-gray-900 dark:text-white">Resumen previo al envío</p>
      <p className="mt-1 text-gray-600 dark:text-gray-300">{summaryLabel}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isMobileCreateFlow && mobileStep === 'review' ? (
          <Button type="button" variant="secondary" onClick={() => setMobileStep('capture')}>
            Volver a productos
          </Button>
        ) : null}
        <Button
          type="button"
          disabled={isSubmitting || draft.lines.length === 0}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Creando solicitud...' : 'Crear solicitud'}
        </Button>
      </div>
    </div>
  );

  const content = (
    <div className="space-y-6">
      {error || validationError ? (
        <PortalAlert
          variant="error"
          title="No se pudo crear la solicitud"
          description={validationError ?? error ?? ''}
        />
      ) : null}

      {isMobileCreateFlow ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 text-sm font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200">
            {mobileStep === 'capture' ? 'Paso 1 de 2' : 'Paso 2 de 2'}
          </div>
          {requestContextSection}
          {mobileStep === 'capture' ? (
            <>
              {captureSection}
              <div className="sticky bottom-0 z-20 rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-600 dark:text-gray-300">{summaryLabel}</p>
                  <Button
                    type="button"
                    disabled={draft.lines.length === 0}
                    onClick={() => setMobileStep('review')}
                  >
                    Revisar selección
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              {draftSection}
              {justificationSection}
              {summaryFooter}
            </>
          )}
        </div>
      ) : isCreateMode ? (
        <>
          {requestContextSection}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div className="space-y-6">{captureSection}</div>
            <div className="space-y-6">
              {draftSection}
              {justificationSection}
              {summaryFooter}
            </div>
          </div>
        </>
      ) : (
        <>
          {requestContextSection}
          {captureSection}
          {draftSection}
          {justificationSection}
          {summaryFooter}
        </>
      )}
    </div>
  );

  if (layout === 'embedded') {
    return content;
  }

  return (
    <PortalPanel
      eyebrow="Nueva solicitud"
      title="Nueva solicitud de compra"
      description="Combina sugerencias, catálogo o líneas manuales en una sola solicitud."
    >
      {content}
    </PortalPanel>
  );
}

function isLoadingSuggestions(
  items: InventoryItemRecord[],
  balances: StockBalanceRecord[],
): boolean {
  return items.length === 0 && balances.length === 0;
}
