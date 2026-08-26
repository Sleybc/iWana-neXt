'use client';

import { ReactNode, useState } from 'react';
import { cn } from '@iwana/ui';
import {
  interactiveFocusClassName,
  portalTabActiveClassName,
  portalTabInactiveClassName,
} from '@/components/shared/portal-ui';

export interface SubscriberTab {
  id: string;
  label: string;
  content: ReactNode;
}

interface SubscriberTabsContainerProps {
  tabs: SubscriberTab[];
  defaultTab?: string;
}

export function SubscriberTabsContainer({ tabs, defaultTab }: SubscriberTabsContainerProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? '');
  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="flex w-full flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2">
      <div
        role="tablist"
        aria-label="Secciones del suscriptor"
        className="flex gap-1 overflow-x-auto border-b border-gray-100 px-5 dark:border-dark-border"
      >
        {tabs.map((tab) => {
          const isActive = currentTab?.id === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex min-h-11 items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors',
                interactiveFocusClassName,
                isActive ? portalTabActiveClassName : portalTabInactiveClassName,
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 px-4 py-5 md:px-6 md:py-6">{currentTab?.content}</div>
    </div>
  );
}
