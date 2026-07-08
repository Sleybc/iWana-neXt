'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@iwana/ui';
import { StockIssueType, StockLocationType } from '@iwana/shared';
import type {
  CreateStockIssueDto,
  InventoryItemRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { formatInventoryQuantity, getStockLocationTypeLabel } from './inventory-labels';

type DestinationOptionsByType = Map<StockLocationType, StockLocationRecord[]>;

export interface StockIssueFormDrawerProps {
  open: boolean;
  items: InventoryItemRecord[];
  locations: StockLocationRecord[];
  destinationOptions: DestinationOptionsByType;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (dto: CreateStockIssueDto) => Promise<void> | void;
}

function issueTypeLabel(type: StockIssueType): string {
  switch (type) {
    case StockIssueType.TECHNICIAN_CUSTODY:
      return 'Custodia técnico';
    case StockIssueType.CREW_CUSTODY:
      return 'Custodia cuadrilla';
    case StockIssueType.OFFICE_REPLENISHMENT:
      return 'Reposición oficina';
    case StockIssueType.NODE_REPLENISHMENT:
      return 'Reposición nodo';
    case StockIssueType.SALE_DISPATCH:
      return 'Salida por venta';
    case StockIssueType.INTERNAL_CONSUMPTION:
      return 'Consumo interno';
    case StockIssueType.WAREHOUSE_TO_WAREHOUSE:
      return 'Entre bodegas';
    default:
      return type;
  }
}

function destinationTypeForIssue(type: StockIssueType): StockLocationType | null {
  switch (type) {
    case StockIssueType.TECHNICIAN_CUSTODY:
      return StockLocationType.MOBILE_TECHNICIAN;
    case StockIssueType.CREW_CUSTODY:
      return StockLocationType.MOBILE_CREW;
    case StockIssueType.OFFICE_REPLENISHMENT:
      return StockLocationType.OFFICE_STOCK;
    case StockIssueType.NODE_REPLENISHMENT:
      return StockLocationType.NODE_STOCK;
    case StockIssueType.WAREHOUSE_TO_WAREHOUSE:
      return null;
    case StockIssueType.SALE_DISPATCH:
    case StockIssueType.INTERNAL_CONSUMPTION:
    default:
      return null;
  }
}

function allowedSourceTypesForIssue(_type: StockIssueType): StockLocationType[] {
  // Salidas de bodega principal: el origen válido del documento es la bodega principal.
  return [StockLocationType.MAIN_WAREHOUSE];
}

export function StockIssueFormDrawer({
  open,
  items,
  locations,
  destinationOptions,
  isSubmitting,
  onClose,
  onSubmit,
}: StockIssueFormDrawerProps) {
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{
    type: StockIssueType;
    sourceLocationId: string;
    destinationLocationId: string;
    commercialRefId: string;
    originRefId: string;
    costCenter: string;
    reason: string;
    lineItemId: string;
    requestedQty: string;
  }>({
    type: StockIssueType.TECHNICIAN_CUSTODY,
    sourceLocationId: '',
    destinationLocationId: '',
    commercialRefId: '',
    originRefId: '',
    costCenter: '',
    reason: '',
    lineItemId: '',
    requestedQty: '1',
  });

  const destinationType = destinationTypeForIssue(form.type);
  const sourceCandidates = useMemo(() => {
    const allowed = new Set(allowedSourceTypesForIssue(form.type));
    return locations.filter((loc) => allowed.has(loc.type));
  }, [form.type, locations]);

  const destinationCandidates = useMemo(() => {
    if (
      form.type === StockIssueType.SALE_DISPATCH ||
      form.type === StockIssueType.INTERNAL_CONSUMPTION
    ) {
      return [];
    }

    if (form.type === StockIssueType.WAREHOUSE_TO_WAREHOUSE) {
      return locations.filter((loc) =>
        [
          StockLocationType.MAIN_WAREHOUSE,
          StockLocationType.OFFICE_STOCK,
          StockLocationType.NODE_STOCK,
          StockLocationType.QUARANTINE,
          StockLocationType.REPAIR,
        ].includes(loc.type),
      );
    }

    if (!destinationType) {
      return [];
    }

    return destinationOptions.get(destinationType) ?? [];
  }, [destinationOptions, destinationType, form.type, locations]);

  const showDestination =
    form.type !== StockIssueType.SALE_DISPATCH && form.type !== StockIssueType.INTERNAL_CONSUMPTION;

  const isValid = useMemo(() => {
    if (!form.sourceLocationId || !form.lineItemId) return false;
    const qty = Number(form.requestedQty || '0');
    if (!Number.isFinite(qty) || qty <= 0) return false;

    if (showDestination && !form.destinationLocationId) return false;

    if (
      form.type === StockIssueType.SALE_DISPATCH &&
      !form.originRefId.trim() &&
      !form.commercialRefId.trim()
    ) {
      return false;
    }

    if (
      form.type === StockIssueType.INTERNAL_CONSUMPTION &&
      (!form.costCenter.trim() || !form.reason.trim())
    ) {
      return false;
    }

    return true;
  }, [form, showDestination]);

  async function submit() {
    setError(null);
    const qty = Number(form.requestedQty || '0');
    try {
      await onSubmit({
        type: form.type,
        sourceLocationId: form.sourceLocationId,
        ...(showDestination ? { destinationLocationId: form.destinationLocationId } : {}),
        originRefId: form.originRefId.trim() || null,
        commercialRefId: form.commercialRefId.trim() || null,
        costCenter: form.costCenter.trim() || null,
        reason: form.reason.trim() || null,
        lines: [
          {
            itemId: form.lineItemId,
            requestedQty: qty,
          },
        ],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible crear la salida.');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <p className="portal-eyebrow">Salidas</p>
          <DialogTitle className="mt-1">Crear salida</DialogTitle>
          <DialogDescription>
            Registra la intención y el destino. El movimiento contable se genera al despachar.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <PortalAlert variant="error" title="No fue posible crear la salida" description={error} />
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Tipo</span>
            <select
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  type: event.target.value as StockIssueType,
                  destinationLocationId: '',
                }))
              }
              className="portal-input-surface w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              {Object.values(StockIssueType).map((type) => (
                <option key={type} value={type}>
                  {issueTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Origen</span>
            <select
              value={form.sourceLocationId}
              onChange={(event) =>
                setForm((current) => ({ ...current, sourceLocationId: event.target.value }))
              }
              className="portal-input-surface w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="">Selecciona una bodega</option>
              {sourceCandidates.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} · {location.name} ({getStockLocationTypeLabel(location.type)})
                </option>
              ))}
            </select>
          </label>

          {showDestination ? (
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                Destino
              </span>
              <select
                value={form.destinationLocationId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, destinationLocationId: event.target.value }))
                }
                className="portal-input-surface w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
              >
                <option value="">Selecciona el destino</option>
                {destinationCandidates.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} · {location.name} ({getStockLocationTypeLabel(location.type)})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Ítem</span>
            <select
              value={form.lineItemId}
              onChange={(event) =>
                setForm((current) => ({ ...current, lineItemId: event.target.value }))
              }
              className="portal-input-surface w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="">Selecciona un ítem</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} · {item.name}
                </option>
              ))}
            </select>
          </label>

          <Input
            label="Cantidad"
            type="number"
            min="0"
            step="0.01"
            value={form.requestedQty}
            onChange={(event) =>
              setForm((current) => ({ ...current, requestedQty: event.target.value }))
            }
            helperText={`Se registrará como ${formatInventoryQuantity(Number(form.requestedQty || '0'))}.`}
          />

          {form.type === StockIssueType.SALE_DISPATCH ? (
            <>
              <Input
                label="Referencia comercial (opcional)"
                value={form.commercialRefId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, commercialRefId: event.target.value }))
                }
              />
              <Input
                label="Origen / referencia operativa (opcional)"
                value={form.originRefId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, originRefId: event.target.value }))
                }
                helperText="Requerido si no se envía referencia comercial."
              />
            </>
          ) : null}

          {form.type === StockIssueType.INTERNAL_CONSUMPTION ? (
            <>
              <Input
                label="Centro de costo"
                value={form.costCenter}
                onChange={(event) =>
                  setForm((current) => ({ ...current, costCenter: event.target.value }))
                }
              />
              <Input
                label="Motivo"
                value={form.reason}
                onChange={(event) =>
                  setForm((current) => ({ ...current, reason: event.target.value }))
                }
              />
            </>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={isSubmitting}
            disabled={!isValid}
            onClick={() => void submit()}
          >
            Crear salida
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
