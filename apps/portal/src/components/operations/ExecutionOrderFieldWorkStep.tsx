'use client';

import { useState } from 'react';
import { Button, Input, Select } from '@iwana/ui';

interface ExecutionOrderFieldWorkStepProps {
  disabled?: boolean;
  onSubmit: (payload: { activityType: string; description: string }) => Promise<void>;
}

export function ExecutionOrderFieldWorkStep({
  disabled = false,
  onSubmit,
}: ExecutionOrderFieldWorkStepProps) {
  const [activityType, setActivityType] = useState('');
  const [description, setDescription] = useState('');

  return (
    <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Trabajo realizado</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Registra la actividad concreta ejecutada en campo.
        </p>
      </div>
      <Select
        id="execution-order-activity-type"
        label="Tipo de actividad"
        value={activityType}
        placeholder="Selecciona un tipo de actividad"
        options={[
          { value: 'INSTALLATION', label: 'Instalación' },
          { value: 'FIELD_NOTE', label: 'Nota de campo' },
          { value: 'CONFIGURATION', label: 'Configuración' },
          { value: 'TESTING', label: 'Prueba' },
          { value: 'NOVELTY', label: 'Novedad' },
        ]}
        disabled={disabled}
        onChange={(event) => setActivityType(event.target.value)}
      />
      <Input
        id="execution-order-activity-description"
        label="Descripción"
        value={description}
        disabled={disabled}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || !activityType || description.trim().length === 0}
        onClick={async () => {
          await onSubmit({
            activityType,
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
