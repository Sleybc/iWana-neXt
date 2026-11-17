import { cn } from '../lib/utils';

interface DimensionBadgeProps {
  label: string;
  value: number;
}

interface ProgressMeterProps {
  /** Valor general 0–100 */
  value: number;
  /** Texto visible que describe qué se está midiendo. */
  label?: string;
  /** Nombre accesible de la barra; por defecto usa `label`. */
  ariaLabel?: string;
  /** Desglose por dimensión (opcional) */
  dimensions?: DimensionBadgeProps[];
  /**
   * Solo la barra (h-2), sin rótulo ni porcentaje visibles, para celdas densas donde la cifra ya
   * se lee al lado. El nombre accesible sigue siendo `ariaLabel` o `label` con el porcentaje.
   */
  compact?: boolean;
  className?: string;
}

/**
 * ProgressMeter — barra de progreso con degradado iWana y badges de dimensión.
 * Basado en el prototipo HTML prototipo_expediente.html.
 * - Track gris claro, relleno degradado primary → secondary.
 * - Porcentaje grande en verde lima accesible (secondary-700).
 */
function ProgressMeter({
  value,
  label = 'Progreso',
  ariaLabel,
  dimensions,
  compact = false,
  className,
}: ProgressMeterProps) {
  const pct = Math.max(0, Math.min(100, value));
  const bar = (
    <progress
      className={cn(
        'w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-[#d9dde5] [&::-webkit-progress-value]:bg-gradient-to-r [&::-webkit-progress-value]:from-iwana-primary [&::-webkit-progress-value]:to-iwana-secondary [&::-moz-progress-bar]:bg-iwana-primary dark:[&::-webkit-progress-bar]:bg-dark-surface-4',
        compact ? 'block h-2' : 'h-3.5',
      )}
      aria-label={ariaLabel ?? `${label}: ${pct}%`}
      value={pct}
      max={100}
    />
  );

  if (compact) {
    return <div className={className}>{bar}</div>;
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="mb-1 flex items-end justify-between gap-4">
        <span className="text-sm font-semibold text-iwana-primary dark:text-white/90">{label}</span>
        <span className="text-[2rem] leading-none font-bold tracking-tight text-iwana-secondary-700 dark:text-iwana-secondary-400">
          {pct}%
        </span>
      </div>

      {bar}

      {dimensions && dimensions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          {dimensions.map((dim) => (
            <span
              key={dim.label}
              className={cn(
                'flex items-center gap-1',
                dim.value === 100
                  ? 'font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400'
                  : dim.value > 0
                    ? 'text-gray-500 dark:text-gray-400'
                    : 'text-gray-400 dark:text-gray-400',
              )}
            >
              {dim.value === 100 ? (
                <svg
                  className="h-3.5 w-3.5 shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  className="h-3.5 w-3.5 shrink-0"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="7.5" />
                </svg>
              )}
              {dim.label}: {dim.value}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export { ProgressMeter };
