'use client';

import { Badge, Button, SectionAccordion, cn } from '@iwana/ui';
import type { AwardMatrixQuoteColumn, AwardMatrixRow } from '@iwana/shared';
import {
  interactiveFocusClassName,
  portalDataTableCellClassName,
} from '@/components/shared/portal-ui';
import { formatInventoryMoney, formatInventoryQuantity } from './inventory-labels';
import { decimalStringToCents, formatCentsAsDecimal2 } from './decimal-cents';

/**
 * Rendering alterno de la matriz por cotización (MOD12 Compras, Fase 30, track FE-2).
 *
 * Consume el MISMO estado que `AwardMatrixTable` (selections/locks llegan ya
 * resueltos en `rows` + `selections`): un acordeón por proveedor con un
 * checkbox por producto cubierto y totales por proveedor. La exclusividad
 * «un producto, un proveedor» la garantiza `award-matrix.ts`; aquí un producto
 * ya marcado en otra cotización se muestra como tal y marcarlo lo mueve.
 *
 * Props no fijadas en la spec §5.2 (la spec solo nombra el componente):
 * se definen en analogía a `AwardMatrixTable` con los tipos del contrato
 * congelado, sin tipos paralelos.
 */

export interface AwardQuoteAccordionProps {
  rows: AwardMatrixRow[];
  columns: AwardMatrixQuoteColumn[];
  /** Draft vigente (lineId → quoteId): lo marcado en otra columna se refleja aquí. */
  selections: Record<string, string>;
  canEdit: boolean;
  onToggleCell: (lineId: string, quoteId: string) => void;
  onToggleColumn: (quoteId: string) => void;
}

/** Texto secundario sobre blanco: token con AA verificada (regla dura del track). */
const SECONDARY_TEXT_CLASS_NAME = 'text-iwana-secondary-700 dark:text-gray-300';

const PRODUCT_CHECKBOX_CLASS_NAME = `h-4 w-4 shrink-0 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`;

function formatMarkedTotal(markedAmountCents: number, currency: string): string {
  return formatInventoryMoney(formatCentsAsDecimal2(markedAmountCents), currency);
}

export function AwardQuoteAccordion({
  rows,
  columns,
  selections,
  canEdit,
  onToggleCell,
  onToggleColumn,
}: AwardQuoteAccordionProps) {
  const firstQuoteId = columns.length > 0 ? columns[0]?.quoteId : undefined;

  return (
    <SectionAccordion
      variant="card"
      {...(firstQuoteId ? { defaultOpen: firstQuoteId } : {})}
      items={columns.map((column) => {
        const coveredRows = rows.filter((row) => column.lines[row.purchaseRequestLineId]);
        const markedRows = coveredRows.filter(
          (row) => selections[row.purchaseRequestLineId] === column.quoteId,
        );
        let markedCents = 0;
        for (const row of markedRows) {
          const quoteLine = column.lines[row.purchaseRequestLineId];
          if (quoteLine) {
            // Céntimos exactos (decimal-cents): mismo criterio que la matriz y
            // la barra de resumen.
            markedCents += decimalStringToCents(quoteLine.lineAmount);
          }
        }
        const doneRows = coveredRows.filter((row) => {
          const state = row.cells[column.quoteId]?.state;
          return state === 'seleccionado' || state === 'adjudicado' || state === 'ordenado';
        });
        const progress =
          coveredRows.length > 0 ? Math.round((doneRows.length / coveredRows.length) * 100) : 0;
        const markedWord = markedRows.length === 1 ? 'producto' : 'productos';

        return {
          id: column.quoteId,
          label: column.quoteNumber?.trim()
            ? `${column.supplierLabel} · ${column.quoteNumber.trim()}`
            : column.supplierLabel,
          description: `${markedRows.length} ${markedWord} · ${formatMarkedTotal(markedCents, column.currency)}`,
          progress,
          children: (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={cn('text-xs tabular-nums', SECONDARY_TEXT_CLASS_NAME)}>
                  Pagadero {formatInventoryMoney(column.payableAmount, column.currency)} ·{' '}
                  {column.currency}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canEdit}
                  onClick={() => onToggleColumn(column.quoteId)}
                >
                  Adjudicar productos libres
                </Button>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-dark-border">
                {coveredRows.map((row) => {
                  const lineId = row.purchaseRequestLineId;
                  const state = row.cells[column.quoteId]?.state ?? 'sin-cotizar';
                  const quoteLine = column.lines[lineId];
                  const productLabel = row.itemName.trim() || 'Sin nombre';
                  const selectedHere = selections[lineId] === column.quoteId;
                  const selectedElsewhere = !selectedHere && selections[lineId] !== undefined;
                  const locked = state === 'adjudicado' || state === 'ordenado';

                  return (
                    <li key={lineId} className={portalDataTableCellClassName}>
                      {locked ? (
                        <span className="flex min-h-6 flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 font-medium text-gray-900 dark:text-white">
                            {productLabel}
                          </span>
                          {state === 'adjudicado' ? (
                            <Badge variant="success">Adjudicado</Badge>
                          ) : (
                            <Badge variant="neutral">Ordenado</Badge>
                          )}
                        </span>
                      ) : (
                        <label
                          className={cn(
                            'flex min-h-6 cursor-pointer items-start gap-2',
                            !canEdit && 'cursor-not-allowed',
                          )}
                        >
                          <input
                            type="checkbox"
                            className={PRODUCT_CHECKBOX_CLASS_NAME}
                            aria-label={`Adjudicar ${productLabel} a ${column.supplierLabel}`}
                            checked={selectedHere}
                            disabled={!canEdit}
                            onChange={() => onToggleCell(lineId, column.quoteId)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-gray-900 dark:text-white">
                              {productLabel}
                            </span>
                            <span
                              className={cn(
                                'block text-xs tabular-nums',
                                SECONDARY_TEXT_CLASS_NAME,
                              )}
                            >
                              {formatInventoryQuantity(row.quantityRequested)} {row.unitOfMeasure}
                              {quoteLine
                                ? ` · ${formatInventoryMoney(quoteLine.unitCost, column.currency)} / u.`
                                : null}
                            </span>
                            {selectedElsewhere ? (
                              <span className={cn('block text-xs', SECONDARY_TEXT_CLASS_NAME)}>
                                Adjudicado a otra cotización: marcarlo aquí lo mueve.
                              </span>
                            ) : null}
                          </span>
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                {markedRows.length} {markedWord} · {formatMarkedTotal(markedCents, column.currency)}
              </p>
            </div>
          ),
        };
      })}
    />
  );
}
