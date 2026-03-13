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
    <div className="mx-6 mt-6 flex items-center justify-between px-6 py-4 bg-white border border-gray-200 rounded-2xl dark:bg-dark-surface-2 dark:border-dark-border">
      <div>
        <h1 className="text-xl font-semibold text-iwana-primary dark:text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
