import * as React from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/utils';
import { interactiveFocusClassName } from '../focus';
import { SkeletonBlock } from '../skeleton';
import { toneMutedTextVariants, toneSurfaceVariants, type Tone } from './Tone';

/**
 * Tarjeta de métrica (U-1, contrato DS 2026-11-21 §3).
 * Superficie tonal › eyebrow › cifra (+ «/ total») › título › descripción.
 * La franja (rejilla, eyebrow de sección, carga y error) es composición de cada app.
 */
const metricCardBaseVariants = cva(
  'flex h-full w-full flex-col rounded-2xl border px-4 py-4 text-left shadow-iwana-soft',
  {
    variants: {
      size: {
        default: 'min-h-37',
        compact: 'min-h-22',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

export interface MetricCardVariantOptions {
  tone?: Tone | undefined;
  size?: 'default' | 'compact' | undefined;
}

/** Clases de la carcasa, para franjas que componen su propio control (como `badgeVariants`). */
export function metricCardVariants({
  tone = 'neutral',
  size = 'default',
}: MetricCardVariantOptions = {}) {
  return cn(metricCardBaseVariants({ size }), toneSurfaceVariants({ tone }));
}

export interface MetricCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  tone?: Tone | undefined;
  label: React.ReactNode;
  value: React.ReactNode;
  total?: React.ReactNode | undefined;
  eyebrow?: React.ReactNode | undefined;
  description?: React.ReactNode | undefined;
  state?: 'idle' | 'loading' | undefined;
  isActive?: boolean | undefined;
  emphasized?: boolean | undefined;
  interactive?: boolean | undefined;
  onActivate?: (() => void) | undefined;
  asChild?: boolean | undefined;
  size?: 'default' | 'compact' | undefined;
}

export function MetricCard({
  tone = 'neutral',
  label,
  value,
  total,
  eyebrow,
  description,
  state = 'idle',
  isActive,
  emphasized = false,
  interactive = true,
  onActivate,
  asChild = false,
  size = 'default',
  className,
  children,
  ...rest
}: MetricCardProps) {
  if (state === 'loading') {
    return (
      <SkeletonBlock
        className={cn(metricCardBaseVariants({ size }), 'border-0 shadow-none', className)}
      />
    );
  }

  const muted = toneMutedTextVariants({ tone });
  const body = (
    <>
      {eyebrow ? <span className={cn('portal-eyebrow-muted block', muted)}>{eyebrow}</span> : null}
      <span
        className={cn(
          'block font-mono text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white',
          eyebrow ? 'mt-2' : null,
        )}
      >
        {value}
        {total !== undefined && total !== null ? (
          <span className={cn('ml-1 text-sm font-normal', muted)}>/ {total}</span>
        ) : null}
      </span>
      <span className="mt-1 block text-sm font-medium text-gray-900 dark:text-white">{label}</span>
      {description ? (
        <span className={cn('mt-1 block text-sm leading-6', muted)}>{description}</span>
      ) : null}
    </>
  );

  const isInteractive = interactive && (Boolean(onActivate) || asChild);
  const shellClassName = cn(
    metricCardVariants({ tone, size }),
    isActive && 'ring-2 ring-iwana-primary/40',
    emphasized && !isActive && 'ring-2 ring-iwana-primary/25',
    isInteractive && 'transition-shadow hover:shadow-iwana-active',
    isInteractive && interactiveFocusClassName,
    className,
  );

  if (isInteractive && asChild) {
    return (
      <Slot className={shellClassName} {...rest}>
        <Slottable>{children}</Slottable>
        {body}
      </Slot>
    );
  }

  if (isInteractive && onActivate) {
    return (
      <button
        {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        type="button"
        aria-pressed={isActive}
        onClick={onActivate}
        className={shellClassName}
      >
        {body}
      </button>
    );
  }

  return (
    <article className={shellClassName} {...rest}>
      {body}
    </article>
  );
}
