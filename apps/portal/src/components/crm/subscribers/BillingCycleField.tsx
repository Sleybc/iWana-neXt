'use client';

import { Select } from '@iwana/ui';
import type { BillingCycleOption } from '@/lib/api-client';
import { formatBillingDate } from './billing-cycle-ui';
import { PortalAlert } from '@/components/shared/portal-ui';

interface BillingCycleFieldProps {
  cycles: BillingCycleOption[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  catalogError?: boolean;
  onRetry?: (() => void) | undefined;
  disabled?: boolean | undefined;
  allowUnassigned?: boolean | undefined;
  error?: string | undefined;
  helperText?: string | undefined;
  showNextCutoff?: boolean | undefined;
  placeholder?: string | undefined;
  id?: string | undefined;
}

export function BillingCycleField({
  cycles,
  value,
  onChange,
  loading = false,
  catalogError = false,
  onRetry,
  disabled = false,
  allowUnassigned = true,
  error,
  helperText,
  showNextCutoff = false,
  placeholder,
  id = 'billing-cycle-day',
}: BillingCycleFieldProps) {
  const selected = cycles.find((cycle) => String(cycle.cycleDay) === value);

  return (
    <div className="space-y-2">
      <Select
        id={id}
        label="Ciclo de facturación"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || loading || catalogError || cycles.length === 0}
        {...(error !== undefined ? { error } : {})}
        {...(helperText !== undefined ? { helperText } : {})}
        placeholder={placeholder ?? (loading ? 'Cargando ciclos…' : 'Sin asignar')}
        className="min-h-11"
      >
        {allowUnassigned ? <option value="">Sin asignar</option> : null}
        {cycles.map((cycle) => (
          <option key={cycle.cycleDay} value={String(cycle.cycleDay)}>
            Día {cycle.cycleDay}
          </option>
        ))}
      </Select>

      {loading ? (
        <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
          Cargando ciclos de facturación…
        </p>
      ) : null}

      {catalogError ? (
        <PortalAlert
          variant="error"
          title="No pudimos cargar los ciclos de facturación"
          action={
            onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="min-h-11 rounded-lg px-3 text-sm font-semibold text-iwana-secondary-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:text-iwana-secondary-300"
              >
                Reintentar
              </button>
            ) : undefined
          }
        />
      ) : null}

      {!loading && !catalogError && cycles.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
          No hay ciclos de facturación disponibles.
        </p>
      ) : null}

      {showNextCutoff && selected ? (
        <p className="text-sm text-gray-700 dark:text-gray-200" aria-live="polite">
          Próximo corte: {formatBillingDate(selected.nextCutoffDate)}
        </p>
      ) : null}
    </div>
  );
}
