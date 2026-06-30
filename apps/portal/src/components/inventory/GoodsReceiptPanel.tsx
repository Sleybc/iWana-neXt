'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Input } from '@iwana/ui';
import { GoodsReceiptStatus } from '@iwana/shared';
import type {
  GoodsReceiptResultRecord,
  InventoryItemRecord,
  PurchaseOrderLineRecord,
  PurchaseOrderRecord,
  ReceivePurchaseOrderDto,
  StockLocationRecord,
} from '@/lib/api-client';
import { PortalAlert, PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
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
  onSubmit: (payload: ReceivePurchaseOrderDto) => Promise<void>;
}

interface ReceiptLineDraft {
  purchaseOrderLineId: string;
  itemId: string;
  quantityReceived: string;
  lotNumber: string;
  serialNumbers: string;
}

const fieldClassName =
  'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white';

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
  return item ? `${item.sku} · ${item.name}` : itemId.slice(0, 8);
}

export function GoodsReceiptPanel({
  order,
  orderLines,
  items,
  locations,
  isSubmitting,
  error,
  lastReceipt,
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
        description="Genera una orden de compra o selecciona una OC reciente para registrar la recepción."
      />
    );
  }

  return (
    <PortalPanel
      eyebrow="Recepción"
      title={`Recibir ${order.orderNumber}`}
      description="Las líneas pendientes se cargan automáticamente desde la orden de compra."
      contentClassName="space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm dark:border-dark-border dark:bg-dark-surface-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-iwana-secondary-700 dark:text-iwana-secondary">
            Orden
          </p>
          <p className="mt-2 font-medium text-gray-900 dark:text-white">{order.orderNumber}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm dark:border-dark-border dark:bg-dark-surface-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-iwana-secondary-700 dark:text-iwana-secondary">
            Estado
          </p>
          <p className="mt-2 font-medium text-gray-900 dark:text-white">
            {getPurchaseOrderStatusLabel(order.status)}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm dark:border-dark-border dark:bg-dark-surface-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-iwana-secondary-700 dark:text-iwana-secondary">
            Entrega esperada
          </p>
          <p className="mt-2 font-medium text-gray-900 dark:text-white">
            {formatInventoryDate(order.expectedDeliveryDate)}
          </p>
        </div>
      </div>

      {lastReceipt && lastReceipt.receipt.purchaseOrderId === order.id && (
        <PortalAlert
          variant="success"
          title={`Recepción ${lastReceipt.receipt.receiptNumber} registrada`}
          description={`Se creó el movimiento ${lastReceipt.movement.movementNumber} con ${lastReceipt.lines.length} líneas.`}
        />
      )}

      {!hasPendingLines && (
        <PortalEmptyState
          title="Orden completamente recibida"
          description="No quedan cantidades pendientes por registrar en esta orden de compra."
        />
      )}

      {hasPendingLines && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                Ubicación destino
              </span>
              <select
                value={destinationLocationId}
                onChange={(event) => setDestinationLocationId(event.target.value)}
                className={fieldClassName}
              >
                <option value="">Selecciona una ubicación</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} · {location.name}
                  </option>
                ))}
              </select>
            </label>

            <Input
              label="Fecha de recepción"
              type="datetime-local"
              value={receivedAt}
              onChange={(event) => setReceivedAt(event.target.value)}
            />

            <label className="space-y-1 text-sm">
              <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                Estado
              </span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as GoodsReceiptStatus)}
                className={fieldClassName}
              >
                {Object.values(GoodsReceiptStatus).map((value) => (
                  <option key={value} value={value}>
                    {getGoodsReceiptStatusLabel(value)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Notas</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className={fieldClassName}
              />
            </label>
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => (
              <div
                key={line.purchaseOrderLineId}
                className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-2 xl:grid-cols-4"
              >
                <div className="space-y-1 text-sm xl:col-span-2">
                  <p className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Línea de OC
                  </p>
                  <p className="text-gray-900 dark:text-white">
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

          {error && (
            <PortalAlert
              variant="error"
              title="No fue posible registrar la recepción"
              description={error}
            />
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              loading={isSubmitting}
              disabled={!destinationLocationId || lines.every((line) => !line.purchaseOrderLineId)}
              onClick={() => void handleSubmit()}
            >
              Registrar recepción
            </Button>
          </div>
        </>
      )}
    </PortalPanel>
  );
}
