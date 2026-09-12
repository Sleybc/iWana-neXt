'use client';

import { memo, useId } from 'react';
import { Badge, Button, Input, cn } from '@iwana/ui';
import type { AwardMatrixQuoteColumn, AwardMatrixRow } from '@iwana/shared';
import {
  PortalDataTableHead,
  interactiveFocusClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import { formatInventoryMoney, formatInventoryQuantity } from './inventory-labels';
import { getAwardColumnControlId } from './award-matrix';
import { decimalStringToCents, formatCentsAsDecimal2 } from './decimal-cents';

/**
 * Matriz productos × cotizaciones (MOD12 Compras, Fase 30, track FE-2).
 *
 * Contrato congelado: spec 2026-09-11 §5.2 (props exactas) + §4.2/§4.3
 * (anatomía y estados de celda). La exclusividad «un producto, un proveedor»
 * vive en `award-matrix.ts`, no en el render: cada fila es un `radiogroup`
 * nativo (un solo radio marcable por fila).
 *
 * Recetas: `portalDataTableShell` / `PortalDataTableHead` /
 * `portalDataTableCellClassName` / `portalTableRowHoverClassName`. El checkbox
 * de columna es idéntico al de `PurchaseDraftLinesTable` /
 * `StockIssueDraftLinesTable` (h-4 w-4, accent-iwana-primary). El área táctil
 * de 24 px de la celda la aporta el `<label>` que envuelve control + precio
 * (spec §8: el área activa es la celda, no solo el control).
 */

export interface AwardMatrixTableProps {
  rows: AwardMatrixRow[];
  columns: AwardMatrixQuoteColumn[];
  canEdit: boolean;
  /** true solo si requestType === PROJECT (spec §4.2). */
  quantityEditable: boolean;
  onToggleCell: (lineId: string, quoteId: string) => void;
  onToggleColumn: (quoteId: string) => void;
  onQuantityChange?: ((lineId: string, value: string) => void) | undefined;
  /**
   * Se invoca con el `purchaseRequestLineId` de la fila: el panel resuelve el
   * `awardId` real a través de `state.locks` (la fila del contrato no expone
   * `awardId`; solo el contenedor dueño del estado conoce los locks).
   */
  onRevokeRequest?: ((awardId: string) => void) | undefined;
}

/** Checkbox de columna: marcado solo si todo lo libre de la columna está marcado. */
function resolveColumnCheckState(
  column: AwardMatrixQuoteColumn,
  rows: AwardMatrixRow[],
): { checked: boolean; indeterminate: boolean; freeCount: number } {
  let freeCount = 0;
  let selectedCount = 0;
  for (const row of rows) {
    const state = row.cells[column.quoteId]?.state;
    if (state !== 'disponible' && state !== 'seleccionado') {
      continue;
    }
    freeCount += 1;
    if (state === 'seleccionado') {
      selectedCount += 1;
    }
  }
  return {
    checked: freeCount > 0 && selectedCount === freeCount,
    indeterminate: selectedCount > 0 && selectedCount < freeCount,
    freeCount,
  };
}

const COLUMN_CHECKBOX_CLASS_NAME = `h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`;

const CELL_RADIO_CLASS_NAME = `h-4 w-4 shrink-0 accent-iwana-primary ${interactiveFocusClassName}`;

/** Texto secundario sobre blanco: token con AA verificada (regla dura del track). */
const SECONDARY_TEXT_CLASS_NAME = 'text-iwana-secondary-700 dark:text-gray-300';

interface AwardMatrixRowViewProps {
  row: AwardMatrixRow;
  columns: AwardMatrixQuoteColumn[];
  canEdit: boolean;
  quantityEditable: boolean;
  groupName: string;
  onToggleCell: (lineId: string, quoteId: string) => void;
  onQuantityChange?: ((lineId: string, value: string) => void) | undefined;
  onRevokeRequest?: ((awardId: string) => void) | undefined;
}

/** Fila memoizada (patrón StockIssueDraftLinesTable): solo re-renderiza con su fila. */
const AwardMatrixRowView = memo(function AwardMatrixRowView({
  row,
  columns,
  canEdit,
  quantityEditable,
  groupName,
  onToggleCell,
  onQuantityChange,
  onRevokeRequest,
}: AwardMatrixRowViewProps) {
  const lineId = row.purchaseRequestLineId;
  const productLabel = row.itemName.trim() || 'Sin nombre';
  const cellStates = columns.map((column) => row.cells[column.quoteId]?.state ?? 'sin-cotizar');
  const lockedAdjudicated = cellStates.includes('adjudicado');
  const lockedOrdered = cellStates.includes('ordenado');
  const locked = lockedAdjudicated || lockedOrdered;
  const quantityControlId = `award-matrix-qty-${lineId}`;

  return (
    <tr role="radiogroup" aria-label={productLabel} className={portalTableRowHoverClassName}>
      <td
        className={cn(
          portalDataTableCellClassName,
          'sticky left-0 z-10 bg-white dark:bg-dark-surface-2',
        )}
      >
        <p className="font-medium text-gray-900 dark:text-white">{productLabel}</p>
        {row.sku.trim() ? (
          <p className={cn('mt-0.5 font-mono text-xs', SECONDARY_TEXT_CLASS_NAME)}>
            {row.sku.trim()}
          </p>
        ) : null}
        <p className={cn('mt-0.5 text-xs tabular-nums', SECONDARY_TEXT_CLASS_NAME)}>
          {formatInventoryQuantity(row.quantityRequested)} {row.unitOfMeasure}
        </p>
      </td>

      {columns.map((column) => {
        const cell = row.cells[column.quoteId];
        const state = cell?.state ?? 'sin-cotizar';
        const quoteLine = column.lines[lineId];

        if (state === 'sin-cotizar' || !quoteLine) {
          return (
            <td key={column.quoteId} className={portalDataTableCellClassName}>
              <span role="img" aria-label="Sin cotizar" className={SECONDARY_TEXT_CLASS_NAME}>
                —
              </span>
            </td>
          );
        }

        if (state === 'adjudicado' || state === 'ordenado') {
          return (
            <td key={column.quoteId} className={portalDataTableCellClassName}>
              {state === 'adjudicado' ? (
                <Badge variant="success">Adjudicado</Badge>
              ) : (
                <Badge variant="neutral">Ordenado</Badge>
              )}
            </td>
          );
        }

        const selected = state === 'seleccionado';
        return (
          <td
            key={column.quoteId}
            className={cn(portalDataTableCellClassName, selected && 'bg-iwana-primary/5')}
          >
            <label
              className={cn(
                'flex min-h-6 min-w-6 items-start gap-2',
                canEdit ? 'cursor-pointer' : 'cursor-not-allowed',
              )}
            >
              <input
                type="radio"
                name={groupName}
                className={CELL_RADIO_CLASS_NAME}
                aria-label={`Adjudicar ${productLabel} a ${column.supplierLabel}`}
                checked={selected}
                disabled={!canEdit}
                onChange={() => onToggleCell(lineId, column.quoteId)}
              />
              <span className="min-w-0">
                <span className="block font-medium tabular-nums text-gray-900 dark:text-white">
                  {formatInventoryMoney(quoteLine.unitCost, column.currency)} / u.
                </span>
                <span className={cn('block text-xs tabular-nums', SECONDARY_TEXT_CLASS_NAME)}>
                  {formatInventoryMoney(quoteLine.lineAmount, column.currency)}
                </span>
                {cell?.cheapest === true ? (
                  <span className="mt-1 inline-block">
                    <Badge variant="lime">Más barato</Badge>
                  </span>
                ) : null}
              </span>
            </label>
          </td>
        );
      })}

      <td className={portalDataTableCellClassName}>
        {locked ? (
          <span className="font-medium tabular-nums text-gray-900 dark:text-white">
            {formatInventoryQuantity(row.awardedQuantity)} {row.unitOfMeasure}
          </span>
        ) : quantityEditable && canEdit ? (
          <Input
            id={quantityControlId}
            aria-label={`Cantidad adjudicada de ${productLabel}`}
            className="w-24 tabular-nums"
            inputMode="decimal"
            value={row.awardedQuantity}
            onChange={(event) => onQuantityChange?.(lineId, event.target.value)}
          />
        ) : (
          <span className="space-y-1">
            <span className="block font-medium tabular-nums text-gray-900 dark:text-white">
              {formatInventoryQuantity(row.awardedQuantity)} {row.unitOfMeasure}
            </span>
            <span className={cn('block text-xs', SECONDARY_TEXT_CLASS_NAME)}>
              En este tipo de compra la adjudicación cubre la cantidad total.
            </span>
          </span>
        )}
        {lockedAdjudicated && onRevokeRequest && canEdit ? (
          <span className="mt-1 block">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Revocar adjudicación de ${productLabel}`}
              onClick={() => onRevokeRequest(lineId)}
            >
              Revocar
            </Button>
          </span>
        ) : null}
      </td>
    </tr>
  );
});

export function AwardMatrixTable({
  rows,
  columns,
  canEdit,
  quantityEditable,
  onToggleCell,
  onToggleColumn,
  onQuantityChange,
  onRevokeRequest,
}: AwardMatrixTableProps) {
  const groupPrefix = useId();

  return (
    <div className={portalDataTableShellClassName}>
      <table
        className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border"
        aria-label="Adjudicación por cotización"
      >
        <thead className={portalDataTableHeadRowClassName}>
          <tr>
            <PortalDataTableHead className="sticky left-0 z-10 bg-iwana-surface-soft dark:bg-dark-surface-3">
              Producto
            </PortalDataTableHead>
            {columns.map((column) => {
              const check = resolveColumnCheckState(column, rows);
              return (
                <PortalDataTableHead key={column.quoteId}>
                  <span className="block min-w-36 space-y-1">
                    <span className="block font-medium text-gray-900 dark:text-white">
                      {column.supplierLabel}
                    </span>
                    <span className={cn('block text-xs', SECONDARY_TEXT_CLASS_NAME)}>
                      {column.quoteNumber?.trim() || 'Sin número'} · {column.currency}
                    </span>
                    <span className="block text-xs tabular-nums text-gray-900 dark:text-white">
                      {formatInventoryMoney(column.payableAmount, column.currency)}
                    </span>
                    <input
                      ref={(element) => {
                        if (element) {
                          element.indeterminate = check.indeterminate;
                        }
                      }}
                      id={getAwardColumnControlId(column.quoteId)}
                      type="checkbox"
                      className={COLUMN_CHECKBOX_CLASS_NAME}
                      aria-label={`Adjudicar productos libres a ${column.supplierLabel}`}
                      checked={check.checked}
                      disabled={!canEdit || check.freeCount === 0}
                      onChange={() => onToggleColumn(column.quoteId)}
                    />
                  </span>
                </PortalDataTableHead>
              );
            })}
            <PortalDataTableHead>Cantidad adjudicada</PortalDataTableHead>
          </tr>
        </thead>
        <tbody className={portalDataTableBodyClassName}>
          {rows.map((row) => (
            <AwardMatrixRowView
              key={row.purchaseRequestLineId}
              row={row}
              columns={columns}
              canEdit={canEdit}
              quantityEditable={quantityEditable}
              groupName={`${groupPrefix}-row-${row.purchaseRequestLineId}`}
              onToggleCell={onToggleCell}
              {...(onQuantityChange ? { onQuantityChange } : {})}
              {...(onRevokeRequest ? { onRevokeRequest } : {})}
            />
          ))}
        </tbody>
        <tfoot className={portalDataTableHeadRowClassName}>
          <tr>
            <td className={portalDataTableCellClassName}>
              <span className="font-medium text-gray-900 dark:text-white">Subtotal</span>
            </td>
            {columns.map((column) => {
              let markedCount = 0;
              let totalCents = 0;
              for (const row of rows) {
                if (row.cells[column.quoteId]?.state !== 'seleccionado') {
                  continue;
                }
                const quoteLine = column.lines[row.purchaseRequestLineId];
                if (!quoteLine) {
                  continue;
                }
                markedCount += 1;
                // Céntimos exactos (decimal-cents): el mismo criterio que la
                // barra de resumen, para que ambas vistas nunca discrepen.
                totalCents += decimalStringToCents(quoteLine.lineAmount);
              }
              const productWord = markedCount === 1 ? 'producto' : 'productos';
              return (
                <td key={column.quoteId} className={portalDataTableCellClassName}>
                  <span className="block text-xs tabular-nums text-gray-900 dark:text-white">
                    {markedCount} {productWord} ·{' '}
                    {formatInventoryMoney(formatCentsAsDecimal2(totalCents), column.currency)}
                  </span>
                </td>
              );
            })}
            <td className={portalDataTableCellClassName} aria-hidden="true" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
