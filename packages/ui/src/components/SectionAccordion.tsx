'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export interface SectionAccordionItemProps {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  progress?: number;
  children: React.ReactNode;
  disabled?: boolean;
}

interface SectionAccordionProps {
  items: SectionAccordionItemProps[];
  defaultOpen?: string;
  openId?: string | null;
  onOpenChange?: (id: string | null) => void;
  openIds?: Set<string>;
  onOpenIdsChange?: (ids: Set<string>) => void;
  variant?: 'default' | 'card';
  className?: string;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10.22 3.22a.75.75 0 010 1.06l-5 5a.75.75 0 01-1.06 0l-2.25-2.25a.75.75 0 011.06-1.06L4.75 7.69l4.47-4.47a.75.75 0 011.06 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SectionAccordion({
  items,
  defaultOpen,
  openId,
  onOpenChange,
  openIds: openIdsProp,
  onOpenIdsChange,
  variant = 'default',
  className,
}: SectionAccordionProps) {
  const [internalOpen, setInternalOpen] = React.useState<string | null>(defaultOpen ?? null);
  const [internalOpenIds, setInternalOpenIds] = React.useState<Set<string>>(
    () => new Set(defaultOpen ? [defaultOpen] : []),
  );

  const isControlledSingle = openId !== undefined;
  const currentOpen = isControlledSingle ? openId : internalOpen;

  const isControlledMulti = openIdsProp !== undefined;
  const currentOpenIds = isControlledMulti ? openIdsProp : internalOpenIds;

  const handleToggleSingle = (id: string, disabled?: boolean) => {
    if (disabled) return;
    const next = currentOpen === id ? null : id;
    if (!isControlledSingle) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const handleToggleMulti = (id: string, disabled?: boolean) => {
    if (disabled) return;
    const next = new Set(currentOpenIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    if (!isControlledMulti) setInternalOpenIds(next);
    onOpenIdsChange?.(next);
  };

  if (variant === 'card') {
    return (
      <div className={cn('space-y-4', className)}>
        {items.map((item) => {
          const isOpen = currentOpenIds.has(item.id);
          const isComplete = item.progress === 100;

          return (
            <div
              key={item.id}
              className={cn(
                'rounded-[20px] transition-all',
                isOpen ? 'overflow-visible' : 'overflow-hidden',
                isOpen
                  ? 'bg-white shadow-[var(--shadow-iwana-soft)] border border-gray-50 dark:bg-dark-surface-2 dark:border-dark-border'
                  : 'bg-white shadow-sm border border-gray-50 hover:shadow-md hover:border-iwana-secondary/30 dark:bg-dark-surface-2 dark:border-dark-border dark:hover:border-iwana-secondary/30',
              )}
            >
              {isOpen ? (
                <>
                  <div className="flex items-center space-x-2 p-6 pb-4 border-b border-gray-50 dark:border-dark-border">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                        isComplete
                          ? 'bg-[#EDF8CC] text-[#6A7A1C] dark:bg-iwana-secondary-700/20 dark:text-iwana-secondary'
                          : 'bg-iwana-secondary/10 text-iwana-secondary dark:bg-iwana-secondary/20 dark:text-iwana-secondary',
                      )}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-bold text-iwana-primary truncate dark:text-white">
                        {item.label}
                      </h2>
                      {item.description && (
                        <p className="mt-1 text-xs leading-5 text-gray-500 truncate dark:text-gray-400">
                          {item.description}
                        </p>
                      )}
                    </div>
                    {item.progress != null && (
                      <span
                        className={cn(
                          'px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shrink-0',
                          isComplete
                            ? 'bg-[#EDF8CC] text-[#48531D] dark:bg-iwana-secondary-700/20 dark:text-iwana-secondary'
                            : 'bg-gray-100 text-gray-500 dark:bg-dark-surface-3 dark:text-gray-400',
                        )}
                      >
                        {isComplete && <CheckIcon className="h-3 w-3" />}
                        {item.progress}%
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleMulti(item.id, item.disabled)}
                      disabled={item.disabled}
                      aria-label={`Contraer sección ${item.label}`}
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                        'bg-gray-100 hover:bg-gray-200 transition-colors dark:bg-dark-surface-3 dark:hover:bg-dark-surface-4',
                        item.disabled && 'opacity-50 cursor-not-allowed',
                      )}
                      aria-expanded="true"
                      aria-controls={`section-panel-${item.id}`}
                    >
                      <ChevronDownIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </button>
                  </div>
                  <div id={`section-panel-${item.id}`} role="region" className="p-6 pt-4">
                    {item.children}
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => handleToggleMulti(item.id, item.disabled)}
                  disabled={item.disabled}
                  aria-expanded="false"
                  aria-controls={`section-panel-${item.id}`}
                  className={cn(
                    'w-full px-6 py-4 flex items-center justify-between text-left',
                    'transition-colors group',
                    item.disabled && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-8 h-8 rounded-full bg-gray-100 text-iwana-secondary
                        flex items-center justify-center shrink-0
                        group-hover:bg-iwana-secondary/20 transition-colors
                        dark:bg-dark-surface-3 dark:text-iwana-secondary dark:group-hover:bg-iwana-secondary/20"
                      aria-hidden="true"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </div>
                    <h3
                      className="font-bold text-sm text-gray-700
                        group-hover:text-iwana-primary transition-colors
                        dark:text-gray-300 dark:group-hover:text-iwana-secondary"
                    >
                      {item.label}
                    </h3>
                  </div>
                  {item.progress != null && (
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[11px] font-semibold',
                        isComplete
                          ? 'bg-[#EDF8CC] text-[#48531D] dark:bg-iwana-secondary-700/20 dark:text-iwana-secondary'
                          : 'bg-gray-100 text-gray-400 dark:bg-dark-surface-3 dark:text-gray-400',
                      )}
                    >
                      {isComplete && <CheckIcon className="h-2.5 w-2.5 inline mr-0.5" />}
                      {item.progress}%
                    </span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item) => {
        const isOpen = currentOpen === item.id;
        const expandedState = isOpen
          ? ({ 'aria-expanded': 'true' } as const)
          : ({ 'aria-expanded': 'false' } as const);
        const isComplete = item.progress === 100;
        const isEmpty = item.progress === 0 || item.progress == null;

        return (
          <div
            key={item.id}
            className={cn(
              'rounded-2xl transition-all',
              isOpen ? 'overflow-visible' : 'overflow-hidden',
              isOpen
                ? 'border border-iwana-primary/20 shadow-[var(--shadow-iwana-active)] bg-white'
                : isComplete
                  ? 'border border-transparent bg-gray-50/50 hover:bg-gray-50'
                  : 'border border-gray-100 bg-white hover:border-iwana-secondary/30 shadow-sm',
            )}
          >
            <button
              type="button"
              aria-controls={`section-panel-${item.id}`}
              onClick={() => !item.disabled && handleToggleSingle(item.id)}
              disabled={item.disabled}
              {...expandedState}
              className={cn(
                'w-full p-5 flex items-center justify-between text-left',
                'transition-colors group',
                isOpen ? 'border-b border-gray-50' : '',
                item.disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className="flex items-center space-x-4">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors',
                    isOpen || isComplete
                      ? 'bg-[#EDF8CC] text-[#6A7A1C]'
                      : 'bg-gray-100 text-gray-400 group-hover:bg-iwana-secondary/10 group-hover:text-iwana-secondary-700 dark:group-hover:text-iwana-secondary-400',
                  )}
                  aria-hidden="true"
                >
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <h3
                    className={cn(
                      'font-semibold text-[15px] truncate transition-colors',
                      isOpen
                        ? 'text-iwana-primary font-bold'
                        : isComplete
                          ? 'text-iwana-primary group-hover:text-iwana-secondary-700 dark:group-hover:text-iwana-secondary-400'
                          : 'text-iwana-primary group-hover:text-iwana-primary',
                    )}
                  >
                    {item.label}
                  </h3>
                  {item.description && (
                    <p className="mt-1 text-xs leading-5 text-gray-500 truncate dark:text-gray-400">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0 ml-4">
                {item.progress != null && (
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1',
                      isComplete ? 'bg-[#EDF8CC] text-[#48531D]' : 'bg-gray-100 text-gray-500',
                    )}
                  >
                    {isComplete && <CheckIcon className="h-3 w-3" />}
                    {item.progress}%
                  </span>
                )}
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                    isOpen ? 'bg-gray-100 rotate-180' : 'group-hover:bg-gray-100',
                  )}
                  aria-hidden="true"
                >
                  <ChevronDownIcon
                    className={cn(
                      'h-4 w-4 transition-colors',
                      isOpen
                        ? 'text-gray-600'
                        : isEmpty
                          ? 'text-gray-300 group-hover:text-iwana-primary'
                          : 'text-gray-400',
                    )}
                  />
                </div>
              </div>
            </button>

            {isOpen && (
              <div
                id={`section-panel-${item.id}`}
                role="region"
                aria-labelledby={`section-header-${item.id}`}
                className="p-6 bg-gray-50/30"
              >
                {item.children}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { SectionAccordion };
