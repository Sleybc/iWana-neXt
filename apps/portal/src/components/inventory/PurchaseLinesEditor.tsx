'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@iwana/ui';
import { PurchaseRequestLineSourceKind } from '@iwana/shared';
import type { InventoryCatalogOptionRecord } from '@/lib/api-client';
import { PortalAlert, PortalEmptyState, PortalSectionHeader } from '@/components/shared/portal-ui';
import { focusLastMatchingInput } from './line-focus';
import {
  addCatalogSelectionToDraft,
  applyBulkQuantityToDraftLines,
  applyBulkSupplierToDraftLines,
  removeDraftLine,
  removeDraftLines,
  type PurchaseDraftState,
} from './purchase-request-draft';
import { resolveCatalogSupplierLabel } from './purchase-catalog-selector';
import { buildCatalogUnitCostMap, estimatePurchaseDraftTotal } from './purchase-draft-estimate';
import { formatInventoryCurrency } from './inventory-labels';
import { PurchaseDraftLinesTable } from './PurchaseDraftLinesTable';
import { PurchaseProductSearch } from './PurchaseProductSearch';

export interface PurchaseLinesEditorProps {
  draft: PurchaseDraftState;
  onDraftChange: (updater: (current: PurchaseDraftState) => PurchaseDraftState) => void;
  catalogOptions: InventoryCatalogOptionRecord[];
  supplierLabels?: Record<string, string>;
  isCatalogSearching?: boolean;
  onCatalogSearch?: (search: string) => void;
  isSubmitting?: boolean;
  /** Id estable del buscador de productos (foco ante error de validación). */
  searchInputId?: string;
  /** Se invoca tras agregar una línea (búsqueda o manual), para flujos con pasos (ej. mobile). */
  onLineAdded?: () => void;
}

export interface PurchaseLinesEditorSections {
  captureSection: ReactNode;
  draftSection: ReactNode;
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

export function usePurchaseLinesEditorSections({
  draft,
  onDraftChange,
  catalogOptions,
  supplierLabels = {},
  isCatalogSearching = false,
  onCatalogSearch,
  isSubmitting = false,
  searchInputId,
  onLineAdded,
}: PurchaseLinesEditorProps): PurchaseLinesEditorSections {
  const [selectedDraftLineIds, setSelectedDraftLineIds] = useState<string[]>([]);
  const [duplicateAlert, setDuplicateAlert] = useState<string | null>(null);

  useEffect(() => {
    if (!duplicateAlert) {
      return;
    }

    const handle = window.setTimeout(() => setDuplicateAlert(null), 4000);
    return () => window.clearTimeout(handle);
  }, [duplicateAlert]);

  function handleSelectProduct(option: InventoryCatalogOptionRecord) {
    const alreadySelected = draft.lines.some(
      (line) =>
        line.sourceKind === PurchaseRequestLineSourceKind.INVENTORY_ITEM &&
        line.inventoryItemId === option.id,
    );

    if (alreadySelected) {
      setDuplicateAlert(option.name);
      return;
    }

    onDraftChange((current) =>
      addCatalogSelectionToDraft(
        current,
        [mapCatalogSelection(option, supplierLabels)],
        PurchaseRequestLineSourceKind.INVENTORY_ITEM,
      ),
    );
    // Fase 27: el foco sigue a la cantidad de la línea recién agregada.
    focusLastMatchingInput('purchase-draft-qty-');
    onLineAdded?.();
  }

  function handleAddManualLine() {
    onDraftChange((current) => ({
      lines: [...current.lines, createManualDraftLine()],
    }));
    focusLastMatchingInput('purchase-draft-label-');
    onLineAdded?.();
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
    onDraftChange((current) => removeDraftLines(current, selectedDraftLineIds));
    setSelectedDraftLineIds([]);
  }

  function handleSearchChange(search: string) {
    onCatalogSearch?.(search);
  }

  const unitCostByItemId = useMemo(() => buildCatalogUnitCostMap(catalogOptions), [catalogOptions]);
  const draftEstimate = useMemo(
    () => estimatePurchaseDraftTotal(draft.lines, unitCostByItemId),
    [draft.lines, unitCostByItemId],
  );
  const draftLineCount = draft.lines.length;
  const draftSummary =
    draftLineCount === 0
      ? 'Aquí ajustas cantidades y revisas el cierre de la solicitud.'
      : `${draftLineCount} línea${draftLineCount === 1 ? '' : 's'}${
          draftEstimate.coveredLines > 0
            ? ` · Total estimado: ${formatInventoryCurrency(draftEstimate.total)}`
            : ''
        }`;

  const captureSection = (
    <section className="space-y-3">
      <PortalSectionHeader
        eyebrow="Productos"
        title="Agregar productos"
        description="Busca por nombre o código y selecciona para agregarlo al borrador."
      />

      {duplicateAlert ? (
        <PortalAlert
          variant="warning"
          title="Este producto ya lo tienes en tu lista"
          description={`"${duplicateAlert}" ya fue agregado. Si necesitas más cantidad, ajústala desde la tabla de abajo.`}
        />
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <PurchaseProductSearch
            {...(searchInputId ? { id: searchInputId } : {})}
            catalogOptions={catalogOptions}
            supplierLabels={supplierLabels}
            isSearching={isCatalogSearching}
            disabled={isSubmitting}
            {...(onCatalogSearch ? { onSearchChange: handleSearchChange } : {})}
            onSelect={handleSelectProduct}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={isSubmitting}
          onClick={handleAddManualLine}
        >
          Agregar línea manual
        </Button>
      </div>
    </section>
  );

  const draftSection = (
    <section className="space-y-4">
      <PortalSectionHeader
        eyebrow="Borrador"
        title="Líneas seleccionadas"
        description={draftSummary}
      />

      {draft.lines.length === 0 ? (
        <PortalEmptyState
          title="Aún no hay líneas en el borrador"
          description="Busca un producto arriba o agrega una línea manual."
        />
      ) : (
        <PurchaseDraftLinesTable
          lines={draft.lines}
          selectedLineIds={selectedDraftLineIds}
          onLabelChange={(lineId, value) =>
            onDraftChange((current) => ({
              lines: current.lines.map((line) =>
                line.id === lineId ? { ...line, productLabel: value } : line,
              ),
            }))
          }
          onQuantityChange={(lineId, value) =>
            onDraftChange((current) => ({
              lines: current.lines.map((line) =>
                line.id === lineId ? { ...line, quantityRequested: value } : line,
              ),
            }))
          }
          onToggleLine={handleToggleDraftLine}
          onToggleAll={handleToggleAllDraftLines}
          onRemove={(lineId) => {
            onDraftChange((current) => removeDraftLine(current, lineId));
            setSelectedDraftLineIds((current) => current.filter((value) => value !== lineId));
          }}
          onRemoveSelected={handleRemoveSelectedDraftLines}
          onApplyBulkQuantity={(quantity) =>
            onDraftChange((current) =>
              applyBulkQuantityToDraftLines(current, selectedDraftLineIds, quantity),
            )
          }
          onApplyBulkSupplier={(partyRefId, displayName) =>
            onDraftChange((current) =>
              applyBulkSupplierToDraftLines(current, selectedDraftLineIds, partyRefId, displayName),
            )
          }
        />
      )}
    </section>
  );

  return { captureSection, draftSection };
}

export function PurchaseLinesEditor(props: PurchaseLinesEditorProps) {
  const { captureSection, draftSection } = usePurchaseLinesEditorSections(props);

  return (
    <div className="space-y-6">
      {captureSection}
      {draftSection}
    </div>
  );
}
