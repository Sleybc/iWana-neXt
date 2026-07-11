'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Select } from '@iwana/ui';
import { InventoryTrackingMode } from '@iwana/shared';
import type {
  CreateCounterPurchaseDto,
  InventoryCatalogOptionRecord,
  InventoryItemRecord,
  StockLocationRecord,
  StockMovementResultRecord,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  CreateModeSummaryFooter,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import { formatInventoryCurrency, formatInventoryQuantity } from './inventory-labels';
import { SupplierPicker } from './SupplierPicker';
import { toLocalDateValue } from './inventory-date';

interface CounterPurchasePanelProps {
  items: InventoryItemRecord[];
  catalogOptions: InventoryCatalogOptionRecord[];
  locations: StockLocationRecord[];
  isSubmitting: boolean;
  error: string | null;
  lastResult: StockMovementResultRecord | null;
  onSubmit: (payload: CreateCounterPurchaseDto) => Promise<void>;
  onBack?: () => void;
}

interface CounterPurchaseLineDraft {
  itemId: string;
  quantityReceived: string;
  unitCost: string;
  lotNumber: string;
  serialNumbers: string;
}

function createEmptyLine(): CounterPurchaseLineDraft {
  return {
    itemId: '',
    quantityReceived: '1',
    unitCost: '0',
    lotNumber: '',
    serialNumbers: '',
  };
}

function resolveItem(
  items: InventoryItemRecord[],
  itemId: string,
): InventoryItemRecord | undefined {
  return items.find((entry) => entry.id === itemId);
}

function isSerializedItem(item: InventoryItemRecord | undefined): boolean {
  if (!item) {
    return false;
  }

  return [InventoryTrackingMode.SERIALIZED, InventoryTrackingMode.FIXED_ASSET].includes(
    item.trackingMode,
  );
}

export function CounterPurchasePanel({
  items,
  catalogOptions,
  locations,
  isSubmitting,
  error,
  lastResult,
  onSubmit,
  onBack,
}: CounterPurchasePanelProps) {
  const [partyRefId, setPartyRefId] = useState<string | null>(null);
  const [supplierLabel, setSupplierLabel] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(toLocalDateValue(new Date()));
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<CounterPurchaseLineDraft[]>([createEmptyLine()]);

  const itemOptions = useMemo(() => {
    const source =
      catalogOptions.length > 0
        ? catalogOptions.map((option) => ({
            value: option.id,
            label: `${option.sku} · ${option.name}`,
          }))
        : items.map((item) => ({
            value: item.id,
            label: `${item.sku} · ${item.name}`,
          }));

    return [{ value: '', label: 'Selecciona un producto' }, ...source];
  }, [catalogOptions, items]);

  const locationOptions = useMemo(
    () => [
      { value: '', label: 'Selecciona una bodega destino' },
      ...locations.map((location) => ({
        value: location.id,
        label: `${location.code} · ${location.name}`,
      })),
    ],
    [locations],
  );

  const activeLines = useMemo(
    () =>
      lines.filter((line) => line.itemId && Number.parseFloat(line.quantityReceived || '0') > 0),
    [lines],
  );

  const summaryLabel = useMemo(() => {
    const destination = locations.find((location) => location.id === destinationLocationId);
    const destinationLabel = destination
      ? `${destination.code} · ${destination.name}`
      : 'sin bodega destino';
    const supplier = supplierLabel?.trim() || 'sin proveedor';
    return `${supplier} · ${invoiceNumber.trim() || 'sin factura'} · ${destinationLabel} · ${activeLines.length} línea${activeLines.length === 1 ? '' : 's'}`;
  }, [activeLines.length, destinationLocationId, invoiceNumber, locations, supplierLabel]);

  const estimatedTotal = useMemo(() => {
    return activeLines.reduce((total, line) => {
      const quantity = Number.parseFloat(line.quantityReceived || '0');
      const unitCost = Number.parseFloat(line.unitCost || '0');
      return total + quantity * unitCost;
    }, 0);
  }, [activeLines]);

  async function handleSubmit() {
    if (!partyRefId) {
      return;
    }

    await onSubmit({
      partyRefId,
      invoiceNumber: invoiceNumber.trim(),
      purchaseDate: purchaseDate || null,
      destinationLocationId,
      notes: notes.trim() || null,
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

  const canSubmit =
    Boolean(partyRefId) &&
    invoiceNumber.trim().length > 0 &&
    Boolean(destinationLocationId) &&
    activeLines.length > 0 &&
    !isSubmitting;

  return (
    <PortalPanel
      eyebrow="Ingreso directo"
      title="Compra de mostrador"
      description="Registra mercancía ya adquirida con factura en mano, sin solicitud ni orden de compra."
      actions={
        onBack ? (
          <Button type="button" variant="secondary" onClick={onBack}>
            Volver al listado
          </Button>
        ) : null
      }
      contentClassName="space-y-4"
    >
      {lastResult ? (
        <PortalAlert
          variant="success"
          title="Ingreso registrado"
          description={`Se creó el movimiento ${lastResult.movement.movementNumber} con ${lastResult.lines.length} línea${lastResult.lines.length === 1 ? '' : 's'}.`}
        />
      ) : null}

      {error ? (
        <PortalAlert
          variant="error"
          title="No fue posible registrar el ingreso"
          description={error}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <SupplierPicker
          value={partyRefId}
          selectedLabel={supplierLabel}
          onChange={(nextPartyRefId, displayName) => {
            setPartyRefId(nextPartyRefId);
            setSupplierLabel(displayName);
          }}
        />
        <Input
          id="counter-purchase-invoice"
          label="Factura o soporte"
          value={invoiceNumber}
          onChange={(event) => setInvoiceNumber(event.target.value)}
          placeholder="Número de factura"
        />
        <Input
          id="counter-purchase-date"
          label="Fecha de compra"
          type="date"
          value={purchaseDate}
          onChange={(event) => setPurchaseDate(event.target.value)}
        />
        <Select
          id="counter-purchase-destination"
          label="Bodega destino"
          value={destinationLocationId}
          onChange={(event) => setDestinationLocationId(event.target.value)}
          options={locationOptions}
        />
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Notas</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className={portalTextareaClassName}
        />
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-gray-900 dark:text-white">Líneas de ingreso</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setLines((current) => [...current, createEmptyLine()])}
          >
            Agregar línea
          </Button>
        </div>

        {lines.length === 0 ? (
          <PortalEmptyState
            title="Sin líneas"
            description="Agrega al menos un producto del catálogo para registrar el ingreso."
          />
        ) : (
          lines.map((line, index) => {
            const item = resolveItem(items, line.itemId);
            const serialized = isSerializedItem(item);

            return (
              <div
                key={`counter-line-${index}`}
                className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-2 xl:grid-cols-4"
              >
                <Select
                  label="Producto"
                  value={line.itemId}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, itemId: event.target.value } : entry,
                      ),
                    )
                  }
                  options={itemOptions}
                />
                <Input
                  label="Cantidad"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={line.quantityReceived}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, quantityReceived: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
                <Input
                  label="Costo unitario"
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitCost}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, unitCost: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Input
                  label="Lote (opcional)"
                  value={line.lotNumber}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, lotNumber: event.target.value } : entry,
                      ),
                    )
                  }
                />
                {serialized ? (
                  <div className="md:col-span-2 xl:col-span-4">
                    <Input
                      label="Seriales (separados por coma)"
                      value={line.serialNumbers}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, serialNumbers: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      helperText={`Debes indicar ${formatInventoryQuantity(line.quantityReceived)} serial${Number(line.quantityReceived) === 1 ? '' : 'es'}.`}
                    />
                  </div>
                ) : null}
                {lines.length > 1 ? (
                  <div className="md:col-span-2 xl:col-span-4">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((_, entryIndex) => entryIndex !== index),
                        )
                      }
                    >
                      Quitar línea
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <CreateModeSummaryFooter
        title="Resumen previo al registro"
        summary={`${summaryLabel} · Total estimado: ${formatInventoryCurrency(String(estimatedTotal))}`}
        primaryLabel="Registrar ingreso directo"
        primaryLoadingLabel="Registrando ingreso…"
        loading={isSubmitting}
        disabled={!canSubmit}
        onPrimaryClick={() => void handleSubmit()}
      />
    </PortalPanel>
  );
}
