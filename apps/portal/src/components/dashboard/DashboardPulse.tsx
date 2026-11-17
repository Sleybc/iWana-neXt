// apps/portal/src/components/dashboard/DashboardPulse.tsx
'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, Button, cn } from '@iwana/ui';
import { PortalSkeletonBlock, interactiveFocusClassName } from '@/components/shared/portal-ui';
import { formatDashboardNumber } from './dashboard-visuals';

export type DashboardPulseTone = 'progress' | 'neutral' | 'warning' | 'danger';

export interface DashboardPulseCell {
  id: string;
  label: string;
  /** `null` = la fuente no entregó el dato: se dice, no se pinta cero. */
  value: number | null;
  /** Cómo se pinta la cifra (importes con moneda); por defecto, número entero. */
  formatValue?: ((value: number) => string) | undefined;
  /** Señal de la misma fuente; lima solo en `progress`. */
  delta?: { label: string; tone: DashboardPulseTone } | undefined;
  /** Frase que interpreta la cifra con datos de la misma fuente. */
  hint?: string | undefined;
  /** Mini visual con datos reales; sin dato no se monta. */
  visual?: ReactNode;
  state: 'idle' | 'loading' | 'error';
  /** Aviso accesible mientras la fuente se refresca. */
  updating?: boolean;
  href?: string | null | undefined;
  onClick?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
}

const deltaBadgeVariant = {
  progress: 'lime',
  neutral: 'neutral',
  warning: 'warning',
  danger: 'error',
} as const;

const PULSE_COLUMNS: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
};

const cellClassName =
  'flex min-h-36 flex-col gap-1.5 bg-white px-5 py-4 text-left dark:bg-dark-surface-2';
const interactiveCellClassName = cn(
  'transition-colors hover:bg-iwana-surface-soft focus-visible:ring-inset dark:hover:bg-dark-surface-3',
  interactiveFocusClassName,
);

/**
 * B1 · Pulso del negocio: una sola superficie con hasta cinco celdas.
 * Anatomía de celda: rótulo → cifra rol title → señal → frase → mini visual.
 * Patrón de pantalla; candidato a primitive de `portal-ui` (regla de promoción).
 */
export function DashboardPulse({
  cells,
  loading,
}: {
  cells: readonly DashboardPulseCell[];
  loading: boolean;
}) {
  if (cells.length === 0) return null;

  return (
    <section
      aria-label="Indicadores núcleo"
      aria-busy={loading || undefined}
      className={cn(
        // `gap-px` sobre fondo gris dibuja los divisores en cualquier retícula.
        'grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 shadow-iwana-soft dark:border-dark-border dark:bg-dark-border sm:grid-cols-2',
        PULSE_COLUMNS[Math.min(cells.length, 5)],
      )}
    >
      {cells.map((cell) => {
        if (loading || cell.state === 'loading') {
          return (
            <div key={cell.id} className={cellClassName}>
              <PortalSkeletonBlock className="h-3 w-28 rounded-md" />
              <PortalSkeletonBlock className="h-9 w-20 rounded-lg" />
              <PortalSkeletonBlock className="h-4 w-32 rounded-md" />
            </div>
          );
        }

        const isError = cell.state === 'error';
        const body = (
          <>
            {/* Dos líneas reservadas: un rótulo largo no desalinea las cifras de la franja. */}
            <span className="portal-eyebrow-muted flex min-h-8 items-start">{cell.label}</span>
            {isError ? (
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                No disponible
              </span>
            ) : cell.value === null ? (
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Sin dato disponible
              </span>
            ) : (
              <span className="font-thin-exo text-4xl leading-none tabular-nums text-iwana-primary dark:text-white">
                {(cell.formatValue ?? formatDashboardNumber)(cell.value)}
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
                Actualizando
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
                    Reintentar
                  </Button>
                </span>
              ) : null}
            </article>
          );
        }

        if (cell.href) {
          return (
            <Link
              key={cell.id}
              href={cell.href}
              aria-label={cell.label}
              className={cn(cellClassName, interactiveCellClassName)}
            >
              {body}
            </Link>
          );
        }

        if (cell.onClick) {
          return (
            <button
              key={cell.id}
              type="button"
              aria-label={cell.label}
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
