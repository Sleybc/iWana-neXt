'use client';

import { useRef } from 'react';
import { Badge, cn } from '@iwana/ui';
import type { SettingsNavigationItem, SettingsTabId } from './settings-navigation';

interface SettingsTabBadge {
  label: string;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' | 'lime';
}

interface SettingsTabsProps {
  items: SettingsNavigationItem[];
  activeTab: SettingsTabId;
  onChange: (tabId: SettingsTabId) => void;
  getTabId: (tabId: SettingsTabId) => string;
  getPanelId: (tabId: SettingsTabId) => string;
  getBadge?: (tabId: SettingsTabId) => SettingsTabBadge | null;
}

export function SettingsTabs({
  items,
  activeTab,
  onChange,
  getTabId,
  getPanelId,
  getBadge,
}: SettingsTabsProps) {
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
    <div className="overflow-x-auto border-b border-gray-100 bg-[#f8faf5]/90 px-4 [-ms-overflow-style:none] [scrollbar-width:none] dark:border-dark-border dark:bg-dark-surface-3/40 md:px-6">
      <nav
        role="tablist"
        aria-label="Secciones de configuración empresarial"
        className="-mb-px flex min-w-max gap-5 md:gap-6"
      >
        {items.map((item, index) => {
          const isActive = item.id === activeTab;
          const selectedState = isActive
            ? ({ 'aria-selected': 'true' } as const)
            : ({ 'aria-selected': 'false' } as const);
          const badge = getBadge?.(item.id) ?? null;

          return (
            <button
              key={item.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={getTabId(item.id)}
              type="button"
              role="tab"
              aria-label={item.label}
              aria-controls={getPanelId(item.id)}
              {...selectedState}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                'relative flex items-center gap-2 border-b-[3px] border-transparent px-2 py-4 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2',
                isActive
                  ? 'border-iwana-secondary font-semibold text-iwana-secondary-700 dark:border-iwana-secondary dark:text-iwana-secondary-300'
                  : 'font-medium text-gray-500 hover:border-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:border-dark-border dark:hover:text-gray-200',
              )}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => {
                // WCAG: ambos ejes (horizontal y vertical) permiten navegar en un tablist horizontal.
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
            >
              {item.label}
              {badge ? (
                <Badge
                  variant={badge.variant ?? 'neutral'}
                  className="rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.14em]"
                >
                  {badge.label}
                </Badge>
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
