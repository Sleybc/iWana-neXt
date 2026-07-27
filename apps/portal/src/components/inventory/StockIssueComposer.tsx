'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Select } from '@iwana/ui';
import { StockIssueType, StockLocationType } from '@iwana/shared';
import {
  inventoryApi,
  mapPickerSearchResponse,
  type CreateStockIssueDto,
  type InventoryItemRecord,
  type PickerSearchItemDto,
  type SerializedAssetRecord,
  type StockBalanceRecord,
  type StockIssueDetailRecord,
  type StockLocationRecord,
  type UpdateStockIssueDto,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSectionHeader,
  CreateModeSummaryFooter,
  CreateModeMobileCaptureFooter,
  CreateModeMobileStepIndicator,
} from '@/components/shared/portal-ui';
import {
  STOCK_COMMITTED_NEXT_STEP_TEXT,
  formatInventoryQuantity,
  getStockIssueTypeHelperLabel,
  getStockIssueTypeLabel,
} from './inventory-labels';
import { PurchaseSelectionBar } from './PurchaseSelectionBar';
import { PurchaseSuggestionList } from './PurchaseSuggestionList';
import { StockIssueCatalogSelector } from './StockIssueCatalogSelector';
import { StockIssueDraftLinesTable } from './StockIssueDraftLinesTable';
import { StockIssueSourceTabs, type StockIssueSourceTab } from './StockIssueSourceTabs';
import {
  addCatalogSelectionToDraft,
  applyBulkQuantityToDraftLines,
  createEmptyStockIssueDraft,
  createManualStockIssueDraftLine,
  removeDraftLine,
  removeDraftLines,
  updateDraftLineCondition,
  updateDraftLineItem,
  updateDraftLineLot,
  updateDraftLineQuantity,
  updateDraftLineSerializedAsset,
  type StockIssueDraftLine,
} from './stock-issue-draft';
import { buildDraftFromIssueDetail } from './stock-issue-draft-from-detail';
import { showDestinationForIssueType } from './stock-issue-form-utils';
import { buildCreateStockIssuePayload, buildUpdateStockIssuePayload } from './stock-issue-submit';
import { buildAvailableQuantityByItemAtLocation } from './stock-issue-balance-utils';
import { buildStockIssueSuggestions } from './stock-issue-suggestions';
import { InventoryLocationPicker } from './InventoryLocationPicker';
import { inventoryHasMore } from './inventory-list-pagination';

type DestinationOptionsByType = Map<StockLocationType, StockLocationRecord[]>;
export type StockIssueComposerMode = 'create' | 'edit';

/** Parse label/sublabel F4 → sku/name aproximados para el borrador. */
function pickerItemToCatalogSelection(item: PickerSearchItemDto): {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
} {
  const sub = item.sublabel?.trim() ?? '';
  const skuFromSub = sub.replace(/^SKU\s+/i, '').trim();
  return {
    id: item.id,
    sku: skuFromSub || item.id.slice(0, 8),
    name: item.label,
    unitOfMeasure: 'unidad',
  };
}

interface ComposerSnapshot {
  type: StockIssueType;
  sourceLocationId: string;
  destinationLocationId: string;
  commercialRefId: string;
  originRefId: string;
  costCenter: string;
  reason: string;
  lines: Array<{
    itemId: string;
    requestedQty: string;
    condition: string;
    lotId: string;
    serializedAssetId: string;
  }>;
}

function buildComposerSnapshot(input: {
  type: StockIssueType;
  sourceLocationId: string;
  destinationLocationId: string;
  commercialRefId: string;
  originRefId: string;
  costCenter: string;
  reason: string;
  lines: StockIssueDraftLine[];
}): ComposerSnapshot {
  return {
    type: input.type,
    sourceLocationId: input.sourceLocationId,
    destinationLocationId: input.destinationLocationId,
    commercialRefId: input.commercialRefId,
    originRefId: input.originRefId,
    costCenter: input.costCenter,
    reason: input.reason,
    lines: input.lines.map((line) => ({
      itemId: line.itemId,
      requestedQty: line.requestedQty,
      condition: line.condition,
      lotId: line.lotId,
      serializedAssetId: line.serializedAssetId,
    })),
  };
}

function useMinWidth(minWidth: number): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [minWidth]);

  return matches;
}

const TYPE_OPTIONS = Object.values(StockIssueType).map((type) => ({
  value: type,
  label: getStockIssueTypeLabel(type),
}));

export interface StockIssueComposerProps {
  mode?: StockIssueComposerMode;
  editIssue?: StockIssueDetailRecord | null;
  /** Seed opcional; el composer carga catálogo vía lookup F4 y balances por origen. */
  items?: InventoryItemRecord[];
  balances?: StockBalanceRecord[];
  assets?: SerializedAssetRecord[];
  locations?: StockLocationRecord[];
  destinationOptions?: DestinationOptionsByType;
  issueItemFrequency?: Record<string, number>;
  isSubmitting?: boolean;
  error?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onDraftLineCountChange?: (count: number) => void;
  onSubmit: (dto: CreateStockIssueDto) => Promise<void>;
  onUpdate?: (issueId: string, dto: UpdateStockIssueDto) => Promise<void>;
}

export function StockIssueComposer({
  mode = 'create',
  editIssue = null,
  items: seedItems = [],
  balances: seedBalances = [],
  assets: seedAssets = [],
  locations: _locations = [],
  destinationOptions: _destinationOptions,
  issueItemFrequency = {},
  isSubmitting = false,
  error = null,
  onDirtyChange,
  onDraftLineCountChange,
  onSubmit,
  onUpdate,
}: StockIssueComposerProps) {
  void _locations;
  void _destinationOptions;
  const isEditMode = mode === 'edit';
  const [type, setType] = useState<StockIssueType>(StockIssueType.TECHNICIAN_CUSTODY);
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [sourceLocationLabel, setSourceLocationLabel] = useState<string | null>(null);
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [destinationLocationLabel, setDestinationLocationLabel] = useState<string | null>(null);
  const [commercialRefId, setCommercialRefId] = useState('');
  const [originRefId, setOriginRefId] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [reason, setReason] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [sourceTab, setSourceTab] = useState<StockIssueSourceTab>('suggestions');
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const [selectedDraftLineIds, setSelectedDraftLineIds] = useState<string[]>([]);
  const [draft, setDraft] = useState(createEmptyStockIssueDraft());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [mobileStep, setMobileStep] = useState<'capture' | 'review'>('capture');
  const editBaselineRef = useRef<ComposerSnapshot | null>(null);
  const [knownItems, setKnownItems] = useState<InventoryItemRecord[]>(seedItems);
  const [balances, setBalances] = useState<StockBalanceRecord[]>(seedBalances);
  const [assets, setAssets] = useState<SerializedAssetRecord[]>(seedAssets);
  const [balancesTruncated, setBalancesTruncated] = useState(false);
  const [catalogHits, setCatalogHits] = useState<PickerSearchItemDto[]>([]);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [catalogSearchError, setCatalogSearchError] = useState<string | null>(null);

  const itemsById = useMemo(() => new Map(knownItems.map((item) => [item.id, item])), [knownItems]);
  const isDesktopLayout = useMinWidth(768);
  const showDestination = showDestinationForIssueType(type);
  const showStockContext = Boolean(sourceLocationId.trim());

  const availableByItemId = useMemo(
    () => buildAvailableQuantityByItemAtLocation(balances, sourceLocationId),
    [balances, sourceLocationId],
  );

  const suggestionRecords = useMemo(
    () =>
      buildStockIssueSuggestions({
        items: knownItems,
        balances,
        sourceLocationId,
        search: catalogSearch,
        issueItemFrequency,
      }),
    [knownItems, balances, sourceLocationId, catalogSearch, issueItemFrequency],
  );

  const suggestionRows = useMemo(
    () =>
      suggestionRecords.map((suggestion) => ({
        itemId: suggestion.itemId,
        productLabel: suggestion.productLabel,
        helperLabel: suggestion.helperLabel,
        selected: selectedSuggestionIds.includes(suggestion.itemId),
      })),
    [suggestionRecords, selectedSuggestionIds],
  );

  const selectionCount = selectedSuggestionIds.length + selectedCatalogIds.length;

  const catalogRows = useMemo(() => {
    return catalogHits.map((hit) => {
      const selection = pickerItemToCatalogSelection(hit);
      return {
        id: hit.id,
        productLabel: hit.sublabel ? `${hit.label} — ${hit.sublabel}` : hit.label,
        categoryName: '—',
        unitLabel: selection.unitOfMeasure,
        availableLabel: showStockContext
          ? formatInventoryQuantity(availableByItemId.get(hit.id) ?? 0)
          : null,
        selected: selectedCatalogIds.includes(hit.id),
      };
    });
  }, [catalogHits, selectedCatalogIds, showStockContext, availableByItemId]);

  const summaryLabel = useMemo(() => {
    const destinationLabel = showDestination
      ? (destinationLocationLabel ?? 'sin destino')
      : getStockIssueTypeLabel(type);
    return `${getStockIssueTypeLabel(type)} · ${destinationLabel} · ${draft.lines.length} línea${draft.lines.length === 1 ? '' : 's'}`;
  }, [type, showDestination, destinationLocationLabel, draft.lines.length]);

  const currentSnapshot = useMemo(
    () =>
      buildComposerSnapshot({
        type,
        sourceLocationId,
        destinationLocationId,
        commercialRefId,
        originRefId,
        costCenter,
        reason,
        lines: draft.lines,
      }),
    [
      type,
      sourceLocationId,
      destinationLocationId,
      commercialRefId,
      originRefId,
      costCenter,
      reason,
      draft.lines,
    ],
  );

  const hasUnsavedChanges = useMemo(() => {
    if (isEditMode && editBaselineRef.current) {
      return JSON.stringify(currentSnapshot) !== JSON.stringify(editBaselineRef.current);
    }

    return Boolean(
      sourceLocationId ||
      destinationLocationId ||
      commercialRefId.trim() ||
      originRefId.trim() ||
      costCenter.trim() ||
      reason.trim() ||
      catalogSearch.trim() ||
      selectedSuggestionIds.length > 0 ||
      selectedCatalogIds.length > 0 ||
      draft.lines.length > 0,
    );
  }, [
    isEditMode,
    currentSnapshot,
    sourceLocationId,
    destinationLocationId,
    commercialRefId,
    originRefId,
    costCenter,
    reason,
    catalogSearch,
    selectedSuggestionIds.length,
    selectedCatalogIds.length,
    draft.lines.length,
  ]);

  useEffect(() => {
    if (!isEditMode || !editIssue) {
      editBaselineRef.current = null;
      return;
    }

    const { header, draft: initialDraft } = buildDraftFromIssueDetail(editIssue, itemsById);
    setType(header.type);
    setSourceLocationId(header.sourceLocationId);
    setDestinationLocationId(header.destinationLocationId);
    setCommercialRefId(header.commercialRefId);
    setOriginRefId(header.originRefId);
    setCostCenter(header.costCenter);
    setReason(header.reason);
    setDraft(initialDraft);
    setCatalogSearch('');
    setSourceTab('suggestions');
    setSelectedSuggestionIds([]);
    setSelectedCatalogIds([]);
    setSelectedDraftLineIds([]);
    setValidationError(null);
    setDuplicateNotice(null);
    setMobileStep('capture');

    editBaselineRef.current = buildComposerSnapshot({
      type: header.type,
      sourceLocationId: header.sourceLocationId,
      destinationLocationId: header.destinationLocationId,
      commercialRefId: header.commercialRefId,
      originRefId: header.originRefId,
      costCenter: header.costCenter,
      reason: header.reason,
      lines: initialDraft.lines,
    });
  }, [isEditMode, editIssue, itemsById]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    onDraftLineCountChange?.(draft.lines.length);
  }, [draft.lines.length, onDraftLineCountChange]);

  useEffect(() => {
    const query = catalogSearch.trim();
    if (query.length < 2) {
      setCatalogHits([]);
      setCatalogSearching(false);
      setCatalogSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCatalogSearching(true);
      setCatalogSearchError(null);
      void inventoryApi
        .searchItemsForPicker({ q: query }, { signal: controller.signal })
        .then((response) => {
          const mapped = mapPickerSearchResponse(response);
          setCatalogHits(mapped.items);
        })
        .catch((searchError: unknown) => {
          if (controller.signal.aborted) return;
          setCatalogHits([]);
          setCatalogSearchError(
            searchError instanceof Error ? searchError.message : 'No fue posible buscar productos.',
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setCatalogSearching(false);
          }
        });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [catalogSearch]);

  useEffect(() => {
    if (!sourceLocationId.trim()) {
      setBalances([]);
      setAssets([]);
      setBalancesTruncated(false);
      return;
    }

    const controller = new AbortController();
    void Promise.all([
      inventoryApi.listBalances({ locationId: sourceLocationId, limit: 100 }),
      inventoryApi.listAssets({ locationId: sourceLocationId, limit: 100 }),
    ])
      .then(async ([balancesResponse, assetsResponse]) => {
        if (controller.signal.aborted) return;
        setBalances(balancesResponse.data);
        setAssets(assetsResponse.data);
        setBalancesTruncated(inventoryHasMore(balancesResponse.meta));

        const itemIds = [
          ...new Set(balancesResponse.data.map((row) => row.itemId).filter(Boolean)),
        ].slice(0, 40);
        const missing = itemIds.filter((id) => !itemsById.has(id));
        if (missing.length === 0) return;

        const fetched = await Promise.all(
          missing.map((id) => inventoryApi.getItem(id).catch(() => null)),
        );
        if (controller.signal.aborted) return;
        const resolved = fetched.filter((row): row is InventoryItemRecord => row != null);
        if (resolved.length === 0) return;
        setKnownItems((prev) => {
          const next = new Map(prev.map((item) => [item.id, item]));
          for (const item of resolved) {
            next.set(item.id, item);
          }
          return [...next.values()];
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setBalances([]);
        setAssets([]);
        setBalancesTruncated(false);
      });

    return () => controller.abort();
    // itemsById intentionally omitted — enrichment uses latest map inside effect start
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch on source change
  }, [sourceLocationId]);

  function handleAddSelectedProducts() {
    const fromSuggestions = suggestionRecords
      .filter((row) => selectedSuggestionIds.includes(row.itemId))
      .map((row) => {
        const known = itemsById.get(row.itemId);
        return {
          id: row.itemId,
          sku: known?.sku ?? row.itemId.slice(0, 8),
          name: known?.name ?? row.productLabel,
          unitOfMeasure: known?.unitOfMeasure ?? 'unidad',
        };
      });
    const fromCatalog = catalogHits
      .filter((hit) => selectedCatalogIds.includes(hit.id))
      .map(pickerItemToCatalogSelection);
    const uniqueItems = new Map(
      [...fromSuggestions, ...fromCatalog].map((item) => [item.id, item]),
    );
    const selections = [...uniqueItems.values()];

    const result = addCatalogSelectionToDraft(draft, selections);
    setDraft(result.draft);
    setSelectedSuggestionIds([]);
    setSelectedCatalogIds([]);

    if (result.skippedItemIds.length > 0) {
      setDuplicateNotice(
        result.skippedItemIds.length === 1
          ? 'Un ítem ya estaba en el borrador; ajusta la cantidad en esa línea.'
          : `${result.skippedItemIds.length} ítems ya estaban en el borrador; ajusta las cantidades en esas líneas.`,
      );
    } else {
      setDuplicateNotice(null);
    }

    if (!isDesktopLayout && result.draft.lines.length > 0) {
      setMobileStep('review');
    }
  }

  function handleAddManualLine() {
    setDraft((current) => ({
      lines: [...current.lines, createManualStockIssueDraftLine()],
    }));
    if (!isDesktopLayout) {
      setMobileStep('review');
    }
  }

  function resetComposer() {
    setType(StockIssueType.TECHNICIAN_CUSTODY);
    setSourceLocationId('');
    setSourceLocationLabel(null);
    setDestinationLocationId('');
    setDestinationLocationLabel(null);
    setCommercialRefId('');
    setOriginRefId('');
    setCostCenter('');
    setReason('');
    setCatalogSearch('');
    setCatalogHits([]);
    setSourceTab('suggestions');
    setSelectedSuggestionIds([]);
    setSelectedCatalogIds([]);
    setSelectedDraftLineIds([]);
    setDraft(createEmptyStockIssueDraft());
    setValidationError(null);
    setDuplicateNotice(null);
    setMobileStep('capture');
    setBalances([]);
    setAssets([]);
    setBalancesTruncated(false);
  }

  function mapDraftLinesForSubmit() {
    return draft.lines.map((line) => ({
      itemId: line.itemId,
      productLabel: line.productLabel,
      requestedQty: line.requestedQty,
      isManual: line.isManual,
      condition: line.condition,
      lotId: line.lotId,
      serializedAssetId: line.serializedAssetId,
    }));
  }

  async function handleSubmit() {
    const submitInput = {
      type,
      sourceLocationId,
      destinationLocationId,
      commercialRefId,
      originRefId,
      costCenter,
      reason,
      lines: mapDraftLinesForSubmit(),
      itemsById,
    };

    setValidationError(null);
    try {
      if (isEditMode) {
        const result = buildUpdateStockIssuePayload(submitInput);
        if (!result.payload) {
          setValidationError(result.error);
          return;
        }
        if (!editIssue || !onUpdate) {
          setValidationError('No se pudo identificar la salida a editar.');
          return;
        }
        await onUpdate(editIssue.id, result.payload);
        return;
      }

      const result = buildCreateStockIssuePayload(submitInput);
      if (!result.payload) {
        setValidationError(result.error);
        return;
      }
      await onSubmit(result.payload);
      resetComposer();
    } catch {
      // El workspace o InventoryClient muestran el error externo.
    }
  }

  const issueContextSection = (
    <section className="space-y-3">
      <PortalSectionHeader
        eyebrow="Salida"
        title={isEditMode ? 'Contexto de la salida' : 'Datos de la salida'}
        description={
          isEditMode
            ? 'Puedes ajustar tipo, origen, destino y referencias mientras la salida esté solicitada.'
            : 'Tipo, origen y destino. El movimiento contable se genera al despachar.'
        }
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Select
          id="issue-type"
          label="Tipo"
          value={type}
          helperText={getStockIssueTypeHelperLabel(type)}
          onChange={(event) => {
            setType(event.target.value as StockIssueType);
            setDestinationLocationId('');
            setDestinationLocationLabel(null);
          }}
          options={TYPE_OPTIONS}
        />
        <InventoryLocationPicker
          id="issue-source"
          label="Origen"
          value={sourceLocationId || null}
          selectedLabel={sourceLocationLabel}
          onChange={(nextId, item) => {
            const nextSource = nextId ?? '';
            setSourceLocationId(nextSource);
            setSourceLocationLabel(item ? item.label : null);
            if (destinationLocationId === nextSource) {
              setDestinationLocationId('');
              setDestinationLocationLabel(null);
            }
          }}
        />
        {showDestination ? (
          <InventoryLocationPicker
            id="issue-destination"
            label="Destino"
            value={destinationLocationId || null}
            selectedLabel={destinationLocationLabel}
            onChange={(nextId, item) => {
              setDestinationLocationId(nextId ?? '');
              setDestinationLocationLabel(item ? item.label : null);
            }}
          />
        ) : null}
        {type === StockIssueType.SALE_DISPATCH ? (
          <>
            <Input
              label="Referencia comercial (opcional)"
              value={commercialRefId}
              onChange={(event) => setCommercialRefId(event.target.value)}
            />
            <Input
              label="Origen o referencia de venta (opcional)"
              value={originRefId}
              onChange={(event) => setOriginRefId(event.target.value)}
              helperText="Requerido si no se envía referencia comercial."
            />
          </>
        ) : null}
        {type === StockIssueType.INTERNAL_CONSUMPTION ? (
          <>
            <Input
              label="Centro de costo"
              value={costCenter}
              onChange={(event) => setCostCenter(event.target.value)}
            />
            <Input
              label="Motivo"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </>
        ) : null}
      </div>
    </section>
  );

  const captureSection = (
    <section className="space-y-4">
      <PortalSectionHeader
        eyebrow="Productos"
        title={isEditMode ? 'Modificar productos' : 'Agregar productos'}
        description={
          showStockContext
            ? isEditMode
              ? 'Agrega o quita ítems disponibles en la bodega de origen.'
              : 'Selecciona productos disponibles en la bodega de origen o busca en el catálogo completo.'
            : 'Selecciona primero la bodega de origen para ver el material disponible.'
        }
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={handleAddManualLine}>
            Agregar línea manual
          </Button>
        }
      />
      <StockIssueSourceTabs
        value={sourceTab}
        suggestionCount={suggestionRecords.length}
        catalogCount={catalogHits.length}
        onValueChange={setSourceTab}
      />
      <Input
        id="issue-catalog-search"
        label="Buscar ítem"
        placeholder="Escribe al menos 2 caracteres"
        value={catalogSearch}
        onChange={(event) => setCatalogSearch(event.target.value)}
      />
      {balancesTruncated && showStockContext ? (
        <PortalAlert
          variant="warning"
          title="Existencias parciales en origen"
          description="Hay más saldos en esta bodega de los cargados. Afina la búsqueda en catálogo si no ves un producto."
        />
      ) : null}
      {sourceTab === 'suggestions' ? (
        showStockContext ? (
          <PurchaseSuggestionList
            suggestions={suggestionRows}
            emptyTitle="No hay material disponible en origen"
            emptyDescription="Cambia de bodega o usa Catálogo / línea manual para armar la salida."
            onToggle={(itemId) =>
              setSelectedSuggestionIds((current) =>
                current.includes(itemId)
                  ? current.filter((value) => value !== itemId)
                  : [...current, itemId],
              )
            }
          />
        ) : (
          <PortalEmptyState
            className="w-full"
            title="Selecciona la bodega de origen"
            description="Con el origen definido verás el material disponible para agregar a la salida."
          />
        )
      ) : catalogSearch.trim().length < 2 ? (
        <PortalEmptyState
          className="w-full"
          title="Escribe al menos 2 caracteres"
          description="La búsqueda consulta el catálogo en el servidor; ya no se precarga un tope silencioso."
        />
      ) : catalogSearchError ? (
        <PortalAlert
          variant="error"
          title="No fue posible buscar productos"
          description={catalogSearchError}
        />
      ) : (
        <StockIssueCatalogSelector
          rows={catalogRows}
          isLoading={catalogSearching}
          showAvailableColumn={showStockContext}
          onToggle={(itemId) =>
            setSelectedCatalogIds((current) =>
              current.includes(itemId)
                ? current.filter((value) => value !== itemId)
                : [...current, itemId],
            )
          }
        />
      )}
      <PurchaseSelectionBar
        count={selectionCount}
        disabled={isSubmitting}
        onClear={() => {
          setSelectedSuggestionIds([]);
          setSelectedCatalogIds([]);
        }}
        onAdd={handleAddSelectedProducts}
      />
    </section>
  );

  const draftSection = (
    <section className="space-y-4">
      <PortalSectionHeader
        eyebrow="Borrador"
        title="Líneas seleccionadas"
        description={
          isEditMode
            ? 'Revisa cantidades y condiciones antes de guardar los cambios.'
            : 'Revisa cantidades antes de crear la salida.'
        }
      />
      {duplicateNotice ? (
        <PortalAlert variant="warning" title="Productos omitidos" description={duplicateNotice} />
      ) : null}
      {draft.lines.length === 0 ? (
        <PortalEmptyState
          title="Aún no hay líneas en el borrador"
          description="Selecciona ítems desde el catálogo o agrega una línea manual."
        />
      ) : (
        <StockIssueDraftLinesTable
          lines={draft.lines}
          items={knownItems}
          balances={balances}
          assets={assets}
          sourceLocationId={sourceLocationId}
          selectedLineIds={selectedDraftLineIds}
          {...(showStockContext ? { showAvailableColumn: true as const } : {})}
          onItemChange={(lineId, itemId, productLabel, unitOfMeasure) =>
            setDraft((current) =>
              updateDraftLineItem(current, lineId, itemId, productLabel, unitOfMeasure),
            )
          }
          onQuantityChange={(lineId, value) =>
            setDraft((current) => updateDraftLineQuantity(current, lineId, value))
          }
          onConditionChange={(lineId, condition) =>
            setDraft((current) => updateDraftLineCondition(current, lineId, condition))
          }
          onLotChange={(lineId, lotId) =>
            setDraft((current) => updateDraftLineLot(current, lineId, lotId))
          }
          onSerializedAssetChange={(lineId, serializedAssetId) =>
            setDraft((current) =>
              updateDraftLineSerializedAsset(current, lineId, serializedAssetId),
            )
          }
          onToggleLine={(lineId) =>
            setSelectedDraftLineIds((current) =>
              current.includes(lineId)
                ? current.filter((value) => value !== lineId)
                : [...current, lineId],
            )
          }
          onToggleAll={(checked) =>
            setSelectedDraftLineIds(checked ? draft.lines.map((line) => line.id) : [])
          }
          onRemove={(lineId) => {
            setDraft((current) => removeDraftLine(current, lineId));
            setSelectedDraftLineIds((current) => current.filter((value) => value !== lineId));
          }}
          onRemoveSelected={() => {
            setDraft((current) => removeDraftLines(current, selectedDraftLineIds));
            setSelectedDraftLineIds([]);
          }}
          onApplyBulkQuantity={(quantity) =>
            setDraft((current) =>
              applyBulkQuantityToDraftLines(current, selectedDraftLineIds, quantity),
            )
          }
        />
      )}
    </section>
  );

  const summaryFooter = (
    <CreateModeSummaryFooter
      title={isEditMode ? 'Resumen de cambios' : 'Resumen previo al envío'}
      summary={summaryLabel}
      secondaryAction={
        !isDesktopLayout && mobileStep === 'review' ? (
          <Button type="button" variant="secondary" onClick={() => setMobileStep('capture')}>
            Volver a productos
          </Button>
        ) : undefined
      }
      primaryLabel={isEditMode ? 'Guardar cambios' : 'Crear salida'}
      primaryLoadingLabel={isEditMode ? 'Guardando cambios...' : 'Creando salida...'}
      loading={isSubmitting}
      disabled={draft.lines.length === 0 || (isEditMode && !hasUnsavedChanges)}
      onPrimaryClick={() => void handleSubmit()}
    />
  );

  const content = (
    <div className="space-y-6">
      {isEditMode ? (
        <PortalAlert
          variant="info"
          title="Edición disponible en estado solicitada"
          description="Cuando la salida avance a preparación o despacho, solo podrás consultarla o cancelarla desde el detalle."
        />
      ) : null}

      {error || validationError ? (
        <PortalAlert
          variant="error"
          title={isEditMode ? 'No se pudo guardar la salida' : 'No se pudo crear la salida'}
          description={
            validationError ? (
              validationError
            ) : (
              <>
                <p>{error}</p>
                <p className="mt-1">{STOCK_COMMITTED_NEXT_STEP_TEXT}</p>
              </>
            )
          }
        />
      ) : null}

      {!isDesktopLayout ? (
        <div className="space-y-6">
          <CreateModeMobileStepIndicator currentStep={mobileStep === 'capture' ? 1 : 2} />
          {issueContextSection}
          {mobileStep === 'capture' ? (
            <>
              {captureSection}
              <CreateModeMobileCaptureFooter
                summary={summaryLabel}
                disabled={draft.lines.length === 0}
                onReview={() => setMobileStep('review')}
              />
            </>
          ) : (
            <>
              {draftSection}
              {summaryFooter}
            </>
          )}
        </div>
      ) : (
        <>
          {issueContextSection}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div className="space-y-6">{captureSection}</div>
            <div className="space-y-6">
              {draftSection}
              {summaryFooter}
            </div>
          </div>
        </>
      )}
    </div>
  );

  return content;
}
