'use client';

import { Input } from '@iwana/ui';
import type { PurchaseRequestLineRecord } from '@/lib/api-client';
import {
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import { formatInventoryCurrency, formatInventoryQuantity } from './inventory-labels';

export type QuoteLineUnitCostMap = Record<string, string>;

export function buildQuoteLinesPayload(
  unitCosts: QuoteLineUnitCostMap,
  requestLines: PurchaseRequestLineRecord[],
): Array<{ purchaseRequestLineId: string; unitCost: number }> {
  const payload: Array<{ purchaseRequestLineId: string; unitCost: number }> = [];
  for (const line of requestLines) {
    const raw = unitCosts[line.id]?.trim() ?? '';
    if (!raw) {
      continue;
    }
    const unitCost = Number.parseFloat(raw);
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      continue;
    }
    payload.push({ purchaseRequestLineId: line.id, unitCost });
  }
  return payload;
}

export function sumQuoteLinesTotal(
  unitCosts: QuoteLineUnitCostMap,
  requestLines: PurchaseRequestLineRecord[],
): number {
  return buildQuoteLinesPayload(unitCosts, requestLines).reduce((total, entry) => {
    const line = requestLines.find((item) => item.id === entry.purchaseRequestLineId);
    const quantity = Number.parseFloat(line?.quantityRequested ?? '0');
    return total + quantity * entry.unitCost;
  }, 0);
}

function lineLabel(line: PurchaseRequestLineRecord): string {
  const freeText = line.freeTextDescription?.trim();
  if (freeText) {
    return freeText;
  }
  if (line.inventoryItemId) {
    return `Producto del catálogo`;
  }
  return 'Línea de solicitud';
}

interface SupplierQuoteLinesEditorProps {
  requestLines: PurchaseRequestLineRecord[];
  value: QuoteLineUnitCostMap;
  onChange: (next: QuoteLineUnitCostMap) => void;
  disabled?: boolean;
  itemLabelsById?: Record<string, string>;
}

export function SupplierQuoteLinesEditor({
  requestLines,
  value,
  onChange,
  disabled = false,
  itemLabelsById,
}: SupplierQuoteLinesEditorProps) {
  const total = sumQuoteLinesTotal(value, requestLines);

  if (requestLines.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-300">
        Esta solicitud no tiene líneas para cotizar por producto.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className={portalDataTableShellClassName}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
            <thead className="bg-gray-50 dark:bg-dark-surface-3">
              <tr>
                <th className={portalDataTableHeadClassName}>Producto</th>
                <th className={portalDataTableHeadClassName}>Cantidad</th>
                <th className={portalDataTableHeadClassName}>Costo unitario</th>
                <th className={portalDataTableHeadClassName}>Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {requestLines.map((line) => {
                const unitCostRaw = value[line.id] ?? '';
                const unitCost = Number.parseFloat(unitCostRaw);
                const quantity = Number.parseFloat(line.quantityRequested);
                const subtotal =
                  Number.isFinite(unitCost) && unitCost > 0 && Number.isFinite(quantity)
                    ? unitCost * quantity
                    : null;
                const label =
                  (line.inventoryItemId && itemLabelsById?.[line.inventoryItemId]) ||
                  lineLabel(line);

                return (
                  <tr key={line.id} className={portalTableRowHoverClassName}>
                    <td className={portalDataTableCellClassName}>
                      <p className="font-medium text-gray-900 dark:text-white">{label}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{line.unitOfMeasure}</p>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatInventoryQuantity(line.quantityRequested)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Input
                        aria-label={`Costo unitario de ${label}`}
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        value={unitCostRaw}
                        disabled={disabled}
                        onChange={(event) => onChange({ ...value, [line.id]: event.target.value })}
                        containerClassName="min-w-[8rem]"
                      />
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {subtotal !== null ? formatInventoryCurrency(subtotal) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        Total de la cotización:{' '}
        <span className="tabular-nums">{formatInventoryCurrency(total)}</span>
      </p>
      <p className="text-xs text-iwana-secondary-700">
        Deja vacío el costo unitario en las líneas que el proveedor no cotiza.
      </p>
    </div>
  );
}
