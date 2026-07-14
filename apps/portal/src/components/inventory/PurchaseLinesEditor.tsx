'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@iwana/ui';
import { PurchaseRequestLineSourceKind } from '@iwana/shared';
import type { InventoryCatalogOptionRecord } from '@/lib/api-client';
import { PortalAlert, PortalEmptyState, PortalSectionHeader } from '@/components/shared/portal-ui';
import {
  addCatalogSelectionToDraft,
  applyBulkQuantityToDraftLines,
  applyBulkSupplierToDraftLines,
  removeDraftLine,
  removeDraftLines,
  type PurchaseDraftState,
} from './purchase-request-draft';
import { resolveCatalogSupplierLabel } from './purchase-catalog-selector';
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
    onLineAdded?.();
  }

  function handleAddManualLine() {
    onDraftChange((current) => ({
      lines: [...current.lines, createManualDraftLine()],
    }));
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

  const captureSection = (
    <section className="space-y-4">
      <PortalSectionHeader
        eyebrow="Productos"
        title="Agregar productos"
        description="Busca por nombre o código y selecciona para agregarlo al borrador."
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={handleAddManualLine}>
            Agregar línea manual
          </Button>
        }
      />

      {duplicateAlert ? (
        <PortalAlert
          variant="warning"
          title="Este producto ya lo tienes en tu lista"
          description={`"${duplicateAlert}" ya fue agregado. Si necesitas más cantidad, ajústala desde la tabla de abajo.`}
        />
      ) : null}

      <PurchaseProductSearch
        catalogOptions={catalogOptions}
        supplierLabels={supplierLabels}
        isSearching={isCatalogSearching}
        disabled={isSubmitting}
        {...(onCatalogSearch ? { onSearchChange: handleSearchChange } : {})}
        onSelect={handleSelectProduct}
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
