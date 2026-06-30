// apps/web/src/components/layout/PageHeader.tsx
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Acciones opcionales (botones, filtros) alineadas a la derecha */
  actions?: ReactNode;
}

/**
 * Cabecera de página del dashboard administrativo.
 * Reemplaza el Header inline. Compatible con dark mode.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white px-6 py-5 md:flex-row md:items-center md:justify-between dark:border-dark-border dark:bg-dark-surface-2">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-iwana-primary dark:text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
    </div>
  );
}
