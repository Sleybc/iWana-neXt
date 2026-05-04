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
    <div
      role="tablist"
      aria-label="Secciones de configuración empresarial"
      className="flex gap-2 overflow-x-auto rounded-2xl border border-white/70 bg-white/95 p-2 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95"
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
              'flex min-w-fit items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2',
              isActive
                ? 'bg-iwana-primary text-white shadow-iwana dark:bg-iwana-primary-400'
                : 'text-gray-600 hover:bg-[#f8faf5] hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-surface-3 dark:hover:text-white',
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
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.14em]',
                  isActive && 'bg-white/15 text-white dark:bg-white/20',
                )}
              >
                {badge.label}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
