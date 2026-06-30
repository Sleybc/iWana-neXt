'use client';

import { useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select } from '@iwana/ui';
import {
  PurchaseRequestLineSourceKind,
  PurchaseRequestPriority,
  PurchaseRequestType,
} from '@iwana/shared';
import type { CreatePurchaseRequestDto, InventoryCatalogOptionRecord } from '@/lib/api-client';
import { PortalAlert, PortalPanel, PortalSectionHeader } from '@/components/shared/portal-ui';
import {
  getPurchaseRequestLineSourceLabel,
  getPurchaseRequestLineSourceHelperLabel,
  getPurchaseRequestPriorityLabel,
  getPurchaseRequestTypeHelperLabel,
  getPurchaseRequestTypeLabel,
} from './inventory-labels';
import { SupplierPicker } from './SupplierPicker';
import { toDateFromLocalDateValue, toLocalDateValue } from './inventory-date';
import {
  buildCatalogSelectOptions,
  filterCatalogOptions,
  resolveCatalogSupplierPrefill,
  resolveCatalogUnitOfMeasure,
} from './purchase-catalog-selector';

interface PurchaseRequestComposerProps {
  catalogOptions: InventoryCatalogOptionRecord[];
  supplierLabels?: Record<string, string>;
  isSubmitting: boolean;
  error: string | null;
  layout?: 'panel' | 'embedded';
  onSubmit: (payload: CreatePurchaseRequestDto) => Promise<void>;
}

interface LineDraft {
  id: string;
  sourceKind: PurchaseRequestLineSourceKind;
  inventoryItemId: string;
  productSearch: string;
  freeTextDescription: string;
  quantityRequested: string;
  unitOfMeasure: string;
  suggestedPartyRefId: string;
  suggestedPartyName: string;
  notes: string;
}

let lineDraftSequence = 0;

function createLineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  lineDraftSequence += 1;
  return `purchase-line-${lineDraftSequence}`;
}

function createLineDraft(): LineDraft {
  return {
    id: createLineId(),
    sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
    inventoryItemId: '',
    productSearch: '',
    freeTextDescription: '',
    quantityRequested: '1',
    unitOfMeasure: 'unidad',
    suggestedPartyRefId: '',
    suggestedPartyName: '',
    notes: '',
  };
}

const TYPE_OPTIONS = Object.values(PurchaseRequestType).map((value) => ({
  value,
  label: getPurchaseRequestTypeLabel(value),
}));

const PRIORITY_OPTIONS = Object.values(PurchaseRequestPriority).map((value) => ({
  value,
  label: getPurchaseRequestPriorityLabel(value),
}));

const SOURCE_OPTIONS = Object.values(PurchaseRequestLineSourceKind).map((value) => ({
  value,
  label: getPurchaseRequestLineSourceLabel(value),
}));

export function PurchaseRequestComposer({
  catalogOptions,
  supplierLabels = {},
  isSubmitting,
  error,
  layout = 'panel',
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
  const [lines, setLines] = useState<LineDraft[]>([createLineDraft()]);

  const lineCount = lines.length;
  const summaryLabel = useMemo(
    () =>
      `${getPurchaseRequestTypeLabel(requestType)} · ${getPurchaseRequestPriorityLabel(priority)} · ${lineCount} línea${lineCount === 1 ? '' : 's'}`,
    [requestType, priority, lineCount],
  );

  async function handleSubmit() {
    await onSubmit({
      title: title.trim(),
      requestType,
      priority,
      requestingArea: requestingArea.trim(),
      justification: justification.trim(),
      neededByDate: neededByDate || null,
      lines: lines.map((line) => ({
        sourceKind: line.sourceKind,
        inventoryItemId:
          line.sourceKind === PurchaseRequestLineSourceKind.INVENTORY_ITEM
            ? line.inventoryItemId || null
            : null,
        freeTextDescription:
          line.sourceKind === PurchaseRequestLineSourceKind.FREE_TEXT
            ? line.freeTextDescription.trim() || null
            : null,
        quantityRequested: Number(line.quantityRequested || '0'),
        unitOfMeasure: line.unitOfMeasure.trim(),
        suggestedPartyRefId: line.suggestedPartyRefId.trim() || null,
        notes: line.notes.trim() || null,
      })),
    });

    setTitle('');
    setRequestingArea('');
    setJustification('');
    setNeededByDate('');
    setLines([createLineDraft()]);
  }

  function updateLine(lineId: string, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(lineId: string) {
    setLines((current) =>
      current.length <= 1 ? current : current.filter((line) => line.id !== lineId),
    );
  }

  function handleCatalogSelection(lineId: string, inventoryItemId: string) {
    const selected = catalogOptions.find((option) => option.id === inventoryItemId);
    if (!selected) {
      updateLine(lineId, { inventoryItemId });
      return;
    }

    const supplierPrefill = resolveCatalogSupplierPrefill(selected, supplierLabels);

    updateLine(lineId, {
      inventoryItemId,
      unitOfMeasure: resolveCatalogUnitOfMeasure(selected),
      suggestedPartyRefId: supplierPrefill.suggestedPartyRefId,
      suggestedPartyName: supplierPrefill.suggestedPartyName,
    });
  }

  function renderCatalogLineFields(line: LineDraft) {
    const filteredOptions = filterCatalogOptions(catalogOptions, line.productSearch);

    return (
      <div className="space-y-3 md:col-span-2">
        <Input
          id={`purchase-line-search-${line.id}`}
          label="Buscar producto"
          placeholder="SKU o nombre"
          value={line.productSearch}
          onChange={(e) => updateLine(line.id, { productSearch: e.target.value })}
        />
        <Select
          id={`purchase-line-item-${line.id}`}
          label="Producto del catálogo"
          value={line.inventoryItemId}
          menuWidth={420}
          onChange={(e) => handleCatalogSelection(line.id, e.target.value)}
          options={buildCatalogSelectOptions(filteredOptions)}
        />
      </div>
    );
  }

  const content = (
    <div className="space-y-6">
      {error ? (
        <PortalAlert variant="error" title="No se pudo crear la solicitud" description={error} />
      ) : null}

      <section className="space-y-4">
        <PortalSectionHeader
          eyebrow="Solicitud"
          title="Datos de la solicitud"
          description="Indica qué necesitas comprar, para qué área y con qué prioridad."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            id="purchase-title"
            label="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            id="purchase-area"
            label="Área solicitante"
            value={requestingArea}
            onChange={(e) => setRequestingArea(e.target.value)}
          />
          <Select
            id="purchase-type"
            label="Tipo de compra"
            value={requestType}
            helperText={getPurchaseRequestTypeHelperLabel(requestType)}
            onChange={(e) => setRequestType(e.target.value as PurchaseRequestType)}
            options={TYPE_OPTIONS}
          />
          <Select
            id="purchase-priority"
            label="Prioridad"
            value={priority}
            onChange={(e) => setPriority(e.target.value as PurchaseRequestPriority)}
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
      </section>

      <section className="space-y-4">
        <PortalSectionHeader
          eyebrow="Productos"
          title="Detalle del pedido"
          description="Agrega uno o varios productos. Puedes elegirlos del catálogo, usar una sugerencia o describirlos a mano."
        />
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div
              key={line.id}
              className="rounded-2xl border border-gray-200 p-4 dark:border-dark-border"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Línea {index + 1}
                </p>
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(line.id)}
                  >
                    Quitar línea
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-3 md:items-end">
                <Select
                  id={`purchase-line-source-${line.id}`}
                  label="Agregar desde"
                  value={line.sourceKind}
                  onChange={(e) =>
                    updateLine(line.id, {
                      sourceKind: e.target.value as PurchaseRequestLineSourceKind,
                    })
                  }
                  options={SOURCE_OPTIONS}
                />
                {line.sourceKind === PurchaseRequestLineSourceKind.INVENTORY_ITEM ? (
                  renderCatalogLineFields(line)
                ) : (
                  <div className="md:col-span-2">
                    <Input
                      id={`purchase-line-description-${line.id}`}
                      label="Descripción"
                      value={line.freeTextDescription}
                      onChange={(e) => updateLine(line.id, { freeTextDescription: e.target.value })}
                    />
                  </div>
                )}
                <p className="text-xs text-gray-400 md:col-span-3 dark:text-gray-500">
                  {getPurchaseRequestLineSourceHelperLabel(line.sourceKind)}
                </p>
                <Input
                  id={`purchase-line-qty-${line.id}`}
                  label="Cantidad"
                  value={line.quantityRequested}
                  onChange={(e) => updateLine(line.id, { quantityRequested: e.target.value })}
                />
                <Input
                  id={`purchase-line-unit-${line.id}`}
                  label="Unidad"
                  value={line.unitOfMeasure}
                  onChange={(e) => updateLine(line.id, { unitOfMeasure: e.target.value })}
                />
                <div className="md:col-span-3">
                  <SupplierPicker
                    label="Proveedor sugerido"
                    value={line.suggestedPartyRefId || null}
                    selectedLabel={line.suggestedPartyName || null}
                    onChange={(partyRefId, displayName) => {
                      updateLine(line.id, {
                        suggestedPartyRefId: partyRefId ?? '',
                        suggestedPartyName: displayName ?? '',
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setLines((current) => [...current, createLineDraft()])}
          >
            Agregar línea
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <PortalSectionHeader
          eyebrow="Control"
          title="Justificación"
          description="Explica la necesidad operativa que respalda la solicitud."
        />
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-gray-900 dark:text-white">Justificación</span>
          <textarea
            aria-label="Justificación"
            className="w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white"
            rows={3}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </label>
      </section>

      <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 text-sm dark:border-dark-border dark:bg-dark-surface-3">
        <p className="font-medium text-gray-900 dark:text-white">Resumen previo al envío</p>
        <p className="mt-1 text-gray-600 dark:text-gray-300">{summaryLabel}</p>
      </div>

      <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
        {isSubmitting ? 'Creando solicitud…' : 'Crear solicitud'}
      </Button>
    </div>
  );

  if (layout === 'embedded') {
    return content;
  }

  return (
    <PortalPanel
      eyebrow="Nueva solicitud"
      title="Nueva solicitud de compra"
      description="Combina ítems de inventario, sugerencias o descripciones libres en una sola solicitud."
    >
      {content}
    </PortalPanel>
  );
}
