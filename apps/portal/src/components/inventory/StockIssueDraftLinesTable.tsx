'use client';

import { memo } from 'react';
import { getInventoryUnitOfMeasureLabel } from '@iwana/shared';
import type { StockIssuePickableItem } from '@iwana/shared';
import { Badge, Button, Input } from '@iwana/ui';
import { inventoryApi } from '@/lib/api-client';
import {
  interactiveFocusClassName,
  portalDataTableCellClassName,
  portalDataTableBodyClassName,
  portalDataTableHeadClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import { getStockBalanceConditionLabel } from './inventory-labels';
import type { StockIssueDraftItemHydration, StockIssueDraftLine } from './stock-issue-draft';
import { buildDraftProductLabel, resolveLineSerializedAssetIds } from './stock-issue-draft';
import { isRequestedQtyExceedingAvailable } from './stock-issue-balance-utils';
import {
  fallbackSerializedAssetLabel,
  formatLotOptionLabel,
  getAvailableQtyForDraftLine,
  isSerializedTrackingMode,
  stockConditionBadgeVariant,
} from './stock-issue-line-utils';
import { StockIssueBulkEditBar } from './StockIssueBulkEditBar';
import { InventoryItemPicker } from './InventoryItemPicker';

export interface StockIssueDraftLineError {
  message: string;
  controlId: string;
}

interface StockIssueDraftLinesTableProps {
  lines: StockIssueDraftLine[];
  selectedLineIds: string[];
  /** Etiquetas resueltas de seriales (hidratación de edición y selecciones del panel). */
  serialLabelsById: Record<string, string>;
  /** Errores por línea tras un envío bloqueado (además del PortalAlert global). */
  lineErrors?: Record<string, StockIssueDraftLineError>;
  /** Anuncios para la región viva de la tabla (regla dura P1: visible + anunciado). */
  liveNotice?: string;
  /** Caché de elegibles B1 de la bodega de origen (hidratación de la vía manual). */
  pickableById?: Map<string, StockIssuePickableItem>;
  /** Deshabilita los controles de la tabla mientras se envía la salida. */
  busy?: boolean;
  onItemChange: (lineId: string, hydration: StockIssueDraftItemHydration | null) => void;
  onQuantityChange: (lineId: string, value: string) => void;
  /** Reabre el panel de línea con los valores actuales de la fila (CA-S2-08). */
  onModifyLine: (lineId: string) => void;
  onToggleLine: (lineId: string) => void;
  onToggleAll: (checked: boolean) => void;
  onRemove: (lineId: string) => void;
  onRemoveSelected: () => void;
  onApplyBulkQuantity: (quantity: string) => void;
}

/** Texto del detalle de lote: número real + vencimiento + disponible. */
function lotDetailText(line: StockIssueDraftLine): string | null {
  if (!line.lotId.trim()) {
    return null;
  }
  const lot = line.lots.find((entry) => entry.lotId === line.lotId);
  if (!lot) {
    return null;
  }
  return formatLotOptionLabel({
    lotNumber: lot.lotNumber,
    expiryDate: lot.expiryDate,
    availableQty: Number.parseFloat(lot.available) || 0,
  });
}

/** Etiquetas visibles truncadas; el `title` y el `aria-label` llevan la lista completa. */
function truncateSerialLabels(labels: string[], maxVisible = 2): string {
  if (labels.length <= maxVisible) {
    return labels.join(', ');
  }
  const visible = labels.slice(0, maxVisible).join(', ');
  return `${visible}, +${labels.length - maxVisible} más`;
}

interface StockIssueDraftLineRowProps {
  line: StockIssueDraftLine;
  selected: boolean;
  serialLabelsById: Record<string, string>;
  lineError?: StockIssueDraftLineError | undefined;
  pickableById?: Map<string, StockIssuePickableItem> | undefined;
  busy: boolean;
  onItemChange: (lineId: string, hydration: StockIssueDraftItemHydration | null) => void;
  onQuantityChange: (lineId: string, value: string) => void;
  onModifyLine: (lineId: string) => void;
  onToggleLine: (lineId: string) => void;
  onRemove: (lineId: string) => void;
}

/**
 * Fila memoizada (S2.1 C4): los callbacks llegan estables desde el composer y
 * la fila solo se re-renderiza cuando cambian su línea, su selección, sus
 * etiquetas o el estado de envío.
 */
const StockIssueDraftLineRow = memo(function StockIssueDraftLineRow({
  line,
  selected,
  serialLabelsById,
  lineError,
  pickableById,
  busy,
  onItemChange,
  onQuantityChange,
  onModifyLine,
  onToggleLine,
  onRemove,
}: StockIssueDraftLineRowProps) {
  const serialized = isSerializedTrackingMode(line.trackingMode);
  const serializedIds = resolveLineSerializedAssetIds(line);
  const qtyControlId = `issue-draft-qty-${line.id}`;
  const modifyControlId = `issue-draft-modify-${line.id}`;
  const lotText = lotDetailText(line);
  const serialLabels = serializedIds.map(
    (id) => serialLabelsById[id] ?? fallbackSerializedAssetLabel(id),
  );
  const fullSerialLabels = serialLabels.join(', ');
  const missingSerials = serialized && serializedIds.length === 0;
  const availableQty =
    line.itemId && !serialized
      ? getAvailableQtyForDraftLine({
          availability: line.availability,
          lots: line.lots,
          condition: line.condition,
          lotId: line.lotId,
          serializedAssetId: '',
        })
      : null;
  const exceedsAvailable =
    availableQty != null && isRequestedQtyExceedingAvailable(line.requestedQty, availableQty);

  return (
    <tr className={portalTableRowHoverClassName}>
      <td className={portalDataTableCellClassName}>
        <input
          type="checkbox"
          className={`h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
          aria-label={`Seleccionar línea ${line.productLabel || 'manual'}`}
          checked={selected}
          disabled={busy}
          onChange={() => onToggleLine(line.id)}
        />
      </td>
      <td className={portalDataTableCellClassName}>
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
                    // B1 aún no expone el modelo: la línea muestra el nombre.
                    productLabel: buildDraftProductLabel(pickable.name),
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
                      productLabel: buildDraftProductLabel(item.name, item.model),
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
                      productLabel: picked.label,
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
          <span className="font-medium text-gray-900 dark:text-white">{line.productLabel}</span>
        )}
      </td>
      <td className={portalDataTableCellClassName}>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={stockConditionBadgeVariant(line.condition)}>
            {getStockBalanceConditionLabel(line.condition)}
          </Badge>
          {lotText ? (
            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
              Lote {lotText}
            </span>
          ) : null}
          {missingSerials ? <Badge variant="warning">Falta configurar seriales</Badge> : null}
          {!missingSerials && serializedIds.length === 1 ? (
            <span className="font-mono text-xs text-gray-700 dark:text-gray-200">
              {serialLabels[0]}
            </span>
          ) : null}
          {!missingSerials && serializedIds.length > 1 ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Badge
                variant="neutral"
                title={fullSerialLabels}
                aria-label={`${serializedIds.length} seriales: ${fullSerialLabels}`}
              >
                {serializedIds.length} seriales
              </Badge>
              <span
                aria-hidden="true"
                title={fullSerialLabels}
                className="max-w-40 truncate font-mono text-xs text-gray-500 dark:text-gray-400"
              >
                {truncateSerialLabels(serialLabels)}
              </span>
            </span>
          ) : null}
        </div>
        {lineError && !lineError.controlId.includes('-item-') ? (
          <p role="alert" className="mt-1 text-xs text-error-700 dark:text-error-400">
            {lineError.message}
          </p>
        ) : null}
      </td>
      <td className={portalDataTableCellClassName}>
        {serialized ? (
          <span className="tabular-nums text-gray-900 dark:text-white">{line.requestedQty}</span>
        ) : (
          <div className="max-w-24 space-y-1">
            <Input
              id={qtyControlId}
              aria-label={`Cantidad ${line.productLabel || 'manual'}`}
              value={line.requestedQty}
              disabled={busy}
              onChange={(event) => onQuantityChange(line.id, event.target.value)}
            />
            {exceedsAvailable ? (
              <p className="text-xs text-error-700 dark:text-error-400">
                Supera el material disponible en origen. No podrás crear la salida hasta ajustar la
                cantidad.
              </p>
            ) : null}
          </div>
        )}
      </td>
      <td className={`${portalDataTableCellClassName} text-gray-600 dark:text-gray-300`}>
        {line.unitOfMeasure ? getInventoryUnitOfMeasureLabel(line.unitOfMeasure) : '—'}
      </td>
      <td className={portalDataTableCellClassName}>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            id={modifyControlId}
            variant="secondary"
            size="sm"
            className="min-h-11"
            disabled={!line.itemId.trim() || busy}
            onClick={() => onModifyLine(line.id)}
          >
            Modificar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            disabled={busy}
            onClick={() => onRemove(line.id)}
          >
            Quitar
          </Button>
        </div>
      </td>
    </tr>
  );
});

/**
 * Lista revisable del borrador (MOD12 S2 §6.3): sin controles inline de
 * condición, lote ni serial — la configuración vive en el panel y la fila
 * muestra el detalle como dato, con Modificar y Quitar siempre visibles.
 */
export function StockIssueDraftLinesTable({
  lines,
  selectedLineIds,
  serialLabelsById,
  lineErrors = {},
  liveNotice = '',
  pickableById,
  busy = false,
  onItemChange,
  onQuantityChange,
  onModifyLine,
  onToggleLine,
  onToggleAll,
  onRemove,
  onRemoveSelected,
  onApplyBulkQuantity,
}: StockIssueDraftLinesTableProps) {
  const allSelected = lines.length > 0 && selectedLineIds.length === lines.length;
  const needsAssetLabels = lines.some((line) => resolveLineSerializedAssetIds(line).length > 0);

  return (
    <div className="space-y-3">
      <StockIssueBulkEditBar
        selectedCount={selectedLineIds.length}
        disabled={busy}
        onApplyQuantity={onApplyBulkQuantity}
      />

      {selectedLineIds.length > 0 ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onRemoveSelected}
          >
            Quitar seleccionadas ({selectedLineIds.length})
          </Button>
        </div>
      ) : null}

      <div className={portalDataTableShellClassName} aria-busy={busy || undefined}>
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
          <thead className={portalDataTableHeadRowClassName}>
            <tr>
              <th scope="col" className={portalDataTableHeadClassName}>
                <input
                  type="checkbox"
                  className={`h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
                  aria-label="Seleccionar todas las líneas"
                  checked={allSelected}
                  disabled={busy}
                  onChange={(event) => onToggleAll(event.target.checked)}
                />
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                Producto
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                Detalle
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                Cantidad
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                Unidad
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className={portalDataTableBodyClassName}>
            {lines.map((line) => (
              <StockIssueDraftLineRow
                key={line.id}
                line={line}
                selected={selectedLineIds.includes(line.id)}
                serialLabelsById={serialLabelsById}
                lineError={lineErrors[line.id]}
                pickableById={pickableById}
                busy={busy}
                onItemChange={onItemChange}
                onQuantityChange={onQuantityChange}
                onModifyLine={onModifyLine}
                onToggleLine={onToggleLine}
                onRemove={onRemove}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="sr-only" role="status">
        {liveNotice}
      </p>

      {needsAssetLabels ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          La cantidad de una línea con seriales es el número de seriales seleccionados; ajústala con
          Modificar.
        </p>
      ) : null}
    </div>
  );
}
