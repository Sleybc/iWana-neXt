'use client';

import { Button, Input } from '@iwana/ui';
import { PurchaseRequestLineSourceKind } from '@iwana/shared';
import type { PurchaseDraftLine } from './purchase-request-draft';
import { getPurchaseRequestLineSourceLabel } from './inventory-labels';
import { PurchaseBulkEditBar } from './PurchaseBulkEditBar';

interface PurchaseDraftLinesTableProps {
  lines: PurchaseDraftLine[];
  selectedLineIds: string[];
  onLabelChange: (lineId: string, value: string) => void;
  onQuantityChange: (lineId: string, value: string) => void;
  onToggleLine: (lineId: string) => void;
  onToggleAll: (checked: boolean) => void;
  onRemove: (lineId: string) => void;
  onRemoveSelected: () => void;
  onApplyBulkQuantity: (quantity: string) => void;
  onApplyBulkSupplier: (partyRefId: string, displayName: string) => void;
}

export function PurchaseDraftLinesTable({
  lines,
  selectedLineIds,
  onLabelChange,
  onQuantityChange,
  onToggleLine,
  onToggleAll,
  onRemove,
  onRemoveSelected,
  onApplyBulkQuantity,
  onApplyBulkSupplier,
}: PurchaseDraftLinesTableProps) {
  const allSelected = lines.length > 0 && selectedLineIds.length === lines.length;

  return (
    <div className="space-y-3">
      <PurchaseBulkEditBar
        selectedCount={selectedLineIds.length}
        onApplyQuantity={onApplyBulkQuantity}
        onApplySupplier={onApplyBulkSupplier}
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
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 accent-iwana-primary"
                  aria-label="Seleccionar todas las lineas"
                  checked={allSelected}
                  onChange={(event) => onToggleAll(event.target.checked)}
                />
              </th>
              <th className="px-4 py-3 text-left">Producto</th>
              <th className="px-4 py-3 text-left">Origen</th>
              <th className="px-4 py-3 text-left">Cantidad</th>
              <th className="px-4 py-3 text-left">Unidad</th>
              <th className="px-4 py-3 text-left">Proveedor sugerido</th>
              <th className="px-4 py-3 text-left">Accion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 accent-iwana-primary"
                    aria-label={`Seleccionar linea ${line.productLabel}`}
                    checked={selectedLineIds.includes(line.id)}
                    onChange={() => onToggleLine(line.id)}
                  />
                </td>
                <td className="px-4 py-3">
                  {line.sourceKind === PurchaseRequestLineSourceKind.FREE_TEXT ? (
                    <Input
                      aria-label="Descripcion manual"
                      value={line.productLabel}
                      onChange={(event) => onLabelChange(line.id, event.target.value)}
                    />
                  ) : (
                    <span className="font-medium text-gray-900 dark:text-white">
                      {line.productLabel}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                  {getPurchaseRequestLineSourceLabel(line.sourceKind)}
                </td>
                <td className="px-4 py-3">
                  <Input
                    aria-label={`Cantidad ${line.productLabel}`}
                    value={line.quantityRequested}
                    onChange={(event) => onQuantityChange(line.id, event.target.value)}
                  />
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{line.unitOfMeasure}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                  {line.suggestedPartyName || 'Sin proveedor sugerido'}
                </td>
                <td className="px-4 py-3">
                  <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(line.id)}>
                    Quitar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
