'use client';

import { cn } from '@iwana/ui';
import { portalFieldClassName } from '@/components/shared/portal-ui';

interface TimeFieldSelectProps {
  id?: string;
  value: string;
  disabled: boolean;
  onChange: (nextValue: string) => void;
  compact?: boolean;
  ariaLabel?: string;
  dataTestId?: string;
}

/**
 * Selector de hora del portal — input nativo `<input type="time">` estilizado.
 * Reemplaza el popover de 84 botones (contrato de remediación): misma API de
 * salida ('HH:mm' o ''), sin estado interno ni dependencias de Radix.
 */
export function TimeFieldSelect({
  id,
  value,
  disabled,
  onChange,
  compact = false,
  ariaLabel,
  dataTestId,
}: TimeFieldSelectProps) {
  return (
    <input
      id={id}
      type="time"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={dataTestId}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        portalFieldClassName,
        'tabular-nums [color-scheme:light] dark:[color-scheme:dark]',
        compact ? 'h-10 w-[98px] px-2.5' : 'h-11 w-full px-3.5',
      )}
    />
  );
}
