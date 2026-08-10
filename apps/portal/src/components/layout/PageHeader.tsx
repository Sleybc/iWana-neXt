import type { ReactNode } from 'react';
import { cn } from '@iwana/ui';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Cabecera de página del portal (B0 en el inicio).
 * Superficie con borde + `shadow-iwana-soft` (DS §5).
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white px-6 py-5 shadow-iwana-soft md:flex-row md:items-center md:justify-between dark:border-dark-border dark:bg-dark-surface-2',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-iwana-primary dark:text-white">{title}</h1>
        {subtitle ? (
          <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}
