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
  Select,
} from '@iwana/ui';
import { StockIssueType, StockLocationType } from '@iwana/shared';
import type {
  CreateStockIssueDto,
  InventoryItemRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import {
  formatInventoryQuantity,
  getStockIssueTypeHelperLabel,
  getStockIssueTypeLabel,
  getStockLocationTypeLabel,
} from './inventory-labels';

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
  return [StockLocationType.MAIN_WAREHOUSE];
}

const TYPE_OPTIONS = Object.values(StockIssueType).map((type) => ({
  value: type,
  label: getStockIssueTypeLabel(type),
}));

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
      return locations.filter(
        (loc) =>
          [
            StockLocationType.OFFICE_STOCK,
            StockLocationType.NODE_STOCK,
            StockLocationType.QUARANTINE,
            StockLocationType.REPAIR,
          ].includes(loc.type) && loc.id !== form.sourceLocationId,
      );
    }

    if (!destinationType) {
      return [];
    }

    return destinationOptions.get(destinationType) ?? [];
  }, [destinationOptions, destinationType, form.type, locations, form.sourceLocationId]);

  const sourceOptions = useMemo(
    () => [
      { value: '', label: 'Selecciona una bodega' },
      ...sourceCandidates.map((location) => ({
        value: location.id,
        label: `${location.code} · ${location.name} (${getStockLocationTypeLabel(location.type)})`,
      })),
    ],
    [sourceCandidates],
  );

  const destinationSelectOptions = useMemo(
    () => [
      { value: '', label: 'Selecciona el destino' },
      ...destinationCandidates.map((location) => ({
        value: location.id,
        label: `${location.code} · ${location.name} (${getStockLocationTypeLabel(location.type)})`,
      })),
    ],
    [destinationCandidates],
  );

  const itemOptions = useMemo(
    () => [
      { value: '', label: 'Selecciona un ítem' },
      ...items.map((item) => ({
        value: item.id,
        label: `${item.sku} · ${item.name}`,
      })),
    ],
    [items],
  );

  const showDestination =
    form.type !== StockIssueType.SALE_DISPATCH && form.type !== StockIssueType.INTERNAL_CONSUMPTION;

  const isValid = useMemo(() => {
    if (!form.sourceLocationId || !form.lineItemId) return false;
    const qty = Number(form.requestedQty || '0');
    if (!Number.isFinite(qty) || qty <= 0) return false;

    if (showDestination && !form.destinationLocationId) return false;
    if (showDestination && form.destinationLocationId === form.sourceLocationId) return false;

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
          <Select
            id="issue-form-type"
            label="Tipo"
            value={form.type}
            helperText={getStockIssueTypeHelperLabel(form.type)}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                type: event.target.value as StockIssueType,
                destinationLocationId: '',
              }))
            }
            options={TYPE_OPTIONS}
          />

          <Select
            id="issue-form-source"
            label="Origen"
            value={form.sourceLocationId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sourceLocationId: event.target.value,
                destinationLocationId:
                  current.destinationLocationId === event.target.value
                    ? ''
                    : current.destinationLocationId,
              }))
            }
            options={sourceOptions}
          />

          {showDestination ? (
            <Select
              id="issue-form-destination"
              label="Destino"
              className="md:col-span-2"
              value={form.destinationLocationId}
              onChange={(event) =>
                setForm((current) => ({ ...current, destinationLocationId: event.target.value }))
              }
              options={destinationSelectOptions}
            />
          ) : null}

          <Select
            id="issue-form-item"
            label="Ítem"
            className="md:col-span-2"
            value={form.lineItemId}
            onChange={(event) =>
              setForm((current) => ({ ...current, lineItemId: event.target.value }))
            }
            options={itemOptions}
          />

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
