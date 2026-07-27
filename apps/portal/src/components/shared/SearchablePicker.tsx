'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Check, Search, X } from 'lucide-react';
import { Badge, Button, Input, SkeletonBlock, cn, interactiveFocusClassName } from '@iwana/ui';

/** Ítem canónico del listbox — alineado al contrato lookup UX §3.3. */
export interface SearchablePickerItem {
  id: string;
  label: string;
  /** Detalle corto; si existe, la fila muestra `label — sublabel`. */
  sublabel?: string | null | undefined;
}

export interface SearchablePickerSearchResult {
  /** Página de resultados de esta query (máx. dominio, tip. ≤20). */
  items: SearchablePickerItem[];
  /**
   * Conteo del universo filtrado por `q` (no del tenant completo).
   * Si `total > items.length` → estado S6.
   */
  total: number;
}

/**
 * Sustantivo del recurso — mismo criterio que PortalResourceNoun del pager.
 * Obligatorio: alimenta copy S1–S6 y aria-labels (CA-PICK-15).
 */
export interface SearchablePickerResourceNoun {
  singular: string;
  plural: string;
}

export type SearchablePickerLabels = {
  /** Default: `Buscar {singular}…` */
  placeholder: (resource: SearchablePickerResourceNoun) => string;
  /** Default: `Escribe al menos 2 caracteres` */
  threshold: string;
  /** Default: `Buscando…` (solo live region) */
  searching: string;
  /** Default: `No hay {plural} que coincidan` */
  empty: (resource: SearchablePickerResourceNoun) => string;
  /** Default: `No fue posible cargar {plural}.` */
  error: (resource: SearchablePickerResourceNoun) => string;
  /** Default: `Reintentar` */
  retry: string;
  /** Default: `Mostrando los {n} más relevantes. Afina la búsqueda.` */
  truncated: (n: number) => string;
  /** Default aria-label: `Limpiar selección` */
  clear: string;
  /** Default: `Resultados de {plural}` */
  listbox: (resource: SearchablePickerResourceNoun) => string;
  /**
   * Anuncio SR tras estabilizar.
   * Default: `{n} {singular|plural}` · truncado: `{n} de {total} {plural}. Afina la búsqueda.`
   */
  countAnnouncement: (args: {
    n: number;
    total: number;
    truncated: boolean;
    resource: SearchablePickerResourceNoun;
  }) => string;
};

export interface SearchablePickerBaseProps {
  /** REQUERIDO. Sustantivo para copy y a11y. */
  resource: SearchablePickerResourceNoun;
  /**
   * REQUERIDO. Lookup async. El consumidor cierra filtros de contexto
   * (`status`, `isActive`, …) dentro del callback — el primitive no los modela.
   * Debe respetar `signal` (AbortController) para cancelar respuestas obsoletas.
   */
  onSearch: (query: string, signal: AbortSignal) => Promise<SearchablePickerSearchResult>;
  /** Default 2 (CA-PICK-01). Contados sobre trim(). */
  minChars?: number | undefined;
  /** Default 300 (CA-PICK-02). */
  debounceMs?: number | undefined;
  placeholder?: string | undefined;
  label?: ReactNode | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
  /** Sobrescritura parcial de copy. Solo string / fn→string — nunca ReactNode. */
  labels?: Partial<SearchablePickerLabels> | undefined;
  /**
   * Slot opcional de fila. Default canónico: dos líneas / `label — sublabel`.
   * No puede omitir role=option ni el target ≥44×44.
   */
  renderItem?:
    | ((args: { item: SearchablePickerItem; active: boolean; selected: boolean }) => ReactNode)
    | undefined;
}

export interface SearchablePickerProps extends SearchablePickerBaseProps {
  /** id seleccionado o null. Controlado puro. */
  value: string | null;
  /**
   * Label (y sublabel opcional) del valor actual para S0 cuando el ítem
   * ya no está en `items` de la última query.
   */
  selectedItem?: Pick<SearchablePickerItem, 'label' | 'sublabel'> | null | undefined;
  /** null = limpiar. */
  onChange: (next: SearchablePickerItem | null) => void;
}

export interface SearchableMultiPickerProps extends SearchablePickerBaseProps {
  /** Selección actual (orden de inserción del operador). Controlado puro. */
  value: SearchablePickerItem[];
  onChange: (next: SearchablePickerItem[]) => void;
  /**
   * Quitar último chip con Backspace si el campo de búsqueda está vacío.
   * Default true (CA-PICK-16 / UX §5.3).
   */
  backspaceRemovesLast?: boolean | undefined;
}

const DEFAULT_MIN_CHARS = 2;
const DEFAULT_DEBOUNCE_MS = 300;

function buildDefaultLabels(): SearchablePickerLabels {
  return {
    placeholder: (resource) => `Buscar ${resource.singular}…`,
    threshold: 'Escribe al menos 2 caracteres',
    searching: 'Buscando…',
    empty: (resource) => `No hay ${resource.plural} que coincidan`,
    error: (resource) => `No fue posible cargar ${resource.plural}.`,
    retry: 'Reintentar',
    truncated: (n) => `Mostrando los ${n} más relevantes. Afina la búsqueda.`,
    clear: 'Limpiar selección',
    listbox: (resource) => `Resultados de ${resource.plural}`,
    countAnnouncement: ({ n, total, truncated, resource }) => {
      if (truncated) {
        return `${n} de ${total} ${resource.plural}. Afina la búsqueda.`;
      }
      const noun = n === 1 ? resource.singular : resource.plural;
      return `${n} ${noun}`;
    },
  };
}

function mergeLabels(partial?: Partial<SearchablePickerLabels>): SearchablePickerLabels {
  return { ...buildDefaultLabels(), ...partial };
}

function formatItemText(item: Pick<SearchablePickerItem, 'label' | 'sublabel'>): string {
  const sub = item.sublabel?.trim();
  return sub ? `${item.label} — ${sub}` : item.label;
}

function DefaultItemContent({ item }: { item: SearchablePickerItem }) {
  const sub = item.sublabel?.trim();
  if (!sub) {
    return <span className="font-medium">{item.label}</span>;
  }
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium">{item.label}</span>
      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{sub}</span>
    </span>
  );
}

type ListboxPhase = 'closed' | 'threshold' | 'loading' | 'results' | 'empty' | 'error';

const listboxSurfaceClassName = cn(
  'z-30 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-iwana-soft',
  'dark:border-dark-border dark:bg-dark-surface-3 dark:shadow-none',
  // ≥md: dropdown anclado; <md: panel inferior usable con teclado virtual
  'fixed inset-x-0 bottom-0 max-h-[min(70vh,24rem)] md:absolute md:inset-x-auto md:bottom-auto md:left-0 md:right-0 md:top-full md:mt-1 md:max-h-60',
);

function ListboxShell({
  id,
  label,
  multi,
  busy,
  children,
}: {
  id: string;
  label: string;
  multi?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={label}
      aria-multiselectable={multi ? true : undefined}
      aria-busy={busy || undefined}
      className={cn(listboxSurfaceClassName, 'overflow-y-auto p-1')}
    >
      {children}
    </ul>
  );
}

function ThresholdMessage({ text }: { text: string }) {
  return (
    <li role="presentation" className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
      {text}
    </li>
  );
}

function LoadingRows() {
  return (
    <li role="presentation" className="space-y-2 px-3 py-3" aria-hidden="true">
      <SkeletonBlock className="h-4 w-3/4" />
      <SkeletonBlock className="h-4 w-1/2" />
      <SkeletonBlock className="h-4 w-2/3" />
    </li>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <li role="presentation" className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
      {text}
    </li>
  );
}

function TruncationBand({ text }: { text: string }) {
  return (
    <li
      role="presentation"
      className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500 dark:border-dark-border dark:text-gray-400"
    >
      {text}
    </li>
  );
}

function ErrorPanel({
  message,
  retryLabel,
  onRetry,
  retryRef,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  retryRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <li role="presentation" className="space-y-2 px-3 py-3">
      <p className="text-sm text-gray-700 dark:text-gray-200">{message}</p>
      <Button
        ref={retryRef}
        type="button"
        variant="secondary"
        size="sm"
        className={interactiveFocusClassName}
        onClick={onRetry}
      >
        {retryLabel}
      </Button>
    </li>
  );
}

function optionId(listboxId: string, itemId: string): string {
  return `${listboxId}-option-${itemId}`;
}

export function SearchablePicker({
  resource,
  onSearch,
  value,
  selectedItem = null,
  onChange,
  minChars = DEFAULT_MIN_CHARS,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  placeholder,
  label,
  disabled = false,
  id,
  className,
  labels: labelsPartial,
  renderItem,
}: SearchablePickerProps) {
  const generatedId = useId();
  const inputId = id ?? `searchable-picker-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const liveId = `${inputId}-live`;
  const labels = useMemo(() => mergeLabels(labelsPartial), [labelsPartial]);
  const resolvedPlaceholder = placeholder ?? labels.placeholder(resource);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const retryRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const failedRetryCountRef = useRef(0);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const resourceRef = useRef(resource);
  resourceRef.current = resource;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const displayValue = editing || !value || !selectedItem ? query : selectedItem.label;

  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  const [items, setItems] = useState<SearchablePickerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const trimmed = query.trim();
  const meetsThreshold = trimmed.length >= minChars;

  const abortPending = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const resetLookupUi = useCallback(() => {
    setItems([]);
    setTotal(0);
    setLoading(false);
    setError(false);
  }, []);

  const executeSearch = useCallback(
    async (q: string) => {
      abortPending();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      const currentLabels = labelsRef.current;
      const currentResource = resourceRef.current;

      setLoading(true);
      setError(false);
      setAnnouncement(currentLabels.searching);

      try {
        const result = await onSearchRef.current(q, controller.signal);
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        setItems(result.items);
        setTotal(result.total);
        setLoading(false);
        setActiveIndex(0);
        const truncated = result.total > result.items.length;
        setAnnouncement(
          currentLabels.countAnnouncement({
            n: result.items.length,
            total: result.total,
            truncated,
            resource: currentResource,
          }),
        );
        failedRetryCountRef.current = 0;
      } catch (err) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        const isAbort =
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError');
        if (isAbort) {
          return;
        }
        setItems([]);
        setTotal(0);
        setLoading(false);
        setError(true);
        setAnnouncement('');
        if (failedRetryCountRef.current > 0) {
          queueMicrotask(() => retryRef.current?.focus());
        }
      }
    },
    [abortPending],
  );

  const executeSearchRef = useRef(executeSearch);
  executeSearchRef.current = executeSearch;

  // Single-picker search effect
  useEffect(() => {
    if (disabled || !open) {
      abortPending();
      if (!open) {
        setLoading(false);
      }
      return;
    }

    if (!meetsThreshold) {
      abortPending();
      resetLookupUi();
      setAnnouncement('');
      return;
    }

    if (debounceMs <= 0) {
      void executeSearchRef.current(trimmed);
      return;
    }

    const handle = window.setTimeout(() => {
      void executeSearchRef.current(trimmed);
    }, debounceMs);

    return () => {
      window.clearTimeout(handle);
      abortPending();
    };
  }, [disabled, open, meetsThreshold, trimmed, debounceMs, abortPending, resetLookupUi]);

  useEffect(() => {
    return () => {
      abortPending();
    };
  }, [abortPending]);

  // Preload items on mount when minChars=0, so the picker shows results
  // immediately on open without waiting for the debounced search.
  const [preloaded, setPreloaded] = useState(false);
  useEffect(() => {
    if (minChars > 0 || disabled) return;
    void executeSearchRef.current('').then(() => setPreloaded(true));
  }, [minChars, disabled]);

  // Sync display when value/selectedItem change from outside while not editing.
  useEffect(() => {
    if (!editing && selectedItem) {
      setQuery(selectedItem.label);
    }
    if (!editing && !value) {
      setQuery('');
    }
  }, [value, selectedItem, editing]);

  const phase: ListboxPhase = !open
    ? 'closed'
    : error
      ? 'error'
      : !meetsThreshold
        ? 'threshold'
        : loading
          ? 'loading'
          : items.length === 0
            ? 'empty'
            : 'results';

  const truncated = phase === 'results' && total > items.length;
  const showList = open && !disabled;
  const activeDescendant =
    phase === 'results' && items[activeIndex]
      ? optionId(listboxId, items[activeIndex].id)
      : undefined;

  const closeListbox = useCallback(
    (opts?: { restoreSelection?: boolean }) => {
      setOpen(false);
      setEditing(false);
      setError(false);
      abortPending();
      setLoading(false);
      if (opts?.restoreSelection && value && selectedItem) {
        setQuery(selectedItem.label);
      }
    },
    [abortPending, value, selectedItem],
  );

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeListbox({ restoreSelection: true });
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, closeListbox]);

  function selectItem(item: SearchablePickerItem) {
    onChange(item);
    setQuery(item.label);
    setEditing(false);
    setOpen(false);
    setError(false);
    abortPending();
    setLoading(false);
    inputRef.current?.focus();
  }

  function handleClear() {
    onChange(null);
    setQuery('');
    setEditing(false);
    setOpen(false);
    resetLookupUi();
    setAnnouncement('');
    abortPending();
    inputRef.current?.focus();
  }

  function moveHighlight(delta: number) {
    if (items.length === 0) return;
    setActiveIndex((current) => {
      const next = (current + delta + items.length) % items.length;
      optionRefs.current[next]?.scrollIntoView?.({ block: 'nearest' });
      return next;
    });
  }

  function handleRetry() {
    failedRetryCountRef.current += 1;
    void executeSearch(trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setEditing(true);
      if (phase === 'results') moveHighlight(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setEditing(true);
      if (phase === 'results') moveHighlight(-1);
      return;
    }
    if (event.key === 'Home' && open && phase === 'results') {
      event.preventDefault();
      setActiveIndex(0);
      optionRefs.current[0]?.scrollIntoView?.({ block: 'nearest' });
      return;
    }
    if (event.key === 'End' && open && phase === 'results') {
      event.preventDefault();
      const last = items.length - 1;
      setActiveIndex(last);
      optionRefs.current[last]?.scrollIntoView?.({ block: 'nearest' });
      return;
    }
    if (event.key === 'Enter' && open && phase === 'results' && items[activeIndex]) {
      event.preventDefault();
      selectItem(items[activeIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeListbox({ restoreSelection: true });
      return;
    }
    if (event.key === 'Tab') {
      closeListbox({ restoreSelection: true });
    }
  }

  return (
    <div ref={rootRef} className={cn('relative w-full space-y-1', className)}>
      <Input
        ref={inputRef}
        id={inputId}
        label={label}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        aria-describedby={liveId}
        autoComplete="off"
        placeholder={resolvedPlaceholder}
        value={displayValue}
        disabled={disabled}
        startIcon={<Search className="h-4 w-4" aria-hidden />}
        endAdornment={
          value && !disabled ? (
            <button
              type="button"
              aria-label={labels.clear}
              className={cn(
                'inline-flex min-h-11 min-w-11 items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                interactiveFocusClassName,
              )}
              onClick={handleClear}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null
        }
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setEditing(true);
          if (value && selectedItem && query === selectedItem.label) {
            // Mantener label visible hasta que el operador escriba.
          }
        }}
        onChange={(event) => {
          const next = event.target.value;
          setEditing(true);
          setQuery(next);
          setOpen(true);
          setError(false);
          if (value) {
            onChange(null);
          }
        }}
        onKeyDown={handleKeyDown}
      />

      <div id={liveId} className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {showList ? (
        <ListboxShell id={listboxId} label={labels.listbox(resource)} busy={phase === 'loading'}>
          {phase === 'threshold' ? <ThresholdMessage text={labels.threshold} /> : null}
          {phase === 'loading' ? <LoadingRows /> : null}
          {phase === 'empty' ? <EmptyMessage text={labels.empty(resource)} /> : null}
          {phase === 'error' ? (
            <ErrorPanel
              message={labels.error(resource)}
              retryLabel={labels.retry}
              onRetry={handleRetry}
              retryRef={retryRef}
            />
          ) : null}
          {phase === 'results'
            ? items.map((item, index) => {
                const selected = item.id === value;
                const active = index === activeIndex;
                return (
                  <li key={item.id} role="presentation">
                    <button
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      id={optionId(listboxId, item.id)}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-label={formatItemText(item)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200',
                        active && 'bg-iwana-primary-50/70 dark:bg-iwana-primary-950/30',
                        selected && 'text-iwana-secondary-700 dark:text-iwana-secondary-400',
                        interactiveFocusClassName,
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectItem(item)}
                    >
                      <Check
                        className={cn('h-3.5 w-3.5 shrink-0', selected ? '' : 'invisible')}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        {renderItem ? (
                          renderItem({ item, active, selected })
                        ) : (
                          <DefaultItemContent item={item} />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })
            : null}
          {truncated ? <TruncationBand text={labels.truncated(items.length)} /> : null}
        </ListboxShell>
      ) : null}
    </div>
  );
}

export function SearchableMultiPicker({
  resource,
  onSearch,
  value,
  onChange,
  minChars = DEFAULT_MIN_CHARS,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  placeholder,
  label,
  disabled = false,
  id,
  className,
  labels: labelsPartial,
  renderItem,
  backspaceRemovesLast = true,
}: SearchableMultiPickerProps) {
  const generatedId = useId();
  const inputId = id ?? `searchable-multi-picker-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const liveId = `${inputId}-live`;
  const labels = useMemo(() => mergeLabels(labelsPartial), [labelsPartial]);
  const resolvedPlaceholder = placeholder ?? labels.placeholder(resource);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const retryRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const failedRetryCountRef = useRef(0);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const resourceRef = useRef(resource);
  resourceRef.current = resource;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedIds = useMemo(() => new Set(value.map((item) => item.id)), [value]);

  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  const [items, setItems] = useState<SearchablePickerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const trimmed = query.trim();
  const meetsThreshold = trimmed.length >= minChars;

  const abortPending = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const resetLookupUi = useCallback(() => {
    setItems([]);
    setTotal(0);
    setLoading(false);
    setError(false);
  }, []);

  const executeSearch = useCallback(
    async (q: string) => {
      abortPending();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      const currentLabels = labelsRef.current;
      const currentResource = resourceRef.current;

      setLoading(true);
      setError(false);
      setAnnouncement(currentLabels.searching);

      try {
        const result = await onSearchRef.current(q, controller.signal);
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        setItems(result.items);
        setTotal(result.total);
        setLoading(false);
        setActiveIndex(0);
        const truncated = result.total > result.items.length;
        setAnnouncement(
          currentLabels.countAnnouncement({
            n: result.items.length,
            total: result.total,
            truncated,
            resource: currentResource,
          }),
        );
        failedRetryCountRef.current = 0;
      } catch (err) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        const isAbort =
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError');
        if (isAbort) {
          return;
        }
        setItems([]);
        setTotal(0);
        setLoading(false);
        setError(true);
        setAnnouncement('');
        if (failedRetryCountRef.current > 0) {
          queueMicrotask(() => retryRef.current?.focus());
        }
      }
    },
    [abortPending],
  );

  const executeSearchRef = useRef(executeSearch);
  executeSearchRef.current = executeSearch;

  // Multi-picker search effect
  useEffect(() => {
    if (disabled || !open) {
      abortPending();
      if (!open) {
        setLoading(false);
      }
      return;
    }

    if (!meetsThreshold) {
      abortPending();
      resetLookupUi();
      setAnnouncement('');
      return;
    }

    if (debounceMs <= 0) {
      void executeSearchRef.current(trimmed);
      return;
    }

    const handle = window.setTimeout(() => {
      void executeSearchRef.current(trimmed);
    }, debounceMs);

    return () => {
      window.clearTimeout(handle);
      abortPending();
    };
  }, [disabled, open, meetsThreshold, trimmed, debounceMs, abortPending, resetLookupUi]);

  useEffect(() => {
    return () => {
      abortPending();
    };
  }, [abortPending]);

  // Multi-picker outside click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setError(false);
        abortPending();
        setLoading(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, abortPending]);

  const phase: ListboxPhase = !open
    ? 'closed'
    : error
      ? 'error'
      : !meetsThreshold
        ? 'threshold'
        : loading
          ? 'loading'
          : items.length === 0
            ? 'empty'
            : 'results';

  const truncated = phase === 'results' && total > items.length;
  const showList = open && !disabled;
  const activeDescendant =
    phase === 'results' && items[activeIndex]
      ? optionId(listboxId, items[activeIndex].id)
      : undefined;

  function addItem(item: SearchablePickerItem) {
    if (selectedIds.has(item.id)) {
      onChange(value.filter((entry) => entry.id !== item.id));
    } else {
      onChange([...value, item]);
    }
    setQuery('');
    // Multi: permanece abierto (CA-PICK-16); tras limpiar query → S1.
    setOpen(true);
    setError(false);
    inputRef.current?.focus();
  }

  function removeItem(itemId: string) {
    onChange(value.filter((entry) => entry.id !== itemId));
  }

  function moveHighlight(delta: number) {
    if (items.length === 0) return;
    setActiveIndex((current) => {
      const next = (current + delta + items.length) % items.length;
      optionRefs.current[next]?.scrollIntoView?.({ block: 'nearest' });
      return next;
    });
  }

  function handleRetry() {
    failedRetryCountRef.current += 1;
    void executeSearch(trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (
      event.key === 'Backspace' &&
      backspaceRemovesLast &&
      query.length === 0 &&
      value.length > 0
    ) {
      event.preventDefault();
      onChange(value.slice(0, -1));
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      if (phase === 'results') moveHighlight(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (phase === 'results') moveHighlight(-1);
      return;
    }
    if (event.key === 'Home' && open && phase === 'results') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End' && open && phase === 'results') {
      event.preventDefault();
      setActiveIndex(items.length - 1);
      return;
    }
    if (event.key === 'Enter' && open && phase === 'results' && items[activeIndex]) {
      event.preventDefault();
      addItem(items[activeIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setError(false);
      abortPending();
      setLoading(false);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      setError(false);
      abortPending();
      setLoading(false);
    }
  }

  return (
    <div ref={rootRef} className={cn('relative w-full space-y-2', className)}>
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      ) : null}

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <Badge
              key={item.id}
              variant="lime"
              className="inline-flex max-w-full items-center gap-1 pr-1"
            >
              <span className="truncate">{item.label}</span>
              {!disabled ? (
                <button
                  type="button"
                  aria-label={`Quitar ${item.label}`}
                  className={cn(
                    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-iwana-secondary-900/70 hover:text-iwana-secondary-900 dark:text-iwana-secondary-400',
                    interactiveFocusClassName,
                  )}
                  onClick={() => removeItem(item.id)}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}

      <Input
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        aria-describedby={liveId}
        autoComplete="off"
        placeholder={resolvedPlaceholder}
        value={query}
        disabled={disabled}
        startIcon={<Search className="h-4 w-4" aria-hidden />}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setError(false);
        }}
        onKeyDown={handleKeyDown}
      />

      <div id={liveId} className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {showList ? (
        <ListboxShell
          id={listboxId}
          label={labels.listbox(resource)}
          multi
          busy={phase === 'loading'}
        >
          {phase === 'threshold' ? <ThresholdMessage text={labels.threshold} /> : null}
          {phase === 'loading' ? <LoadingRows /> : null}
          {phase === 'empty' ? <EmptyMessage text={labels.empty(resource)} /> : null}
          {phase === 'error' ? (
            <ErrorPanel
              message={labels.error(resource)}
              retryLabel={labels.retry}
              onRetry={handleRetry}
              retryRef={retryRef}
            />
          ) : null}
          {phase === 'results'
            ? items.map((item, index) => {
                const selected = selectedIds.has(item.id);
                const active = index === activeIndex;
                return (
                  <li key={item.id} role="presentation">
                    <button
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      id={optionId(listboxId, item.id)}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-label={formatItemText(item)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200',
                        active && 'bg-iwana-primary-50/70 dark:bg-iwana-primary-950/30',
                        selected && 'text-iwana-secondary-700 dark:text-iwana-secondary-400',
                        interactiveFocusClassName,
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => addItem(item)}
                    >
                      <Check
                        className={cn('h-3.5 w-3.5 shrink-0', selected ? '' : 'invisible')}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        {renderItem ? (
                          renderItem({ item, active, selected })
                        ) : (
                          <DefaultItemContent item={item} />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })
            : null}
          {truncated ? <TruncationBand text={labels.truncated(items.length)} /> : null}
        </ListboxShell>
      ) : null}
    </div>
  );
}
