'use client';

import { ReactNode, useState } from 'react';

export interface ExpedienteTab {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}

interface ExpedienteTabsContainerProps {
  tabs?: ExpedienteTab[];
  defaultTab?: string;
}

export function ExpedienteTabsContainer({ tabs, defaultTab }: ExpedienteTabsContainerProps) {
  const safeTabs = tabs ?? [];
  const [activeTab, setActiveTab] = useState<string | null>(defaultTab ?? safeTabs[0]?.id ?? null);

  const resolvedActiveTab =
    activeTab && safeTabs.some((tab) => tab.id === activeTab)
      ? activeTab
      : (safeTabs[0]?.id ?? null);

  if (safeTabs.length === 0) {
    return (
      <div className="w-full flex-1 rounded-2xl border border-dashed border-gray-200 bg-white/95 px-6 py-8 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
          Expediente en preparación
        </p>
        <p className="mt-2 text-base font-semibold text-gray-900 dark:text-white">
          No hay secciones disponibles para este expediente.
        </p>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Cuando el caso tenga información asociada, aquí aparecerán las pestañas operativas y su
          trazabilidad.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col overflow-x-hidden overflow-y-visible rounded-2xl border border-white/70 bg-white/95 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95">
      <div className="overflow-x-auto border-b border-gray-100 bg-[#f8faf5]/90 px-4 dark:border-dark-border dark:bg-dark-surface-3/40 md:px-6">
        <nav className="-mb-px flex min-w-max gap-5 md:gap-6" aria-label="Tabs">
          {safeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 border-b-[3px] border-transparent px-2 py-4 text-sm whitespace-nowrap transition-colors outline-none ${
                resolvedActiveTab === tab.id
                  ? 'border-iwana-secondary text-iwana-secondary-700 font-semibold dark:border-iwana-secondary dark:text-iwana-secondary-300'
                  : 'text-gray-500 font-medium hover:border-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:border-dark-border dark:hover:text-gray-200'
              }`}
              aria-current={resolvedActiveTab === tab.id ? 'page' : undefined}
            >
              {tab.icon}
              {tab.label}

              {resolvedActiveTab === tab.id && (
                <div className="absolute bottom-0 left-0 h-[3px] w-full rounded-t-full bg-iwana-secondary" />
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 bg-white px-4 py-5 dark:bg-dark-surface-2 md:px-6 md:py-6">
        {safeTabs.find((tab) => tab.id === resolvedActiveTab)?.content}
      </div>
    </div>
  );
}
