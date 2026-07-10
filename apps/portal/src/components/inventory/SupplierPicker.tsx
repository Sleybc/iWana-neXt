'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@iwana/ui';
import { purchasingApi, type SupplierListItemRecord } from '@/lib/api-client';
import { PortalAlert, interactiveFocusClassName } from '@/components/shared/portal-ui';
import { getPartyStatusLabel } from './inventory-labels';

interface SupplierPickerProps {
  id?: string;
  label?: string;
  value: string | null;
  selectedLabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  onChange: (partyRefId: string | null, displayName: string | null) => void;
  onPreview?: (partyRefId: string) => void;
}

const fieldClassName = cn(
  'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white',
  interactiveFocusClassName,
);

export function SupplierPicker({
  id,
  label = 'Proveedor',
  value,
  selectedLabel,
  placeholder = 'Buscar proveedor por nombre',
  disabled = false,
  onChange,
  onPreview,
}: SupplierPickerProps) {
  const generatedId = useId();
  const inputId = id ?? `supplier-picker-${generatedId}`;
  const listboxId = `${inputId}-listbox`;

  const [search, setSearch] = useState(selectedLabel ?? '');
  const [options, setOptions] = useState<SupplierListItemRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setSearch(selectedLabel ?? '');
  }, [selectedLabel, value]);

  const trimmedSearch = search.trim();
  const showList = isOpen && trimmedSearch.length > 0 && !disabled;

  useEffect(() => {
    if (disabled || trimmedSearch.length === 0) {
      setOptions([]);
      setIsLoading(false);
      return;
    }

    const handle = window.setTimeout(() => {
      void (async () => {
        setIsLoading(true);
        setError(null);
        try {
          const response = await purchasingApi.searchSuppliers({ search: trimmedSearch, page: 1 });
          setOptions(response.data);
          setHighlightedIndex(0);
        } catch {
          setError('No fue posible cargar proveedores.');
          setOptions([]);
        } finally {
          setIsLoading(false);
        }
      })();
    }, 300);

    return () => window.clearTimeout(handle);
  }, [disabled, trimmedSearch]);

  const selectOption = useCallback(
    (option: SupplierListItemRecord) => {
      onChange(option.partyRefId, option.displayName);
      setSearch(option.displayName);
      setIsOpen(false);
      onPreview?.(option.partyRefId);
    },
    [onChange, onPreview],
  );

  function handleClear() {
    onChange(null, null);
    setSearch('');
    setIsOpen(false);
    setOptions([]);
  }

  function moveHighlight(delta: number) {
    if (options.length === 0) {
      return;
    }

    setHighlightedIndex((current) => {
      const next = (current + delta + options.length) % options.length;
      optionRefs.current[next]?.scrollIntoView?.({ block: 'nearest' });
      return next;
    });
  }

  const activeDescendant =
    showList && options[highlightedIndex]
      ? `${listboxId}-option-${options[highlightedIndex].partyRefId}`
      : undefined;

  const listContent = useMemo(() => {
    if (!showList) {
      return null;
    }

    if (isLoading) {
      return <p className="px-3 py-2 text-xs text-gray-500">Buscando proveedores…</p>;
    }

    if (options.length === 0) {
      return <p className="px-3 py-2 text-xs text-gray-500">Sin resultados para esta búsqueda.</p>;
    }

    return options.map((option, index) => (
      <li key={option.partyRefId} role="presentation">
        <button
          ref={(node) => {
            optionRefs.current[index] = node;
          }}
          id={`${listboxId}-option-${option.partyRefId}`}
          type="button"
          role="option"
          aria-selected={highlightedIndex === index}
          className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50 focus-visible:bg-gray-50 dark:hover:bg-dark-surface-2 dark:focus-visible:bg-dark-surface-2 ${highlightedIndex === index ? 'bg-iwana-primary-50/70 dark:bg-iwana-primary-950/30' : ''} ${interactiveFocusClassName}`}
          onMouseEnter={() => setHighlightedIndex(index)}
          onClick={() => selectOption(option)}
        >
          <span className="font-medium text-gray-900 dark:text-white">{option.displayName}</span>
          <span className="text-xs text-iwana-secondary-700">
            {getPartyStatusLabel(option.status)}
          </span>
        </button>
      </li>
    ));
  }, [highlightedIndex, isLoading, listboxId, options, selectOption, showList]);

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
            if (value) {
              onChange(null, null);
            }
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

            if (event.key === 'Enter' && showList && options[highlightedIndex]) {
              event.preventDefault();
              selectOption(options[highlightedIndex]);
              return;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setIsOpen(false);
            }
          }}
        />
        {value ? (
          <button
            type="button"
            className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-iwana-primary hover:underline ${interactiveFocusClassName}`}
            onClick={handleClear}
          >
            Limpiar
          </button>
        ) : null}
      </div>

      {error ? (
        <PortalAlert variant="error" title="Búsqueda de proveedor" description={error} />
      ) : null}

      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`Resultados de ${label}`}
          className="max-h-44 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface-3"
        >
          {listContent}
        </ul>
      ) : null}
    </div>
  );
}
