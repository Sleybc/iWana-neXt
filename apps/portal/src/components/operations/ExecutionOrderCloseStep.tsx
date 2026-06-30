'use client';

import { useMemo, useState } from 'react';
import { Button, Select } from '@iwana/ui';
import { ExecutionOrderResult } from '@iwana/shared';

interface ExecutionOrderCloseStepProps {
  disabled?: boolean;
  onSubmit: (payload: {
    result: ExecutionOrderResult;
    closeNotes?: string | null;
  }) => Promise<void>;
}

export function ExecutionOrderCloseStep({
  disabled = false,
  onSubmit,
}: ExecutionOrderCloseStepProps) {
  const [result, setResult] = useState<ExecutionOrderResult>(ExecutionOrderResult.EXECUTED);
  const [closeNotes, setCloseNotes] = useState('');

  const resultOptions = useMemo(
    () => [
      { value: ExecutionOrderResult.EXECUTED, label: 'Ejecutado' },
      {
        value: ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS,
        label: 'Ejecutado con observaciones',
      },
      { value: ExecutionOrderResult.NOT_EXECUTED, label: 'No ejecutado' },
      { value: ExecutionOrderResult.REQUIRES_FOLLOW_UP, label: 'Requiere seguimiento' },
      { value: ExecutionOrderResult.CANCELLED, label: 'Cancelado' },
    ],
    [],
  );

  return (
    <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Cierre técnico</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Define el resultado final y deja la observación de cierre.
        </p>
      </div>
      <Select
        id="execution-order-result"
        label="Resultado"
        value={result}
        options={resultOptions}
        disabled={disabled}
        onChange={(event) => setResult(event.target.value as ExecutionOrderResult)}
      />
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
        Nota de cierre
        <textarea
          className="mt-1 min-h-24 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-iwana-primary focus:ring-2 focus:ring-iwana-primary/20 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white"
          value={closeNotes}
          disabled={disabled}
          onChange={(event) => setCloseNotes(event.target.value)}
        />
      </label>
      <Button
        type="button"
        disabled={disabled}
        onClick={async () => {
          await onSubmit({
            result,
            closeNotes: closeNotes.trim() || null,
          });
        }}
      >
        Cerrar OT
      </Button>
    </section>
  );
}
