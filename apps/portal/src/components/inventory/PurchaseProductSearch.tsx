'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@iwana/ui';
import type { InventoryCatalogOptionRecord } from '@/lib/api-client';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';
import {
  buildCatalogBulkRowLabel,
  filterCatalogOptions,
  resolveCatalogSupplierLabel,
} from './purchase-catalog-selector';

interface PurchaseProductSearchProps {
  id?: string;
  label?: string;
  placeholder?: string;
  catalogOptions: InventoryCatalogOptionRecord[];
  supplierLabels?: Record<string, string>;
  isSearching?: boolean;
  disabled?: boolean;
  onSearchChange?: (search: string) => void;
  onSelect: (option: InventoryCatalogOptionRecord) => void;
}

const RESULT_LIMIT = 8;

const fieldClassName = cn(
  'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white',
  interactiveFocusClassName,
);

export function PurchaseProductSearch({
  id,
  label = 'Buscar producto',
  placeholder = 'Código o nombre',
  catalogOptions,
  supplierLabels = {},
  isSearching = false,
  disabled = false,
  onSearchChange,
  onSelect,
}: PurchaseProductSearchProps) {
  const generatedId = useId();
  const inputId = id ?? `purchase-product-search-${generatedId}`;
  const listboxId = `${inputId}-listbox`;

  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const trimmedSearch = search.trim();
  const showList = isOpen && trimmedSearch.length > 0 && !disabled;

  const results = useMemo(
    () => filterCatalogOptions(catalogOptions, trimmedSearch).slice(0, RESULT_LIMIT),
    [catalogOptions, trimmedSearch],
  );

  useEffect(() => {
    setHighlightedIndex(0);
  }, [results]);

  const onSearchChangeRef = useRef(onSearchChange);
  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  }, [onSearchChange]);

  useEffect(() => {
    if (!onSearchChangeRef.current) {
      return;
    }

    const handle = window.setTimeout(
      () => {
        onSearchChangeRef.current?.(trimmedSearch);
      },
      trimmedSearch ? 300 : 0,
    );

    return () => window.clearTimeout(handle);
  }, [trimmedSearch]);

  const selectOption = useCallback(
    (option: InventoryCatalogOptionRecord) => {
      onSelect(option);
      setSearch('');
      setIsOpen(false);
    },
    [onSelect],
  );

  function moveHighlight(delta: number) {
    if (results.length === 0) {
      return;
    }

    setHighlightedIndex((current) => {
      const next = (current + delta + results.length) % results.length;
      optionRefs.current[next]?.scrollIntoView?.({ block: 'nearest' });
      return next;
    });
  }

  const activeDescendant =
    showList && results[highlightedIndex]
      ? `${listboxId}-option-${results[highlightedIndex].id}`
      : undefined;

  const listContent = useMemo(() => {
    if (!showList) {
      return null;
    }

    if (isSearching && results.length === 0) {
      return <p className="px-3 py-2 text-xs text-gray-500">Buscando en catálogo...</p>;
    }

    if (results.length === 0) {
      return <p className="px-3 py-2 text-xs text-gray-500">No hay productos que coincidan.</p>;
    }

    return results.map((option, index) => (
      <li key={option.id} role="presentation">
        <button
          ref={(node) => {
            optionRefs.current[index] = node;
          }}
          id={`${listboxId}-option-${option.id}`}
          type="button"
          role="option"
          aria-selected={highlightedIndex === index}
          className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 focus-visible:bg-gray-50 dark:hover:bg-dark-surface-2 dark:focus-visible:bg-dark-surface-2 ${highlightedIndex === index ? 'bg-iwana-primary-50/70 dark:bg-iwana-primary-950/30' : ''} ${interactiveFocusClassName}`}
          onMouseEnter={() => setHighlightedIndex(index)}
          onClick={() => selectOption(option)}
        >
          <span className="font-medium text-gray-900 dark:text-white">
            {buildCatalogBulkRowLabel(option)}
          </span>
          <span className="shrink-0 text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">
            {resolveCatalogSupplierLabel(option, supplierLabels)}
          </span>
        </button>
      </li>
    ));
  }, [highlightedIndex, isSearching, listboxId, results, selectOption, supplierLabels, showList]);

  return (
    <div className="space-y-1 text-sm">
      <label
        htmlFor={inputId}
        id={`${inputId}-label`}
        className="font-medium text-gray-900 dark:text-white"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-labelledby={`${inputId}-label`}
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          autoComplete="off"
          className={fieldClassName}
          placeholder={placeholder}
          value={search}
          disabled={disabled}
          onFocus={() => {
            if (trimmedSearch.length > 0) {
              setIsOpen(true);
            }
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            setSearch(nextValue);
            setIsOpen(nextValue.trim().length > 0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIsOpen(true);
              moveHighlight(1);
              return;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setIsOpen(true);
              moveHighlight(-1);
              return;
            }

            if (event.key === 'Enter' && showList && results[highlightedIndex]) {
              event.preventDefault();
              selectOption(results[highlightedIndex]);
              return;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setIsOpen(false);
            }
          }}
        />
      </div>

      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`Resultados de ${label}`}
          className="max-h-56 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface-3"
        >
          {listContent}
        </ul>
      ) : null}
    </div>
  );
}
