'use client';

import { useState } from 'react';
import { Button, Input } from '@iwana/ui';
import { PortalActionToolbar } from '@/components/shared/portal-ui';

interface StockIssueBulkEditBarProps {
  selectedCount: number;
  onApplyQuantity: (quantity: string) => void;
}

export function StockIssueBulkEditBar({
  selectedCount,
  onApplyQuantity,
}: StockIssueBulkEditBarProps) {
  const [bulkQuantity, setBulkQuantity] = useState('1');

  if (selectedCount === 0) {
    return null;
  }

  return (
    <PortalActionToolbar className="flex-wrap gap-2">
      <span className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        {selectedCount} línea{selectedCount === 1 ? '' : 's'} seleccionada
        {selectedCount === 1 ? '' : 's'}
      </span>
      <div className="flex min-w-[180px] flex-1 items-end gap-2">
        <Input
          id="issue-bulk-quantity"
          label="Cantidad masiva"
          value={bulkQuantity}
          onChange={(event) => setBulkQuantity(event.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onApplyQuantity(bulkQuantity)}
        >
          Aplicar cantidad
        </Button>
      </div>
    </PortalActionToolbar>
  );
}
