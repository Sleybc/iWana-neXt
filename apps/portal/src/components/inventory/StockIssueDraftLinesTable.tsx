'use client';

import { useEffect, useState } from 'react';
import { StockBalanceCondition, getInventoryUnitOfMeasureLabel } from '@iwana/shared';
import type { StockIssuePickableItem } from '@iwana/shared';
import { Button, Input, Select } from '@iwana/ui';
import { inventoryApi } from '@/lib/api-client';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';
import type { StockIssueDraftItemHydration, StockIssueDraftLine } from './stock-issue-draft';
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
  getAvailableQtyByCondition,
  getAvailableQtyForDraftLine,
  isSerializedTrackingMode,
  listAvailableConditionsForDraftLine,
  listLotOptionsFromPickableLots,
} from './stock-issue-line-utils';
import { InventoryAssetPicker } from './InventoryAssetPicker';
import { InventoryItemPicker } from './InventoryItemPicker';

export interface StockIssueDraftLineError {
  message: string;
  controlId: string;
}

interface StockIssueDraftLinesTableProps {
  lines: StockIssueDraftLine[];
  sourceLocationId: string;
  selectedLineIds: string[];
  showAvailableColumn?: boolean;
  /** Caché de elegibles B1 de la bodega de origen (hidratación manual y etiquetas). */
  pickableById?: Map<string, StockIssuePickableItem>;
  /** Errores por línea tras un envío bloqueado (además del PortalAlert global). */
  lineErrors?: Record<string, StockIssueDraftLineError>;
  onItemChange: (lineId: string, hydration: StockIssueDraftItemHydration | null) => void;
  onQuantityChange: (lineId: string, value: string) => void;
  onConditionChange: (lineId: string, condition: StockBalanceCondition) => void;
  onLotChange: (lineId: string, lotId: string) => void;
  onSerializedAssetChange: (
    lineId: string,
    serializedAssetId: string,
    serializedAssetLabel: string,
  ) => void;
  onToggleLine: (lineId: string) => void;
  onToggleAll: (checked: boolean) => void;
  onRemove: (lineId: string) => void;
  onRemoveSelected: () => void;
  onApplyBulkQuantity: (quantity: string) => void;
}

/** Etiqueta corta del serial elegido cuando aún no se resolvió su rótulo. */
function fallbackAssetLabel(assetId: string): string {
  return assetId.slice(0, 8).toUpperCase();
}

export function StockIssueDraftLinesTable({
  lines,
  sourceLocationId,
  selectedLineIds,
  showAvailableColumn = false,
  pickableById,
  lineErrors = {},
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
  const [conditionNotice, setConditionNotice] = useState('');
  const [resolvedAssetLabels, setResolvedAssetLabels] = useState<Record<string, string>>({});

  // Etiquetas de seriales preexistentes (modo edición): se resuelven una vez por
  // activo y se cachean; un fallo degrada al id corto, nunca bloquea la línea.
  useEffect(() => {
    const pending = lines.filter(
      (line) =>
        line.serializedAssetId.trim() &&
        !line.serializedAssetLabel.trim() &&
        resolvedAssetLabels[line.serializedAssetId] == null,
    );
    if (pending.length === 0) {
      return;
    }

    let cancelled = false;
    void Promise.all(
      [...new Set(pending.map((line) => line.serializedAssetId.trim()))].map((assetId) =>
        inventoryApi
          .getAsset(assetId)
          .then((asset) => ({
            assetId,
            label:
              asset.serialNumber?.trim() || asset.assetTag?.trim() || fallbackAssetLabel(assetId),
          }))
          .catch(() => ({ assetId, label: fallbackAssetLabel(assetId) })),
      ),
    ).then((resolved) => {
      if (cancelled) {
        return;
      }
      setResolvedAssetLabels((current) => {
        const next = { ...current };
        for (const entry of resolved) {
          next[entry.assetId] = entry.label;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [lines, resolvedAssetLabels]);

  function handleConditionChange(line: StockIssueDraftLine, condition: StockBalanceCondition) {
    onConditionChange(line.id, condition);
    // Cambiar la condición limpia el lote (updateDraftLineCondition): se anuncia
    // para que el operador entienda por qué el disponible cambió.
    if (line.lotId.trim()) {
      setConditionNotice(
        `Se limpió el lote de ${line.productLabel || 'la línea'} al cambiar la condición.`,
      );
    }
  }

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
              const serialized = isSerializedTrackingMode(line.trackingMode);
              const lotOptions = serialized
                ? []
                : listLotOptionsFromPickableLots(line.lots, line.condition);
              const conditionOptions = listAvailableConditionsForDraftLine(line.availability);
              const hasAvailabilityData = line.availability.length > 0;
              const usedSerializedAssetIds = new Set(
                lines
                  .filter((other) => other.id !== line.id)
                  .map((other) => other.serializedAssetId.trim())
                  .filter(Boolean),
              );
              const availableQty = line.itemId
                ? getAvailableQtyForDraftLine({
                    availability: line.availability,
                    lots: line.lots,
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
              const lineError = lineErrors[line.id];
              const selectedAssetLabel =
                line.serializedAssetLabel.trim() ||
                (line.serializedAssetId.trim()
                  ? (resolvedAssetLabels[line.serializedAssetId.trim()] ??
                    fallbackAssetLabel(line.serializedAssetId.trim()))
                  : null);
              const serialControlId = `issue-draft-serial-${line.id}`;
              const qtyControlId = `issue-draft-qty-${line.id}`;
              const noSerialsInSource =
                serialized && !line.serializedAssetId.trim() && line.availableSerialCount === 0;

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
                      <div className="space-y-1">
                        <InventoryItemPicker
                          id={`issue-draft-item-${line.id}`}
                          label="Producto"
                          value={line.itemId || null}
                          selectedLabel={line.productLabel || null}
                          onChange={(itemId, picked) => {
                            if (!itemId || !picked) {
                              onItemChange(line.id, null);
                              return;
                            }
                            // Vía manual hidratada (S1): primero el caché B1 de la
                            // bodega (trackingMode + lots[] + availability[]); si el
                            // ítem no está ahí, getItem aporta al menos trackingMode
                            // y unidad para que C3 no persista por esta vía.
                            const pickable = pickableById?.get(itemId);
                            if (pickable) {
                              onItemChange(line.id, {
                                itemId: pickable.itemId,
                                productLabel: `${pickable.sku} · ${pickable.name}`,
                                unitOfMeasure: pickable.unitOfMeasure,
                                trackingMode: pickable.trackingMode,
                                lots: pickable.lots,
                                availability: pickable.availability,
                                availableSerialCount: pickable.availableSerialCount,
                              });
                              return;
                            }
                            void inventoryApi
                              .getItem(itemId)
                              .then((item) => {
                                onItemChange(line.id, {
                                  itemId: item.id,
                                  productLabel: `${item.sku} · ${item.name}`,
                                  unitOfMeasure: item.unitOfMeasure ?? '',
                                  trackingMode: item.trackingMode,
                                  lots: [],
                                  availability: [],
                                  availableSerialCount: 0,
                                });
                              })
                              .catch(() => {
                                onItemChange(line.id, {
                                  itemId,
                                  productLabel: picked.sublabel
                                    ? `${picked.label} · ${picked.sublabel}`
                                    : picked.label,
                                  unitOfMeasure: '',
                                  trackingMode: line.trackingMode,
                                  lots: [],
                                  availability: [],
                                  availableSerialCount: 0,
                                });
                              });
                          }}
                        />
                        {lineError?.controlId.includes('-item-') ? (
                          <p role="alert" className="text-xs text-error-700 dark:text-error-400">
                            {lineError.message}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="font-medium text-gray-900 dark:text-white">
                        {line.productLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      id={`issue-draft-condition-${line.id}`}
                      aria-label={`Condición ${line.productLabel || 'manual'}`}
                      value={line.condition}
                      onChange={(event) =>
                        handleConditionChange(line, event.target.value as StockBalanceCondition)
                      }
                      options={conditionOptions.map((condition) => ({
                        value: condition,
                        label: hasAvailabilityData
                          ? `${getStockBalanceConditionLabel(condition)} · ${formatInventoryQuantity(getAvailableQtyByCondition(line.availability, condition))}`
                          : getStockBalanceConditionLabel(condition),
                      }))}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {serialized ? (
                      <div className="min-w-52 space-y-1">
                        {noSerialsInSource ? (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Este producto serializado no tiene seriales disponibles en esta bodega.
                          </p>
                        ) : null}
                        <InventoryAssetPicker
                          id={serialControlId}
                          label={
                            <span className="sr-only">Serial {line.productLabel || 'manual'}</span>
                          }
                          value={line.serializedAssetId || null}
                          selectedLabel={selectedAssetLabel}
                          placeholder="Buscar serial disponible"
                          disabled={noSerialsInSource}
                          minChars={0}
                          itemId={line.itemId || null}
                          locationId={sourceLocationId || null}
                          excludeIds={[...usedSerializedAssetIds]}
                          onChange={(assetId, item) => {
                            onSerializedAssetChange(line.id, assetId ?? '', item?.label ?? '');
                          }}
                        />
                        {lineError?.controlId.includes('-serial-') ? (
                          <p role="alert" className="text-xs text-error-700 dark:text-error-400">
                            {lineError.message}
                          </p>
                        ) : null}
                      </div>
                    ) : lotOptions.length > 0 ? (
                      <div className="space-y-1">
                        <Select
                          id={`issue-draft-lot-${line.id}`}
                          aria-label={`Lote ${line.productLabel || 'manual'}`}
                          value={line.lotId}
                          onChange={(event) => onLotChange(line.id, event.target.value)}
                          options={[
                            { value: '', label: 'Sin lote específico' },
                            ...lotOptions.map((option) => ({
                              value: option.lotId,
                              label: formatLotOptionLabel(option),
                            })),
                          ]}
                        />
                        <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
                          {(() => {
                            if (!line.lotId) {
                              return null;
                            }
                            const selected = lotOptions.find(
                              (option) => option.lotId === line.lotId,
                            );
                            return selected ? `N.º ${selected.lotNumber}` : null;
                          })()}
                        </p>
                      </div>
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
                        id={qtyControlId}
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
                      {lineError &&
                      !lineError.controlId.includes('-serial-') &&
                      !lineError.controlId.includes('-item-') ? (
                        <p role="alert" className="text-xs text-error-700 dark:text-error-400">
                          {lineError.message}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {line.unitOfMeasure ? getInventoryUnitOfMeasureLabel(line.unitOfMeasure) : '—'}
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

      <p className="sr-only" role="status">
        {conditionNotice}
      </p>

      {showAvailableColumn ? (
        <p className="text-xs text-iwana-secondary-700 dark:text-gray-400">
          {STOCK_RESERVED_HELP_TEXT}
        </p>
      ) : null}
    </div>
  );
}
