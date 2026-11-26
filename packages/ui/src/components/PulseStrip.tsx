'use client';

import * as React from 'react';
import { cn } from '../lib/utils';
import { interactiveFocusClassName } from '../focus';
import { SkeletonBlock } from '../skeleton';
import { Badge } from './Badge';
import { Button } from './Button';
import type { Tone } from './Tone';

/** `progress` (lima) es exclusivo de la señal del pulso; nunca entra en `Tone` (contrato DS §7bis.2, R7). */
export type PulseDeltaTone = Tone | 'progress';

export interface PulseCellData {
  id: string;
  label: string;
  /** `null` = la fuente no entregó el dato: se dice, nunca se pinta cero. */
  value: number | null;
  /** Por defecto, entero con `Intl` es-CO. */
  formatValue?: ((value: number) => string) | undefined;
  delta?: { label: string; tone: PulseDeltaTone } | undefined;
  hint?: string | undefined;
  /** Solo con dato real (p. ej. `StackedBar`). */
  visual?: React.ReactNode;
  state: 'idle' | 'loading' | 'error';
  updating?: boolean | undefined;
  href?: string | null | undefined;
  onClick?: (() => void) | undefined;
  /** Nombre de la acción con el rótulo visible de la celda. */
  actionLabel?: string | undefined;
  onRetry?: (() => void) | undefined;
}

export interface PulseStripProps {
  cells: readonly PulseCellData[];
  /** Toda la franja en esqueleto. */
  loading?: boolean | undefined;
  ariaLabel: string;
  labels: { unavailable: string; noData: string; retry: string; updating: string };
  /** El consumidor pasa `next/link`; por defecto `a`. */
  linkComponent?: React.ElementType | undefined;
  className?: string | undefined;
}

const deltaBadgeVariant = {
  progress: 'lime',
  neutral: 'neutral',
  primary: 'primary',
  success: 'success',
  warning: 'warning',
  error: 'error',
} as const satisfies Record<PulseDeltaTone, string>;

// Clases literales por mapa: Tailwind no ve clases interpoladas.
const pulseColumns: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
};

const integerFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const formatInteger = (value: number) => integerFormatter.format(value);

const cellClassName =
  'flex min-h-36 flex-col gap-1.5 bg-white px-5 py-4 text-left dark:bg-dark-surface-2';
const interactiveCellClassName = cn(
  'transition-colors hover:bg-iwana-surface-soft focus-visible:ring-inset dark:hover:bg-dark-surface-3',
  interactiveFocusClassName,
);
const missingValueClassName = 'text-sm font-semibold text-gray-700 dark:text-gray-200';

/**
 * Pulso: una sola superficie dividida en hasta cinco celdas (contrato DS v1.3 §7bis.2).
 * Precedencia: `loading` de franja > `state` de celda > `value === null` > cifra.
 */
export function PulseStrip({
  cells,
  loading,
  ariaLabel,
  labels,
  linkComponent: LinkComponent = 'a',
  className,
}: PulseStripProps) {
  if (cells.length === 0) return null;

  return (
    <section
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={cn(
        // `gap-px` sobre fondo gris dibuja los divisores en cualquier retícula.
        'grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 shadow-iwana-soft dark:border-dark-border dark:bg-dark-border sm:grid-cols-2',
        pulseColumns[Math.min(cells.length, 5)],
        className,
      )}
    >
      {cells.map((cell) => {
        if (loading || cell.state === 'loading') {
          return (
            <article
              key={cell.id}
              aria-label={cell.label}
              // F1-D5 (§7ter.1): ocupada la celda que carga, no la franja; con la franja
              // en carga ya lo dice la sección. `updating` no: silenciaría su aria-live.
              aria-busy={!loading || undefined}
              className={cellClassName}
            >
              <SkeletonBlock className="h-3 w-28 rounded-md" />
              <SkeletonBlock className="h-9 w-20 rounded-lg" />
              <SkeletonBlock className="h-4 w-32 rounded-md" />
            </article>
          );
        }

        const isError = cell.state === 'error';
        const body = (
          <>
            {/* Dos líneas reservadas: un rótulo largo no desalinea las cifras. */}
            <span className="portal-eyebrow-muted flex min-h-8 items-start">{cell.label}</span>
            {isError ? (
              <span className={missingValueClassName}>{labels.unavailable}</span>
            ) : cell.value === null ? (
              <span className={missingValueClassName}>{labels.noData}</span>
            ) : (
              <span className="text-4xl leading-none font-bold tabular-nums text-iwana-primary dark:text-white">
                {(cell.formatValue ?? formatInteger)(cell.value)}
              </span>
            )}
            {!isError && cell.delta ? (
              <span>
                <Badge variant={deltaBadgeVariant[cell.delta.tone]}>{cell.delta.label}</Badge>
              </span>
            ) : null}
            {!isError && cell.hint ? (
              <span className="text-xs text-gray-600 dark:text-gray-400">{cell.hint}</span>
            ) : null}
            {cell.updating ? (
              <span className="sr-only" aria-live="polite">
                {labels.updating}
              </span>
            ) : null}
            {!isError && cell.visual ? (
              <span className="mt-auto block pt-1">{cell.visual}</span>
            ) : null}
          </>
        );

        if (isError) {
          return (
            <article key={cell.id} className={cellClassName}>
              {body}
              {cell.onRetry ? (
                <span>
                  <Button type="button" variant="ghost" size="sm" onClick={cell.onRetry}>
                    {labels.retry}
                  </Button>
                </span>
              ) : null}
            </article>
          );
        }

        if (cell.href) {
          return (
            <LinkComponent
              key={cell.id}
              href={cell.href}
              aria-label={cell.actionLabel ?? cell.label}
              className={cn(cellClassName, interactiveCellClassName)}
            >
              {body}
            </LinkComponent>
          );
        }

        if (cell.onClick) {
          return (
            <button
              key={cell.id}
              type="button"
              aria-label={cell.actionLabel ?? cell.label}
              onClick={cell.onClick}
              className={cn(cellClassName, interactiveCellClassName)}
            >
              {body}
            </button>
          );
        }

        return (
          <article key={cell.id} className={cellClassName}>
            {body}
          </article>
        );
      })}
    </section>
  );
}
