// apps/portal/src/components/dashboard/dashboard-visuals.tsx
import { cn } from '@iwana/ui';

/**
 * Visuales de proporción del inicio, sin librería de gráficas: barras en CSS.
 * Las series temporales llegan con el sistema de gráficas (Firma §4/Fase 3 ítem 3.1).
 */

export const formatDashboardNumber = (value: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);

export interface DashboardSegment {
  key: string;
  label: string;
  value: number;
  /** Clase de relleno. Urgencia en escalas de error y advertencia; nunca lima. */
  className: string;
}

/** Barra apilada. La proporción se lee en la barra; la cifra, en el texto que la acompaña. */
export function DashboardStackBar({
  segments,
  ariaLabel,
  className,
}: {
  segments: readonly DashboardSegment[];
  ariaLabel: string;
  className?: string;
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) return null;
  return (
    <div
      className={cn('flex h-2 gap-0.5 overflow-hidden rounded-full', className)}
      role="img"
      aria-label={`${ariaLabel}: ${visible.map((s) => `${s.label} ${s.value}`).join(', ')}`}
    >
      {visible.map((segment) => (
        <span
          key={segment.key}
          className={segment.className}
          style={{ width: `${(segment.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function DashboardStackLegend({ segments }: { segments: readonly DashboardSegment[] }) {
  const visible = segments.filter((segment) => segment.value > 0);
  if (visible.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {visible.map((segment) => (
        <div key={segment.key} className="flex items-center gap-2">
          <span
            className={cn('h-2 w-2 shrink-0 rounded-sm', segment.className)}
            aria-hidden={true}
          />
          <dt className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-400">
            {segment.label}
          </dt>
          <dd className="font-mono tabular-nums text-gray-900 dark:text-white">
            {formatDashboardNumber(segment.value)}
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
