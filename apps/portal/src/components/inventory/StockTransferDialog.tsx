'use client';

import { useEffect, useMemo, useState } from 'react';
import { StockBalanceCondition, StockLocationType } from '@iwana/shared';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input } from '@iwana/ui';
import type {
  InventoryItemRecord,
  StockBalanceRecord,
  StockLocationRecord,
  TransferStockDto,
} from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { formatInventoryQuantity } from './inventory-labels';

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
  const [handoffReference, setHandoffReference] = useState('');
  const [handoffNotes, setHandoffNotes] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) {
      setItemId('');
      setSourceLocationId('');
      setDestinationLocationId('');
      setQuantity('1');
      setSerialNumber('');
      setHandoffReference('');
      setHandoffNotes('');
      setNotes('');
    }
  }, [open]);

  const positiveBalances = useMemo(
    () =>
      balances.filter(
        (balance) =>
          (!itemId || balance.itemId === itemId) &&
          balance.condition === StockBalanceCondition.NEW &&
          !balance.lotId &&
          Number.parseFloat(balance.quantityOnHand) > 0,
      ),
    [balances, itemId],
  );

  const sourceLocationOptions = useMemo(() => {
    const locationIds = new Set(positiveBalances.map((balance) => balance.locationId));
    return locations.filter((location) => locationIds.has(location.id));
  }, [locations, positiveBalances]);

  const sourceBalances = useMemo(
    () => positiveBalances.filter((balance) => balance.locationId === sourceLocationId),
    [positiveBalances, sourceLocationId],
  );

  const availableQuantity = useMemo(
    () =>
      sourceBalances.reduce(
        (total, balance) => total + Number.parseFloat(balance.quantityOnHand),
        0,
      ),
    [sourceBalances],
  );

  const requestedQuantity = serialNumber.trim() ? 1 : Number(quantity || '0');
  const selectedDestination = useMemo(
    () => locations.find((location) => location.id === destinationLocationId) ?? null,
    [destinationLocationId, locations],
  );

  const destinationCurrentOnHand = useMemo(
    () =>
      balances
        .filter((balance) => balance.locationId === destinationLocationId)
        .reduce((total, balance) => total + Number.parseFloat(balance.quantityOnHand), 0),
    [balances, destinationLocationId],
  );

  const destinationRemainingCapacity = useMemo(() => {
    if (
      !selectedDestination ||
      !selectedDestination.maxCapacity ||
      ![StockLocationType.MOBILE_TECHNICIAN, StockLocationType.MOBILE_CREW].includes(
        selectedDestination.type,
      )
    ) {
      return null;
    }

    return Number.parseFloat(selectedDestination.maxCapacity) - destinationCurrentOnHand;
  }, [destinationCurrentOnHand, selectedDestination]);

  const exceedsAvailable = requestedQuantity > availableQuantity;
  const exceedsDestinationCapacity =
    destinationRemainingCapacity != null && requestedQuantity > destinationRemainingCapacity;

  useEffect(() => {
    if (
      sourceLocationId &&
      !sourceLocationOptions.some((location) => location.id === sourceLocationId)
    ) {
      setSourceLocationId('');
    }
  }, [sourceLocationId, sourceLocationOptions]);

  async function handleSubmit() {
    if (!itemId || !sourceLocationId || !destinationLocationId) {
      return;
    }

    await onSubmit({
      itemId,
      sourceLocationId,
      destinationLocationId,
      quantity: requestedQuantity,
      serialNumber: serialNumber.trim() || null,
      handoffReference: handoffReference.trim(),
      handoffNotes: handoffNotes.trim() || null,
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
                {sourceLocationOptions.map((location) => (
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

            <Input
              label="Acta o evidencia"
              value={handoffReference}
              onChange={(event) => setHandoffReference(event.target.value)}
              helperText="Referencia de acta, soporte o cadena de custodia sin PII."
            />

            <div className="md:col-span-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Observaciones de entrega
                </span>
                <textarea
                  rows={2}
                  value={handoffNotes}
                  onChange={(event) => setHandoffNotes(event.target.value)}
                  className={fieldClassName}
                />
              </label>
            </div>

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

          {sourceLocationId ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
              <p className="font-medium text-gray-900 dark:text-white">Disponibilidad validada</p>
              <p className="mt-1">
                Disponible en origen (saldo nuevo sin lote):{' '}
                {formatInventoryQuantity(availableQuantity)}.
              </p>
              {destinationRemainingCapacity != null ? (
                <p className="mt-1">
                  Cupo restante en destino móvil:{' '}
                  {formatInventoryQuantity(Math.max(destinationRemainingCapacity, 0))}.
                </p>
              ) : null}
            </div>
          ) : null}

          {exceedsAvailable ? (
            <PortalAlert
              variant="warning"
              title="La transferencia supera el saldo visible"
              description="Ajusta la cantidad o selecciona otra bodega origen con saldo nuevo sin lote disponible."
            />
          ) : null}

          {exceedsDestinationCapacity ? (
            <PortalAlert
              variant="warning"
              title="La bodega destino no tiene cupo suficiente"
              description="Reduce la cantidad o elige una bodega móvil con capacidad restante."
            />
          ) : null}

          {error ? (
            <PortalAlert
              variant="error"
              title="No fue posible transferir el stock"
              description={error}
            />
          ) : null}

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
                requestedQuantity <= 0 ||
                !handoffReference.trim() ||
                exceedsAvailable ||
                exceedsDestinationCapacity
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
