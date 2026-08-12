'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  label?: string;
  error?: string | undefined;
  disabled?: boolean;
  className?: string;
}

/**
 * Multi-select combobox del design system iWana neXt.
 * Dropdown filtrable con chips removibles y agrupación por categoría.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Buscar...',
  label,
  error,
  disabled = false,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Limpiar búsqueda al cerrar
  React.useEffect(() => {
    if (!open) setSearch('');
    else setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const toggle = (optValue: string) => {
    const next = value.includes(optValue)
      ? value.filter((v) => v !== optValue)
      : [...value, optValue];
    onChange(next);
  };

  const remove = (e: React.MouseEvent, optValue: string) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== optValue));
  };

  // Filtrar por búsqueda y agrupar
  const filtered = React.useMemo(() => {
    const term = search.toLowerCase().trim();
    const matched = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;

    // Agrupar
    const groups: Map<string, MultiSelectOption[]> = new Map();
    for (const opt of matched) {
      const g = opt.group ?? '';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(opt);
    }
    return groups;
  }, [options, search]);

  const selectedLabels = React.useMemo(
    () => value.map((v) => options.find((o) => o.value === v)?.label ?? v).filter(Boolean),
    [value, options],
  );

  const hasOptions = Array.from(filtered.values()).some((g) => g.length > 0);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600 dark:text-gray-300">
          {label}
        </span>
      )}

      <PopoverPrimitive.Root
        open={open}
        onOpenChange={(v) => {
          if (!disabled) setOpen(v);
        }}
      >
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-2xl border px-3 py-2 text-left text-sm transition-colors',
              'border-gray-200 bg-white dark:border-iwana-neutral-600 dark:bg-dark-surface-3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-secondary/30',
              open && 'border-iwana-secondary ring-2 ring-iwana-secondary/30',
              error && 'border-red-400 focus-visible:ring-red-200',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {/* Chips de seleccionados */}
            {selectedLabels.length > 0 ? (
              selectedLabels.map((lbl, i) => {
                const optValue = value[i];
                if (!optValue) return null;
                return (
                  <span
                    key={optValue}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#EEEEFA] px-2 py-0.5 text-xs font-medium text-[#17163A] dark:bg-iwana-primary-800/50 dark:text-iwana-primary-200"
                  >
                    {lbl}
                    {!disabled && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Quitar ${lbl}`}
                        className="ml-0.5 rounded-full hover:text-red-500 focus:outline-none"
                        onClick={(e) => remove(e, optValue)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ')
                            remove(e as unknown as React.MouseEvent, optValue);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                );
              })
            ) : (
              <span className="text-gray-500 dark:text-gray-400">{placeholder}</span>
            )}

            {/* Ícono de apertura */}
            <ChevronDown
              className={cn(
                'ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150',
                open && 'rotate-180',
              )}
            />
          </button>
        </PopoverPrimitive.Trigger>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className={cn(
              'z-[1200] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg',
              'dark:border-dark-border-2 dark:bg-dark-surface-2',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
            )}
          >
            {/* Buscador */}
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-dark-border">
              <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-gray-100"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Lista de opciones agrupadas */}
            <div className="max-h-60 overflow-y-auto py-1">
              {!hasOptions && (
                <p className="px-3 py-2 text-center text-sm text-gray-400">Sin resultados.</p>
              )}

              {Array.from(filtered.entries()).map(([group, groupOptions]) => {
                if (groupOptions.length === 0) return null;

                return (
                  <div key={group}>
                    {group && (
                      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-400">
                        {group}
                      </p>
                    )}
                    {groupOptions.map((opt) => {
                      const selected = value.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          disabled={opt.disabled}
                          onClick={() => toggle(opt.value)}
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                            'text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-dark-surface-3',
                            selected && 'bg-[#F5F5FD] dark:bg-iwana-primary-900/20',
                            opt.disabled && 'cursor-not-allowed opacity-40',
                          )}
                        >
                          {/* Checkbox visual */}
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                              selected
                                ? 'border-iwana-primary bg-iwana-primary text-white'
                                : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-transparent',
                            )}
                          >
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Footer con contador */}
            {value.length > 0 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-3 py-1.5 dark:border-dark-border">
                <span className="text-xs text-gray-400">
                  {value.length} seleccionado{value.length !== 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Limpiar
                </button>
              </div>
            )}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
