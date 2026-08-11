'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn, interactiveFocusClassName } from '@iwana/ui';
import type { TenantListItem } from '@/lib/api-client';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

interface PlatformTenantPickerProps {
  tenants: TenantListItem[];
  value: string;
  onChange: (slug: string) => void;
  ariaLabel?: string;
}

export function PlatformTenantPicker({
  tenants,
  value,
  onChange,
  ariaLabel = PLATFORM_UI_COPY.shared.selectTenant,
}: PlatformTenantPickerProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const isDisabled = tenants.length === 0;

  const selectedTenantName =
    tenants.find((tenant) => tenant.slug === value)?.name ??
    (isDisabled
      ? PLATFORM_UI_COPY.shared.noTenantsAvailable
      : PLATFORM_UI_COPY.shared.chooseTenant);

  const handleToggle = () => {
    if (isDisabled) {
      return;
    }

    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setOpenUpward(window.innerHeight - rect.bottom < 240);
    }

    setOpen((current) => !current);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={isDisabled}
        onClick={handleToggle}
        className={cn(
          'portal-input-surface inline-flex h-11 min-w-[220px] items-center justify-between gap-3 border px-4 text-sm transition-colors',
          'text-gray-700 hover:bg-iwana-surface-soft dark:text-gray-200 dark:hover:bg-dark-surface-4',
          'disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400',
          'dark:disabled:border-dark-border dark:disabled:bg-dark-surface-3 dark:disabled:text-gray-500',
          interactiveFocusClassName,
        )}
      >
        <span className="truncate">{selectedTenantName}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150 dark:text-gray-500',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            'absolute left-0 z-20 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-gray-200 bg-white p-1 shadow-[var(--shadow-iwana-soft)]',
            'dark:border-dark-border dark:bg-dark-surface-2',
            openUpward && 'bottom-full mb-2 mt-0',
          )}
        >
          {tenants.map((tenant) => (
            <li key={tenant.id} role="option" aria-selected={tenant.slug === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(tenant.slug);
                  setOpen(false);
                }}
                className={cn(
                  'w-full rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                  tenant.slug === value
                    ? 'bg-iwana-surface-soft font-medium text-iwana-primary dark:bg-dark-surface-3 dark:text-white'
                    : 'text-gray-700 hover:bg-iwana-surface-soft dark:text-gray-300 dark:hover:bg-dark-surface-3',
                )}
              >
                {tenant.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
