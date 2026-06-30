'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input } from '@iwana/ui';
import type {
  InventoryItemRecord,
  StockBalanceRecord,
  StockLocationRecord,
  TransferStockDto,
} from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';

interface StockTransferDialogProps {
  open: boolean;
  items: InventoryItemRecord[];
  locations: StockLocationRecord[];
  balances: StockBalanceRecord[];
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: TransferStockDto) => Promise<void>;
}

const fieldClassName =
  'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white';

export function StockTransferDialog({
  open,
  items,
  locations,
  balances,
  isSubmitting,
  error,
  onClose,
  onSubmit,
}: StockTransferDialogProps) {
  const [itemId, setItemId] = useState('');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [serialNumber, setSerialNumber] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) {
      setItemId('');
      setSourceLocationId('');
      setDestinationLocationId('');
      setQuantity('1');
      setSerialNumber('');
      setNotes('');
    }
  }, [open]);

  const sourceBalances = useMemo(
    () =>
      balances.filter(
        (balance) =>
          (!itemId || balance.itemId === itemId) &&
          (!sourceLocationId || balance.locationId === sourceLocationId) &&
          Number.parseFloat(balance.quantityOnHand) > 0,
      ),
    [balances, itemId, sourceLocationId],
  );

  async function handleSubmit() {
    if (!itemId || !sourceLocationId || !destinationLocationId) {
      return;
    }

    await onSubmit({
      itemId,
      sourceLocationId,
      destinationLocationId,
      quantity: Number(quantity || '0'),
      serialNumber: serialNumber.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transferir stock</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Ítem</span>
              <select
                value={itemId}
                onChange={(event) => setItemId(event.target.value)}
                className={fieldClassName}
              >
                <option value="">Selecciona un ítem</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} · {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                Origen
              </span>
              <select
                value={sourceLocationId}
                onChange={(event) => setSourceLocationId(event.target.value)}
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

            <label className="space-y-1 text-sm">
              <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                Destino
              </span>
              <select
                value={destinationLocationId}
                onChange={(event) => setDestinationLocationId(event.target.value)}
                className={fieldClassName}
              >
                <option value="">Selecciona una ubicación</option>
                {locations
                  .filter((location) => location.id !== sourceLocationId)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} · {location.name}
                    </option>
                  ))}
              </select>
            </label>

            <Input
              label="Cantidad"
              min="0"
              step="0.01"
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />

            <Input
              label="Serial (opcional)"
              value={serialNumber}
              onChange={(event) => setSerialNumber(event.target.value)}
              helperText="Si es un activo serializado, la cantidad efectiva será 1."
            />

            <div className="md:col-span-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Notas
                </span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className={fieldClassName}
                />
              </label>
            </div>
          </div>

          {sourceLocationId && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
              <p className="font-medium text-gray-900 dark:text-white">Saldos visibles en origen</p>
              <p className="mt-1">
                {sourceBalances.length > 0
                  ? `${sourceBalances.length} registros con saldo positivo para la selección actual.`
                  : 'No se encontraron saldos positivos con esos filtros.'}
              </p>
            </div>
          )}

          {error && (
            <PortalAlert
              variant="error"
              title="No fue posible transferir el stock"
              description={error}
            />
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cerrar
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={
                !itemId ||
                !sourceLocationId ||
                !destinationLocationId ||
                Number(quantity || '0') <= 0
              }
              loading={isSubmitting}
            >
              Registrar transferencia
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
