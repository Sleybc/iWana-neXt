'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Select } from '@iwana/ui';
import { ExecutionOrderItemAction, InventoryDisposition } from '@iwana/shared';

interface ExecutionOrderInventoryStepProps {
  disabled?: boolean;
  onSubmit: (payload: {
    itemId: string;
    technicianCustodyId: string;
    quantity: number;
    serialNumber?: string | null;
    action: ExecutionOrderItemAction;
    finalDisposition: InventoryDisposition;
  }) => Promise<void>;
}

export function ExecutionOrderInventoryStep({
  disabled = false,
  onSubmit,
}: ExecutionOrderInventoryStepProps) {
  const [itemId, setItemId] = useState('');
  const [technicianCustodyId, setTechnicianCustodyId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [serialNumber, setSerialNumber] = useState('');
  const [action, setAction] = useState<ExecutionOrderItemAction>(ExecutionOrderItemAction.INSTALL);
  const [disposition, setDisposition] = useState<InventoryDisposition>(
    InventoryDisposition.INSTALLED_AT_CUSTOMER,
  );

  const actionOptions = useMemo(
    () => [
      { value: ExecutionOrderItemAction.INSTALL, label: 'Instalar' },
      { value: ExecutionOrderItemAction.CONSUME, label: 'Consumir' },
      { value: ExecutionOrderItemAction.RETURN, label: 'Devolver' },
      { value: ExecutionOrderItemAction.REMOVE, label: 'Retirar' },
    ],
    [],
  );

  const dispositionOptions = useMemo(
    () => [
      { value: InventoryDisposition.INSTALLED_AT_CUSTOMER, label: 'Instalado en cliente' },
      { value: InventoryDisposition.INTERNAL_CONSUMPTION, label: 'Consumo interno' },
      {
        value: InventoryDisposition.RETURNED_TO_TECHNICIAN_STOCK,
        label: 'Retorno a custodia técnica',
      },
      { value: InventoryDisposition.RETURNED_TO_WAREHOUSE, label: 'Retorno a bodega' },
      { value: InventoryDisposition.DAMAGED_OR_LOST, label: 'Dañado o perdido' },
    ],
    [],
  );

  return (
    <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Equipos y materiales</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          El consumo se registra desde la custodia del técnico o cuadrilla.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          id="execution-order-item-id"
          label="Ítem"
          value={itemId}
          disabled={disabled}
          onChange={(event) => setItemId(event.target.value)}
        />
        <Input
          id="execution-order-custody-id"
          label="Custodia técnica"
          value={technicianCustodyId}
          disabled={disabled}
          onChange={(event) => setTechnicianCustodyId(event.target.value)}
        />
        <Input
          id="execution-order-quantity"
          label="Cantidad"
          type="number"
          value={quantity}
          disabled={disabled}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <Input
          id="execution-order-serial"
          label="Serial"
          value={serialNumber}
          disabled={disabled}
          onChange={(event) => setSerialNumber(event.target.value)}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Select
          id="execution-order-action"
          label="Acción"
          value={action}
          options={actionOptions}
          disabled={disabled}
          onChange={(event) => setAction(event.target.value as ExecutionOrderItemAction)}
        />
        <Select
          id="execution-order-disposition"
          label="Destino final"
          value={disposition}
          options={dispositionOptions}
          disabled={disabled}
          onChange={(event) => setDisposition(event.target.value as InventoryDisposition)}
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || itemId.trim().length === 0 || technicianCustodyId.trim().length === 0}
        onClick={async () => {
          await onSubmit({
            itemId: itemId.trim(),
            technicianCustodyId: technicianCustodyId.trim(),
            quantity: Number(quantity || '1') || 1,
            serialNumber: serialNumber.trim() || null,
            action,
            finalDisposition: disposition,
          });
          setItemId('');
          setTechnicianCustodyId('');
          setQuantity('1');
          setSerialNumber('');
        }}
      >
        Registrar material
      </Button>
    </section>
  );
}
