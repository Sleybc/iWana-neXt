// apps/web/src/components/dashboard/SystemStatusPanel.tsx
import { cn, SkeletonBlock } from '@iwana/ui';

type StatusLevel = 'ok' | 'warning' | 'error' | 'unknown';

export interface StatusIndicator {
  label: string;
  status: StatusLevel;
  detail?: string;
}

interface SystemStatusPanelProps {
  indicators: StatusIndicator[];
  title?: string;
  summary?: string;
  lastCheckedAt?: string | null;
  isLoading?: boolean;
  className?: string;
}

const statusStyles: Record<StatusLevel, { dot: string; text: string; bg: string }> = {
  ok: {
    dot: 'bg-success-500',
    text: 'text-success-700 dark:text-success-400',
    bg: 'bg-success-50 dark:bg-dark-surface-3/30',
  },
  warning: {
    dot: 'bg-warning-500',
    text: 'text-warning-700 dark:text-warning-400',
    bg: 'bg-warning-50 dark:bg-dark-surface-3/30',
  },
  error: {
    dot: 'bg-error-500',
    text: 'text-error-700 dark:text-error-400',
    bg: 'bg-error-50 dark:bg-dark-surface-3/30',
  },
  unknown: {
    // Sin token DS para estado indeterminado — gray genérico aceptado en Fase-1
    dot: 'bg-gray-400 dark:bg-gray-500',
    text: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-dark-surface-3/80',
  },
};

const statusLabel: Record<StatusLevel, string> = {
  ok: 'Operativo',
  warning: 'Degradado',
  error: 'Error',
  unknown: 'Desconocido',
};

function formatLastChecked(value?: string | null): string {
  if (!value) {
    return 'Pendiente';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Pendiente';
  }

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function SystemStatusPanel({
  indicators,
  title = 'Salud de plataforma',
  summary,
  lastCheckedAt,
  isLoading = false,
  className,
}: SystemStatusPanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200 bg-white p-5 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2',
        className,
      )}
    >
      <div className="border-b border-gray-100 pb-4 dark:border-dark-border">
        <p className="portal-eyebrow">Monitoreo</p>
        <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
            {summary && (
              <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{summary}</p>
            )}
          </div>
          <div className="rounded-2xl bg-iwana-surface-soft px-3 py-2 text-xs text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300">
            Última lectura
            <p className="mt-1 font-semibold text-iwana-primary dark:text-white">
              {formatLastChecked(lastCheckedAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={`status-skeleton-${idx}`} className="h-20 w-full bg-gray-200" />
            ))
          : indicators.map((ind, idx) => {
              const styles = statusStyles[ind.status];
              return (
                <div
                  key={idx}
                  className={cn('rounded-2xl border border-transparent p-3', styles.bg)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('h-2.5 w-2.5 shrink-0 rounded-full', styles.dot)}
                      aria-hidden="true"
                    />
                    <span className={cn('text-xs font-medium', styles.text)}>
                      {statusLabel[ind.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {ind.label}
                  </p>
                  {ind.detail && (
                    <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
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
