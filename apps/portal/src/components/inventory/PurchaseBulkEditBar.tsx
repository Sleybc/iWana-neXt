'use client';

import { useState } from 'react';
import { Button, Input } from '@iwana/ui';
import { PortalActionToolbar } from '@/components/shared/portal-ui';
import { SupplierPicker } from './SupplierPicker';

interface PurchaseBulkEditBarProps {
  selectedCount: number;
  onApplyQuantity: (quantity: string) => void;
  onApplySupplier: (partyRefId: string, displayName: string) => void;
}

export function PurchaseBulkEditBar({
  selectedCount,
  onApplyQuantity,
  onApplySupplier,
}: PurchaseBulkEditBarProps) {
  const [bulkQuantity, setBulkQuantity] = useState('1');
  const [bulkSupplierRefId, setBulkSupplierRefId] = useState<string | null>(null);
  const [bulkSupplierName, setBulkSupplierName] = useState<string | null>(null);

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
          id="purchase-bulk-quantity"
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
      <div className="flex min-w-[240px] flex-[2] items-end gap-2">
        <div className="min-w-0 flex-1">
          <SupplierPicker
            label="Proveedor masivo"
            value={bulkSupplierRefId}
            selectedLabel={bulkSupplierName}
            onChange={(partyRefId, displayName) => {
              setBulkSupplierRefId(partyRefId);
              setBulkSupplierName(displayName);
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!bulkSupplierRefId}
          onClick={() => {
            if (!bulkSupplierRefId) {
              return;
            }

            onApplySupplier(bulkSupplierRefId, bulkSupplierName ?? '');
          }}
        >
          Aplicar proveedor
        </Button>
      </div>
    </PortalActionToolbar>
  );
}
