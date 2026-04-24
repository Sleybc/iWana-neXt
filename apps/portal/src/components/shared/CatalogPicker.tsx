'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

// ── Single-select ─────────────────────────────────────────────────────────────

export interface CatalogPickerProps<T> {
  items: T[];
  selectedId: string | null;
  onChange: (item: T | null) => void;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getDescription?: (item: T) => string | null | undefined;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CatalogPicker<T>({
  items,
  selectedId,
  onChange,
  getKey,
  getLabel,
  getDescription,
  placeholder = 'Seleccionar...',
  disabled = false,
  className,
}: CatalogPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(
    () => (selectedId ? (items.find((item) => getKey(item) === selectedId) ?? null) : null),
    [items, selectedId, getKey],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter((item) => {
      const label = getLabel(item).toLowerCase();
      const desc = (getDescription?.(item) ?? '').toLowerCase();
      return label.includes(q) || desc.includes(q);
    });
  }, [items, search, getLabel, getDescription]);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  return (
    <div className={['relative', className].join(' ')}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm transition hover:border-iwana-secondary-700 focus:outline-none focus:ring-2 focus:ring-iwana-secondary-700/30 disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface dark:text-white"
      >
        <span className="flex-1 truncate">
          {selected ? getLabel(selected) : <span className="text-gray-400">{placeholder}</span>}
        </span>
        {selected && !disabled ? (
          <span
            role="button"
            aria-label="Limpiar selección"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onChange(null)}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="cursor-pointer text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : (
          <ChevronDown
            className={[
              'h-4 w-4 shrink-0 text-gray-400 transition-transform',
              open ? 'rotate-180' : '',
            ].join(' ')}
            aria-hidden
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} aria-hidden />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-dark-border dark:bg-dark-surface-2">
            {/* Search */}
            <div className="border-b border-gray-100 p-2 dark:border-dark-border">
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 dark:bg-dark-surface">
                <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  autoFocus
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-white"
                  aria-label="Buscar en catálogo"
                />
              </div>
            </div>

            {/* Options */}
            <ul className="max-h-52 overflow-y-auto p-1" role="listbox" aria-label="Opciones">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  Sin resultados
                </li>
              ) : (
                filtered.map((item) => {
                  const key = getKey(item);
                  const isSelected = key === selectedId;
                  return (
                    <li
                      key={key}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(isSelected ? null : item);
                        close();
                      }}
                      className={[
                        'flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm transition',
                        isSelected
                          ? 'bg-iwana-secondary/10 text-iwana-secondary-700'
                          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-dark-border',
                      ].join(' ')}
                    >
                      <Check
                        className={[
                          'mt-0.5 h-3.5 w-3.5 shrink-0',
                          isSelected ? '' : 'invisible',
                        ].join(' ')}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="font-medium">{getLabel(item)}</p>
                        {getDescription?.(item) && (
                          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                            {getDescription(item)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// ── Multi-select ──────────────────────────────────────────────────────────────

export interface MultiCatalogPickerProps<T> {
  items: T[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getDescription?: (item: T) => string | null | undefined;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiCatalogPicker<T>({
  items,
  selectedIds,
  onChange,
  getKey,
  getLabel,
  getDescription,
  placeholder = 'Seleccionar...',
  disabled = false,
  className,
}: MultiCatalogPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(getKey(item))),
    [items, selectedIds, getKey],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter((item) => {
      const label = getLabel(item).toLowerCase();
      const desc = (getDescription?.(item) ?? '').toLowerCase();
      return label.includes(q) || desc.includes(q);
    });
  }, [items, search, getLabel, getDescription]);

  const toggle = (item: T) => {
    const key = getKey(item);
    if (selectedIds.includes(key)) {
      onChange(selectedIds.filter((id) => id !== key));
    } else {
      onChange([...selectedIds, key]);
    }
  };

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  return (
    <div className={['relative', className].join(' ')}>
      {/* Trigger — div en lugar de button para evitar <button> anidados (chips de quitar) */}
      <div
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-multiselectable="true"
        aria-disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
          if (e.key === 'Escape') close();
        }}
        className={[
          'flex min-h-[42px] w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm transition hover:border-iwana-secondary-700 focus:outline-none focus:ring-2 focus:ring-iwana-secondary-700/30',
          disabled ? 'pointer-events-none opacity-50' : '',
          'dark:border-dark-border dark:bg-dark-surface dark:text-white',
        ]
          .join(' ')
          .trim()}
      >
        {selectedItems.length === 0 ? (
          <span className="flex-1 text-gray-400">{placeholder}</span>
        ) : (
          selectedItems.map((item) => {
            const key = getKey(item);
            return (
              <span
                key={key}
                className="flex items-center gap-1 rounded-md bg-iwana-secondary/15 px-2 py-0.5 text-xs font-medium text-iwana-secondary-700"
              >
                {getLabel(item)}
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Quitar ${getLabel(item)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(selectedIds.filter((id) => id !== key));
                    }}
                    className="ml-0.5 text-iwana-secondary-700/60 hover:text-iwana-secondary-700"
                  >
                    <X className="h-2.5 w-2.5" aria-hidden />
                  </button>
                )}
              </span>
            );
          })
        )}
        <ChevronDown
          className={[
            'ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform',
            open ? 'rotate-180' : '',
          ].join(' ')}
          aria-hidden
        />
      </div>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} aria-hidden />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-dark-border dark:bg-dark-surface-2">
            <div className="border-b border-gray-100 p-2 dark:border-dark-border">
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 dark:bg-dark-surface">
                <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  autoFocus
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-white"
                  aria-label="Buscar en catálogo"
                />
              </div>
            </div>
            <ul
              className="max-h-52 overflow-y-auto p-1"
              role="listbox"
              aria-multiselectable="true"
              aria-label="Opciones"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  Sin resultados
                </li>
              ) : (
                filtered.map((item) => {
                  const key = getKey(item);
                  const isSelected = selectedIds.includes(key);
                  return (
                    <li
                      key={key}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggle(item)}
                      className={[
                        'flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm transition',
                        isSelected
                          ? 'bg-iwana-secondary/10 text-iwana-secondary-700'
                          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-dark-border',
                      ].join(' ')}
                    >
                      <Check
                        className={[
                          'mt-0.5 h-3.5 w-3.5 shrink-0',
                          isSelected ? '' : 'invisible',
                        ].join(' ')}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="font-medium">{getLabel(item)}</p>
                        {getDescription?.(item) && (
                          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                            {getDescription(item)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
