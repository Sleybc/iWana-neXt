'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Input, Select, cn } from '@iwana/ui';
import type { ListMeta, SubscriberListItem } from '@iwana/shared';
import { CustomerSegment, PersonType, SubscriberStatus } from '@iwana/shared';
import { CircleDashed, Plus } from 'lucide-react';
import { ApiError, type ListSubscribersParams, subscribersApi } from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { PrivacyMarks } from '@/components/privacy/PrivacyMarks';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalDataTableSortableHead,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalPanel,
  PortalSkeletonBlock,
  PortalTablePager,
  portalDataBusyRegionClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  CUSTOMER_SEGMENT_META,
  CUSTOMER_SEGMENT_OPTIONS,
  PERSON_TYPE_META,
  PERSON_TYPE_OPTIONS,
  STRATUM_OPTIONS,
  SUBSCRIBER_STATUS_META,
  SUBSCRIBER_STATUS_OPTIONS,
  formatDocumentDisplay,
  formatSubscriberLocation,
  formatSubscriberDate,
  formatSubscriberName,
} from './subscriber-ui';

const SUBSCRIBERS_RESOURCE = { singular: 'suscriptor', plural: 'suscriptores' } as const;

const FILTER_KEYS = [
  'search',
  'status',
  'personType',
  'customerSegment',
  'stratum',
  'mode',
] as const;

const SEARCH_MODES = [
  { value: 'text', label: 'Texto', placeholder: 'Nombre, razón social o NIT', empty: 'texto' },
  {
    value: 'document',
    label: 'Documento',
    placeholder: 'Cédula, NIT o pasaporte',
    empty: 'documento',
  },
  { value: 'phone', label: 'Teléfono', placeholder: 'Teléfono', empty: 'teléfono' },
  { value: 'email', label: 'Correo', placeholder: 'Correo', empty: 'correo' },
] as const;
type SearchMode = (typeof SEARCH_MODES)[number]['value'];

/** Rótulos visibles por campo lógico — solo se activan si `sortableFields` los autoriza. */
const SORTABLE_COLUMN_LABELS: Record<string, string> = {
  createdAt: 'Creado',
  status: 'Estado',
  customerSegment: 'Segmento',
  personType: 'Tipo',
};

const PAGE_OUT_OF_RANGE_NOTICE = 'Esa página ya no existe. Mostrando la última página disponible.';

function mapError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'No fue posible cargar los suscriptores. Intenta de nuevo.';
}

function buildPageMetaFixture(
  partial: Partial<ListMeta>,
  dataLength: number,
  limit: number,
): ListMeta {
  return normalizeListMeta(
    {
      mode: 'page',
      page: partial.page ?? 1,
      limit: partial.limit ?? limit,
      total: partial.total ?? dataLength,
      ...(partial.totalPages !== undefined ? { totalPages: partial.totalPages } : {}),
      ...(partial.hasMore !== undefined ? { hasMore: partial.hasMore } : {}),
      nextCursor: null,
      totalIsEstimate: false,
      capabilities: partial.capabilities ?? {
        randomAccess: true,
        sortableFields: [],
      },
      sort: partial.sort ?? null,
    },
    { dataLength, limit },
  );
}

function SubscribersListClientInner() {
  const tableShellRef = useRef<HTMLDivElement | null>(null);
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const requestIdRef = useRef(0);
  const searchInFlightRef = useRef(false);

  const {
    page,
    pageSize,
    sort,
    sortBy,
    sortDir,
    filters,
    setPage,
    setPageSize,
    setSort,
    setFilters,
    setQuery,
  } = useTableQueryState({
    filterKeys: FILTER_KEYS,
    defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
  });

  const [records, setRecords] = useState<SubscriberListItem[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(() =>
    SEARCH_MODES.some((item) => item.value === filters.mode && item.value !== 'text')
      ? ''
      : (filters.search ?? ''),
  );
  const [exactSearched, setExactSearched] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const urlMode = (SEARCH_MODES.find((item) => item.value === filters.mode) ?? SEARCH_MODES[0])
    .value;
  const [selectedMode, setSelectedMode] = useState<SearchMode>(urlMode);
  const selectedModeRef = useRef<SearchMode>(urlMode);
  const mode = SEARCH_MODES.find((item) => item.value === selectedMode) ?? SEARCH_MODES[0];
  const exactMode = mode.value !== 'text';

  const urlSearch = filters.search ?? '';
  const statusFilter = filters.status ?? '';
  const personTypeFilter = filters.personType ?? '';
  const segmentFilter = filters.customerSegment ?? '';
  const stratumFilter = filters.stratum ?? '';

  const sortableFields = meta.capabilities.sortableFields;
  const canSort = sortableFields.length > 0;
  const activeSort = sort && sortableFields.includes(sort.by) ? sort : null;

  useEffect(() => {
    // La confirmación de una navegación propia no vuelve a limpiar la entrada.
    // Atrás y Adelante sí sincronizan una selección distinta desde la URL.
    if (selectedModeRef.current !== urlMode) {
      selectedModeRef.current = urlMode;
      setSelectedMode(urlMode);
      setSearchDraft('');
    }
  }, [urlMode]);

  useEffect(() => {
    if (!exactMode && selectedMode === urlMode) setSearchDraft(urlSearch);
  }, [urlSearch, exactMode, selectedMode, urlMode]);

  useEffect(
    () => () => {
      ++requestIdRef.current;
    },
    [],
  );

  useEffect(() => {
    if (exactMode) return;
    const timeout = window.setTimeout(() => {
      const next = searchDraft.trim();
      if (next === urlSearch) return;
      setFilters({ search: next || null });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchDraft, setFilters, urlSearch, exactMode]);

  const listParams = useMemo((): ListSubscribersParams => {
    const params: ListSubscribersParams = {
      page,
      limit: pageSize,
    };
    if (urlSearch) params.search = urlSearch;
    if (statusFilter) params.status = statusFilter as SubscriberStatus;
    if (personTypeFilter) params.personType = personTypeFilter as PersonType;
    if (segmentFilter) params.customerSegment = segmentFilter as CustomerSegment;
    if (stratumFilter) params.stratum = Number(stratumFilter);
    // El BE ignora sortBy fuera de sortableFields (Ola 2 deuda: hoy []).
    if (sortBy && sortDir) {
      params.sortBy = sortBy;
      params.sortDir = sortDir;
    }
    return params;
  }, [
    page,
    pageSize,
    personTypeFilter,
    segmentFilter,
    sortBy,
    sortDir,
    statusFilter,
    stratumFilter,
    urlSearch,
  ]);

  const loadPage = useCallback(
    async (params: ListSubscribersParams, opts?: { soft?: boolean }) => {
      const requestId = ++requestIdRef.current;
      const soft = opts?.soft === true && hasLoadedOnceRef.current;
      if (soft) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      setError(null);

      try {
        const response = await subscribersApi.list(params);
        if (requestId !== requestIdRef.current) return;
        const nextMeta = normalizeListMeta(response.meta, {
          dataLength: response.data.length,
          ...(params.limit !== undefined ? { limit: params.limit } : {}),
        });
        const requestedPage = params.page ?? 1;
        const totalPages = nextMeta.totalPages ?? 0;

        if (totalPages > 0 && requestedPage > totalPages) {
          if (!outOfRangeShownRef.current) {
            outOfRangeShownRef.current = true;
            setOutOfRangeNotice(PAGE_OUT_OF_RANGE_NOTICE);
          }
          setQuery({ page: totalPages }, { history: 'replace' });
          return;
        }

        if (response.data.length === 0 && requestedPage > 1 && nextMeta.total > 0) {
          const fallback = Math.max(1, totalPages || requestedPage - 1);
          setQuery({ page: fallback }, { history: 'replace' });
          return;
        }

        setRecords(response.data);
        setMeta(
          buildPageMetaFixture(
            { ...nextMeta, page: nextMeta.page ?? requestedPage },
            response.data.length,
            params.limit ?? PORTAL_DEFAULT_PAGE_SIZE,
          ),
        );
        hasLoadedOnceRef.current = true;
      } catch (loadError) {
        if (requestId !== requestIdRef.current) return;
        setError(mapError(loadError));
        if (!soft) {
          setRecords([]);
          setMeta(EMPTY_LIST_META);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [setQuery],
  );

  useEffect(() => {
    if (exactMode) return;
    const requestIdState = requestIdRef;
    void loadPage(listParams, { soft: true });
    return () => {
      ++requestIdState.current;
    };
  }, [listParams, loadPage, exactMode]);

  useEffect(() => {
    if (exactMode) {
      ++requestIdRef.current;
      searchInFlightRef.current = false;
      setRecords([]);
      setMeta(EMPTY_LIST_META);
      setInitialLoading(false);
      setRefreshing(false);
      setError(null);
      setExactSearched(false);
      return;
    }
  }, [exactMode, mode.value]);

  function changeMode(nextMode: SearchMode) {
    if (nextMode === mode.value) return;
    ++requestIdRef.current;
    searchInFlightRef.current = false;
    selectedModeRef.current = nextMode;
    setSelectedMode(nextMode);
    setSearchDraft('');
    setRecords([]);
    setMeta(EMPTY_LIST_META);
    setError(null);
    setValidationError(null);
    setOutOfRangeNotice(null);
    setInitialLoading(false);
    setRefreshing(false);
    setExactSearched(false);
    setFilters({ mode: nextMode === 'text' ? null : nextMode, search: null });
  }

  async function searchExact() {
    if (!exactMode || searchInFlightRef.current) return;
    const value = searchDraft.trim();
    const invalid =
      mode.value === 'email'
        ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        : value.length < 3 || value.length > 50;
    if (invalid) {
      setValidationError(
        mode.value === 'email' ? 'Escribe un correo válido.' : 'Escribe entre 3 y 50 caracteres.',
      );
      return;
    }
    setValidationError(null);
    setError(null);
    setRecords([]);
    setInitialLoading(true);
    setExactSearched(false);
    searchInFlightRef.current = true;
    const requestId = ++requestIdRef.current;
    // Heurística acordada para NIT: nueve dígitos, con DV opcional separado por guion.
    const params =
      mode.value === 'document'
        ? /^\d{9}(?:-\d)?$/.test(value)
          ? { nit: value.replace(/-\d$/, '') }
          : { documentNumber: value }
        : mode.value === 'phone'
          ? { phone: value }
          : { email: value };
    try {
      const response = await subscribersApi.search(params);
      if (requestId !== requestIdRef.current) return;
      setRecords(response.data);
      setExactSearched(true);
    } catch (searchError) {
      if (requestId === requestIdRef.current) setError(mapError(searchError));
    } finally {
      if (requestId === requestIdRef.current) {
        searchInFlightRef.current = false;
        setInitialLoading(false);
      }
    }
  }

  const prevPageRef = useRef(page);
  useEffect(() => {
    if (prevPageRef.current === page) return;
    prevPageRef.current = page;
    const el = tableShellRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } catch {
        // jsdom / entornos sin layout
      }
    }
  }, [page]);

  const hasActiveFilters = Boolean(
    urlSearch || statusFilter || personTypeFilter || segmentFilter || stratumFilter,
  );

  const pageCount = meta.totalPages ?? (meta.total > 0 ? 1 : 0);
  const effectivePage = meta.page ?? page;
  const { from, to } = listPageWindow({
    page: effectivePage,
    limit: meta.limit || pageSize,
    total: meta.total,
  });

  const showPager = !exactMode && !initialLoading && meta.total > 0;
  const showPageSize = showPager && meta.total > Math.min(...[10, 20, 50]);

  function clearFilters() {
    setSearchDraft('');
    setFilters({
      search: null,
      status: null,
      personType: null,
      customerSegment: null,
      stratum: null,
    });
  }

  function renderHead(field: string | null, label: string) {
    if (!exactMode && field && sortableFields.includes(field)) {
      return (
        <PortalDataTableSortableHead
          field={field}
          activeSort={activeSort}
          onSortChange={setSort}
          loading={refreshing}
        >
          {label}
        </PortalDataTableSortableHead>
      );
    }
    return <PortalDataTableHead>{label}</PortalDataTableHead>;
  }

  const mobileSortOptions = useMemo(() => {
    const options = [{ value: '', label: 'Orden por defecto' }];
    for (const field of sortableFields) {
      const label = SORTABLE_COLUMN_LABELS[field] ?? field;
      options.push({ value: `${field}:asc`, label: `${label} · ascendente` });
      options.push({ value: `${field}:desc`, label: `${label} · descendente` });
    }
    return options;
  }, [sortableFields]);

  const mobileSortValue = activeSort ? `${activeSort.by}:${activeSort.dir}` : '';

  return (
    <div className="space-y-6 pb-6">
      <PageHeader
        title="Suscriptores"
        subtitle="Consulta y gestiona el ciclo de vida comercial de los suscriptores de la empresa."
      />

      {error ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar los suscriptores"
          description={error}
          action={
            !exactMode ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void loadPage(listParams)}
              >
                Reintentar
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {outOfRangeNotice ? (
        <PortalAlert
          variant="warning"
          title="Página fuera de rango"
          description={outOfRangeNotice}
          live="polite"
        />
      ) : null}

      <PortalPanel className="overflow-hidden p-0" contentClassName="p-0">
        <div className="flex flex-col gap-3 px-5 py-3">
          <div className="space-y-2">
            <span id="subscriber-search-mode-label" className="text-sm font-medium">
              Buscar por
            </span>
            <div
              role="radiogroup"
              aria-labelledby="subscriber-search-mode-label"
              className="flex flex-wrap gap-1"
            >
              {SEARCH_MODES.map((item, index) => (
                <Button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={mode.value === item.value}
                  tabIndex={mode.value === item.value ? 0 : -1}
                  variant={mode.value === item.value ? 'primary' : 'ghost'}
                  className="min-h-11"
                  onClick={() => changeMode(item.value)}
                  onKeyDown={(event) => {
                    const next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? SEARCH_MODES.length - 1
                          : ['ArrowRight', 'ArrowDown'].includes(event.key)
                            ? (index + 1) % SEARCH_MODES.length
                            : ['ArrowLeft', 'ArrowUp'].includes(event.key)
                              ? (index + SEARCH_MODES.length - 1) % SEARCH_MODES.length
                              : null;
                    if (next === null) return;
                    event.preventDefault();
                    changeMode(SEARCH_MODES[next]!.value);
                    (
                      event.currentTarget.parentElement?.children[next] as
                        | HTMLButtonElement
                        | undefined
                    )?.focus();
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              void searchExact();
            }}
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="subscriber-search" className="sr-only">
                Buscar suscriptor
              </label>
              <Input
                id="subscriber-search"
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder={mode.placeholder}
                aria-invalid={validationError ? true : undefined}
                aria-describedby={validationError ? 'subscriber-search-error' : undefined}
                className="h-12"
              />
            </div>
            {exactMode ? (
              <Button
                type="submit"
                variant="secondary"
                loading={initialLoading}
                className="min-h-11"
              >
                Buscar
              </Button>
            ) : null}
            <Button asChild size="sm" className="h-11 min-h-11 w-full shrink-0 px-3 sm:w-auto">
              <Link href="/dashboard/crm/subscribers/new">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Nuevo suscriptor
              </Link>
            </Button>
          </form>
          {validationError ? (
            <p
              id="subscriber-search-error"
              role="alert"
              className="text-sm text-error-700 dark:text-error-400"
            >
              {validationError}
            </p>
          ) : null}
          {exactMode && exactSearched ? (
            <p role="status" className="text-sm">
              Coincidencia exacta · {records.length}{' '}
              {records.length === 1 ? 'resultado' : 'resultados'}
            </p>
          ) : null}

          {!exactMode ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:items-center">
              <Select
                id="subscriber-status-filter"
                aria-label="Estado"
                className="h-12 min-w-0"
                value={statusFilter}
                onChange={(event) => setFilters({ status: event.target.value || null })}
                options={SUBSCRIBER_STATUS_OPTIONS}
              >
                <option value="">Todos los estados</option>
              </Select>

              <Select
                id="subscriber-person-type-filter"
                aria-label="Tipo de persona"
                className="h-12 min-w-0"
                value={personTypeFilter}
                onChange={(event) => setFilters({ personType: event.target.value || null })}
                options={[...PERSON_TYPE_OPTIONS]}
              >
                <option value="">Todos los tipos</option>
              </Select>

              <Select
                id="subscriber-segment-filter"
                aria-label="Segmento"
                className="h-12 min-w-0"
                value={segmentFilter}
                onChange={(event) => setFilters({ customerSegment: event.target.value || null })}
                options={[...CUSTOMER_SEGMENT_OPTIONS]}
              >
                <option value="">Todos los segmentos</option>
              </Select>

              <Select
                id="subscriber-stratum-filter"
                aria-label="Estrato"
                className="h-12 min-w-0"
                value={stratumFilter}
                onChange={(event) => setFilters({ stratum: event.target.value || null })}
                options={[...STRATUM_OPTIONS]}
              >
                <option value="">Todos los estratos</option>
              </Select>

              {hasActiveFilters ? (
                <Button type="button" variant="ghost" onClick={clearFilters} className="h-12">
                  Limpiar filtros
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {!exactMode && canSort ? (
          <div className="px-5 pb-3 sm:hidden">
            <Select
              id="subscriber-mobile-sort"
              aria-label="Ordenar por"
              className="h-12"
              value={mobileSortValue}
              disabled={refreshing}
              onChange={(event) => {
                const raw = event.target.value;
                if (!raw) {
                  setSort(null);
                  return;
                }
                const [by, dir] = raw.split(':');
                if (by && (dir === 'asc' || dir === 'desc')) {
                  setSort({ by, dir });
                }
              }}
              options={mobileSortOptions}
            />
          </div>
        ) : null}

        <div className="px-5 pb-5">
          <div ref={tableShellRef} className={portalDataTableShellClassName}>
            <div
              className={
                refreshing ? `overflow-x-auto ${portalDataBusyRegionClassName}` : 'overflow-x-auto'
              }
              aria-busy={refreshing || undefined}
            >
              <table className="w-full text-sm" aria-label="Listado de suscriptores">
                <thead className={portalDataTableHeadRowClassName}>
                  <tr>
                    {renderHead(null, 'Suscriptor')}
                    {renderHead(null, 'Documento / NIT')}
                    {renderHead('personType', 'Tipo')}
                    {renderHead('customerSegment', 'Segmento')}
                    {renderHead(null, 'Ubicación')}
                    {renderHead('status', 'Estado')}
                    {renderHead('createdAt', 'Creado')}
                  </tr>
                </thead>
                <tbody className={portalDataTableBodyClassName}>
                  {initialLoading && records.length === 0
                    ? Array.from({ length: 5 }, (_, index) => (
                        <tr key={`subscriber-skeleton-${index}`}>
                          <td className={portalDataTableCellClassName} colSpan={7}>
                            <PortalSkeletonBlock className="h-10 w-full rounded-xl" />
                          </td>
                        </tr>
                      ))
                    : null}

                  {!initialLoading && records.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={cn(portalDataTableCellClassName, 'py-12')}>
                        <PortalEmptyState
                          title={
                            exactMode
                              ? exactSearched
                                ? `No hay suscriptores con ese ${mode.empty}`
                                : 'Busca un suscriptor'
                              : hasActiveFilters
                                ? 'No se encontraron resultados'
                                : 'Aún no hay suscriptores'
                          }
                          description={
                            exactMode
                              ? 'Escribe el dato y selecciona Buscar para consultar una coincidencia exacta.'
                              : hasActiveFilters
                                ? 'Ajusta la búsqueda o limpia los filtros para ver otros suscriptores.'
                                : 'Registra el primero para iniciar el ciclo comercial y postventa.'
                          }
                          icon={CircleDashed}
                          className="w-full text-left"
                          action={
                            exactMode ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => changeMode('text')}
                              >
                                Buscar como texto
                              </Button>
                            ) : hasActiveFilters ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={clearFilters}
                              >
                                Limpiar filtros
                              </Button>
                            ) : undefined
                          }
                        />
                      </td>
                    </tr>
                  ) : null}

                  {!initialLoading &&
                    records.map((subscriber) => (
                      <tr key={subscriber.id} className={portalTableRowHoverClassName}>
                        <td className={portalDataTableCellClassName}>
                          <Link
                            href={`/dashboard/crm/subscribers/${subscriber.id}`}
                            className="group block"
                          >
                            <p className="font-semibold text-iwana-primary transition-colors group-hover:text-iwana-secondary-700 dark:text-white dark:group-hover:text-iwana-secondary-300">
                              {privacyDisplayValue(
                                subscriber.anonymizedAt ? null : formatSubscriberName(subscriber),
                                {
                                  privacyRestricted: subscriber.privacyRestricted,
                                  anonymizedAt: subscriber.anonymizedAt,
                                },
                              )}
                            </p>
                            <PrivacyMarks marks={subscriber.privacyMarks ?? []} />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {subscriber.privacyRestricted
                                ? 'Datos bloqueados'
                                : subscriber.anonymizedAt
                                  ? 'Anonimizado'
                                  : subscriber.contactPending
                                    ? 'Contacto pendiente'
                                    : subscriber.email ||
                                      subscriber.phone ||
                                      'Sin contacto principal'}
                            </p>
                          </Link>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {subscriber.privacyRestricted
                            ? 'Datos bloqueados'
                            : subscriber.anonymizedAt
                              ? 'Anonimizado'
                              : formatDocumentDisplay(subscriber)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <Badge
                            variant={PERSON_TYPE_META[subscriber.personType].variant}
                            className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
                          >
                            {PERSON_TYPE_META[subscriber.personType].label}
                          </Badge>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <Badge
                            variant="neutral"
                            className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
                          >
                            {CUSTOMER_SEGMENT_META[subscriber.customerSegment].label}
                          </Badge>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {privacyDisplayValue(
                            subscriber.privacyRestricted
                              ? null
                              : formatSubscriberLocation(subscriber.city, subscriber.department),
                            {
                              privacyRestricted: subscriber.privacyRestricted,
                              anonymizedAt: subscriber.anonymizedAt,
                              emptyValue: 'Sin ubicación registrada',
                            },
                          )}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <Badge
                            variant={SUBSCRIBER_STATUS_META[subscriber.status].variant}
                            className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
                          >
                            {SUBSCRIBER_STATUS_META[subscriber.status].label}
                          </Badge>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {formatSubscriberDate(subscriber.createdAt)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {showPager ? (
              <PortalTablePager
                page={effectivePage}
                pageCount={Math.max(1, pageCount)}
                onPageChange={setPage}
                from={from}
                to={to}
                total={meta.total}
                resource={SUBSCRIBERS_RESOURCE}
                totalIsEstimate={meta.totalIsEstimate}
                loading={refreshing}
                pageSizeControl={
                  showPageSize ? (
                    <PortalPageSizeSelect
                      value={pageSize}
                      onChange={setPageSize}
                      disabled={refreshing}
                    />
                  ) : undefined
                }
              />
            ) : null}
          </div>
        </div>
      </PortalPanel>
    </div>
  );
}

export function SubscribersListClient() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4" aria-busy="true">
          <PortalSkeletonBlock className="h-20 rounded-2xl" />
          <PortalSkeletonBlock className="h-64 rounded-2xl" />
        </div>
      }
    >
      <SubscribersListClientInner />
    </Suspense>
  );
}
