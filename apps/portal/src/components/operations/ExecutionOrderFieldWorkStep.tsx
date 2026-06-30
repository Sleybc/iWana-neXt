'use client';

import { useState } from 'react';
import { Button, Input } from '@iwana/ui';

interface ExecutionOrderFieldWorkStepProps {
  disabled?: boolean;
  onSubmit: (payload: { activityType: string; description: string }) => Promise<void>;
}

export function ExecutionOrderFieldWorkStep({
  disabled = false,
  onSubmit,
}: ExecutionOrderFieldWorkStepProps) {
  const [activityType, setActivityType] = useState('FIELD_NOTE');
  const [description, setDescription] = useState('');

  return (
    <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Trabajo realizado</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Registra la actividad concreta ejecutada en campo.
        </p>
      </div>
      <Input
        id="execution-order-activity-type"
        label="Tipo de actividad"
        value={activityType}
        disabled={disabled}
        onChange={(event) => setActivityType(event.target.value)}
      />
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
        Descripción
        <textarea
          className="mt-1 min-h-24 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-iwana-primary focus:ring-2 focus:ring-iwana-primary/20 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white"
          value={description}
          disabled={disabled}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || description.trim().length === 0}
        onClick={async () => {
          await onSubmit({
            activityType: activityType.trim() || 'FIELD_NOTE',
            description: description.trim(),
          });
          setDescription('');
        }}
      >
        Registrar trabajo
      </Button>
    </section>
  );
}
