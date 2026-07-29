'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Select } from '@iwana/ui';
import { ExecutionOrderResult } from '@iwana/shared';

interface ExecutionOrderCloseStepProps {
  /** Solo es opcional cuando la plantilla/flujo declara que no aplica. */
  requiresCustomerAcceptance?: boolean;
  disabled?: boolean;
  onSubmit: (payload: {
    result: ExecutionOrderResult;
    summary: string;
    customerAcceptance?: {
      artifactId: string;
      method: 'SIGNATURE' | 'OTP' | 'OTHER';
    };
  }) => Promise<void>;
}

export function ExecutionOrderCloseStep({
  requiresCustomerAcceptance = true,
  disabled = false,
  onSubmit,
}: ExecutionOrderCloseStepProps) {
  const [result, setResult] = useState<ExecutionOrderResult>(ExecutionOrderResult.EXECUTED);
  const [summary, setSummary] = useState('');
  const [customerAcceptanceArtifactId, setCustomerAcceptanceArtifactId] = useState('');
  const [customerAcceptanceMethod, setCustomerAcceptanceMethod] = useState<
    'SIGNATURE' | 'OTP' | 'OTHER' | ''
  >('');

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
      <Input
        id="execution-order-summary"
        label="Resumen de cierre"
        value={summary}
        disabled={disabled}
        onChange={(event) => setSummary(event.target.value)}
        requiredIndicator
      />
      {requiresCustomerAcceptance ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Aceptación del cliente
          </p>
          <Input
            id="execution-order-acceptance-artifact"
            label="Referencia de evidencia"
            value={customerAcceptanceArtifactId}
            disabled={disabled}
            onChange={(event) => setCustomerAcceptanceArtifactId(event.target.value)}
            requiredIndicator
          />
          <Select
            id="execution-order-acceptance-method"
            label="Forma de aceptación"
            value={customerAcceptanceMethod}
            options={[
              { value: 'SIGNATURE', label: 'Firma' },
              { value: 'OTP', label: 'Código de verificación' },
              { value: 'OTHER', label: 'Otra forma' },
            ]}
            placeholder="Selecciona una forma"
            disabled={disabled}
            onChange={(event) =>
              setCustomerAcceptanceMethod(event.target.value as 'SIGNATURE' | 'OTP' | 'OTHER')
            }
            required
          />
        </div>
      ) : null}
      <Button
        type="button"
        disabled={
          disabled ||
          summary.trim().length === 0 ||
          (requiresCustomerAcceptance &&
            (customerAcceptanceArtifactId.trim().length === 0 || !customerAcceptanceMethod))
        }
        onClick={async () => {
          const payload = {
            result,
            summary: summary.trim(),
            ...(requiresCustomerAcceptance
              ? {
                  customerAcceptance: {
                    artifactId: customerAcceptanceArtifactId.trim(),
                    method: customerAcceptanceMethod as 'SIGNATURE' | 'OTP' | 'OTHER',
                  },
                }
              : {}),
          };
          await onSubmit(payload);
        }}
      >
        Cerrar OT
      </Button>
    </section>
  );
}
