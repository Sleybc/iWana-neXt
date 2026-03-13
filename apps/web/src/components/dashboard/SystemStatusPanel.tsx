// apps/web/src/components/dashboard/SystemStatusPanel.tsx
import { cn } from '@iwana/ui';

type StatusLevel = 'ok' | 'warning' | 'error' | 'unknown';

export interface StatusIndicator {
  label: string;
  status: StatusLevel;
  /** Texto descriptivo opcional (ej: "Latencia: 12ms") */
  detail?: string;
}

interface SystemStatusPanelProps {
  indicators: StatusIndicator[];
  className?: string;
}

const statusStyles: Record<StatusLevel, { dot: string; text: string; bg: string }> = {
  ok: {
    dot: 'bg-green-500',
    text: 'text-green-700 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20',
  },
  warning: {
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
  },
  error: {
    dot: 'bg-red-500',
    text: 'text-red-700 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
  },
  unknown: {
    dot: 'bg-gray-400',
    text: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-800',
  },
};

const statusLabel: Record<StatusLevel, string> = {
  ok: 'Operativo',
  warning: 'Degradado',
  error: 'Error',
  unknown: 'Desconocido',
};

/**
 * Panel de salud del sistema con hasta 4 indicadores en grilla 2×2.
 * Sprint 2+: conectar con endpoint de health check.
 */
export function SystemStatusPanel({ indicators, className }: SystemStatusPanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900',
        className,
      )}
    >
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mb-4">
        Estado del sistema
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {indicators.map((ind, idx) => {
          const styles = statusStyles[ind.status];
          return (
            <div key={idx} className={cn('rounded-xl p-3', styles.bg)}>
              <div className="flex items-center gap-2 mb-1">
                {/* Dot indicador */}
                <span
                  className={cn('h-2 w-2 rounded-full shrink-0', styles.dot)}
                  aria-hidden="true"
                />
                <span className={cn('text-xs font-medium', styles.text)}>
                  {statusLabel[ind.status]}
                </span>
              </div>
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90 truncate">
                {ind.label}
              </p>
              {ind.detail && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  {ind.detail}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
