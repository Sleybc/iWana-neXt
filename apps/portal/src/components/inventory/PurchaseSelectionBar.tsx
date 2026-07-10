'use client';

import { Button } from '@iwana/ui';
import { PortalActionToolbar } from '@/components/shared/portal-ui';

interface PurchaseSelectionBarProps {
  count: number;
  disabled?: boolean;
  onClear: () => void;
  onAdd: () => void;
}

function resolveAddLabel(count: number): string {
  if (count === 0) {
    return 'Agregar al borrador';
  }

  return `Agregar ${count} producto${count === 1 ? '' : 's'}`;
}

export function PurchaseSelectionBar({
  count,
  disabled = false,
  onClear,
  onAdd,
}: PurchaseSelectionBarProps) {
  return (
    <PortalActionToolbar className="mt-3">
      <span className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        {count} productos seleccionados
      </span>
      <Button type="button" variant="secondary" size="sm" onClick={onClear} disabled={count === 0}>
        Limpiar selección
      </Button>
      <Button type="button" size="sm" onClick={onAdd} disabled={disabled || count === 0}>
        {resolveAddLabel(count)}
      </Button>
    </PortalActionToolbar>
  );
}
