'use client';

import type { InventoryItemRecord } from '@/lib/api-client';
import { PortalEmptyState } from '@/components/shared/portal-ui';
import {
  formatInventoryCurrency,
  formatInventoryQuantity,
  getInventoryItemKindLabel,
  getInventoryItemStatusLabel,
  getInventoryTrackingModeLabel,
} from './inventory-labels';

interface InventoryItemsTableProps {
  items: InventoryItemRecord[];
  supplierLabels?: Record<string, string>;
  showCatalogColumns?: boolean;
  onRowClick?: (item: InventoryItemRecord) => void;
}

function resolveSupplierLabel(
  item: InventoryItemRecord,
  supplierLabels?: Record<string, string>,
): string {
  if (!item.preferredSupplierRefId) {
    return 'Sin proveedor';
  }

  return supplierLabels?.[item.preferredSupplierRefId] ?? 'Proveedor asignado';
}

function resolveReferenceCost(item: InventoryItemRecord): string {
  const standard = Number.parseFloat(item.standardCost || '0');
  if (standard > 0) {
    return formatInventoryCurrency(item.standardCost);
  }

  return formatInventoryCurrency(item.baseCost);
}

export function InventoryItemsTable({
  items,
  supplierLabels,
  showCatalogColumns = false,
  onRowClick,
}: InventoryItemsTableProps) {
  if (items.length === 0) {
    return (
      <PortalEmptyState
        title="Sin ítems registrados"
        description="Crea referencias maestras para empezar a comprar, recibir y mover inventario."
      />
    );
  }

  const rowClassName = onRowClick
    ? 'cursor-pointer transition hover:bg-iwana-primary-50/40 dark:hover:bg-iwana-primary-950/20'
    : '';

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
        <thead className="bg-gray-50 dark:bg-dark-surface-2">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              SKU
            </th>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Ítem
            </th>
            {showCatalogColumns ? (
              <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                Tipo
              </th>
            ) : null}
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Categoría
            </th>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Trazabilidad
            </th>
            {showCatalogColumns ? (
              <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                Comprable
              </th>
            ) : null}
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Estado
            </th>
            {showCatalogColumns ? (
              <>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Proveedor preferido
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Costo referencia
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Punto de reorden
                </th>
              </>
            ) : (
              <>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Costo base
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Stock mínimo
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
          {items.map((item) => (
            <tr
              key={item.id}
              className={`align-top ${rowClassName}`}
              onClick={onRowClick ? () => onRowClick(item) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(item);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
            >
              <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                {item.sku}
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900 dark:text-white">{item.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.unitOfMeasure}</p>
              </td>
              {showCatalogColumns ? (
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                  {getInventoryItemKindLabel(item.itemKind)}
                </td>
              ) : null}
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                {item.categoryName}
              </td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                {getInventoryTrackingModeLabel(item.trackingMode)}
              </td>
              {showCatalogColumns ? (
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                  {item.purchasable ? 'Sí' : 'No'}
                </td>
              ) : null}
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                {getInventoryItemStatusLabel(item.status)}
              </td>
              {showCatalogColumns ? (
                <>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {resolveSupplierLabel(item, supplierLabels)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {resolveReferenceCost(item)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {formatInventoryQuantity(item.reorderPoint)}
                  </td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {formatInventoryCurrency(item.baseCost)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {formatInventoryQuantity(item.minimumStock)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
