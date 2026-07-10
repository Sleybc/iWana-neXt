'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select } from '@iwana/ui';
import { GoodsReceiptStatus } from '@iwana/shared';
import type {
  GoodsReceiptResultRecord,
  InventoryItemRecord,
  PurchaseOrderLineRecord,
  PurchaseOrderRecord,
  ReceivePurchaseOrderDto,
  StockLocationRecord,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  CreateModeSummaryFooter,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryDate,
  formatInventoryQuantity,
  getGoodsReceiptStatusLabel,
  getPurchaseOrderStatusLabel,
} from './inventory-labels';

interface GoodsReceiptPanelProps {
  order: PurchaseOrderRecord | null;
  orderLines: PurchaseOrderLineRecord[];
  items: InventoryItemRecord[];
  locations: StockLocationRecord[];
  isSubmitting: boolean;
  error: string | null;
  lastReceipt: GoodsReceiptResultRecord | null;
  variant?: 'panel' | 'embedded';
  onSubmit: (payload: ReceivePurchaseOrderDto) => Promise<void>;
}

interface ReceiptLineDraft {
  purchaseOrderLineId: string;
  itemId: string;
  quantityReceived: string;
  lotNumber: string;
  serialNumbers: string;
}

function pendingQuantity(line: PurchaseOrderLineRecord): number {
  const ordered = Number.parseFloat(line.quantity);
  const received = Number.parseFloat(line.receivedQuantity);
  return Math.max(ordered - received, 0);
}

function buildLinesFromOrder(orderLines: PurchaseOrderLineRecord[]): ReceiptLineDraft[] {
  const pending = orderLines
    .map((line) => ({
      purchaseOrderLineId: line.id,
      itemId: line.itemId,
      quantityReceived: String(pendingQuantity(line) || 0),
      lotNumber: '',
      serialNumbers: '',
    }))
    .filter((line) => Number(line.quantityReceived) > 0);

  return pending.length > 0 ? pending : [];
}

function resolveItemLabel(items: InventoryItemRecord[], itemId: string): string {
  const item = items.find((entry) => entry.id === itemId);
  return item ? `${item.sku} · ${item.name}` : 'Producto no disponible en el catálogo';
}

const RECEIPT_STATUS_OPTIONS = Object.values(GoodsReceiptStatus).map((value) => ({
  value,
  label: getGoodsReceiptStatusLabel(value),
}));

export function GoodsReceiptPanel({
  order,
  orderLines,
  items,
  locations,
  isSubmitting,
  error,
  lastReceipt,
  variant = 'panel',
  onSubmit,
}: GoodsReceiptPanelProps) {
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [receivedAt, setReceivedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<GoodsReceiptStatus>(GoodsReceiptStatus.COMPLETED);
  const [lines, setLines] = useState<ReceiptLineDraft[]>([]);

  const hasPendingLines = useMemo(
    () => orderLines.some((line) => pendingQuantity(line) > 0),
    [orderLines],
  );

  const locationOptions = useMemo(
    () => [
      { value: '', label: 'Selecciona una ubicación' },
      ...locations.map((location) => ({
        value: location.id,
        label: `${location.code} · ${location.name}`,
      })),
    ],
    [locations],
  );

  const summaryLabel = useMemo(() => {
    const activeLines = lines.filter((line) => Number(line.quantityReceived) > 0).length;
    const destination = locations.find((location) => location.id === destinationLocationId);
    const destinationLabel = destination
      ? `${destination.code} · ${destination.name}`
      : 'sin ubicación destino';
    return `${order?.orderNumber ?? 'Orden'} · ${destinationLabel} · ${activeLines} línea${activeLines === 1 ? '' : 's'}`;
  }, [lines, destinationLocationId, locations, order?.orderNumber]);

  useEffect(() => {
    if (!order) {
      setDestinationLocationId('');
      setReceivedAt('');
      setNotes('');
      setStatus(GoodsReceiptStatus.COMPLETED);
      setLines([]);
      return;
    }

    setLines(buildLinesFromOrder(orderLines));
  }, [order, orderLines]);

  async function handleSubmit() {
    await onSubmit({
      destinationLocationId,
      receivedAt: receivedAt ? new Date(receivedAt).toISOString() : null,
      notes: notes.trim() || null,
      status,
      lines: lines
        .filter((line) => line.purchaseOrderLineId && line.itemId)
        .map((line) => ({
          purchaseOrderLineId: line.purchaseOrderLineId,
          itemId: line.itemId,
          quantityReceived: Number(line.quantityReceived || '0'),
          lotNumber: line.lotNumber.trim() || null,
          serialNumbers: line.serialNumbers
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        })),
    });
  }

  if (!order) {
    return (
      <PortalEmptyState
        title="Sin orden para recibir"
        description="Genera una orden de compra o selecciona una reciente para registrar la recepción."
      />
    );
  }

  const body = (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3 sm:grid-cols-3">
        <dl className="text-sm">
          <dt className="portal-eyebrow-muted">Orden</dt>
          <dd className="mt-1 font-medium text-gray-900 dark:text-white">{order.orderNumber}</dd>
        </dl>
        <dl className="text-sm">
          <dt className="portal-eyebrow-muted">Estado</dt>
          <dd className="mt-1 font-medium text-gray-900 dark:text-white">
            {getPurchaseOrderStatusLabel(order.status)}
          </dd>
        </dl>
        <dl className="text-sm">
          <dt className="portal-eyebrow-muted">Entrega esperada</dt>
          <dd className="mt-1 font-medium text-gray-900 dark:text-white">
            {formatInventoryDate(order.expectedDeliveryDate)}
          </dd>
        </dl>
      </div>

      {lastReceipt && lastReceipt.receipt.purchaseOrderId === order.id ? (
        <PortalAlert
          variant="success"
          title={`Recepción ${lastReceipt.receipt.receiptNumber} registrada`}
          description={`Se creó el movimiento ${lastReceipt.movement.movementNumber} con ${lastReceipt.lines.length} líneas.`}
        />
      ) : null}

      {!hasPendingLines ? (
        <PortalEmptyState
          title="Orden completamente recibida"
          description="No quedan cantidades pendientes por registrar en esta orden de compra."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Select
              id="goods-receipt-destination"
              label="Ubicación destino"
              value={destinationLocationId}
              onChange={(event) => setDestinationLocationId(event.target.value)}
              options={locationOptions}
            />
            <Input
              id="goods-receipt-received-at"
              label="Fecha de recepción"
              type="datetime-local"
              value={receivedAt}
              onChange={(event) => setReceivedAt(event.target.value)}
            />
            <Select
              id="goods-receipt-status"
              label="Estado"
              value={status}
              onChange={(event) => setStatus(event.target.value as GoodsReceiptStatus)}
              options={RECEIPT_STATUS_OPTIONS}
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
            {lines.map((line, index) => (
              <div
                key={line.purchaseOrderLineId}
                className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-2 xl:grid-cols-4"
              >
                <div className="space-y-1 text-sm xl:col-span-2">
                  <p className="portal-eyebrow-muted">Línea de orden</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {resolveItemLabel(items, line.itemId)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Pendiente: {formatInventoryQuantity(line.quantityReceived)}
                  </p>
                </div>
                <Input
                  label="Cantidad a recibir"
                  type="number"
                  min="0"
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
                  label="Lote"
                  value={line.lotNumber}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, lotNumber: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Input
                  label="Seriales"
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
                  helperText="Separa varios seriales por coma."
                  className="xl:col-span-2"
                />
              </div>
            ))}
          </div>

          {error ? (
            <PortalAlert
              variant="error"
              title="No fue posible registrar la recepción"
              description={error}
            />
          ) : null}

          <CreateModeSummaryFooter
            title="Resumen previo al registro"
            summary={summaryLabel}
            primaryLabel="Registrar recepción"
            primaryLoadingLabel="Registrando recepción..."
            loading={isSubmitting}
            disabled={!destinationLocationId || lines.every((line) => !line.purchaseOrderLineId)}
            onPrimaryClick={() => void handleSubmit()}
          />
        </>
      )}
    </div>
  );

  if (variant === 'embedded') {
    return body;
  }

  return (
    <PortalPanel
      eyebrow="Recepción"
      title={`Recibir ${order.orderNumber}`}
      description="Las líneas pendientes se cargan automáticamente desde la orden de compra."
      contentClassName="space-y-4"
    >
      {body}
    </PortalPanel>
  );
}
