'use client';

import { useEffect, useMemo, useState } from 'react';
import { StockAdjustmentReason, StockBalanceCondition } from '@iwana/shared';
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
import {
  ApiError,
  inventoryApi,
  type InventoryItemRecord,
  type StockLocationRecord,
} from '@/lib/api-client';
import { PortalAlert, portalTextareaClassName } from '@/components/shared/portal-ui';
import { STOCK_ADJUSTMENT_REASON_LABELS, getStockBalanceConditionLabel } from './inventory-labels';
import { isStockAdjustableItem } from './stock-overview';

type AdjustmentDirection = 'in' | 'out';

interface StockAdjustmentDialogProps {
  open: boolean;
  items: InventoryItemRecord[];
  locations: StockLocationRecord[];
  preselectedItemId?: string | null;
  onClose: () => void;
  onAdjustmentRegistered: (movementNumber: string) => void;
}

function mapInventoryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para registrar ajustes.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
    return error.message;
  }

  return 'No fue posible completar la operación. Intenta nuevamente.';
}

export function StockAdjustmentDialog({
  open,
  items,
  locations,
  preselectedItemId = null,
  onClose,
  onAdjustmentRegistered,
}: StockAdjustmentDialogProps) {
  const adjustableItems = useMemo(() => items.filter(isStockAdjustableItem), [items]);
  const [itemId, setItemId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [condition, setCondition] = useState<StockBalanceCondition>(StockBalanceCondition.NEW);
  const [direction, setDirection] = useState<AdjustmentDirection>('in');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState<StockAdjustmentReason>(StockAdjustmentReason.CORRECTION);
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setItemId(
      preselectedItemId && adjustableItems.some((item) => item.id === preselectedItemId)
        ? preselectedItemId
        : (adjustableItems[0]?.id ?? ''),
    );
    setLocationId(locations[0]?.id ?? '');
    setCondition(StockBalanceCondition.NEW);
    setDirection('in');
    setQuantity('1');
    setReason(StockAdjustmentReason.CORRECTION);
    setNotes('');
    setIdempotencyKey(crypto.randomUUID());
    setError(null);
    setIsSubmitting(false);
  }, [adjustableItems, locations, open, preselectedItemId]);

  async function handleSubmit() {
    const parsedQuantity = Number.parseFloat(quantity);
    if (!itemId || !locationId || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Completa producto, bodega y una cantidad mayor que cero.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await inventoryApi.createAdjustment({
        itemId,
        locationId,
        condition,
        quantityDelta: direction === 'in' ? parsedQuantity : -parsedQuantity,
        reason,
        notes: notes.trim() || null,
        idempotencyKey,
      });
      onAdjustmentRegistered(result.movement.movementNumber);
      onClose();
    } catch (submitError) {
      setError(mapInventoryError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajuste de inventario</DialogTitle>
          <DialogDescription>
            Registra una entrada o salida manual con razón tipificada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error ? (
            <PortalAlert
              variant="error"
              title="No fue posible registrar el ajuste"
              description={error}
            />
          ) : null}

          <Select
            label="Producto"
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
            options={adjustableItems.map((item) => ({
              value: item.id,
              label: `${item.sku} · ${item.name}`,
            }))}
          />

          <Select
            label="Bodega"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            options={locations.map((location) => ({
              value: location.id,
              label: `${location.code} · ${location.name}`,
            }))}
          />

          <Select
            label="Condición"
            value={condition}
            onChange={(event) => setCondition(event.target.value as StockBalanceCondition)}
            options={Object.values(StockBalanceCondition).map((value) => ({
              value,
              label: getStockBalanceConditionLabel(value),
            }))}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Dirección"
              value={direction}
              onChange={(event) => setDirection(event.target.value as AdjustmentDirection)}
              options={[
                { value: 'in', label: 'Entrada' },
                { value: 'out', label: 'Salida' },
              ]}
            />
            <Input
              label="Cantidad"
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>

          <Select
            label="Razón"
            value={reason}
            onChange={(event) => setReason(event.target.value as StockAdjustmentReason)}
            options={Object.values(StockAdjustmentReason).map((value) => ({
              value,
              label: STOCK_ADJUSTMENT_REASON_LABELS[value],
            }))}
          />

          <label className="block space-y-1">
            <span className="text-sm text-iwana-secondary-700">Nota</span>
            <textarea
              className={portalTextareaClassName}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={4000}
            />
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting ? 'Registrando…' : 'Registrar ajuste'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
