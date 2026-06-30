import type { ReactNode } from 'react';
import { cn } from '@iwana/ui';

interface DashboardPanelProps {
  title: string;
  eyebrow?: string;
  description?: string;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

/**
 * Wrapper visual común para los paneles secundarios del dashboard empresarial.
 * Mantiene una gramática consistente sin mover todavía estos bloques a packages/ui.
 */
export function DashboardPanel({
  title,
  eyebrow,
  description,
  className,
  contentClassName,
  children,
}: DashboardPanelProps) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-gray-200 bg-white p-5 dark:border-dark-border dark:bg-dark-surface-2',
        className,
      )}
    >
      <div>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
            {eyebrow}
          </p>
        )}
        <h3
          className={cn(
            'text-base font-semibold text-gray-800 dark:text-white/90',
            eyebrow && 'mt-1',
          )}
        >
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>

      <div className={cn('mt-4', contentClassName)}>{children}</div>
    </section>
  );
}
