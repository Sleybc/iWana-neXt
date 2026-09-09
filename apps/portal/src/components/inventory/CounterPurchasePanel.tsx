'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, DatePicker, Input } from '@iwana/ui';
import { InventoryItemKind, InventoryTrackingMode } from '@iwana/shared';
import type {
  CreateCounterPurchaseDto,
  InventoryCatalogOptionRecord,
  InventoryItemRecord,
  PurchaseTaxPresetRecord,
  StockLocationRecord,
  StockMovementResultRecord,
} from '@/lib/api-client';
import {
  CreateModeSummaryFooter,
  PortalAlert,
  PortalEmptyState,
  PortalSectionHeader,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import { formatInventoryCurrency, formatInventoryMoney } from './inventory-labels';
import { QuoteTaxFields } from './QuoteTaxFields';
import {
  QUOTE_TAX_CODES,
  QUOTE_TAX_RATE_ERROR,
  buildQuoteTaxesPayload,
  computeQuoteTaxPreview,
  createInitialQuoteTaxState,
  formatQuoteTaxRate,
  getQuoteTaxVisibleLabel,
  resolveQuoteTaxDefaultRate,
  type QuoteTaxCode,
  type QuoteTaxState,
} from './quote-tax-calc';
import { toDateFromLocalDateValue, toLocalDateValue } from './inventory-date';
import { PurchaseCreateModeHeader } from './PurchaseCreateModeHeader';
import { PurchaseCreateModeShell } from './PurchaseCreateModeShell';
import { PurchaseProductSearch } from './PurchaseProductSearch';
import {
  CounterPurchaseLinesTable,
  type CounterPurchaseLineDraft,
} from './CounterPurchaseLinesTable';
import { SupplierPicker } from './SupplierPicker';
import { InventoryLocationPicker } from './InventoryLocationPicker';

interface CounterPurchasePanelProps {
  items: InventoryItemRecord[];
  catalogOptions: InventoryCatalogOptionRecord[];
  /** @deprecated E-4: la bodega destino usa InventoryLocationPicker; prop opcional por compat. */
  locations?: StockLocationRecord[];
  isSubmitting: boolean;
  error: string | null;
  lastResult: StockMovementResultRecord | null;
  isCatalogSearching?: boolean;
  supplierLabels?: Record<string, string>;
  onCatalogSearch?: (search: string) => void;
  onSubmit: (payload: CreateCounterPurchaseDto) => Promise<void>;
  onBack?: () => void;
  onDismissSuccess?: () => void;
  /**
   * Presets PURCHASE del catálogo (Fase 26). 100% props-driven: el panel NO
   * fetchea; `PurchaseWorkspace` los carga al abrir el modo counter-purchase.
   * `undefined` (carga pendiente o GET fallido) degrada a defaults locales.
   */
  taxPresets?: PurchaseTaxPresetRecord[] | undefined;
}

/** Copy informativo congelado (SPEC Fase 26 §7). */
export const COUNTER_PURCHASE_TAX_TITLE = 'Tributos de esta compra (según factura)';
export const COUNTER_PURCHASE_TAX_HINT =
  'Informativo: sirve para estimar el pago según la factura. No es un cálculo tributario ni un documento DIAN.';

function buildInitialCounterPurchaseTaxes(
  presets: PurchaseTaxPresetRecord[] | undefined,
): QuoteTaxState {
  return {
    ...createInitialQuoteTaxState(presets),
    IVA_19: {
      applies: true,
      rate: formatQuoteTaxRate(resolveQuoteTaxDefaultRate('IVA_19', presets)),
    },
  };
}

function createLineId(): string {
  return `cpl-${Math.random().toString(36).slice(2, 10)}`;
}

function requiresSerialsForItem(
  items: InventoryItemRecord[],
  catalogOptions: InventoryCatalogOptionRecord[],
  itemId: string,
): boolean {
  const item = items.find((entry) => entry.id === itemId);
  if (item) {
    return [InventoryTrackingMode.SERIALIZED, InventoryTrackingMode.FIXED_ASSET].includes(
      item.trackingMode,
    );
  }

  const option = catalogOptions.find((entry) => entry.id === itemId);
  return option?.itemKind === InventoryItemKind.SERIALIZED;
}

function buildLineFromCatalog(
  option: InventoryCatalogOptionRecord,
  items: InventoryItemRecord[],
  catalogOptions: InventoryCatalogOptionRecord[],
): CounterPurchaseLineDraft {
  return {
    id: createLineId(),
    itemId: option.id,
    sku: option.sku,
    name: option.name,
    quantityReceived: '1',
    unitCost: option.standardCost || '0',
    lotNumber: '',
    serialNumbers: '',
    requiresSerials: requiresSerialsForItem(items, catalogOptions, option.id),
  };
}

export function CounterPurchasePanel({
  items,
  catalogOptions,
  locations: _locations,
  isSubmitting,
  error,
  lastResult,
  isCatalogSearching = false,
  supplierLabels = {},
  onCatalogSearch,
  onSubmit,
  onBack,
  onDismissSuccess,
  taxPresets,
}: CounterPurchasePanelProps) {
  const notesId = useId();
  const [partyRefId, setPartyRefId] = useState<string | null>(null);
  const [supplierLabel, setSupplierLabel] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(toLocalDateValue(new Date()));
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [destinationLocationLabel, setDestinationLocationLabel] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<CounterPurchaseLineDraft[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [taxes, setTaxes] = useState<QuoteTaxState>(() =>
    buildInitialCounterPurchaseTaxes(taxPresets),
  );
  /**
   * Filas editadas por el operador. Los presets llegan async: al cambiar
   * `taxPresets` solo se re-hidrata la tasa de filas no tocadas, sin pisar
   * ediciones del usuario.
   */
  const touchedTaxRowsRef = useRef<Set<QuoteTaxCode>>(new Set());

  function handleTaxesChange(next: QuoteTaxState) {
    setTaxes((previous) => {
      for (const code of QUOTE_TAX_CODES) {
        if (
          previous[code].applies !== next[code].applies ||
          previous[code].rate !== next[code].rate
        ) {
          touchedTaxRowsRef.current.add(code);
        }
      }
      return next;
    });
  }

  useEffect(() => {
    setTaxes((previous) => {
      let changed = false;
      const next: QuoteTaxState = { ...previous };
      for (const code of QUOTE_TAX_CODES) {
        if (touchedTaxRowsRef.current.has(code)) {
          continue;
        }
        const rehydrated = formatQuoteTaxRate(resolveQuoteTaxDefaultRate(code, taxPresets));
        if (previous[code].rate !== rehydrated) {
          next[code] = { ...previous[code], rate: rehydrated };
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [taxPresets]);

  const activeLines = useMemo(
    () =>
      lines.filter((line) => line.itemId && Number.parseFloat(line.quantityReceived || '0') > 0),
    [lines],
  );

  const isDirty = useMemo(() => {
    return (
      Boolean(partyRefId) ||
      invoiceNumber.trim().length > 0 ||
      notes.trim().length > 0 ||
      lines.length > 0 ||
      Boolean(destinationLocationId) ||
      Object.values(taxes).some((row) => row.applies)
    );
  }, [destinationLocationId, invoiceNumber, lines.length, notes, partyRefId, taxes]);

  const summaryLabel = useMemo(() => {
    const destinationLabel = destinationLocationLabel?.trim() || 'sin bodega destino';
    const supplier = supplierLabel?.trim() || 'sin proveedor';
    return `${supplier} · ${invoiceNumber.trim() || 'sin factura'} · ${destinationLabel} · ${activeLines.length} línea${activeLines.length === 1 ? '' : 's'}`;
  }, [activeLines.length, destinationLocationLabel, invoiceNumber, supplierLabel]);

  const estimatedTotal = useMemo(() => {
    return activeLines.reduce((total, line) => {
      const quantity = Number.parseFloat(line.quantityReceived || '0');
      const unitCost = Number.parseFloat(line.unitCost || '0');
      return total + quantity * unitCost;
    }, 0);
  }, [activeLines]);

  const taxPreview = useMemo(
    () => computeQuoteTaxPreview({ amount: estimatedTotal, shippingCost: 0, taxes }),
    [estimatedTotal, taxes],
  );
  const taxesPayload = useMemo(() => buildQuoteTaxesPayload(taxes), [taxes]);

  function resetForm() {
    setPartyRefId(null);
    setSupplierLabel(null);
    setInvoiceNumber('');
    setPurchaseDate(toLocalDateValue(new Date()));
    setDestinationLocationId('');
    setDestinationLocationLabel(null);
    setNotes('');
    setLines([]);
    setValidationError(null);
    touchedTaxRowsRef.current.clear();
    setTaxes(buildInitialCounterPurchaseTaxes(taxPresets));
  }

  function handleRegisterAnother() {
    resetForm();
    onDismissSuccess?.();
  }

  function handleBack() {
    if (!onBack) {
      return;
    }

    if (isDirty && !window.confirm('Hay cambios sin registrar. ¿Volver al listado?')) {
      return;
    }

    onBack();
  }

  function handleAddProduct(option: InventoryCatalogOptionRecord) {
    setLines((current) => {
      const existing = current.find((line) => line.itemId === option.id);
      if (existing) {
        return current.map((line) =>
          line.id === existing.id
            ? {
                ...line,
                quantityReceived: String(Number.parseFloat(line.quantityReceived || '0') + 1),
              }
            : line,
        );
      }

      return [...current, buildLineFromCatalog(option, items, catalogOptions)];
    });
    setValidationError(null);
  }

  function updateLine(
    lineId: string,
    patch: Partial<
      Pick<
        CounterPurchaseLineDraft,
        'quantityReceived' | 'unitCost' | 'lotNumber' | 'serialNumbers'
      >
    >,
  ) {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    );
  }

  async function handleSubmit() {
    if (!partyRefId) {
      setValidationError('Selecciona un proveedor.');
      return;
    }

    if (!invoiceNumber.trim()) {
      setValidationError('Indica la factura o soporte.');
      return;
    }

    if (!destinationLocationId) {
      setValidationError('Selecciona una bodega destino.');
      return;
    }

    if (activeLines.length === 0) {
      setValidationError('Agrega al menos un producto con cantidad mayor a cero.');
      return;
    }

    const missingSerials = activeLines.find((line) => {
      if (!line.requiresSerials) {
        return false;
      }
      const expected = Math.round(Number.parseFloat(line.quantityReceived || '0'));
      const serials = line.serialNumbers
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      return serials.length !== expected;
    });

    if (missingSerials) {
      setValidationError(
        `En «${missingSerials.name}» la cantidad de seriales debe coincidir con la cantidad recibida.`,
      );
      return;
    }

    if (!taxPreview.valid) {
      setValidationError(QUOTE_TAX_RATE_ERROR);
      return;
    }

    setValidationError(null);

    await onSubmit({
      partyRefId,
      invoiceNumber: invoiceNumber.trim(),
      purchaseDate: purchaseDate || null,
      destinationLocationId,
      notes: notes.trim() || null,
      ...(taxesPayload.length > 0 ? { taxes: taxesPayload } : {}),
      lines: activeLines.map((line) => ({
        itemId: line.itemId,
        quantityReceived: Number.parseFloat(line.quantityReceived),
        unitCost: Number.parseFloat(line.unitCost || '0'),
        lotNumber: line.lotNumber.trim() || null,
        serialNumbers: line.serialNumbers
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      })),
    });
  }

  return (
    <PurchaseCreateModeShell
      header={
        <PurchaseCreateModeHeader
          draftLineCount={activeLines.length}
          onBack={handleBack}
          eyebrow="Ingreso directo"
          title="Compra de mostrador"
          description="Registra mercancía ya adquirida con factura en mano, sin solicitud ni orden de compra."
        />
      }
    >
      <div className="space-y-6">
        {lastResult ? (
          <PortalAlert
            variant="success"
            title="Ingreso registrado"
            description={`Se creó el movimiento ${lastResult.movement.movementNumber} con ${lastResult.lines.length} línea${lastResult.lines.length === 1 ? '' : 's'}.`}
            action={
              <Button type="button" variant="secondary" onClick={handleRegisterAnother}>
                Registrar otro ingreso
              </Button>
            }
          />
        ) : null}

        {error ? (
          <PortalAlert
            variant="error"
            title="No fue posible registrar el ingreso"
            description={error}
          />
        ) : null}

        {validationError ? (
          <PortalAlert
            variant="warning"
            title="Completa los datos requeridos"
            description={validationError}
          />
        ) : null}

        <section className="space-y-4">
          <PortalSectionHeader
            title="Datos del ingreso"
            description="Proveedor, soporte documental y bodega de destino."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <SupplierPicker
              value={partyRefId}
              selectedLabel={supplierLabel}
              onChange={(nextPartyRefId, displayName) => {
                setPartyRefId(nextPartyRefId);
                setSupplierLabel(displayName);
                setValidationError(null);
              }}
            />
            <Input
              id="counter-purchase-invoice"
              label="Factura o soporte"
              value={invoiceNumber}
              onChange={(event) => {
                setInvoiceNumber(event.target.value);
                setValidationError(null);
              }}
              placeholder="Número de factura"
            />
            <DatePicker
              id="counter-purchase-date"
              label="Fecha de compra"
              value={toDateFromLocalDateValue(purchaseDate)}
              onChange={(date) => setPurchaseDate(toLocalDateValue(date))}
            />
            <InventoryLocationPicker
              id="counter-purchase-destination"
              label="Bodega destino"
              value={destinationLocationId || null}
              selectedLabel={destinationLocationLabel}
              onChange={(nextId, item) => {
                setDestinationLocationId(nextId ?? '');
                setDestinationLocationLabel(item ? item.label : null);
                setValidationError(null);
              }}
            />
          </div>
        </section>

        <section className="space-y-4">
          <PortalSectionHeader
            title="Líneas de ingreso"
            description="Busca productos del catálogo y ajusta cantidades, costos y seriales."
          />
          <PurchaseProductSearch
            catalogOptions={catalogOptions}
            supplierLabels={supplierLabels}
            isSearching={isCatalogSearching}
            {...(onCatalogSearch ? { onSearchChange: onCatalogSearch } : {})}
            onSelect={handleAddProduct}
          />

          {lines.length === 0 ? (
            <PortalEmptyState
              title="Sin líneas"
              description="Busca un producto del catálogo para comenzar el ingreso."
            />
          ) : (
            <CounterPurchaseLinesTable
              lines={lines}
              onQuantityChange={(lineId, value) => updateLine(lineId, { quantityReceived: value })}
              onUnitCostChange={(lineId, value) => updateLine(lineId, { unitCost: value })}
              onLotNumberChange={(lineId, value) => updateLine(lineId, { lotNumber: value })}
              onSerialNumbersChange={(lineId, value) =>
                updateLine(lineId, { serialNumbers: value })
              }
              onRemove={(lineId) =>
                setLines((current) => current.filter((line) => line.id !== lineId))
              }
            />
          )}
        </section>

        <section className="space-y-4">
          <QuoteTaxFields
            value={taxes}
            onChange={handleTaxesChange}
            presets={taxPresets}
            title={COUNTER_PURCHASE_TAX_TITLE}
            hint={COUNTER_PURCHASE_TAX_HINT}
          />
        </section>

        <section className="space-y-4">
          <PortalSectionHeader title="Notas" description="Observaciones opcionales del ingreso." />
          <label className="flex w-full flex-col gap-1.5 text-sm" htmlFor={notesId}>
            <span className="font-medium text-gray-700 dark:text-gray-300">Notas</span>
            <textarea
              id={notesId}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={portalTextareaClassName}
            />
          </label>
        </section>

        <section aria-label="Resumen de tributos" className="space-y-4">
          <PortalSectionHeader
            title="Resumen previo al registro"
            description="Subtotal neto de líneas más tributos informativos de la factura."
          />
          <dl className="space-y-1 rounded-2xl border border-gray-200 p-3 text-sm dark:border-dark-border">
            <div className="flex justify-between gap-2">
              <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Subtotal (neto)
              </dt>
              <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                {formatInventoryMoney(estimatedTotal)}
              </dd>
            </div>
            {taxPreview.lines.map((line) => (
              <div key={line.code} className="flex justify-between gap-2">
                <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  {getQuoteTaxVisibleLabel({ code: line.code, name: line.label })}
                </dt>
                <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                  {line.effect === 'ADD'
                    ? formatInventoryMoney(line.taxAmount)
                    : `− ${formatInventoryMoney(line.taxAmount)}`}
                </dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-2 border-t border-gray-100 pt-2 dark:border-dark-border">
              <dt className="font-medium text-gray-900 dark:text-white">
                Total estimado con tributos
              </dt>
              <dd className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
                {taxPreview.valid && taxPreview.payable !== null
                  ? formatInventoryMoney(taxPreview.payable)
                  : '—'}
              </dd>
            </div>
          </dl>
        </section>

        <CreateModeSummaryFooter
          title="Resumen previo al registro"
          summary={`${summaryLabel} · Subtotal (neto): ${formatInventoryCurrency(String(estimatedTotal))} · Total estimado con tributos: ${taxPreview.valid && taxPreview.payable !== null ? formatInventoryMoney(taxPreview.payable) : '—'}`}
          primaryLabel="Registrar ingreso directo"
          primaryLoadingLabel="Registrando ingreso…"
          loading={isSubmitting}
          disabled={isSubmitting}
          onPrimaryClick={() => void handleSubmit()}
        />
      </div>
    </PurchaseCreateModeShell>
  );
}
