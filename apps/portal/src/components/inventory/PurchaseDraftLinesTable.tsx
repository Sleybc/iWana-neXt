'use client';

import { Badge, Button, Input } from '@iwana/ui';
import { PurchaseRequestLineSourceKind } from '@iwana/shared';
import type { PurchaseDraftLine } from './purchase-request-draft';
import { getPurchaseRequestLineSourceLabel } from './inventory-labels';
import { PurchaseBulkEditBar } from './PurchaseBulkEditBar';
import {
  interactiveFocusClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';

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

      <div className={portalDataTableShellClassName}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
            <thead className="bg-gray-50 dark:bg-dark-surface-3">
              <tr>
                <th className={`${portalDataTableHeadClassName} w-10`}>
                  <input
                    type="checkbox"
                    className={`h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
                    aria-label="Seleccionar todas las líneas"
                    checked={allSelected}
                    onChange={(event) => onToggleAll(event.target.checked)}
                  />
                </th>
                <th className={portalDataTableHeadClassName}>Producto</th>
                <th className={portalDataTableHeadClassName}>Cantidad</th>
                <th className={portalDataTableHeadClassName}>Proveedor sugerido</th>
                <th className={`${portalDataTableHeadClassName} w-24`}>
                  <span className="sr-only">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
              {lines.map((line) => (
                <tr key={line.id} className={portalTableRowHoverClassName}>
                  <td className={portalDataTableCellClassName}>
                    <input
                      type="checkbox"
                      className={`h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
                      aria-label={`Seleccionar línea ${line.productLabel}`}
                      checked={selectedLineIds.includes(line.id)}
                      onChange={() => onToggleLine(line.id)}
                    />
                  </td>
                  <td className={portalDataTableCellClassName}>
                    <div className="flex flex-col gap-1.5">
                      {line.sourceKind === PurchaseRequestLineSourceKind.FREE_TEXT ? (
                        <Input
                          aria-label="Descripción manual"
                          value={line.productLabel}
                          onChange={(event) => onLabelChange(line.id, event.target.value)}
                        />
                      ) : (
                        <span className="font-medium text-gray-900 dark:text-white">
                          {line.productLabel}
                        </span>
                      )}
                      <span>
                        <Badge variant="neutral">
                          {getPurchaseRequestLineSourceLabel(line.sourceKind)}
                        </Badge>
                      </span>
                    </div>
                  </td>
                  <td className={portalDataTableCellClassName}>
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Cantidad ${line.productLabel}`}
                        className="w-20 tabular-nums"
                        value={line.quantityRequested}
                        onChange={(event) => onQuantityChange(line.id, event.target.value)}
                      />
                      <span className="text-gray-500 dark:text-gray-400">{line.unitOfMeasure}</span>
                    </div>
                  </td>
                  <td className={portalDataTableCellClassName}>
                    {line.suggestedPartyName ? (
                      <span className="text-gray-700 dark:text-gray-200">
                        {line.suggestedPartyName}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">
                        Sin proveedor sugerido
                      </span>
                    )}
                  </td>
                  <td className={`${portalDataTableCellClassName} text-right`}>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
