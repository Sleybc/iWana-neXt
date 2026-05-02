'use client';

import {
  BriefcaseBusiness,
  FileText,
  HandCoins,
  LayoutDashboard,
  Settings,
  UserRound,
  Users,
} from 'lucide-react';
import { cn } from '@iwana/ui';
import type { GlobalSearchItem } from '@/lib/api-client';

const moduleIconByRoute: Record<string, typeof LayoutDashboard> = {
  '/dashboard': LayoutDashboard,
  '/dashboard/commercial': HandCoins,
  '/dashboard/crm': BriefcaseBusiness,
  '/dashboard/crm/subscribers': Users,
  '/dashboard/settings': Settings,
  '/dashboard/users': UserRound,
};

export function GlobalSearchResultItem({
  item,
  isActive,
  onClick,
  onMouseEnter,
}: {
  item: GlobalSearchItem;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const Icon =
    item.type === 'user'
      ? UserRound
      : item.type === 'subscriber'
        ? Users
        : item.type === 'expediente'
          ? FileText
          : (moduleIconByRoute[item.route] ?? LayoutDashboard);

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
        isActive
          ? 'border-iwana-primary-200 bg-iwana-primary-50 text-iwana-primary-900 dark:border-iwana-primary-700/70 dark:bg-iwana-primary-900/30 dark:text-iwana-primary-100'
          : 'border-transparent bg-white text-gray-800 hover:border-gray-200 hover:bg-gray-50 dark:bg-dark-surface-2 dark:text-gray-100 dark:hover:border-dark-border-2 dark:hover:bg-dark-surface-3',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          isActive
            ? 'bg-iwana-primary-100 text-iwana-primary-700 dark:bg-iwana-primary-800/60 dark:text-iwana-primary-200'
            : 'bg-gray-100 text-gray-500 dark:bg-dark-surface-3 dark:text-gray-300',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{item.title}</span>
            <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
              {item.subtitle}
            </span>
          </span>
          {item.meta ? (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-dark-surface-3 dark:text-gray-300">
              {item.meta}
            </span>
          ) : null}
        </span>

        {item.highlights.length > 0 ? (
          <span className="mt-2 flex flex-wrap gap-2">
            {item.highlights.slice(0, 2).map((highlight) => (
              <span
                key={`${item.id}-${highlight}`}
                className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300"
                dangerouslySetInnerHTML={{ __html: highlight }}
              />
            ))}
          </span>
        ) : null}
      </span>
    </button>
  );
}
