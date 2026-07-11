'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge, cn } from '@iwana/ui';
import { purchasingApi, type SupplierListItemRecord } from '@/lib/api-client';
import { PortalAlert, interactiveFocusClassName } from '@/components/shared/portal-ui';
import { getPartyStatusLabel } from './inventory-labels';

export interface SupplierMultiSelection {
  partyRefId: string;
  displayName: string;
}

interface SupplierMultiPickerProps {
  id?: string;
  label?: string;
  value: SupplierMultiSelection[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (selection: SupplierMultiSelection[]) => void;
}

const fieldClassName = cn(
  'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white',
  interactiveFocusClassName,
);

export function SupplierMultiPicker({
  id,
  label = 'Proveedores',
  value,
  placeholder = 'Buscar proveedor por nombre',
  disabled = false,
  onChange,
}: SupplierMultiPickerProps) {
  const generatedId = useId();
  const inputId = id ?? `supplier-multi-picker-${generatedId}`;
  const listboxId = `${inputId}-listbox`;

  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<SupplierListItemRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIds = useMemo(() => new Set(value.map((entry) => entry.partyRefId)), [value]);

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

  const toggleOption = useCallback(
    (option: SupplierListItemRecord) => {
      if (selectedIds.has(option.partyRefId)) {
        onChange(value.filter((entry) => entry.partyRefId !== option.partyRefId));
        return;
      }

      onChange([...value, { partyRefId: option.partyRefId, displayName: option.displayName }]);
    },
    [onChange, selectedIds, value],
  );

  function removeSelection(partyRefId: string) {
    onChange(value.filter((entry) => entry.partyRefId !== partyRefId));
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

    return options.map((option, index) => {
      const isSelected = selectedIds.has(option.partyRefId);
      return (
        <li key={option.partyRefId} role="presentation">
          <button
            ref={(node) => {
              optionRefs.current[index] = node;
            }}
            id={`${listboxId}-option-${option.partyRefId}`}
            type="button"
            role="option"
            aria-selected={isSelected}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 focus-visible:bg-gray-50 dark:hover:bg-dark-surface-2 dark:focus-visible:bg-dark-surface-2 ${highlightedIndex === index ? 'bg-iwana-primary-50/70 dark:bg-iwana-primary-950/30' : ''} ${interactiveFocusClassName}`}
            onMouseEnter={() => setHighlightedIndex(index)}
            onClick={() => toggleOption(option)}
          >
            <input
              type="checkbox"
              readOnly
              checked={isSelected}
              className="h-4 w-4 rounded border-gray-300"
              aria-hidden
              tabIndex={-1}
            />
            <span className="flex-1 font-medium text-gray-900 dark:text-white">
              {option.displayName}
            </span>
            <span className="text-xs text-iwana-secondary-700">
              {getPartyStatusLabel(option.status)}
            </span>
          </button>
        </li>
      );
    });
  }, [highlightedIndex, isLoading, listboxId, options, selectedIds, showList, toggleOption]);

  return (
    <div className="space-y-2 text-sm">
      <label
        htmlFor={inputId}
        id={`${inputId}-label`}
        className="font-medium text-gray-900 dark:text-white"
      >
        {label}
      </label>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((entry) => (
            <Badge key={entry.partyRefId} variant="neutral" className="gap-1">
              {entry.displayName}
              {!disabled ? (
                <button
                  type="button"
                  className={`ml-1 text-xs underline ${interactiveFocusClassName}`}
                  aria-label={`Quitar ${entry.displayName}`}
                  onClick={() => removeSelection(entry.partyRefId)}
                >
                  Quitar
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-labelledby={`${inputId}-label`}
          aria-expanded={showList}
          aria-controls={listboxId}
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
            setSearch(event.target.value);
            setIsOpen(event.target.value.trim().length > 0);
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
              toggleOption(options[highlightedIndex]);
              return;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setIsOpen(false);
            }
          }}
        />
      </div>

      {error ? (
        <PortalAlert variant="error" title="Búsqueda de proveedor" description={error} />
      ) : null}

      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`Resultados de ${label}`}
          aria-multiselectable="true"
          className="max-h-44 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface-3"
        >
          {listContent}
        </ul>
      ) : null}
    </div>
  );
}
