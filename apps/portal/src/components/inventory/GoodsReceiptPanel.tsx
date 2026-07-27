'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select } from '@iwana/ui';
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
import { toDateFromLocalDateValue, toLocalDateValue } from './inventory-date';
import {
  coalesceInventoryDate,
  formatInventoryDate,
  formatInventoryDateTime,
  formatInventoryQuantity,
  getGoodsReceiptStatusLabel,
  getPurchaseOrderStatusLabel,
  getSupplierDisplayLabel,
} from './inventory-labels';
import { InventoryLocationPicker } from './InventoryLocationPicker';

interface GoodsReceiptPanelProps {
  order: PurchaseOrderRecord | null;
  /** Todas las órdenes de compra de la solicitud (selector multiorden). */
  orders?: PurchaseOrderRecord[];
  orderLines: PurchaseOrderLineRecord[];
  items: InventoryItemRecord[];
  /** @deprecated E-4: destino usa InventoryLocationPicker. */
  locations?: StockLocationRecord[];
  supplierLabels?: Record<string, string>;
  /** Fallback de fecha si la OC se creó sin expectedDeliveryDate (p. ej. fecha requerida de la SC). */
  fallbackExpectedDeliveryDate?: string | null;
  isSubmitting: boolean;
  error: string | null;
  lastReceipt: GoodsReceiptResultRecord | null;
  variant?: 'panel' | 'embedded';
  onSelectOrder?: (orderId: string) => void;
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
  orders = [],
  orderLines,
  items,
  locations: _locations,
  supplierLabels = {},
  fallbackExpectedDeliveryDate = null,
  isSubmitting,
  error,
  lastReceipt,
  variant = 'panel',
  onSelectOrder,
  onSubmit,
}: GoodsReceiptPanelProps) {
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [destinationLocationLabel, setDestinationLocationLabel] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState(() => toLocalDateValue(new Date()));
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<GoodsReceiptStatus>(GoodsReceiptStatus.COMPLETED);
  const [lines, setLines] = useState<ReceiptLineDraft[]>([]);

  const hasPendingLines = useMemo(
    () => orderLines.some((line) => pendingQuantity(line) > 0),
    [orderLines],
  );

  const receiptForOrder =
    lastReceipt && order && lastReceipt.receipt.purchaseOrderId === order.id ? lastReceipt : null;

  const summaryLabel = useMemo(() => {
    const activeLines = lines.filter((line) => Number(line.quantityReceived) > 0).length;
    const destinationLabel = destinationLocationLabel?.trim() || 'sin ubicación destino';
    return `${order?.orderNumber ?? 'Orden'} · ${destinationLabel} · ${activeLines} línea${activeLines === 1 ? '' : 's'}`;
  }, [lines, destinationLocationLabel, order?.orderNumber]);

  const orderOptions = useMemo(
    () =>
      orders.map((entry) => ({
        value: entry.id,
        label: `${entry.orderNumber} · ${getSupplierDisplayLabel(entry.partyRefId, supplierLabels)}`,
      })),
    [orders, supplierLabels],
  );

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

  useEffect(() => {
    if (!order) {
      return;
    }
    setReceivedAt(toLocalDateValue(new Date()));
  }, [order?.id]);

  async function handleSubmit() {
    const receivedAtDate = toDateFromLocalDateValue(receivedAt);
    if (!receivedAtDate) {
      return;
    }

    await onSubmit({
      destinationLocationId,
      receivedAt: receivedAtDate.toISOString(),
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

  if (!order && orders.length === 0) {
    return (
      <PortalEmptyState
        title="Sin orden para recibir"
        description="Genera una orden de compra o selecciona una reciente para registrar la recepción."
      />
    );
  }

  if (!order && orders.length > 0) {
    return (
      <div className="space-y-3">
        <Select
          id="goods-receipt-order-picker-empty"
          label="Orden de compra"
          value=""
          onChange={(event) => onSelectOrder?.(event.target.value)}
          options={[{ value: '', label: 'Selecciona una orden' }, ...orderOptions]}
        />
        <PortalEmptyState
          title="Selecciona una orden"
          description="Elige la orden de compra que vas a recibir."
        />
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const body = (
    <div className="space-y-4">
      {orders.length > 1 ? (
        <Select
          id="goods-receipt-order-picker"
          label="Orden de compra"
          value={order.id}
          onChange={(event) => onSelectOrder?.(event.target.value)}
          options={orderOptions}
        />
      ) : null}
      <div
        className={
          receiptForOrder
            ? 'grid gap-4 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3 sm:grid-cols-2 lg:grid-cols-4'
            : 'grid gap-4 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3 sm:grid-cols-3'
        }
      >
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
            {formatInventoryDate(
              coalesceInventoryDate(
                order.expectedDeliveryDate,
                orders.find((entry) => entry.id === order.id)?.expectedDeliveryDate,
                fallbackExpectedDeliveryDate,
              ),
            )}
          </dd>
        </dl>
        {receiptForOrder ? (
          <dl className="text-sm">
            <dt className="portal-eyebrow-muted">Fecha de recepción</dt>
            <dd className="mt-1 font-medium text-gray-900 dark:text-white">
              {formatInventoryDate(receiptForOrder.receipt.receivedAt)}
            </dd>
          </dl>
        ) : null}
      </div>

      {receiptForOrder ? (
        <PortalAlert
          variant="success"
          title={`Recepción ${receiptForOrder.receipt.receiptNumber} registrada`}
          description={`Se creó el movimiento ${receiptForOrder.movement.movementNumber} con ${receiptForOrder.lines.length} líneas. Fecha de recepción: ${formatInventoryDateTime(receiptForOrder.receipt.receivedAt)}.`}
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
            <InventoryLocationPicker
              id="goods-receipt-destination"
              label="Ubicación destino"
              value={destinationLocationId || null}
              selectedLabel={destinationLocationLabel}
              onChange={(nextId, item) => {
                setDestinationLocationId(nextId ?? '');
                setDestinationLocationLabel(item ? item.label : null);
              }}
            />
            <DatePicker
              id="goods-receipt-received-at"
              label="Fecha de recepción"
              placeholder="Seleccionar fecha"
              requiredIndicator
              helperText="Fecha en que llegó la mercancía. No modifica la entrega esperada de la orden."
              value={toDateFromLocalDateValue(receivedAt)}
              onChange={(date) => setReceivedAt(toLocalDateValue(date))}
              disabled={isSubmitting}
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
            disabled={
              !destinationLocationId ||
              !toDateFromLocalDateValue(receivedAt) ||
              lines.every((line) => !line.purchaseOrderLineId)
            }
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
