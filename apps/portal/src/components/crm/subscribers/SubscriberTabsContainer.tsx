'use client';

import { ReactNode, useState } from 'react';

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
    <div className="flex w-full flex-1 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95">
      <div className="overflow-x-auto border-b border-gray-100 bg-iwana-surface-soft/90 px-4 dark:border-dark-border dark:bg-dark-surface-3/40 md:px-6">
        <nav className="-mb-px flex min-w-max gap-5 md:gap-6" aria-label="Tabs de suscriptor">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 border-b-[3px] border-transparent px-2 py-4 text-sm whitespace-nowrap transition-colors outline-none ${
                currentTab?.id === tab.id
                  ? 'border-iwana-secondary text-iwana-secondary-700 font-semibold dark:border-iwana-secondary dark:text-iwana-secondary-300'
                  : 'text-gray-500 font-medium hover:border-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:border-dark-border dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
              {currentTab?.id === tab.id && (
                <div className="absolute bottom-0 left-0 h-[3px] w-full rounded-t-full bg-iwana-secondary" />
              )}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex-1 bg-white px-4 py-5 dark:bg-dark-surface-2 md:px-6 md:py-6">
        {currentTab?.content}
      </div>
    </div>
  );
}
