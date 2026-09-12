'use client';

import { Button, Input } from '@iwana/ui';
import {
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import { formatInventoryQuantity } from './inventory-labels';

export interface CounterPurchaseLineDraft {
  id: string;
  itemId: string;
  sku: string;
  name: string;
  quantityReceived: string;
  unitCost: string;
  serialNumbers: string;
  requiresSerials: boolean;
}

interface CounterPurchaseLinesTableProps {
  lines: CounterPurchaseLineDraft[];
  onQuantityChange: (lineId: string, value: string) => void;
  onUnitCostChange: (lineId: string, value: string) => void;
  onSerialNumbersChange: (lineId: string, value: string) => void;
  onRemove: (lineId: string) => void;
}

export function CounterPurchaseLinesTable({
  lines,
  onQuantityChange,
  onUnitCostChange,
  onSerialNumbersChange,
  onRemove,
}: CounterPurchaseLinesTableProps) {
  return (
    <div className={portalDataTableShellClassName}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
          <thead className="bg-gray-50 dark:bg-dark-surface-3">
            <tr>
              <th className={portalDataTableHeadClassName}>Producto</th>
              <th className={portalDataTableHeadClassName}>Cantidad</th>
              <th className={portalDataTableHeadClassName}>Costo unitario (sin impuestos)</th>
              <th className={portalDataTableHeadClassName}>Seriales</th>
              <th className={`${portalDataTableHeadClassName} w-24`}>
                <span className="sr-only">Acción</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
            {lines.map((line) => (
              <tr key={line.id} className={portalTableRowHoverClassName}>
                <td className={portalDataTableCellClassName}>
                  <p className="font-medium text-gray-900 dark:text-white">{line.name}</p>
                  <p className="mt-0.5 font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {line.sku}
                  </p>
                </td>
                <td className={portalDataTableCellClassName}>
                  <Input
                    id={`counter-line-qty-${line.id}`}
                    aria-label={`Cantidad de ${line.name}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantityReceived}
                    onChange={(event) => onQuantityChange(line.id, event.target.value)}
                    containerClassName="min-w-[7rem]"
                  />
                </td>
                <td className={portalDataTableCellClassName}>
                  <Input
                    aria-label={`Costo unitario (sin impuestos) de ${line.name}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitCost}
                    onChange={(event) => onUnitCostChange(line.id, event.target.value)}
                    containerClassName="min-w-[8rem]"
                  />
                </td>
                <td className={portalDataTableCellClassName}>
                  {line.requiresSerials ? (
                    <Input
                      id={`counter-line-serials-${line.id}`}
                      aria-label={`Seriales de ${line.name}`}
                      value={line.serialNumbers}
                      onChange={(event) => onSerialNumbersChange(line.id, event.target.value)}
                      placeholder="Separados por coma"
                      helperText={`Indica ${formatInventoryQuantity(line.quantityReceived)} serial${Number(line.quantityReceived) === 1 ? '' : 'es'}.`}
                      containerClassName="min-w-[12rem]"
                    />
                  ) : (
                    <span className="text-xs text-gray-400">No aplica</span>
                  )}
                </td>
                <td className={`${portalDataTableCellClassName} text-right`}>
                  <Button
                    type="button"
                    variant="secondary"
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
  );
}
