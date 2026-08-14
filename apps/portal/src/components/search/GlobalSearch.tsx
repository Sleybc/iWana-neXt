'use client';

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { GlobalSearchOverlay } from './GlobalSearchOverlay';
import { useGlobalSearch } from './useGlobalSearch';
import type { GlobalSearchItem } from '@/lib/api-client';

export type GlobalSearchProps = {
  /** Incrementar para pedir apertura desde un disparador externo (p. ej. móvil). */
  openRequestId?: number;
  onOpenChange?: (open: boolean) => void;
};

export function GlobalSearch({ openRequestId = 0, onOpenChange }: GlobalSearchProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastOpenRequestId = useRef(openRequestId);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [shortcutMod, setShortcutMod] = useState('Ctrl');
  const { results, isLoading, error } = useGlobalSearch(query, isOpen);
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const flatItems = useMemo(
    () => (results?.groups ?? []).flatMap((group) => group.items),
    [results?.groups],
  );

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    const apple =
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform) || /Mac OS/i.test(navigator.userAgent);
    setShortcutMod(apple ? '⌘' : 'Ctrl');
  }, []);

  useEffect(() => {
    if (openRequestId === lastOpenRequestId.current) {
      return;
    }

    lastOpenRequestId.current = openRequestId;
    if (openRequestId <= 0) {
      return;
    }

    setIsOpen(true);
    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [openRequestId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [results?.groups]);

  useEffect(() => {
    setQuery('');
    setIsOpen(false);
    setActiveIndex(0);
  }, [routeKey]);

  const activeItem = flatItems[activeIndex] ?? null;

  const navigateToItem = (item: GlobalSearchItem) => {
    setQuery('');
    setIsOpen(false);
    setActiveIndex(0);
    startTransition(() => {
      router.push(item.route);
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-gray-500 dark:text-gray-400"
      >
        <Search className="h-4 w-4" />
      </span>

      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Buscar en el portal empresarial"
        aria-expanded={isOpen}
        aria-controls="global-search-results"
        placeholder="Buscar en el portal empresarial..."
        value={query}
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!isOpen) {
            setIsOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (!isOpen) {
            return;
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((current) =>
              flatItems.length === 0 ? 0 : Math.min(current + 1, flatItems.length - 1),
            );
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((current) => (flatItems.length === 0 ? 0 : Math.max(current - 1, 0)));
          }

          if (event.key === 'Enter' && activeItem) {
            event.preventDefault();
            navigateToItem(activeItem);
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            setIsOpen(false);
          }
        }}
        className="h-11 w-full rounded-2xl border border-gray-100 bg-gray-50 pl-10 pr-16 text-sm text-gray-700 shadow-[var(--shadow-iwana-card)] placeholder:text-gray-400 focus:border-iwana-primary focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 dark:border-iwana-neutral-600 dark:bg-dark-surface-3 dark:text-gray-200 dark:placeholder:text-gray-400 dark:focus:border-iwana-primary-300"
      />

      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-100 bg-white px-1.5 py-0.5 text-xs text-gray-500 shadow-[var(--shadow-iwana-card)] dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-400"
      >
        <span>{shortcutMod}</span>
        <span>K</span>
      </span>

      <GlobalSearchOverlay
        isOpen={isOpen}
        query={query}
        isLoading={isLoading}
        error={error}
        groups={results?.groups ?? []}
        activeItemId={activeItem?.id ?? null}
        onSelect={navigateToItem}
        onHover={(item) => {
          const nextIndex = flatItems.findIndex((candidate) => candidate.id === item.id);
          if (nextIndex >= 0) {
            setActiveIndex(nextIndex);
          }
        }}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}
