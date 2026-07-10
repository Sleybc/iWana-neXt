'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  cn,
} from '@iwana/ui';
import { PurchaseOrderStatus } from '@iwana/shared';
import type {
  CreatePurchaseOrderDto,
  InventoryItemRecord,
  PurchaseOrderRecord,
  PurchaseRequestRecord,
} from '@/lib/api-client';
import { PortalAlert, interactiveFocusClassName } from '@/components/shared/portal-ui';
import { SupplierPicker } from './SupplierPicker';
import { toDateFromLocalDateValue, toLocalDateValue } from './inventory-date';
import { formatInventoryDate, getPurchaseRequestStatusLabel } from './inventory-labels';

interface PurchaseOrderDrawerProps {
  open: boolean;
  request: PurchaseRequestRecord | null;
  items: InventoryItemRecord[];
  latestOrder: PurchaseOrderRecord | null;
  createError: string | null;
  isSubmittingOrder: boolean;
  onClose: () => void;
  onCreateOrder: (payload: CreatePurchaseOrderDto) => Promise<void>;
  onOrderCreated?: () => void;
}

interface PurchaseOrderLineDraft {
  id: string;
  itemId: string;
  quantity: string;
  unitCost: string;
}

let orderLineSequence = 0;

function createOrderLine(): PurchaseOrderLineDraft {
  orderLineSequence += 1;
  return { id: `order-line-${orderLineSequence}`, itemId: '', quantity: '1', unitCost: '0' };
}

const ITEM_OPTIONS = (items: InventoryItemRecord[]) => [
  { value: '', label: 'Selecciona un producto' },
  ...items.map((item) => ({
    value: item.id,
    label: `${item.sku} · ${item.name}`,
  })),
];

export function PurchaseOrderDrawer({
  open,
  request,
  items,
  latestOrder,
  createError,
  isSubmittingOrder,
  onClose,
  onCreateOrder,
  onOrderCreated,
}: PurchaseOrderDrawerProps) {
  const [partyRefId, setPartyRefId] = useState('');
  const [partyDisplayName, setPartyDisplayName] = useState<string | null>(null);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PurchaseOrderLineDraft[]>([createOrderLine()]);
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);

  const orderJustCreated =
    showOrderSuccess && latestOrder && request && latestOrder.purchaseRequestId === request.id;

  useEffect(() => {
    if (!open) {
      setPartyRefId('');
      setPartyDisplayName(null);
      setExpectedDeliveryDate('');
      setNotes('');
      setLines([createOrderLine()]);
      setShowOrderSuccess(false);
    }
  }, [open]);

  async function handleCreateOrder() {
    if (!request) {
      return;
    }

    await onCreateOrder({
      purchaseRequestId: request.id,
      partyRefId,
      expectedDeliveryDate: expectedDeliveryDate || null,
      notes: notes.trim() || null,
      status: PurchaseOrderStatus.APPROVED,
      lines: lines
        .filter((line) => line.itemId)
        .map((line) => ({
          itemId: line.itemId,
          quantity: Number(line.quantity || '0'),
          unitCost: Number(line.unitCost || '0'),
        })),
    });

    setShowOrderSuccess(true);
    onOrderCreated?.();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Orden de compra</DialogTitle>
        </DialogHeader>

        {!request ? null : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <p className="portal-eyebrow-muted">Solicitud</p>
                <p className="mt-2 font-medium text-gray-900 dark:text-white">
                  {request.requestNumber}
                </p>
                <p className="text-gray-500 dark:text-gray-400">{request.title}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <p className="portal-eyebrow-muted">Estado solicitud</p>
                <p className="mt-2 font-medium text-gray-900 dark:text-white">
                  {getPurchaseRequestStatusLabel(request.status)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <p className="portal-eyebrow-muted">Fecha requerida</p>
                <p className="mt-2 font-medium text-gray-900 dark:text-white">
                  {formatInventoryDate(request.neededByDate)}
                </p>
              </div>
            </div>

            {orderJustCreated && latestOrder ? (
              <PortalAlert
                variant="success"
                title={`Orden de compra ${latestOrder.orderNumber} generada`}
                description="Cierra este panel y registra la recepción en la pestaña Recepciones."
                action={
                  <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                    Cerrar
                  </Button>
                }
              />
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <SupplierPicker
                label="Proveedor"
                value={partyRefId || null}
                selectedLabel={partyDisplayName}
                onChange={(nextPartyRefId, displayName) => {
                  setPartyRefId(nextPartyRefId ?? '');
                  setPartyDisplayName(displayName);
                }}
              />
              <DatePicker
                id="purchase-order-expected-delivery"
                label="Entrega esperada"
                placeholder="Seleccionar fecha"
                value={toDateFromLocalDateValue(expectedDeliveryDate)}
                onChange={(date) => setExpectedDeliveryDate(toLocalDateValue(date))}
                disabled={isSubmittingOrder}
              />
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Notas
                </span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className={cn(
                    'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white',
                    interactiveFocusClassName,
                  )}
                />
              </label>
            </div>

            <div className="space-y-3">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-3"
                >
                  <Select
                    id={`purchase-order-item-${line.id}`}
                    label="Producto"
                    value={line.itemId}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((entry) =>
                          entry.id === line.id ? { ...entry, itemId: event.target.value } : entry,
                        ),
                      )
                    }
                    options={ITEM_OPTIONS(items)}
                  />
                  <Input
                    label="Cantidad"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.quantity}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((entry) =>
                          entry.id === line.id ? { ...entry, quantity: event.target.value } : entry,
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
                        current.map((entry) =>
                          entry.id === line.id ? { ...entry, unitCost: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>

            {createError ? (
              <PortalAlert
                variant="error"
                title="No fue posible crear la orden de compra"
                description={createError}
              />
            ) : null}

            <div className="flex flex-wrap justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLines((current) => [...current, createOrderLine()])}
              >
                Agregar línea
              </Button>
              <Button
                type="button"
                loading={isSubmittingOrder}
                disabled={!partyRefId || lines.every((line) => !line.itemId)}
                onClick={() => void handleCreateOrder()}
              >
                Generar orden de compra
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
