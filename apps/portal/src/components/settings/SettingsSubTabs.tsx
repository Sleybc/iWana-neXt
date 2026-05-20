'use client';

import { useRef } from 'react';
import { cn } from '@iwana/ui';

interface SubTabItem<T extends string = string> {
  id: T;
  label: string;
}

interface SettingsSubTabsProps<T extends string = string> {
  items: readonly SubTabItem<T>[];
  activeTab: T;
  onChange: (id: T) => void;
}

export function SettingsSubTabs<T extends string>({
  items,
  activeTab,
  onChange,
}: SettingsSubTabsProps<T>) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = items.findIndex((item) => item.id === activeTab);

  const focusTabAt = (index: number) => {
    const boundedIndex = (index + items.length) % items.length;
    const targetItem = items[boundedIndex];
    if (!targetItem) return;
    onChange(targetItem.id);
    tabRefs.current[boundedIndex]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Secciones de marca"
      className="flex flex-wrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]"
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(el) => {
            tabRefs.current[index] = el;
          }}
          type="button"
          role="tab"
          aria-selected={item.id === activeTab}
          tabIndex={item.id === activeTab ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              focusTabAt(activeIndex + 1);
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              focusTabAt(activeIndex - 1);
            }
            if (event.key === 'Home') {
              event.preventDefault();
              focusTabAt(0);
            }
            if (event.key === 'End') {
              event.preventDefault();
              focusTabAt(items.length - 1);
            }
          }}
          className={cn(
            'rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-secondary focus-visible:ring-offset-2',
            item.id === activeTab
              ? 'bg-iwana-primary text-white'
              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-dark-surface-3 dark:text-gray-300 dark:ring-dark-border dark:hover:bg-dark-surface-2 dark:hover:text-white',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
