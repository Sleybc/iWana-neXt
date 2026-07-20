'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Select } from '@iwana/ui';
import { StockIssueType, StockLocationType } from '@iwana/shared';
import type {
  CreateStockIssueDto,
  InventoryItemRecord,
  SerializedAssetRecord,
  StockBalanceRecord,
  StockIssueDetailRecord,
  StockLocationRecord,
  UpdateStockIssueDto,
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
  getStockLocationTypeLabel,
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
import {
  getDestinationCandidates,
  getSourceCandidates,
  showDestinationForIssueType,
} from './stock-issue-form-utils';
import { buildCreateStockIssuePayload, buildUpdateStockIssuePayload } from './stock-issue-submit';
import { buildAvailableQuantityByItemAtLocation } from './stock-issue-balance-utils';
import { buildStockIssueSuggestions } from './stock-issue-suggestions';

type DestinationOptionsByType = Map<StockLocationType, StockLocationRecord[]>;
export type StockIssueComposerMode = 'create' | 'edit';

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
  items: InventoryItemRecord[];
  balances?: StockBalanceRecord[];
  assets?: SerializedAssetRecord[];
  locations: StockLocationRecord[];
  destinationOptions: DestinationOptionsByType;
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
  items,
  balances = [],
  assets = [],
  locations,
  destinationOptions,
  issueItemFrequency = {},
  isSubmitting = false,
  error = null,
  onDirtyChange,
  onDraftLineCountChange,
  onSubmit,
  onUpdate,
}: StockIssueComposerProps) {
  const isEditMode = mode === 'edit';
  const [type, setType] = useState<StockIssueType>(StockIssueType.TECHNICIAN_CUSTODY);
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
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

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
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
        items,
        balances,
        sourceLocationId,
        search: catalogSearch,
        issueItemFrequency,
      }),
    [items, balances, sourceLocationId, catalogSearch, issueItemFrequency],
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

  const sourceCandidates = useMemo(() => getSourceCandidates(type, locations), [type, locations]);

  const destinationCandidates = useMemo(
    () => getDestinationCandidates(type, locations, sourceLocationId, destinationOptions),
    [type, locations, sourceLocationId, destinationOptions],
  );

  const sourceOptions = useMemo(
    () => [
      { value: '', label: 'Selecciona una bodega' },
      ...sourceCandidates.map((location) => ({
        value: location.id,
        label: `${location.code} · ${location.name} (${getStockLocationTypeLabel(location.type)})`,
      })),
    ],
    [sourceCandidates],
  );

  const destinationSelectOptions = useMemo(
    () => [
      { value: '', label: 'Selecciona el destino' },
      ...destinationCandidates.map((location) => ({
        value: location.id,
        label: `${location.code} · ${location.name} (${getStockLocationTypeLabel(location.type)})`,
      })),
    ],
    [destinationCandidates],
  );

  const catalogRows = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    return items
      .filter((item) => {
        if (!query) {
          return true;
        }
        return item.sku.toLowerCase().includes(query) || item.name.toLowerCase().includes(query);
      })
      .map((item) => ({
        id: item.id,
        productLabel: `${item.sku} · ${item.name}`,
        categoryName: item.categoryName ?? '—',
        unitLabel: item.unitOfMeasure ?? '—',
        availableLabel: showStockContext
          ? formatInventoryQuantity(availableByItemId.get(item.id) ?? 0)
          : null,
        selected: selectedCatalogIds.includes(item.id),
      }));
  }, [items, catalogSearch, selectedCatalogIds, showStockContext, availableByItemId]);

  const summaryLabel = useMemo(() => {
    const destinationLabel = showDestination
      ? (destinationCandidates.find((loc) => loc.id === destinationLocationId)?.name ??
        'sin destino')
      : getStockIssueTypeLabel(type);
    return `${getStockIssueTypeLabel(type)} · ${destinationLabel} · ${draft.lines.length} línea${draft.lines.length === 1 ? '' : 's'}`;
  }, [type, showDestination, destinationLocationId, destinationCandidates, draft.lines.length]);

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

  function handleAddSelectedProducts() {
    const selectedFromSuggestions = items.filter((item) => selectedSuggestionIds.includes(item.id));
    const selectedFromCatalog = items.filter((item) => selectedCatalogIds.includes(item.id));
    const uniqueItems = new Map(
      [...selectedFromSuggestions, ...selectedFromCatalog].map((item) => [item.id, item]),
    );
    const selections = [...uniqueItems.values()].map((item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      unitOfMeasure: item.unitOfMeasure ?? 'unidad',
    }));

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
    setDestinationLocationId('');
    setCommercialRefId('');
    setOriginRefId('');
    setCostCenter('');
    setReason('');
    setCatalogSearch('');
    setSourceTab('suggestions');
    setSelectedSuggestionIds([]);
    setSelectedCatalogIds([]);
    setSelectedDraftLineIds([]);
    setDraft(createEmptyStockIssueDraft());
    setValidationError(null);
    setDuplicateNotice(null);
    setMobileStep('capture');
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
          }}
          options={TYPE_OPTIONS}
        />
        <Select
          id="issue-source"
          label="Origen"
          value={sourceLocationId}
          onChange={(event) => {
            const nextSource = event.target.value;
            setSourceLocationId(nextSource);
            if (destinationLocationId === nextSource) {
              setDestinationLocationId('');
            }
          }}
          options={sourceOptions}
        />
        {showDestination ? (
          <Select
            id="issue-destination"
            label="Destino"
            className="md:col-span-2"
            value={destinationLocationId}
            onChange={(event) => setDestinationLocationId(event.target.value)}
            options={destinationSelectOptions}
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
        catalogCount={items.length}
        onValueChange={setSourceTab}
      />
      <Input
        id="issue-catalog-search"
        label="Buscar ítem"
        placeholder="Código o nombre"
        value={catalogSearch}
        onChange={(event) => setCatalogSearch(event.target.value)}
      />
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
      ) : (
        <StockIssueCatalogSelector
          rows={catalogRows}
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
          items={items}
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
