'use client';

import { useState } from 'react';
import { Button, cn, Input, Select } from '@iwana/ui';
import { SerializedAssetStatus } from '@iwana/shared';
import { interactiveFocusClassName, PortalAlert, PortalPanel } from '@/components/shared/portal-ui';
import { getSerializedAssetStatusLabel } from './inventory-labels';
import { InventoryItemPicker } from './InventoryItemPicker';
import { InventoryLocationPicker } from './InventoryLocationPicker';

export interface SaleFormState {
  itemId: string;
  locationId: string;
  quantity: string;
  commercialRefId: string;
  serialNumber: string;
  notes: string;
}

export interface ReturnFormState {
  itemId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  quantity: string;
  serialNumber: string;
  targetStatus: SerializedAssetStatus;
  notes: string;
}

interface MovementsWorkspaceProps {
  saleForm: SaleFormState;
  onSaleFormChange: (next: SaleFormState) => void;
  returnForm: ReturnFormState;
  onReturnFormChange: (next: ReturnFormState) => void;
  isSubmittingMovement: boolean;
  movementError: string | null;
  onSale: () => void;
  onReturn: () => void;
}

const RETURN_TARGET_STATUSES = [
  SerializedAssetStatus.IN_TRANSIT,
  SerializedAssetStatus.IN_TESTING,
] as const;

const fieldClassName = cn(
  'portal-input-surface w-full px-3 py-2 text-sm text-gray-900 dark:text-white',
  interactiveFocusClassName,
);

export function MovementsWorkspace({
  saleForm,
  onSaleFormChange,
  returnForm,
  onReturnFormChange,
  isSubmittingMovement,
  movementError,
  onSale,
  onReturn,
}: MovementsWorkspaceProps) {
  const [saleItemLabel, setSaleItemLabel] = useState<string | null>(null);
  const [saleLocationLabel, setSaleLocationLabel] = useState<string | null>(null);
  const [returnItemLabel, setReturnItemLabel] = useState<string | null>(null);
  const [returnSourceLabel, setReturnSourceLabel] = useState<string | null>(null);
  const [returnDestinationLabel, setReturnDestinationLabel] = useState<string | null>(null);

  const returnTargetStatusOptions = RETURN_TARGET_STATUSES.map((status) => ({
    value: status,
    label: getSerializedAssetStatusLabel(status),
  }));

  return (
    <div className="space-y-6" data-testid="movements-workspace">
      <div className="grid gap-6 xl:grid-cols-2">
        <PortalPanel
          eyebrow="Venta"
          title="Registrar venta"
          description="Descuenta unidades desde una bodega y asocia la salida a una referencia comercial."
        >
          <div className="grid gap-4">
            <InventoryItemPicker
              id="sale-item"
              label="Producto"
              value={saleForm.itemId || null}
              selectedLabel={saleItemLabel}
              onChange={(itemId, item) => {
                setSaleItemLabel(item ? item.label : null);
                onSaleFormChange({ ...saleForm, itemId: itemId ?? '' });
              }}
            />
            <InventoryLocationPicker
              id="sale-location"
              label="Ubicación"
              value={saleForm.locationId || null}
              selectedLabel={saleLocationLabel}
              onChange={(locationId, item) => {
                setSaleLocationLabel(item ? item.label : null);
                onSaleFormChange({ ...saleForm, locationId: locationId ?? '' });
              }}
            />
            <Input
              label="Cantidad"
              type="number"
              min="0"
              step="0.01"
              value={saleForm.quantity}
              onChange={(event) => onSaleFormChange({ ...saleForm, quantity: event.target.value })}
            />
            <Input
              label="Referencia comercial"
              value={saleForm.commercialRefId}
              onChange={(event) =>
                onSaleFormChange({ ...saleForm, commercialRefId: event.target.value })
              }
            />
            <Input
              label="Serial (opcional)"
              value={saleForm.serialNumber}
              onChange={(event) =>
                onSaleFormChange({ ...saleForm, serialNumber: event.target.value })
              }
            />
            <label className="space-y-1 text-sm">
              <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Notas</span>
              <textarea
                rows={3}
                value={saleForm.notes}
                onChange={(event) => onSaleFormChange({ ...saleForm, notes: event.target.value })}
                className={fieldClassName}
              />
            </label>
            <Button
              type="button"
              loading={isSubmittingMovement}
              disabled={!saleForm.itemId || !saleForm.locationId || !saleForm.commercialRefId}
              onClick={onSale}
            >
              Registrar venta
            </Button>
          </div>
        </PortalPanel>

        <PortalPanel
          eyebrow="Devolución"
          title="Recibir devolución"
          description="Registra material o activo devuelto por un técnico o cliente y muévelo a la bodega que corresponda."
        >
          <div className="grid gap-4">
            <InventoryItemPicker
              id="return-item"
              label="Producto"
              value={returnForm.itemId || null}
              selectedLabel={returnItemLabel}
              onChange={(itemId, item) => {
                setReturnItemLabel(item ? item.label : null);
                onReturnFormChange({ ...returnForm, itemId: itemId ?? '' });
              }}
            />
            <InventoryLocationPicker
              id="return-source"
              label="Bodega de origen"
              value={returnForm.sourceLocationId || null}
              selectedLabel={returnSourceLabel}
              onChange={(locationId, item) => {
                setReturnSourceLabel(item ? item.label : null);
                onReturnFormChange({
                  ...returnForm,
                  sourceLocationId: locationId ?? '',
                });
              }}
            />
            <InventoryLocationPicker
              id="return-destination"
              label="Bodega de destino"
              value={returnForm.destinationLocationId || null}
              selectedLabel={returnDestinationLabel}
              onChange={(locationId, item) => {
                setReturnDestinationLabel(item ? item.label : null);
                onReturnFormChange({
                  ...returnForm,
                  destinationLocationId: locationId ?? '',
                });
              }}
            />
            <Input
              label="Cantidad"
              type="number"
              min="0"
              step="0.01"
              value={returnForm.quantity}
              onChange={(event) =>
                onReturnFormChange({ ...returnForm, quantity: event.target.value })
              }
            />
            <Input
              label="Serial (opcional)"
              value={returnForm.serialNumber}
              onChange={(event) =>
                onReturnFormChange({ ...returnForm, serialNumber: event.target.value })
              }
            />
            <Select
              label="Estado del activo al llegar"
              value={returnForm.targetStatus}
              onChange={(event) =>
                onReturnFormChange({
                  ...returnForm,
                  targetStatus: event.target.value as SerializedAssetStatus,
                })
              }
              options={returnTargetStatusOptions}
            />
            <label className="space-y-1 text-sm">
              <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Notas</span>
              <textarea
                rows={3}
                value={returnForm.notes}
                onChange={(event) =>
                  onReturnFormChange({ ...returnForm, notes: event.target.value })
                }
                className={fieldClassName}
              />
            </label>
            <Button
              type="button"
              loading={isSubmittingMovement}
              disabled={
                !returnForm.itemId ||
                !returnForm.sourceLocationId ||
                !returnForm.destinationLocationId
              }
              onClick={onReturn}
            >
              Registrar devolución
            </Button>
          </div>
        </PortalPanel>
      </div>

      {movementError ? (
        <PortalAlert
          variant="error"
          title="No fue posible registrar el movimiento"
          description={movementError}
        />
      ) : null}
    </div>
  );
}
