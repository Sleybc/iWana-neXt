'use client';

import { StockBalanceCondition } from '@iwana/shared';
import { Button, Input, Select } from '@iwana/ui';
import type {
  InventoryItemRecord,
  SerializedAssetRecord,
  StockBalanceRecord,
} from '@/lib/api-client';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';
import type { StockIssueDraftLine } from './stock-issue-draft';
import {
  STOCK_AVAILABLE_AT_SOURCE_LABEL,
  STOCK_RESERVED_HELP_TEXT,
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
} from './inventory-labels';
import { isRequestedQtyExceedingAvailable } from './stock-issue-balance-utils';
import { StockIssueBulkEditBar } from './StockIssueBulkEditBar';
import {
  formatLotOptionLabel,
  formatSerializedAssetLabel,
  getAvailableQtyForDraftLine,
  isSerializedInventoryItem,
  listLotOptionsForItemAtLocation,
  listSerializedAssetsForItemAtLocation,
} from './stock-issue-line-utils';

const CONDITION_OPTIONS = Object.values(StockBalanceCondition).map((condition) => ({
  value: condition,
  label: getStockBalanceConditionLabel(condition),
}));

interface StockIssueDraftLinesTableProps {
  lines: StockIssueDraftLine[];
  items: InventoryItemRecord[];
  balances: StockBalanceRecord[];
  assets: SerializedAssetRecord[];
  sourceLocationId: string;
  selectedLineIds: string[];
  showAvailableColumn?: boolean;
  onItemChange: (
    lineId: string,
    itemId: string,
    productLabel: string,
    unitOfMeasure: string,
  ) => void;
  onQuantityChange: (lineId: string, value: string) => void;
  onConditionChange: (lineId: string, condition: StockBalanceCondition) => void;
  onLotChange: (lineId: string, lotId: string) => void;
  onSerializedAssetChange: (lineId: string, serializedAssetId: string) => void;
  onToggleLine: (lineId: string) => void;
  onToggleAll: (checked: boolean) => void;
  onRemove: (lineId: string) => void;
  onRemoveSelected: () => void;
  onApplyBulkQuantity: (quantity: string) => void;
}

export function StockIssueDraftLinesTable({
  lines,
  items,
  balances,
  assets,
  sourceLocationId,
  selectedLineIds,
  showAvailableColumn = false,
  onItemChange,
  onQuantityChange,
  onConditionChange,
  onLotChange,
  onSerializedAssetChange,
  onToggleLine,
  onToggleAll,
  onRemove,
  onRemoveSelected,
  onApplyBulkQuantity,
}: StockIssueDraftLinesTableProps) {
  const allSelected = lines.length > 0 && selectedLineIds.length === lines.length;
  const itemsById = new Map(items.map((item) => [item.id, item]));

  const itemOptions = [
    { value: '', label: 'Selecciona un producto' },
    ...items.map((item) => ({
      value: item.id,
      label: `${item.sku} · ${item.name}`,
    })),
  ];

  return (
    <div className="space-y-3">
      <StockIssueBulkEditBar
        selectedCount={selectedLineIds.length}
        onApplyQuantity={onApplyBulkQuantity}
      />

      {selectedLineIds.length > 0 ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onRemoveSelected}>
            Quitar seleccionadas ({selectedLineIds.length})
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
          <thead className="bg-gray-50 dark:bg-dark-surface-3">
            <tr>
              <th scope="col" className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  className={`h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
                  aria-label="Seleccionar todas las líneas"
                  checked={allSelected}
                  onChange={(event) => onToggleAll(event.target.checked)}
                />
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Producto
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Condición
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Lote / serial
              </th>
              {showAvailableColumn ? (
                <th scope="col" className="px-4 py-3 text-left">
                  {STOCK_AVAILABLE_AT_SOURCE_LABEL}
                </th>
              ) : null}
              <th scope="col" className="px-4 py-3 text-left">
                Cantidad
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Unidad
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
            {lines.map((line) => {
              const item = line.itemId ? itemsById.get(line.itemId) : undefined;
              const serialized = item ? isSerializedInventoryItem(item) : false;
              const lotOptions = line.itemId
                ? listLotOptionsForItemAtLocation(
                    balances,
                    line.itemId,
                    sourceLocationId,
                    line.condition,
                  )
                : [];
              const usedSerializedAssetIds = new Set(
                lines
                  .filter((other) => other.id !== line.id)
                  .map((other) => other.serializedAssetId.trim())
                  .filter(Boolean),
              );
              const assetOptions = line.itemId
                ? listSerializedAssetsForItemAtLocation(
                    assets,
                    line.itemId,
                    sourceLocationId,
                  ).filter(
                    (asset) =>
                      asset.id === line.serializedAssetId || !usedSerializedAssetIds.has(asset.id),
                  )
                : [];
              const availableQty =
                line.itemId && sourceLocationId
                  ? getAvailableQtyForDraftLine({
                      balances,
                      itemId: line.itemId,
                      sourceLocationId,
                      condition: line.condition,
                      lotId: line.lotId,
                      serializedAssetId: line.serializedAssetId,
                    })
                  : null;
              const exceedsAvailable =
                availableQty != null &&
                line.itemId &&
                !serialized &&
                isRequestedQtyExceedingAvailable(line.requestedQty, availableQty);

              return (
                <tr key={line.id}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className={`h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
                      aria-label={`Seleccionar línea ${line.productLabel || 'manual'}`}
                      checked={selectedLineIds.includes(line.id)}
                      onChange={() => onToggleLine(line.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {line.isManual ? (
                      <Select
                        aria-label={`Producto línea ${line.id}`}
                        value={line.itemId}
                        onChange={(event) => {
                          const itemId = event.target.value;
                          const nextItem = items.find((entry) => entry.id === itemId);
                          onItemChange(
                            line.id,
                            itemId,
                            nextItem ? `${nextItem.sku} · ${nextItem.name}` : '',
                            nextItem?.unitOfMeasure ?? '',
                          );
                        }}
                        options={itemOptions}
                      />
                    ) : (
                      <span className="font-medium text-gray-900 dark:text-white">
                        {line.productLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      aria-label={`Condición ${line.productLabel || 'manual'}`}
                      value={line.condition}
                      onChange={(event) =>
                        onConditionChange(line.id, event.target.value as StockBalanceCondition)
                      }
                      options={CONDITION_OPTIONS}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {serialized ? (
                      <Select
                        aria-label={`Serial ${line.productLabel || 'manual'}`}
                        value={line.serializedAssetId}
                        onChange={(event) => onSerializedAssetChange(line.id, event.target.value)}
                        options={[
                          { value: '', label: 'Selecciona un activo' },
                          ...assetOptions.map((asset) => ({
                            value: asset.id,
                            label: formatSerializedAssetLabel(asset),
                          })),
                        ]}
                      />
                    ) : lotOptions.length > 0 ? (
                      <Select
                        aria-label={`Lote ${line.productLabel || 'manual'}`}
                        value={line.lotId}
                        onChange={(event) => onLotChange(line.id, event.target.value)}
                        options={[
                          { value: '', label: 'Sin lote específico' },
                          ...lotOptions.map((option) => ({
                            value: option.lotId,
                            label: formatLotOptionLabel(option.lotId, option.availableQty),
                          })),
                        ]}
                      />
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">—</span>
                    )}
                  </td>
                  {showAvailableColumn ? (
                    <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-gray-300">
                      {line.itemId
                        ? formatInventoryQuantity(availableQty ?? 0)
                        : 'Selecciona un producto'}
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <Input
                        aria-label={`Cantidad ${line.productLabel || 'manual'}`}
                        value={line.requestedQty}
                        disabled={serialized || Boolean(line.serializedAssetId.trim())}
                        onChange={(event) => onQuantityChange(line.id, event.target.value)}
                      />
                      {exceedsAvailable ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Supera el material disponible en origen. No podrás crear la salida hasta
                          ajustar la cantidad.
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {line.unitOfMeasure || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemove(line.id)}
                    >
                      Quitar
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAvailableColumn ? (
        <p className="text-xs text-iwana-secondary-700 dark:text-gray-400">
          {STOCK_RESERVED_HELP_TEXT}
        </p>
      ) : null}
    </div>
  );
}
