'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Select, SkeletonBlock } from '@iwana/ui';
import {
  StockBalanceCondition,
  StockIssueType,
  StockLocationType,
  getInventoryUnitOfMeasureLabel,
  type StockIssuePickableItem,
} from '@iwana/shared';
import {
  inventoryApi,
  type CreateStockIssueDto,
  type StockIssueDetailRecord,
  type StockLocationRecord,
  type UpdateStockIssueDto,
} from '@/lib/api-client';
import { listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { useMinWidth } from '@/lib/useMinWidth';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSectionHeader,
  PortalTablePagination,
  PortalTablePager,
  PortalPageSizeSelect,
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
import { parseDecimalAmount } from './stock-issue-balance-utils';
import {
  StockIssueDraftLinesTable,
  type StockIssueDraftLineError,
} from './StockIssueDraftLinesTable';
import { StockIssueSearchResults } from './StockIssueSearchResults';
import {
  StockIssueLineSidePeek,
  type StockIssueLineSidePeekResult,
} from './StockIssueLineSidePeek';
import { usePickableScope, type PickableScope, type PickableScopeState } from './usePickableScope';
import { useSerialLabels } from './useSerialLabels';
import {
  addCatalogSelectionToDraft,
  applyBulkQuantityToDraftLines,
  areComposerSnapshotsEqual,
  buildComposerSnapshot,
  createEmptyStockIssueDraft,
  createManualStockIssueDraftLine,
  invalidateDraftStockContext,
  rehydrateBareDraftLines,
  removeDraftLine,
  removeDraftLines,
  updateDraftLineConfiguration,
  updateDraftLineItem,
  updateDraftLineQuantity,
  type StockIssueDraftItemHydration,
  type StockIssueDraftLine,
  type StockIssueDraftState,
} from './stock-issue-draft';
import { resolveLineSerializedAssetIds } from './stock-issue-draft';
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

/** Disponible por condición para la fila del buscador (dato, no control). */
export interface StockIssueCatalogConditionBreakdown {
  condition: StockBalanceCondition;
  available: string;
}

export type StockIssueComposerMode = 'create' | 'edit';

const TYPE_OPTIONS = Object.values(StockIssueType).map((type) => ({
  value: type,
  label: getStockIssueTypeLabel(type),
}));

const PICKABLE_EDIT_PRELOAD_LIMIT = 100;
const PICKABLE_SEARCH_DEBOUNCE_MS = 300;
const LIST_SKELETON_DELAY_MS = 300;

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

function toCatalogSelection(item: StockIssuePickableItem) {
  return {
    id: item.itemId,
    sku: item.sku,
    name: item.name,
    unitOfMeasure: item.unitOfMeasure,
    trackingMode: item.trackingMode,
    lots: item.lots,
    availability: item.availability,
    availableSerialCount: item.availableSerialCount,
  };
}

/** Línea provisional lista para el panel: lote único ya preseleccionado sobre
 * los defaults del borrador; vive fuera del borrador hasta confirmarse. */
function buildProvisionalDraftLine(item: StockIssuePickableItem): StockIssueDraftLine | null {
  const { draft: single } = addCatalogSelectionToDraft(createEmptyStockIssueDraft(), [
    toCatalogSelection(item),
  ]);
  const [line] = applySingleLotPreselectionToDraftLines(single.lines);
  return line ?? null;
}

/**
 * Pie único del listado de elegibles (ADR-065): el modo lo declara
 * `meta.capabilities.randomAccess` — pager numerado por defecto, «Cargar más»
 * solo en degradación. Nunca monta los dos pies a la vez (hallazgo P1).
 */
function PickableListFooter({
  state,
  loading,
  onLoadMore,
  onPageChange,
  onPageSizeChange,
}: {
  state: PickableScopeState;
  loading: boolean;
  onLoadMore: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (limit: number) => void;
}) {
  if (state.total === 0) {
    return null;
  }

  if (state.randomAccess) {
    const window = listPageWindow({ page: state.page, limit: state.limit, total: state.total });
    return (
      <PortalTablePager
        page={state.page}
        pageCount={state.totalPages ?? 1}
        onPageChange={onPageChange}
        from={window.from}
        to={window.to}
        total={state.total}
        resource={{ singular: 'producto', plural: 'productos' }}
        loading={loading}
        pageSizeControl={
          <PortalPageSizeSelect
            value={state.limit}
            disabled={loading}
            onChange={onPageSizeChange}
          />
        }
      />
    );
  }

  return (
    <PortalTablePagination
      hasMore={state.hasMore}
      onLoadMore={onLoadMore}
      loading={loading}
      resourceLabel="productos"
      shown={state.items.length}
      total={state.total}
    />
  );
}

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
  const [selectedDraftLineIds, setSelectedDraftLineIds] = useState<string[]>([]);
  const [draft, setDraft] = useState(createEmptyStockIssueDraft());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<Record<string, StockIssueDraftLineError>>({});
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState('');
  const [mobileStep, setMobileStep] = useState<'capture' | 'review'>('capture');
  const [liveNotice, setLiveNotice] = useState('');
  const [editInitializing, setEditInitializing] = useState(false);
  const editBaselineRef = useRef<ReturnType<typeof buildComposerSnapshot> | null>(null);
  const editHydratedRef = useRef<string | null>(null);
  const draftLinesRef = useRef<StockIssueDraftLine[]>(draft.lines);
  draftLinesRef.current = draft.lines;
  const selectedDraftLineIdsRef = useRef<string[]>(selectedDraftLineIds);
  selectedDraftLineIdsRef.current = selectedDraftLineIds;
  /** Consulta de escaneo armada por Enter del lector; se consume al resolverse. */
  const scanArmedRef = useRef<string | null>(null);
  const [scanSeq, setScanSeq] = useState(0);

  // Búsqueda única contra el catálogo completo: la disponibilidad viaja como
  // dato de cada resultado (el flujo dominante ya sabe qué llevar).
  const activeScope: PickableScope = 'catalog';
  const {
    pickablesByScope,
    setPickablesByScope,
    pickableCache,
    setPickableCache,
    completedQByScope,
    showStockContext,
    retryActiveScope,
    handleLoadMore,
    handlePageChange,
    handlePageSizeChange,
    abortAllScopes,
    clearScopes,
    clearPickableCache,
  } = usePickableScope({
    sourceLocationId,
    activeScope,
    debouncedSearch,
    editInitializing,
  });
  const { serialLabelsById, mergeSerialLabels, resetSerialLabels } = useSerialLabels(draft.lines);

  // Panel por id viva (S2.1 C1): el `peek` guarda el id y el modo; la línea se
  // deriva del borrador para que la hidratación posterior no muestre datos
  // viejos. En creación la línea provisional vive aparte hasta confirmarse.
  const [peek, setPeek] = useState<{ lineId: string; mode: 'create' | 'edit' } | null>(null);
  const [provisionalLine, setProvisionalLine] = useState<StockIssueDraftLine | null>(null);
  const peekLine = useMemo(() => {
    if (!peek) {
      return null;
    }
    if (peek.mode === 'create') {
      return provisionalLine && provisionalLine.id === peek.lineId ? provisionalLine : null;
    }
    return draft.lines.find((line) => line.id === peek.lineId) ?? null;
  }, [peek, provisionalLine, draft.lines]);

  const isDesktopLayout = useMinWidth(768);
  const showDestination = showDestinationForIssueType(type);
  const activeScopeState = pickablesByScope[activeScope];
  const showListSkeleton = useDelayedFlag(activeScopeState.loading, LIST_SKELETON_DELAY_MS);

  const pickableById = pickableCache;

  const excludedSerializedAssetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const line of draft.lines) {
      if (peek && line.id === peek.lineId) {
        continue;
      }
      for (const id of resolveLineSerializedAssetIds(line)) {
        ids.add(id);
      }
    }
    return [...ids];
  }, [draft.lines, peek]);

  // Cada fila depende solo de su ámbito: cambiar de pestaña o de página en un
  // ámbito no recalcula las filas del otro (S2.1 C4).
  const catalogItems = pickablesByScope.catalog.items;

  // Filas compactas del buscador: la disponibilidad es dato, nunca control.
  const searchRows = useMemo(
    () =>
      catalogItems.map((item) => ({
        itemId: item.itemId,
        productLabel: `${item.sku} · ${item.name}`,
        availabilityLabel: showStockContext
          ? `Disponible en origen: ${formatInventoryQuantity(item.totalAvailable)} ${getInventoryUnitOfMeasureLabel(item.unitOfMeasure)} · ${formatConditionBreakdownText(item)}`
          : '',
        noStock: showStockContext && parseDecimalAmount(item.totalAvailable) <= 0,
      })),
    [catalogItems, showStockContext],
  );

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
      return !areComposerSnapshotsEqual(currentSnapshot, editBaselineRef.current);
    }

    return Boolean(
      sourceLocationId ||
      destinationLocationId ||
      commercialRefId.trim() ||
      originRefId.trim() ||
      costCenter.trim() ||
      reason.trim() ||
      catalogSearch.trim() ||
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
    draft.lines.length,
  ]);

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

  // S2.1 C3: las líneas sin contexto se rehidratan desde el caché de la bodega
  // vigente; la captura que el operador ya reconfiguró nunca se pisa.
  useEffect(() => {
    if (!sourceLocationId.trim() || editInitializing) {
      return;
    }
    setDraft((current) => {
      const { draft: next, rehydratedLineIds } = rehydrateBareDraftLines(current, pickableCache);
      if (rehydratedLineIds.length === 0) {
        return current;
      }
      return {
        lines: applySingleLotPreselectionToDraftLines(next.lines, {
          lineIds: rehydratedLineIds,
        }),
      };
    });
  }, [sourceLocationId, pickableCache, editInitializing]);

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
    setSelectedDraftLineIds([]);
    setValidationError(null);
    setLineErrors({});
    setSourceNotice(null);
    setScanNotice('');
    setMobileStep('capture');
    resetSerialLabels();
    setPeek(null);
    setProvisionalLine(null);

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
            setPickableCache((current) => {
              const next = new Map(current);
              for (const item of [...withStock.data, ...catalog.data]) {
                if (!next.has(item.itemId)) {
                  next.set(item.itemId, item);
                }
              }
              return next;
            });
            setPickablesByScope({
              'with-stock': {
                items: withStock.data,
                total: withStockMeta.total,
                hasMore: withStockMeta.hasMore,
                nextCursor: withStockMeta.nextCursor,
                page: withStockMeta.page ?? 1,
                limit: withStockMeta.limit,
                totalPages: withStockMeta.totalPages,
                randomAccess: withStockMeta.capabilities.randomAccess,
                loading: false,
                error: null,
              },
              catalog: {
                items: catalog.data,
                total: catalogMeta.total,
                hasMore: catalogMeta.hasMore,
                nextCursor: catalogMeta.nextCursor,
                page: catalogMeta.page ?? 1,
                limit: catalogMeta.limit,
                totalPages: catalogMeta.totalPages,
                randomAccess: catalogMeta.capabilities.randomAccess,
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
      const {
        header,
        draft: initialDraft,
        serialLabelsById: hydratedLabels,
      } = buildDraftFromIssueDetail(editIssue, new Map(), loaded);
      // Etiquetas legibles del contrato §5.5; las ya resueltas por el picker
      // no se pisan.
      resetSerialLabels(hydratedLabels);
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
  }, [isEditMode, editIssue, resetSerialLabels, setPickableCache, setPickablesByScope]);

  function handleCatalogSearchChange(value: string): void {
    scanArmedRef.current = null;
    setScanNotice('');
    setCatalogSearch(value);
  }

  function handleCatalogSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') {
      return;
    }
    // Valor en vivo del campo (F4): en Enter rápido `catalogSearch` aún es el
    // estado anterior; el lector deja el código completo y lo cierra con Enter.
    const query = event.currentTarget.value.trim();
    if (!query) {
      return;
    }
    if (query !== catalogSearch) {
      setCatalogSearch(event.currentTarget.value);
    }
    // Sufijo Enter del lector: arma el escaneo y despierta el efecto aunque el
    // resultado ya estuviera resuelto para esta consulta.
    scanArmedRef.current = query;
    setScanSeq((current) => current + 1);
  }

  const clearLineError = useCallback((lineId: string) => {
    setLineErrors((current) => {
      if (!(lineId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[lineId];
      return next;
    });
  }, []);

  /** S2.1 C3: al cambiar el origen se invalida el contexto de bodega del
   * borrador; el disponible contextual nunca se calcula con datos de otra
   * bodega. Las líneas se rehidratan solas desde el caché de la bodega nueva.
   */
  const handleSourceChange = useCallback(
    (nextId: string | null, item: { id: string; label: string } | null) => {
      const nextSource = nextId ?? '';
      const changed = nextSource !== sourceLocationId;
      setSourceLocationId(nextSource);
      setSourceLocationLabel(item ? item.label : null);
      scanArmedRef.current = null;
      setScanNotice('');
      if (destinationLocationId === nextSource) {
        setDestinationLocationId('');
        setDestinationLocationLabel(null);
      }
      if (changed) {
        clearPickableCache();
        setDraft((current) => invalidateDraftStockContext(current));
        setSourceNotice(
          draftLinesRef.current.length > 0
            ? 'Cambiaste la bodega de origen: las líneas perdieron su disponibilidad. Revísalas con Modificar antes de crear la salida.'
            : null,
        );
      }
    },
    [sourceLocationId, destinationLocationId, clearPickableCache],
  );

  const openPeekForEdit = useCallback(
    (lineId: string) => {
      const line = draftLinesRef.current.find((candidate) => candidate.id === lineId);
      if (!line || !line.itemId.trim()) {
        return;
      }
      clearLineError(lineId);
      setProvisionalLine(null);
      setPeek({ lineId, mode: 'edit' });
    },
    [clearLineError],
  );

  /** Vía principal (MOD12 S2 §6.2): clic en el producto abre el panel. Si el
   * ítem ya está en el borrador, abre edición sobre esa línea en vez de crear
   * una provisional duplicada (CA-S2.1-FE01). */
  const openPeekForItem = useCallback(
    (itemId: string) => {
      const existing = draftLinesRef.current.find((line) => line.itemId === itemId);
      if (existing) {
        openPeekForEdit(existing.id);
        return;
      }
      const item = pickableCache.get(itemId);
      if (!item) {
        return;
      }
      const line = buildProvisionalDraftLine(item);
      if (!line) {
        return;
      }
      // El restaurador de foco del panel devuelve el foco a quien lo abrió al
      // cerrarse: abriendo con el buscador enfocado, tras confirmar el operador
      // queda listo para encadenar el siguiente producto o escaneo.
      document.getElementById('issue-catalog-search')?.focus();
      setProvisionalLine(line);
      setPeek({ lineId: line.id, mode: 'create' });
    },
    [pickableCache, openPeekForEdit],
  );

  // F4 (RF-CAT-16, CA-F4-05): solo el escaneo actúa solo — el lector deja el
  // código completo y lo cierra con Enter; con coincidencia única el panel de
  // captura se abre directamente. La búsqueda tecleada nunca actúa sola.
  // Espera al barrido vigente de la consulta (`completedQ`) antes de abrir.
  useEffect(() => {
    const armed = scanArmedRef.current;
    const wanted = debouncedSearch.trim();
    if (!armed || !wanted || armed !== wanted) {
      return;
    }
    if (activeScopeState.loading) {
      return;
    }
    if (completedQByScope[activeScope] !== wanted) {
      return;
    }
    scanArmedRef.current = null;
    if (activeScopeState.error) {
      setScanNotice('No fue posible verificar el escaneo. Usa Reintentar.');
      return;
    }
    const [single] = activeScopeState.items;
    if (activeScopeState.items.length !== 1 || !single) {
      setScanNotice('El escaneo no encontró un producto único; elige uno de los resultados.');
      return;
    }
    setScanNotice(`Se abrió ${single.sku} · ${single.name} para configurar la línea.`);
    openPeekForItem(single.itemId);
  }, [
    activeScopeState.items,
    activeScopeState.loading,
    activeScopeState.error,
    debouncedSearch,
    activeScope,
    completedQByScope,
    scanSeq,
    openPeekForItem,
  ]);

  const handlePeekConfirm = useCallback(
    (result: StockIssueLineSidePeekResult) => {
      if (!peek) {
        return;
      }
      mergeSerialLabels(result.serializedAssetLabels);
      setSourceNotice(null);

      if (peek.mode === 'edit') {
        clearLineError(peek.lineId);
        setDraft((current) => updateDraftLineConfiguration(current, peek.lineId, result));
        setLiveNotice('');
        setPeek(null);
        return;
      }

      // Alta por búsqueda: la línea confirmada entra al borrador configurada y
      // el foco vuelve al buscador para encadenar el siguiente producto.
      const provisional = provisionalLine;
      if (provisional && provisional.id === peek.lineId) {
        const configured = updateDraftLineConfiguration(
          { lines: [provisional] },
          provisional.id,
          result,
        );
        const [line] = configured.lines;
        if (line) {
          setDraft((current) => ({ lines: [...current.lines, line] }));
        }
      }
      setLiveNotice('');
      setPeek(null);
      setProvisionalLine(null);
    },
    [peek, provisionalLine, mergeSerialLabels, clearLineError],
  );

  const handlePeekOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPeek(null);
      setProvisionalLine(null);
    }
  }, []);

  function handleAddManualLine() {
    setDraft((current) => ({
      lines: [...current.lines, createManualStockIssueDraftLine()],
    }));
    if (!isDesktopLayout) {
      setMobileStep('review');
    }
  }

  const handleItemChange = useCallback(
    (lineId: string, hydration: StockIssueDraftItemHydration | null) => {
      clearLineError(lineId);
      setSourceNotice(null);
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
    },
    [clearLineError],
  );

  const handleQuantityChange = useCallback(
    (lineId: string, value: string) => {
      clearLineError(lineId);
      setDraft((current) => updateDraftLineQuantity(current, lineId, value));
    },
    [clearLineError],
  );

  const handleToggleLine = useCallback((lineId: string) => {
    setSelectedDraftLineIds((current) =>
      current.includes(lineId) ? current.filter((value) => value !== lineId) : [...current, lineId],
    );
  }, []);

  const handleToggleAll = useCallback((checked: boolean) => {
    setSelectedDraftLineIds(checked ? draftLinesRef.current.map((line) => line.id) : []);
  }, []);

  const handleRemoveLine = useCallback((lineId: string) => {
    setSourceNotice(null);
    setDraft((current) => removeDraftLine(current, lineId));
    setSelectedDraftLineIds((current) => current.filter((value) => value !== lineId));
  }, []);

  const handleRemoveSelected = useCallback(() => {
    setSourceNotice(null);
    setDraft((current) => {
      const ids = new Set(selectedDraftLineIdsRef.current);
      return removeDraftLines(current, [...ids]);
    });
    setSelectedDraftLineIds([]);
  }, []);

  const handleApplyBulkQuantity = useCallback((quantity: string) => {
    const ids = [...selectedDraftLineIdsRef.current];
    setDraft((current) => applyBulkQuantityToDraftLines(current, ids, quantity));
  }, []);

  function resetComposer() {
    abortAllScopes();
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
    clearScopes();
    clearPickableCache();
    setSelectedDraftLineIds([]);
    setDraft(createEmptyStockIssueDraft());
    setValidationError(null);
    setLineErrors({});
    setSourceNotice(null);
    setScanNotice('');
    setMobileStep('capture');
    resetSerialLabels();
    setLiveNotice('');
    setPeek(null);
    setProvisionalLine(null);
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
      // Grupo v2 del contrato (MOD12 S2): una línea, N seriales, cantidad N.
      serializedAssetIds: resolveLineSerializedAssetIds(line),
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
    // al primer inválido. Los seriales salen del grupo de la línea.
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
      const firstError = fieldErrors[0];
      if (firstError) {
        if (firstError.controlId.startsWith('issue-draft-modify-')) {
          // La corrección vive en el panel de línea (condición, lote, seriales):
          // se abre directamente sobre la línea inválida y el foco entra con él.
          const lineId = firstError.controlId.replace('issue-draft-modify-', '');
          const target = draft.lines.find((candidate) => candidate.id === lineId);
          if (target) {
            setProvisionalLine(null);
            setPeek({ lineId: target.id, mode: 'edit' });
          } else {
            focusControl(firstError.controlId);
          }
        } else {
          focusControl(firstError.controlId);
        }
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
      <div className="grid gap-3 md:grid-cols-3">
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
          onChange={handleSourceChange}
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
          description="Con el origen definido verás el catálogo con el disponible de cada producto."
        />
      );
    }

    if (debouncedSearch.trim().length < 2) {
      return (
        <PortalEmptyState
          className="w-full"
          title="Busca un producto para agregar"
          description="Escribe el código o el nombre, o escanea el código de barras."
        />
      );
    }

    if (activeScopeState.loading && !showListSkeleton && activeScopeState.items.length === 0) {
      // Hueco de carga con `aria-busy`: anuncia sin parpadear el skeleton.
      return (
        <span className="sr-only" role="status" aria-busy="true">
          Cargando material disponible…
        </span>
      );
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

    const trimmedQuery = debouncedSearch.trim();
    return (
      <>
        <StockIssueSearchResults
          rows={searchRows}
          isLoading={showListSkeleton}
          emptyTitle={trimmedQuery ? 'No hay productos que coincidan' : 'Sin resultados todavía'}
          emptyDescription={
            trimmedQuery
              ? 'Revisa el código o el nombre, o agrega una línea manual.'
              : 'Escribe para buscar en el catálogo, o agrega una línea manual.'
          }
          onOpenItem={openPeekForItem}
        />
        <PickableListFooter
          state={activeScopeState}
          loading={activeScopeState.loading}
          onLoadMore={handleLoadMore}
          onPageChange={(page) => handlePageChange(activeScope, page)}
          onPageSizeChange={(limit) => handlePageSizeChange(activeScope, limit)}
        />
      </>
    );
  })();

  const captureSection = (
    <section className="space-y-4">
      <PortalSectionHeader
        eyebrow="Productos"
        title={isEditMode ? 'Modificar productos' : 'Buscar y agregar'}
        description={
          showStockContext
            ? 'Busca el producto por código, nombre o marca: al abrirlo eliges condición, lote, seriales y cantidad.'
            : 'Selecciona primero la bodega de origen para buscar con el disponible de cada producto.'
        }
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={handleAddManualLine}>
            Agregar línea manual
          </Button>
        }
      />
      <Input
        id="issue-catalog-search"
        label="Buscar producto"
        placeholder="Busca por código, nombre, marca o escanea"
        helperText="Puedes escanear el código de barras y cerrar con Enter: con una sola coincidencia se abre directo para configurar la línea."
        value={catalogSearch}
        onChange={(event) => handleCatalogSearchChange(event.target.value)}
        onKeyDown={handleCatalogSearchKeyDown}
      />
      {scanNotice ? (
        <p className="sr-only" role="status">
          {scanNotice}
        </p>
      ) : null}
      {captureList}
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
      {sourceNotice ? (
        <PortalAlert variant="warning" title="Bodega cambiada" description={sourceNotice} />
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
            description="Busca un producto para agregarlo, o agrega una línea manual."
          />
        )
      ) : (
        <StockIssueDraftLinesTable
          lines={draft.lines}
          selectedLineIds={selectedDraftLineIds}
          serialLabelsById={serialLabelsById}
          liveNotice={liveNotice}
          pickableById={pickableById}
          lineErrors={lineErrors}
          busy={isSubmitting}
          onItemChange={handleItemChange}
          onQuantityChange={handleQuantityChange}
          onModifyLine={openPeekForEdit}
          onToggleLine={handleToggleLine}
          onToggleAll={handleToggleAll}
          onRemove={handleRemoveLine}
          onRemoveSelected={handleRemoveSelected}
          onApplyBulkQuantity={handleApplyBulkQuantity}
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
          {/* Corte en lg (SPEC S2 §6.4): la franja 768–1280 px ya tiene el
              layout de escritorio y el reparto da más ancho a la captura para
              que el panel no estrangule su propio texto. */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="space-y-6">{captureSection}</div>
            <div className="space-y-6">
              {draftSection}
              {summaryFooter}
            </div>
          </div>
        </>
      )}

      <StockIssueLineSidePeek
        open={peek != null && peekLine != null}
        onOpenChange={handlePeekOpenChange}
        line={peekLine}
        mode={peek?.mode ?? 'create'}
        sourceLocationId={sourceLocationId}
        excludedSerializedAssetIds={excludedSerializedAssetIds}
        serialLabelsById={serialLabelsById}
        busy={isSubmitting}
        onConfirm={handlePeekConfirm}
      />
    </div>
  );

  return content;
}
