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

    if (!targetItem) {
      return;
    }

    onChange(targetItem.id);
    tabRefs.current[boundedIndex]?.focus();
  };

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Secciones de configuración empresarial"
        className="flex gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-dark-border dark:bg-dark-surface-2"
      >
        {items.map((item, index) => {
          const isActive = item.id === activeTab;
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
              aria-selected={isActive}
              aria-controls={getPanelId(item.id)}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                'min-w-fit rounded-xl px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2',
                isActive
                  ? 'bg-iwana-primary text-white shadow-sm dark:bg-iwana-primary-400'
                  : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-dark-surface-3',
              )}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => {
                // Navegacion horizontal WCAG para mantener el foco dentro del tablist.
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
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{item.label}</span>
                {badge ? (
                  <Badge
                    variant={badge.variant ?? 'neutral'}
                    className={cn(isActive && 'bg-white/15 text-white dark:bg-white/20')}
                  >
                    {badge.label}
                  </Badge>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
