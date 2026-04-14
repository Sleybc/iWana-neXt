// apps/portal/src/components/layout/PageHeader.tsx
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/**
 * Cabecera de página del portal suscriptor.
 * Compatible con dark mode.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mx-6 mt-6 flex items-center justify-between rounded-[20px] border border-gray-100 bg-white px-6 py-5 shadow-[var(--shadow-iwana-soft)] dark:border-dark-border dark:bg-dark-surface-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-iwana-primary dark:text-white">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
