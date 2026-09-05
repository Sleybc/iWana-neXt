'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Select, SkeletonBlock } from '@iwana/ui';
import {
  StockIssueType,
  StockLocationType,
  getInventoryUnitOfMeasureLabel,
  type StockIssuePickableItem,
} from '@iwana/shared';
import {
  inventoryApi,
  type CreateStockIssueDto,
  type ListPickableItemsParams,
  type StockIssueDetailRecord,
  type StockLocationRecord,
  type UpdateStockIssueDto,
} from '@/lib/api-client';
import { normalizeListMeta } from '@/lib/list-meta';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSectionHeader,
  PortalTablePagination,
  CreateModeSummaryFooter,
  CreateModeMobileCaptureFooter,
  CreateModeMobileStepIndicator,
} from '@/components/shared/portal-ui';
import {
  STOCK_COMMITTED_NEXT_STEP_TEXT,
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
  getStockIssueTypeHelperLabel,
  getStockIssueTypeLabel,
} from './inventory-labels';
import { PurchaseSelectionBar } from './PurchaseSelectionBar';
import { PurchaseSuggestionList } from './PurchaseSuggestionList';
import {
  StockIssueCatalogSelector,
  type StockIssueCatalogConditionBreakdown,
} from './StockIssueCatalogSelector';
import {
  StockIssueDraftLinesTable,
  type StockIssueDraftLineError,
} from './StockIssueDraftLinesTable';
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
  type StockIssueDraftItemHydration,
  type StockIssueDraftLine,
  type StockIssueDraftState,
} from './stock-issue-draft';
import { applySingleLotPreselectionToDraftLines } from './stock-issue-line-utils';
import { buildDraftFromIssueDetail } from './stock-issue-draft-from-detail';
import { showDestinationForIssueType } from './stock-issue-form-utils';
import {
  buildCreateStockIssuePayload,
  buildUpdateStockIssuePayload,
  validateStockIssueDraftLines,
} from './stock-issue-submit';
import { InventoryLocationPicker } from './InventoryLocationPicker';

type DestinationOptionsByType = Map<StockLocationType, StockLocationRecord[]>;
export type StockIssueComposerMode = 'create' | 'edit';

type PickableScope = 'with-stock' | 'catalog';

const PICKABLE_PAGE_LIMIT = 25;
const PICKABLE_EDIT_PRELOAD_LIMIT = 100;
const PICKABLE_SEARCH_DEBOUNCE_MS = 300;
const LIST_SKELETON_DELAY_MS = 300;

function scopeForTab(tab: StockIssueSourceTab): PickableScope {
  return tab === 'suggestions' ? 'with-stock' : 'catalog';
}

interface PickableScopeState {
  items: StockIssuePickableItem[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
}

function emptyScopeState(): PickableScopeState {
  return { items: [], total: 0, hasMore: false, nextCursor: null, loading: false, error: null };
}

function parseDecimalAmount(value: string | null | undefined): number {
  if (value == null || value === '') {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Muestra el skeleton solo si la carga supera el umbral (evita parpadeo). */
function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!active) {
      setDelayed(false);
      return;
    }
    const timer = window.setTimeout(() => setDelayed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return delayed;
}

function formatConditionBreakdownText(item: StockIssuePickableItem): string {
  const parts = item.availability
    .filter((entry) => parseDecimalAmount(entry.available) > 0)
    .map(
      (entry) =>
        `${formatInventoryQuantity(entry.available)} ${getStockBalanceConditionLabel(entry.condition).toLowerCase()}`,
    );
  if (parts.length === 0) {
    return 'Sin disponible en origen';
  }
  return parts.join(' · ');
}

function buildConditionBreakdown(
  item: StockIssuePickableItem,
): StockIssueCatalogConditionBreakdown[] {
  return item.availability
    .filter((entry) => parseDecimalAmount(entry.available) > 0)
    .map((entry) => ({ condition: entry.condition, available: entry.available }));
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

function mapPickableError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'No fue posible cargar el material disponible.';
}

export interface StockIssueComposerProps {
  mode?: StockIssueComposerMode;
  editIssue?: StockIssueDetailRecord | null;
  locations?: StockLocationRecord[];
  destinationOptions?: DestinationOptionsByType;
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
  locations: _locations = [],
  destinationOptions: _destinationOptions,
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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sourceTab, setSourceTab] = useState<StockIssueSourceTab>('suggestions');
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const [selectedDraftLineIds, setSelectedDraftLineIds] = useState<string[]>([]);
  const [draft, setDraft] = useState(createEmptyStockIssueDraft());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<Record<string, StockIssueDraftLineError>>({});
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [mobileStep, setMobileStep] = useState<'capture' | 'review'>('capture');
  const [editInitializing, setEditInitializing] = useState(false);
  const editBaselineRef = useRef<ComposerSnapshot | null>(null);
  const editHydratedRef = useRef<string | null>(null);
  const abortByScopeRef = useRef<Record<PickableScope, AbortController | null>>({
    'with-stock': null,
    catalog: null,
  });
  const [pickablesByScope, setPickablesByScope] = useState<
    Record<PickableScope, PickableScopeState>
  >({
    'with-stock': emptyScopeState(),
    catalog: emptyScopeState(),
  });

  const isDesktopLayout = useMinWidth(768);
  const showDestination = showDestinationForIssueType(type);
  const showStockContext = Boolean(sourceLocationId.trim());
  const activeScope = scopeForTab(sourceTab);
  const activeScopeState = pickablesByScope[activeScope];
  const showListSkeleton = useDelayedFlag(activeScopeState.loading, LIST_SKELETON_DELAY_MS);

  const pickableById = useMemo(() => {
    const map = new Map<string, StockIssuePickableItem>();
    for (const scope of ['with-stock', 'catalog'] as const) {
      for (const item of pickablesByScope[scope].items) {
        if (!map.has(item.itemId)) {
          map.set(item.itemId, item);
        }
      }
    }
    return map;
  }, [pickablesByScope]);

  const suggestionRows = useMemo(
    () =>
      pickablesByScope['with-stock'].items.map((item) => ({
        itemId: item.itemId,
        productLabel: `${item.sku} · ${item.name}`,
        helperLabel: `Disponible en origen: ${formatInventoryQuantity(item.totalAvailable)} ${getInventoryUnitOfMeasureLabel(item.unitOfMeasure)} · ${formatConditionBreakdownText(item)}`,
        selected: selectedSuggestionIds.includes(item.itemId),
      })),
    [pickablesByScope, selectedSuggestionIds],
  );

  const catalogRows = useMemo(() => {
    return pickablesByScope.catalog.items.map((item) => ({
      id: item.itemId,
      productLabel: `${item.sku} · ${item.name}`,
      categoryName: item.categoryName?.trim() ? item.categoryName : 'Sin categoría',
      unitLabel: getInventoryUnitOfMeasureLabel(item.unitOfMeasure),
      availableLabel: showStockContext ? formatInventoryQuantity(item.totalAvailable) : null,
      conditions: showStockContext ? buildConditionBreakdown(item) : [],
      selected: selectedCatalogIds.includes(item.itemId),
    }));
  }, [pickablesByScope, selectedCatalogIds, showStockContext]);

  const selectionCount = selectedSuggestionIds.length + selectedCatalogIds.length;

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

  async function fetchPickableScope(
    scope: PickableScope,
    input: { source: string; q: string; cursor?: string | null; append?: boolean; limit?: number },
  ): Promise<void> {
    abortByScopeRef.current[scope]?.abort();
    const controller = new AbortController();
    abortByScopeRef.current[scope] = controller;

    if (!input.append) {
      setPickablesByScope((current) => ({
        ...current,
        [scope]: { ...current[scope], loading: true, error: null },
      }));
    } else {
      setPickablesByScope((current) => ({
        ...current,
        [scope]: { ...current[scope], loading: true, error: null },
      }));
    }

    const params: ListPickableItemsParams = {
      sourceLocationId: input.source,
      scope,
      ...(input.q.trim() ? { q: input.q.trim() } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
      limit: input.limit ?? PICKABLE_PAGE_LIMIT,
    };

    try {
      const response = await inventoryApi.listPickableItems(params, { signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }
      const meta = normalizeListMeta(response.meta, {
        dataLength: response.data.length,
        limit: params.limit ?? PICKABLE_PAGE_LIMIT,
      });
      setPickablesByScope((current) => {
        const previous = current[scope];
        const merged = input.append
          ? [
              ...previous.items,
              ...response.data.filter(
                (item) => !previous.items.some((row) => row.itemId === item.itemId),
              ),
            ]
          : response.data;
        return {
          ...current,
          [scope]: {
            items: merged,
            total: meta.total,
            hasMore: meta.hasMore,
            nextCursor: meta.nextCursor,
            loading: false,
            error: null,
          },
        };
      });
    } catch (fetchError: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      setPickablesByScope((current) => ({
        ...current,
        [scope]: {
          ...current[scope],
          ...(input.append ? {} : { items: [], total: 0, hasMore: false, nextCursor: null }),
          loading: false,
          error: mapPickableError(fetchError),
        },
      }));
    }
  }

  function retryActiveScope(): void {
    if (!sourceLocationId.trim() || editInitializing) {
      return;
    }
    void fetchPickableScope(activeScope, {
      source: sourceLocationId.trim(),
      q: debouncedSearch,
    });
  }

  function handleLoadMore(): void {
    const cursor = pickablesByScope[activeScope].nextCursor;
    if (!sourceLocationId.trim() || !cursor) {
      return;
    }
    void fetchPickableScope(activeScope, {
      source: sourceLocationId.trim(),
      q: debouncedSearch,
      cursor,
      append: true,
    });
  }

  // Debounce 300 de la búsqueda: el mismo endpoint B1 resuelve `q` en servidor
  // (sku/nombre/marca/modelo/código) para ambas pestañas.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(catalogSearch),
      PICKABLE_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [catalogSearch]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    onDraftLineCountChange?.(draft.lines.length);
  }, [draft.lines.length, onDraftLineCountChange]);

  // Al editar el borrador, el error de validación local deja de aplicar: se
  // recalcula en el próximo envío en vez de quedar fijo.
  useEffect(() => {
    setValidationError(null);
  }, [draft]);

  // Carga S1 (reemplaza listBalances(100) + listAssets(100) + N+1 getItem(40) y la
  // derivación cliente buildStockIssueSuggestions): el efecto sobre el origen y
  // la búsqueda alimenta ambas pestañas desde B1, con `meta.total` en los
  // contadores y "Cargar más" como affordance de paginado.
  useEffect(() => {
    const source = sourceLocationId.trim();
    if (!source || editInitializing) {
      return;
    }
    void fetchPickableScope(activeScope, { source, q: debouncedSearch });
  }, [sourceLocationId, activeScope, debouncedSearch, editInitializing]);

  // El contador de la pestaña inactiva también refleja `meta.total` del servidor.
  useEffect(() => {
    const source = sourceLocationId.trim();
    if (!source || editInitializing) {
      return;
    }
    const inactive: PickableScope = activeScope === 'with-stock' ? 'catalog' : 'with-stock';
    void fetchPickableScope(inactive, { source, q: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- total inactivo por cambio de origen/búsqueda
  }, [sourceLocationId, debouncedSearch, editInitializing]);

  useEffect(() => {
    const scopes = abortByScopeRef.current;
    return () => {
      scopes['with-stock']?.abort();
      scopes.catalog?.abort();
    };
  }, []);

  useEffect(() => {
    if (!showStockContext) {
      setPickablesByScope({ 'with-stock': emptyScopeState(), catalog: emptyScopeState() });
    }
  }, [showStockContext]);

  // Inicialización del modo edición (S1): la cabecera sale del detalle y las
  // líneas se hidratan con el caché B1 (trackingMode + lots[] + availability[]);
  // las líneas cuyo ítem no esté en la primera página se resuelven con getItem
  // (acotado a las líneas, solo edición) para que C3 no persista por esta vía.
  useEffect(() => {
    if (!isEditMode || !editIssue) {
      editBaselineRef.current = null;
      return;
    }

    if (editHydratedRef.current === editIssue.id) {
      return;
    }

    let cancelled = false;
    setEditInitializing(true);
    setType(editIssue.type);
    setSourceLocationId(editIssue.sourceLocationId);
    setDestinationLocationId(editIssue.destinationLocationId ?? '');
    setCommercialRefId(editIssue.commercialRefId ?? '');
    setOriginRefId(editIssue.originRefId ?? '');
    setCostCenter(editIssue.costCenter ?? '');
    setReason(editIssue.reason ?? '');
    setDraft(createEmptyStockIssueDraft());
    setCatalogSearch('');
    setDebouncedSearch('');
    setSourceTab('suggestions');
    setSelectedSuggestionIds([]);
    setSelectedCatalogIds([]);
    setSelectedDraftLineIds([]);
    setValidationError(null);
    setLineErrors({});
    setDuplicateNotice(null);
    setMobileStep('capture');

    const source = editIssue.sourceLocationId.trim();
    void (async () => {
      const loaded = new Map<string, StockIssuePickableItem>();
      if (source) {
        try {
          const [withStock, catalog] = await Promise.all([
            inventoryApi.listPickableItems({
              sourceLocationId: source,
              scope: 'with-stock',
              limit: PICKABLE_EDIT_PRELOAD_LIMIT,
            }),
            inventoryApi.listPickableItems({
              sourceLocationId: source,
              scope: 'catalog',
              limit: PICKABLE_EDIT_PRELOAD_LIMIT,
            }),
          ]);
          if (!cancelled) {
            const withStockMeta = normalizeListMeta(withStock.meta, {
              dataLength: withStock.data.length,
              limit: PICKABLE_EDIT_PRELOAD_LIMIT,
            });
            const catalogMeta = normalizeListMeta(catalog.meta, {
              dataLength: catalog.data.length,
              limit: PICKABLE_EDIT_PRELOAD_LIMIT,
            });
            setPickablesByScope({
              'with-stock': {
                items: withStock.data,
                total: withStockMeta.total,
                hasMore: withStockMeta.hasMore,
                nextCursor: withStockMeta.nextCursor,
                loading: false,
                error: null,
              },
              catalog: {
                items: catalog.data,
                total: catalogMeta.total,
                hasMore: catalogMeta.hasMore,
                nextCursor: catalogMeta.nextCursor,
                loading: false,
                error: null,
              },
            });
            for (const item of [...withStock.data, ...catalog.data]) {
              if (!loaded.has(item.itemId)) {
                loaded.set(item.itemId, item);
              }
            }
          }
        } catch {
          // Sin caché B1 el borrador se arma con el respaldo legacy; el error de
          // carga lo muestra la lista activa con su Reintentar.
        }
      }

      if (cancelled) {
        return;
      }
      const { header, draft: initialDraft } = buildDraftFromIssueDetail(
        editIssue,
        new Map(),
        loaded,
      );
      const missingItemIds = [
        ...new Set(
          initialDraft.lines.filter((line) => !loaded.has(line.itemId)).map((line) => line.itemId),
        ),
      ];
      if (missingItemIds.length > 0) {
        const resolved = await Promise.all(
          missingItemIds.map((itemId) => inventoryApi.getItem(itemId).catch(() => null)),
        );
        if (cancelled) {
          return;
        }
        const fallbackById = new Map(
          resolved.filter((item) => item != null).map((item) => [item!.id, item!]),
        );
        const { draft: patched } = buildDraftFromIssueDetail(editIssue, fallbackById, loaded);
        setDraft(patched);
        editBaselineRef.current = buildComposerSnapshot({
          type: header.type,
          sourceLocationId: header.sourceLocationId,
          destinationLocationId: header.destinationLocationId,
          commercialRefId: header.commercialRefId,
          originRefId: header.originRefId,
          costCenter: header.costCenter,
          reason: header.reason,
          lines: patched.lines,
        });
      } else {
        setDraft(initialDraft);
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
      }
      setType(header.type);
      setSourceLocationId(header.sourceLocationId);
      setDestinationLocationId(header.destinationLocationId);
      setCommercialRefId(header.commercialRefId);
      setOriginRefId(header.originRefId);
      setCostCenter(header.costCenter);
      setReason(header.reason);
      editHydratedRef.current = editIssue.id;
      setEditInitializing(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, editIssue]);

  /**
   * F4 (RF-CAT-16, CA-F4-05): un lector deja el código completo en el buscador
   * y el backend lo resuelve a una sola coincidencia; marcarla evita el clic
   * manual. Vale para cualquier búsqueda con un único resultado.
   */
  useEffect(() => {
    if (!debouncedSearch.trim() || activeScopeState.items.length !== 1) {
      return;
    }
    const [single] = activeScopeState.items;
    if (!single) {
      return;
    }
    if (activeScope === 'with-stock') {
      setSelectedSuggestionIds((current) =>
        current.includes(single.itemId) ? current : [...current, single.itemId],
      );
    } else {
      setSelectedCatalogIds((current) =>
        current.includes(single.itemId) ? current : [...current, single.itemId],
      );
    }
  }, [activeScopeState.items, debouncedSearch, activeScope]);

  /**
   * Coherencia resumen ↔ línea: si la línea hidratada trae un único lote en su
   * condición, nace con ese lote para que la columna "Disponible en origen" no
   * salte del total a 0 mientras el operador no elige. Con varios lotes decide él.
   */
  function withSingleLotPreselection(
    next: StockIssueDraftState,
    lineIds?: readonly string[],
  ): StockIssueDraftState {
    return {
      lines: applySingleLotPreselectionToDraftLines(next.lines, {
        ...(lineIds ? { lineIds } : {}),
      }),
    };
  }

  function clearLineError(lineId: string): void {
    setLineErrors((current) => {
      if (!(lineId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[lineId];
      return next;
    });
  }

  function handleAddSelectedProducts() {
    const selections = [...selectedSuggestionIds, ...selectedCatalogIds]
      .map((itemId) => pickableById.get(itemId))
      .filter((item): item is StockIssuePickableItem => item != null)
      .map((item) => ({
        id: item.itemId,
        sku: item.sku,
        name: item.name,
        unitOfMeasure: item.unitOfMeasure,
        trackingMode: item.trackingMode,
        lots: item.lots,
        availability: item.availability,
        availableSerialCount: item.availableSerialCount,
      }));
    const uniqueItems = new Map(selections.map((item) => [item.id, item]));

    const result = addCatalogSelectionToDraft(draft, [...uniqueItems.values()]);
    const existingLineIds = new Set(draft.lines.map((line) => line.id));
    const addedLineIds = result.draft.lines
      .filter((line) => !existingLineIds.has(line.id))
      .map((line) => line.id);
    setDraft(withSingleLotPreselection(result.draft, addedLineIds));
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

  function handleItemChange(lineId: string, hydration: StockIssueDraftItemHydration | null) {
    clearLineError(lineId);
    setDraft((current) => {
      if (!hydration) {
        return withSingleLotPreselection(updateDraftLineItem(current, lineId, '', '', ''), [
          lineId,
        ]);
      }
      return withSingleLotPreselection(
        updateDraftLineItem(
          current,
          lineId,
          hydration.itemId,
          hydration.productLabel,
          hydration.unitOfMeasure,
          {
            trackingMode: hydration.trackingMode,
            lots: hydration.lots,
            availability: hydration.availability,
            availableSerialCount: hydration.availableSerialCount,
          },
        ),
        [lineId],
      );
    });
  }

  function resetComposer() {
    abortByScopeRef.current['with-stock']?.abort();
    abortByScopeRef.current.catalog?.abort();
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
    setDebouncedSearch('');
    setPickablesByScope({ 'with-stock': emptyScopeState(), catalog: emptyScopeState() });
    setSourceTab('suggestions');
    setSelectedSuggestionIds([]);
    setSelectedCatalogIds([]);
    setSelectedDraftLineIds([]);
    setDraft(createEmptyStockIssueDraft());
    setValidationError(null);
    setLineErrors({});
    setDuplicateNotice(null);
    setMobileStep('capture');
    editHydratedRef.current = null;
  }

  function mapDraftLinesForSubmit() {
    return draft.lines.map((line) => ({
      lineId: line.id,
      itemId: line.itemId,
      productLabel: line.productLabel,
      requestedQty: line.requestedQty,
      isManual: line.isManual,
      condition: line.condition,
      lotId: line.lotId,
      serializedAssetId: line.serializedAssetId,
      trackingMode: line.trackingMode,
    }));
  }

  function focusControl(controlId: string): void {
    window.requestAnimationFrame(() => {
      const target = document.getElementById(controlId);
      if (target && typeof target.focus === 'function') {
        target.focus({ preventScroll: false });
      }
    });
  }

  async function handleSubmit() {
    // S1/CA-S1-05: el botón queda habilitado y el bloqueo se vuelve efectivo al
    // enviar (mejor a11y que `disabled`): error global + inline por línea y foco
    // al primer inválido. El serial sale de la línea, no de knownItems.
    const lines = mapDraftLinesForSubmit();
    const fieldErrors = validateStockIssueDraftLines(lines, new Map());
    if (fieldErrors.length > 0) {
      const byLineId: Record<string, StockIssueDraftLineError> = {};
      for (const fieldError of fieldErrors) {
        const line = lines[fieldError.lineIndex];
        if (line && !(line.lineId in byLineId)) {
          byLineId[line.lineId] = {
            message: fieldError.message,
            controlId: fieldError.controlId,
          };
        }
      }
      setLineErrors(byLineId);
      setValidationError(fieldErrors[0]?.message ?? 'Revisa las líneas del borrador.');
      if (fieldErrors[0]) {
        focusControl(fieldErrors[0].controlId);
      }
      return;
    }
    setLineErrors({});

    const submitInput = {
      type,
      sourceLocationId,
      destinationLocationId,
      commercialRefId,
      originRefId,
      costCenter,
      reason,
      lines,
      itemsById: new Map(),
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
            : 'Tipo, origen y destino. Al despachar se genera el movimiento de inventario y se registra el costo operativo de la salida.'
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
            setSelectedSuggestionIds([]);
            setSelectedCatalogIds([]);
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

  const captureList = (() => {
    if (!showStockContext) {
      return (
        <PortalEmptyState
          className="w-full"
          title="Selecciona la bodega de origen"
          description={
            sourceTab === 'suggestions'
              ? 'Con el origen definido verás el material disponible para agregar a la salida.'
              : 'Con el origen definido verás el catálogo con el disponible de cada producto.'
          }
        />
      );
    }

    if (activeScopeState.loading && !showListSkeleton && activeScopeState.items.length === 0) {
      return null;
    }

    if (activeScopeState.error && activeScopeState.items.length === 0) {
      return (
        <PortalAlert
          variant="error"
          title="No fue posible cargar el material"
          description={activeScopeState.error}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={retryActiveScope}>
              Reintentar
            </Button>
          }
        />
      );
    }

    if (sourceTab === 'suggestions') {
      return (
        <>
          <PurchaseSuggestionList
            suggestions={suggestionRows}
            isLoading={showListSkeleton}
            emptyTitle="Esta bodega no tiene material disponible"
            emptyDescription="Cambia de bodega o usa Catálogo / línea manual para armar la salida."
            onToggle={(itemId) =>
              setSelectedSuggestionIds((current) =>
                current.includes(itemId)
                  ? current.filter((value) => value !== itemId)
                  : [...current, itemId],
              )
            }
          />
          <PortalTablePagination
            hasMore={activeScopeState.hasMore}
            onLoadMore={handleLoadMore}
            loading={activeScopeState.loading}
            resourceLabel="productos"
            shown={activeScopeState.items.length}
            total={activeScopeState.total}
          />
        </>
      );
    }

    const trimmedQuery = debouncedSearch.trim();
    return (
      <>
        <StockIssueCatalogSelector
          rows={catalogRows}
          isLoading={showListSkeleton}
          showAvailableColumn={showStockContext}
          emptyTitle={trimmedQuery ? 'No hay ítems que coincidan' : 'No hay ítems en el catálogo'}
          emptyDescription={
            trimmedQuery
              ? 'Ajusta la búsqueda o cambia a la pestaña Con material.'
              : 'Crea productos en el catálogo para poder armar salidas.'
          }
          onToggle={(itemId) =>
            setSelectedCatalogIds((current) =>
              current.includes(itemId)
                ? current.filter((value) => value !== itemId)
                : [...current, itemId],
            )
          }
        />
        <PortalTablePagination
          hasMore={activeScopeState.hasMore}
          onLoadMore={handleLoadMore}
          loading={activeScopeState.loading}
          resourceLabel="productos"
          shown={activeScopeState.items.length}
          total={activeScopeState.total}
        />
      </>
    );
  })();

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
        suggestionCount={pickablesByScope['with-stock'].total}
        catalogCount={pickablesByScope.catalog.total}
        onValueChange={setSourceTab}
      />
      <Input
        id="issue-catalog-search"
        label="Buscar ítem"
        placeholder="Buscar por código, nombre o marca"
        helperText="Puedes escanear el código de barras: con una sola coincidencia queda marcada para agregar."
        value={catalogSearch}
        onChange={(event) => setCatalogSearch(event.target.value)}
      />
      {captureList}
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
        editInitializing ? (
          <div className="space-y-2" aria-label="Cargando líneas de la salida" role="status">
            <SkeletonBlock className="h-16 w-full" />
            <SkeletonBlock className="h-16 w-full" />
          </div>
        ) : (
          <PortalEmptyState
            title="Aún no hay líneas en el borrador"
            description="Selecciona ítems desde el catálogo o agrega una línea manual."
          />
        )
      ) : (
        <StockIssueDraftLinesTable
          lines={draft.lines}
          sourceLocationId={sourceLocationId}
          selectedLineIds={selectedDraftLineIds}
          showAvailableColumn={showStockContext}
          pickableById={pickableById}
          lineErrors={lineErrors}
          onItemChange={handleItemChange}
          onQuantityChange={(lineId, value) => {
            clearLineError(lineId);
            setDraft((current) => updateDraftLineQuantity(current, lineId, value));
          }}
          onConditionChange={(lineId, condition) => {
            clearLineError(lineId);
            setDraft((current) =>
              // Cambiar la condición limpia el lote; si la nueva condición tiene un solo
              // lote se vuelve a preseleccionar en vez de volver a mostrar 0.
              withSingleLotPreselection(updateDraftLineCondition(current, lineId, condition), [
                lineId,
              ]),
            );
          }}
          onLotChange={(lineId, lotId) => {
            clearLineError(lineId);
            setDraft((current) => updateDraftLineLot(current, lineId, lotId));
          }}
          onSerializedAssetChange={(lineId, serializedAssetId, serializedAssetLabel) => {
            clearLineError(lineId);
            setDraft((current) =>
              updateDraftLineSerializedAsset(
                current,
                lineId,
                serializedAssetId,
                serializedAssetLabel,
              ),
            );
          }}
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
