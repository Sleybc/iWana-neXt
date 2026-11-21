import * as React from 'react';
import { cn } from '../lib/utils';
import { toneFillVariants, type FillEmphasis, type Tone } from './Tone';

/** Barra apilada por tonos (U-3, contrato DS 2026-11-21 §5.4). Sin leyenda en v1.0. */
export interface StackedBarSegment {
  key: string;
  label: string;
  value: number;
  tone: Tone;
  /** Intensidad para escalas ordinales (contrato DS v1.1 §5.5). */
  emphasis?: FillEmphasis | undefined;
}

export interface StackedBarProps {
  segments: readonly StackedBarSegment[];
  ariaLabel: string;
  formatValue?: ((value: number) => string) | undefined;
  size?: 'sm' | 'md' | undefined;
  className?: string | undefined;
}

export function StackedBar({
  segments,
  ariaLabel,
  formatValue,
  size = 'md',
  className,
}: StackedBarProps) {
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return null;

  const format = formatValue ?? ((value: number) => String(value));
  const name = `${ariaLabel}: ${visible.map((s) => `${s.label} ${format(s.value)}`).join(', ')}`;

  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        'flex w-full gap-0.5 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-surface-3',
        size === 'sm' ? 'h-2' : 'h-2.5',
        className,
      )}
    >
      {visible.map((segment) => (
        <span
          key={segment.key}
          data-tone={segment.tone}
          className={cn(
            'h-full',
            toneFillVariants({ tone: segment.tone, emphasis: segment.emphasis }),
          )}
          style={{ width: `${(segment.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}
