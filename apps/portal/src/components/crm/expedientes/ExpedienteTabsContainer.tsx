'use client';

import { ReactNode, useId, useState } from 'react';
import { CircleDashed } from 'lucide-react';
import { cn } from '@iwana/ui';
import {
  PortalEmptyState,
  interactiveFocusClassName,
  portalTabLimeActiveClassName,
  portalTabInactiveClassName,
} from '@/components/shared/portal-ui';

export interface ExpedienteTab {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}

interface ExpedienteTabsContainerProps {
  tabs?: ExpedienteTab[];
  defaultTab?: string;
  onTabChange?: (tabId: string) => void | Promise<void>;
  loadingTabId?: string | null;
}

export function ExpedienteTabsContainer({
  tabs,
  defaultTab,
  onTabChange,
  loadingTabId,
}: ExpedienteTabsContainerProps) {
  const safeTabs = tabs ?? [];
  const tabsInstanceId = useId().replace(/:/g, '');
  const [activeTab, setActiveTab] = useState<string | null>(defaultTab ?? safeTabs[0]?.id ?? null);

  const resolvedActiveTab =
    activeTab && safeTabs.some((tab) => tab.id === activeTab)
      ? activeTab
      : (safeTabs[0]?.id ?? null);

  if (safeTabs.length === 0) {
    return (
      <PortalEmptyState
        title="Sin secciones disponibles"
        description="Cuando la oportunidad tenga información asociada, aquí aparecerán las pestañas operativas."
        icon={CircleDashed}
      />
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col overflow-x-hidden overflow-y-visible rounded-2xl border border-gray-100 bg-white shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2">
      <div
        role="tablist"
        aria-label="Secciones de la oportunidad"
        className="flex gap-1 overflow-x-auto border-b border-gray-100 px-5 dark:border-dark-border"
      >
        {safeTabs.map((tab, index) => {
          const isActive = resolvedActiveTab === tab.id;
          const isLoading = loadingTabId === tab.id;
          const tabId = `${tabsInstanceId}-tab-${tab.id}`;
          const panelId = `${tabsInstanceId}-panel`;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tabId}
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              aria-busy={isLoading || undefined}
              onClick={() => {
                setActiveTab(tab.id);
                void onTabChange?.(tab.id);
              }}
              onKeyDown={(event) => {
                if (
                  !['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(
                    event.key,
                  )
                ) {
                  return;
                }

                event.preventDefault();
                const nextIndex =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? safeTabs.length - 1
                      : (index +
                          (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) +
                          safeTabs.length) %
                        safeTabs.length;
                const nextTab = safeTabs[nextIndex];
                if (!nextTab) return;
                setActiveTab(nextTab.id);
                void onTabChange?.(nextTab.id);
                document.getElementById(`${tabsInstanceId}-tab-${nextTab.id}`)?.focus();
              }}
              className={cn(
                'flex min-h-11 items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors',
                interactiveFocusClassName,
                isActive ? portalTabLimeActiveClassName : portalTabInactiveClassName,
              )}
            >
              {tab.icon ? (
                <span
                  className={
                    isActive
                      ? 'text-iwana-secondary-700 dark:text-iwana-secondary'
                      : 'text-gray-400 dark:text-gray-500'
                  }
                  aria-hidden="true"
                >
                  {tab.icon}
                </span>
              ) : null}
              {tab.label}
              {isLoading ? (
                <span className="sr-only" role="status">
                  Cargando {tab.label.toLocaleLowerCase('es-CO')}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        id={`${tabsInstanceId}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsInstanceId}-tab-${resolvedActiveTab ?? 'empty'}`}
        tabIndex={0}
        className="flex-1 px-4 py-5 outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary/40 md:px-6 md:py-6"
      >
        {safeTabs.find((tab) => tab.id === resolvedActiveTab)?.content}
      </div>
    </div>
  );
}
