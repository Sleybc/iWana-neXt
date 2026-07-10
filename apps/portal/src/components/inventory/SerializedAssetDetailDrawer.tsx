'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@iwana/ui';
import type {
  InventoryItemRecord,
  SerializedAssetRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import {
  formatInventoryDate,
  formatInventoryDateTime,
  getInventoryResponsibleTypeLabel,
  getSerializedAssetStatusLabel,
} from './inventory-labels';

interface SerializedAssetDetailDrawerProps {
  open: boolean;
  asset: SerializedAssetRecord | null;
  item?: InventoryItemRecord | null;
  location?: StockLocationRecord | null;
  onClose: () => void;
}

function renderValue(value: string | null | undefined): string {
  return value?.trim() ? value : 'Sin dato';
}

export function SerializedAssetDetailDrawer({
  open,
  asset,
  item,
  location,
  onClose,
}: SerializedAssetDetailDrawerProps) {
  if (!asset) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Activo con serial</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3">
            <p className="portal-eyebrow">Identificación</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Producto</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {item?.name ?? 'Producto no encontrado'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Serial</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {renderValue(asset.serialNumber)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">MAC</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {renderValue(asset.macAddress)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Etiqueta</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {renderValue(asset.assetTag)}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3">
            <p className="portal-eyebrow">Estado actual</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Estado</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {getSerializedAssetStatusLabel(asset.currentStatus)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Ubicación</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {location?.name ?? renderValue(asset.currentLocationId)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Responsable</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {getInventoryResponsibleTypeLabel(asset.currentResponsibleType)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Responsable</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {renderValue(asset.currentResponsibleRefId)}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3">
            <p className="portal-eyebrow">Compra y garantía</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Orden de compra</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {renderValue(asset.purchaseOrderRef)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Fecha de compra</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {formatInventoryDate(asset.purchaseDate)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Garantía</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {formatInventoryDate(asset.warrantyUntil)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Vida útil</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {asset.usefulLifeMonths ? `${asset.usefulLifeMonths} meses` : 'Sin dato'}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3">
            <p className="portal-eyebrow">Seguimiento</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Suscriptor</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {renderValue(asset.subscriberRefId)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Contrato</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {renderValue(asset.contractRefId)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Creado</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {formatInventoryDateTime(asset.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Actualizado</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {formatInventoryDateTime(asset.updatedAt)}
                </dd>
              </div>
            </dl>
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}
