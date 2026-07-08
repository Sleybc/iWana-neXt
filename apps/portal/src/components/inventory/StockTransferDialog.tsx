'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import {
  InventoryItemKind,
  InventoryTrackingMode,
  StockBalanceCondition,
  StockLocationType,
} from '@iwana/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
} from '@iwana/ui';
import type {
  InventoryItemRecord,
  StockBalanceRecord,
  StockLocationRecord,
  TransferStockDto,
} from '@/lib/api-client';
import { PortalAlert, portalTextareaClassName } from '@/components/shared/portal-ui';
import {
  CUSTOMER_SITE_TRANSFER_BLOCKED_MESSAGE,
  formatInventoryQuantity,
} from './inventory-labels';

const MOBILE_CUSTODY_TYPES = new Set<StockLocationType>([
  StockLocationType.MOBILE_TECHNICIAN,
  StockLocationType.MOBILE_CREW,
]);

const ISSUE_SOURCE_BLOCKED_TYPES = new Set<StockLocationType>([
  StockLocationType.MOBILE_TECHNICIAN,
  StockLocationType.MOBILE_CREW,
  StockLocationType.CUSTOMER_SITE,
]);

interface StockTransferDialogProps {
  open: boolean;
  items: InventoryItemRecord[];
  locations: StockLocationRecord[];
  balances: StockBalanceRecord[];
  userLabelById?: Map<string, string>;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: TransferStockDto) => Promise<void>;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-iwana-secondary-700 dark:text-iwana-secondary">
      {children}
    </p>
  );
}

function isTransferableBalance(balance: StockBalanceRecord): boolean {
  return (
    balance.condition === StockBalanceCondition.NEW &&
    !balance.lotId &&
    Number.parseFloat(balance.quantityOnHand) > 0
  );
}

function isSerializedInventoryItem(item: InventoryItemRecord): boolean {
  return (
    item.trackingMode === InventoryTrackingMode.SERIALIZED ||
    item.itemKind === InventoryItemKind.SERIALIZED
  );
}

function formatLocationOptionLabel(
  location: StockLocationRecord,
  userLabelById?: Map<string, string>,
): string {
  const base = `${location.code} · ${location.name}`;
  if (!location.responsibleRefId) {
    return base;
  }

  const responsibleLabel = userLabelById?.get(location.responsibleRefId);
  return responsibleLabel ? `${base} · ${responsibleLabel}` : base;
}

export function StockTransferDialog({
  open,
  items,
  locations,
  balances,
  userLabelById,
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

  const transferableItemIds = useMemo(() => {
    const ids = new Set<string>();
    balances.filter(isTransferableBalance).forEach((balance) => ids.add(balance.itemId));
    return ids;
  }, [balances]);

  const transferableItems = useMemo(
    () => items.filter((item) => transferableItemIds.has(item.id)),
    [items, transferableItemIds],
  );

  const selectedItem = useMemo(
    () => transferableItems.find((item) => item.id === itemId) ?? null,
    [itemId, transferableItems],
  );

  const requiresSerial = selectedItem ? isSerializedInventoryItem(selectedItem) : false;

  const positiveBalances = useMemo(
    () =>
      balances.filter(
        (balance) => Boolean(itemId) && balance.itemId === itemId && isTransferableBalance(balance),
      ),
    [balances, itemId],
  );

  const sourceLocationOptions = useMemo(() => {
    const locationIds = new Set(positiveBalances.map((balance) => balance.locationId));
    return locations.filter(
      (location) => locationIds.has(location.id) && !ISSUE_SOURCE_BLOCKED_TYPES.has(location.type),
    );
  }, [locations, positiveBalances]);

  const destinationOptions = useMemo(
    () =>
      locations.filter(
        (location) =>
          location.id !== sourceLocationId &&
          MOBILE_CUSTODY_TYPES.has(location.type) &&
          Boolean(location.responsibleRefId),
      ),
    [locations, sourceLocationId],
  );

  const mobileDestinationsWithoutResponsible = useMemo(
    () =>
      locations.filter(
        (location) => MOBILE_CUSTODY_TYPES.has(location.type) && !location.responsibleRefId,
      ),
    [locations],
  );

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
  const selectedSource = useMemo(
    () => locations.find((location) => location.id === sourceLocationId) ?? null,
    [locations, sourceLocationId],
  );
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
      !MOBILE_CUSTODY_TYPES.has(selectedDestination.type)
    ) {
      return null;
    }

    return Number.parseFloat(selectedDestination.maxCapacity) - destinationCurrentOnHand;
  }, [destinationCurrentOnHand, selectedDestination]);

  const exceedsAvailable = sourceLocationId ? requestedQuantity > availableQuantity : false;
  const exceedsDestinationCapacity =
    destinationRemainingCapacity != null && requestedQuantity > destinationRemainingCapacity;
  const missingSerial = requiresSerial && !serialNumber.trim();

  useEffect(() => {
    setSourceLocationId('');
    setDestinationLocationId('');
  }, [itemId]);

  useEffect(() => {
    setDestinationLocationId('');
  }, [sourceLocationId]);

  useEffect(() => {
    if (
      sourceLocationId &&
      !sourceLocationOptions.some((location) => location.id === sourceLocationId)
    ) {
      setSourceLocationId('');
    }
  }, [sourceLocationId, sourceLocationOptions]);

  useEffect(() => {
    if (
      destinationLocationId &&
      !destinationOptions.some((location) => location.id === destinationLocationId)
    ) {
      setDestinationLocationId('');
    }
  }, [destinationLocationId, destinationOptions]);

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

  const submitDisabled =
    !itemId ||
    !sourceLocationId ||
    !destinationLocationId ||
    requestedQuantity <= 0 ||
    !handoffReference.trim() ||
    missingSerial ||
    exceedsAvailable ||
    exceedsDestinationCapacity ||
    destinationOptions.length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <p className="portal-eyebrow">Bodegas</p>
          <DialogTitle className="mt-1">Salida a técnico</DialogTitle>
          <DialogDescription>
            Entrega equipos o insumos desde bodega central a la custodia móvil del técnico
            responsable. Requiere acta de entrega. La instalación en cliente se registra al cerrar
            la orden de trabajo con firma, no desde este formulario.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-4">
            <SectionTitle>Qué entregar</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Ítem"
                className="md:col-span-2"
                value={itemId}
                options={[
                  {
                    value: '',
                    label:
                      transferableItems.length === 0
                        ? 'Sin ítems con saldo transferible'
                        : 'Selecciona un ítem',
                  },
                  ...transferableItems.map((item) => ({
                    value: item.id,
                    label: `${item.sku} · ${item.name}`,
                  })),
                ]}
                onChange={(event) => setItemId(event.target.value)}
                helperText="Solo se listan ítems con saldo nuevo sin lote en bodega."
              />

              <Input
                label="Cantidad"
                min="0"
                step="0.01"
                type="number"
                value={quantity}
                disabled={!itemId || requiresSerial || Boolean(serialNumber.trim())}
                onChange={(event) => setQuantity(event.target.value)}
                helperText={
                  requiresSerial || serialNumber.trim()
                    ? 'Para equipos serializados la salida es de una unidad por serial.'
                    : 'Usa decimales solo si la unidad de medida lo permite.'
                }
              />

              <Input
                label="Serial"
                value={serialNumber}
                disabled={!itemId}
                requiredIndicator={requiresSerial}
                onChange={(event) => setSerialNumber(event.target.value)}
                helperText={
                  requiresSerial
                    ? 'Obligatorio para equipos serializados.'
                    : 'Opcional. Si lo informas, la salida operará por una unidad.'
                }
                className="md:col-span-2"
              />
            </div>
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-5 dark:border-dark-border">
            <SectionTitle>Ruta de salida</SectionTitle>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end">
              <Select
                label="Bodega origen"
                value={sourceLocationId}
                disabled={!itemId}
                options={[
                  {
                    value: '',
                    label: itemId ? 'Selecciona bodega origen' : 'Primero selecciona un ítem',
                  },
                  ...sourceLocationOptions.map((location) => ({
                    value: location.id,
                    label: formatLocationOptionLabel(location, userLabelById),
                  })),
                ]}
                onChange={(event) => setSourceLocationId(event.target.value)}
                helperText="Bodegas centrales o de preparación con saldo del ítem."
              />

              <div className="hidden justify-center pb-3 md:flex" aria-hidden="true">
                <ArrowRight className="h-5 w-5 text-iwana-primary" />
              </div>

              <Select
                label="Custodia del técnico"
                value={destinationLocationId}
                disabled={!sourceLocationId}
                options={[
                  {
                    value: '',
                    label: sourceLocationId
                      ? 'Selecciona custodia móvil'
                      : 'Primero selecciona bodega origen',
                  },
                  ...destinationOptions.map((location) => ({
                    value: location.id,
                    label: formatLocationOptionLabel(location, userLabelById),
                  })),
                ]}
                onChange={(event) => setDestinationLocationId(event.target.value)}
                helperText="Solo bodegas móviles con responsable asignado."
              />
            </div>

            <PortalAlert
              variant="info"
              title="Sitio del cliente no disponible"
              description={CUSTOMER_SITE_TRANSFER_BLOCKED_MESSAGE}
            />
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-5 dark:border-dark-border">
            <SectionTitle>Acta de entrega al técnico</SectionTitle>
            <Input
              label="Acta o evidencia"
              requiredIndicator
              value={handoffReference}
              onChange={(event) => setHandoffReference(event.target.value)}
              helperText="Referencia del acta o soporte de entrega física al técnico, sin PII."
            />
          </section>

          <details className="group rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Agregar observaciones opcionales
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Notas de entrega o comentarios internos para la salida.
                </p>
              </div>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-iwana-primary transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>

            <div className="mt-4 space-y-4">
              <label htmlFor="stock-transfer-handoff-notes" className="space-y-1 text-sm">
                <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Observaciones de entrega
                </span>
                <textarea
                  id="stock-transfer-handoff-notes"
                  rows={2}
                  value={handoffNotes}
                  onChange={(event) => setHandoffNotes(event.target.value)}
                  className={portalTextareaClassName}
                />
              </label>

              <label htmlFor="stock-transfer-notes" className="space-y-1 text-sm">
                <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Notas internas
                </span>
                <textarea
                  id="stock-transfer-notes"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className={portalTextareaClassName}
                />
              </label>
            </div>
          </details>

          {transferableItems.length === 0 ? (
            <PortalAlert
              variant="warning"
              title="Sin material disponible para salida"
              description="No hay ítems con saldo nuevo sin lote en bodega. Recibe mercancía o revisa los balances antes de entregar a un técnico."
            />
          ) : null}

          {mobileDestinationsWithoutResponsible.length > 0 && destinationOptions.length === 0 ? (
            <PortalAlert
              variant="warning"
              title="Sin custodias móviles habilitadas"
              description="Hay bodegas móviles sin responsable asignado. Edita la bodega y asigna un técnico antes de registrar salidas."
            />
          ) : null}

          {sourceLocationId ? (
            <div className="rounded-2xl border border-iwana-primary-100 bg-iwana-primary-50 p-4 text-sm dark:border-iwana-primary-900/50 dark:bg-iwana-primary-950/20">
              <p className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                Disponibilidad validada
              </p>
              {selectedItem ? (
                <p className="mt-1 font-mono text-xs text-gray-900 dark:text-white">
                  {selectedItem.sku} · {selectedItem.name}
                </p>
              ) : null}
              {selectedSource && selectedDestination ? (
                <p className="mt-2 text-xs text-iwana-secondary-700 dark:text-gray-400">
                  {selectedSource.code} → {selectedDestination.code}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                Disponible en origen (saldo nuevo sin lote):{' '}
                <span className="font-semibold text-iwana-primary dark:text-white">
                  {formatInventoryQuantity(availableQuantity)}
                </span>
                .
              </p>
              {destinationRemainingCapacity != null ? (
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  Cupo restante en custodia móvil:{' '}
                  <span className="font-semibold text-iwana-primary dark:text-white">
                    {formatInventoryQuantity(Math.max(destinationRemainingCapacity, 0))}
                  </span>
                  .
                </p>
              ) : null}
            </div>
          ) : null}

          {missingSerial ? (
            <PortalAlert
              variant="warning"
              title="Falta el serial del equipo"
              description="Informa el serial para registrar la salida del activo serializado."
            />
          ) : null}

          {exceedsAvailable ? (
            <PortalAlert
              variant="warning"
              title="La salida supera el saldo visible"
              description="Ajusta la cantidad o selecciona otra bodega origen con saldo nuevo sin lote disponible."
            />
          ) : null}

          {exceedsDestinationCapacity ? (
            <PortalAlert
              variant="warning"
              title="La custodia móvil no tiene cupo suficiente"
              description="Reduce la cantidad o elige otra bodega móvil con capacidad restante."
            />
          ) : null}

          {error ? (
            <PortalAlert
              variant="error"
              title="No fue posible registrar la salida"
              description={error}
            />
          ) : null}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-dark-border">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitDisabled}
              loading={isSubmitting}
            >
              Registrar salida
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
