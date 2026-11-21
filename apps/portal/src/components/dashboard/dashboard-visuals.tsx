// apps/portal/src/components/dashboard/dashboard-visuals.tsx
import { cn, toneFillVariants, type StackedBarSegment } from '@iwana/ui';

/**
 * Visuales de proporción del inicio, sin librería de gráficas: barras en CSS.
 * Las series temporales llegan con el sistema de gráficas (Firma §4/Fase 3 ítem 3.1).
 */

export const formatDashboardNumber = (value: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);

const compactMoneyFormat = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Importe abreviado para cifras de pulso y ejes («$148,2 M»). El valor completo va en la tabla. */
export const formatDashboardMoneyCompact = (value: number) => compactMoneyFormat.format(value);

/** Tramo de una proporción del inicio: el de `StackedBar` (contrato DS v1.1 §5.5), sin clase libre. */
export type DashboardSegment = StackedBarSegment;

export function DashboardStackLegend({
  segments,
  formatValue = formatDashboardNumber,
}: {
  segments: readonly DashboardSegment[];
  formatValue?: (value: number) => string;
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  if (visible.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {visible.map((segment) => (
        <div key={segment.key} className="flex items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-sm',
              toneFillVariants({ tone: segment.tone, emphasis: segment.emphasis }),
            )}
            aria-hidden={true}
          />
          <dt className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-400">
            {segment.label}
          </dt>
          <dd className="font-mono tabular-nums text-gray-900 dark:text-white">
            {formatValue(segment.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export interface DashboardBarRow {
  key: string;
  label: string;
  value: number;
  /** Tono del relleno; por defecto azul noche. */
  tone?: 'default' | 'warning' | 'danger';
}

const barToneClassName = {
  default: 'bg-iwana-primary dark:bg-iwana-primary-300',
  warning: 'bg-amber-500',
  danger: 'bg-error-600',
} as const;

/** Barras horizontales comparables; el ancho es relativo al mayor de la lista. */
export function DashboardBars({ rows }: { rows: readonly DashboardBarRow[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <dl className="space-y-1.5 text-xs">
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[minmax(0,8rem)_1fr_2.5rem] items-center gap-3"
        >
          <dt className="truncate text-gray-600 dark:text-gray-400">{row.label}</dt>
          <span
            className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-surface-4"
            aria-hidden={true}
          >
            <span
              className={cn('block h-full rounded-full', barToneClassName[row.tone ?? 'default'])}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </span>
          <dd className="text-right font-mono tabular-nums text-gray-900 dark:text-white">
            {formatDashboardNumber(row.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
