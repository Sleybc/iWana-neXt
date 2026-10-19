'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Input, Select, cn } from '@iwana/ui';
import type { ListMeta, SubscriberListItem } from '@iwana/shared';
import { CustomerSegment, PersonType, SubscriberStatus } from '@iwana/shared';
import { CircleDashed, Plus } from 'lucide-react';
import { type ListSubscribersParams, subscribersApi } from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import { PageHeader } from '@/components/layout/PageHeader';
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
  interactiveFocusClassName,
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
  formatSubscriberDate,
  formatSubscriberName,
  formatLocationLabel,
} from './subscriber-ui';
import { SubscriberMoreFilters, type SubscriberActiveFilter } from './SubscriberMoreFilters';
import { SubscriberPeek } from './SubscriberPeek';
import {
  SubscriberQueueChips,
  SUBSCRIBER_QUEUE_OPTIONS,
  type SubscriberQueueKey,
} from './SubscriberQueueChips';

const SUBSCRIBERS_RESOURCE = { singular: 'suscriptor', plural: 'suscriptores' } as const;

const FILTER_KEYS = [
  'search',
  'status',
  'personType',
  'customerSegment',
  'stratum',
  'mode',
  'queue',
  'peek',
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
const SUBSCRIBER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapError(error: unknown): string {
  void error;
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
  const router = useRouter();
  const tableShellRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const peekOriginRef = useRef<{ subscriberId: string; index: number } | null>(null);
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const requestIdRef = useRef(0);
  const searchInFlightRef = useRef(false);
  const queueCountsRequestIdRef = useRef(0);

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
  const [showInitialSkeleton, setShowInitialSkeleton] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queueCounts, setQueueCounts] = useState<Awaited<
    ReturnType<typeof subscribersApi.queueCounts>
  > | null>(null);
  const [queueCountsLoading, setQueueCountsLoading] = useState(true);
  const [queueCountsError, setQueueCountsError] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [textSearch, setTextSearch] = useState('');
  const [exactSearched, setExactSearched] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const urlMode = (SEARCH_MODES.find((item) => item.value === filters.mode) ?? SEARCH_MODES[0])
    .value;
  const [selectedMode, setSelectedMode] = useState<SearchMode>(urlMode);
  const selectedModeRef = useRef<SearchMode>(urlMode);
  const mode = SEARCH_MODES.find((item) => item.value === selectedMode) ?? SEARCH_MODES[0];
  const exactMode = mode.value !== 'text';

  const legacyUrlSearch = filters.search ?? '';
  const statusFilter = filters.status ?? '';
  const personTypeFilter = filters.personType ?? '';
  const segmentFilter = filters.customerSegment ?? '';
  const stratumFilter = filters.stratum ?? '';
  const queueFilter = filters.queue ?? '';
  const queueSlug = SUBSCRIBER_QUEUE_OPTIONS.some((item) => item.value === queueFilter)
    ? (queueFilter as SubscriberQueueKey)
    : null;
  const peekParam = filters.peek ?? '';
  const peekId = SUBSCRIBER_ID_PATTERN.test(peekParam) ? peekParam : null;

  const queueStatus =
    queueSlug === 'active'
      ? SubscriberStatus.ACTIVE
      : queueSlug === 'suspended'
        ? SubscriberStatus.SUSPENDED
        : null;
  const statusIntersectionIsEmpty = Boolean(
    queueStatus && statusFilter && statusFilter !== queueStatus,
  );

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
      setTextSearch('');
    }
  }, [urlMode]);

  useEffect(() => {
    if (legacyUrlSearch) setFilters({ search: null });
  }, [legacyUrlSearch, setFilters]);

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
      if (next === textSearch) return;
      setTextSearch(next);
      if (page !== 1) setQuery({ page: 1 }, { history: 'replace' });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchDraft, setQuery, page, textSearch, exactMode]);

  const listParams = useMemo((): ListSubscribersParams => {
    const params: ListSubscribersParams = {
      page,
      limit: pageSize,
    };
    if (textSearch) params.search = textSearch;
    if (queueStatus) params.status = queueStatus;
    else if (statusFilter) params.status = statusFilter as SubscriberStatus;
    if (personTypeFilter) params.personType = personTypeFilter as PersonType;
    if (segmentFilter) params.customerSegment = segmentFilter as CustomerSegment;
    if (stratumFilter) params.stratum = Number(stratumFilter);
    if (queueSlug === 'contactPending') params.contactPending = true;
    if (queueSlug === 'fiscalIncomplete') params.fiscalIncomplete = true;
    if (queueSlug === 'withoutLiveServices') params.withoutLiveServices = true;
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
    textSearch,
    queueSlug,
    queueStatus,
  ]);

  const loadQueueCounts = useCallback(async () => {
    const requestId = ++queueCountsRequestIdRef.current;
    setQueueCountsLoading(true);
    setQueueCountsError(false);
    try {
      const counts = await subscribersApi.queueCounts();
      if (requestId === queueCountsRequestIdRef.current) setQueueCounts(counts);
    } catch {
      if (requestId === queueCountsRequestIdRef.current) {
        setQueueCounts(null);
        setQueueCountsError(true);
      }
    } finally {
      if (requestId === queueCountsRequestIdRef.current) setQueueCountsLoading(false);
    }
  }, []);

  const invalidateQueueCountsRequest = useCallback(() => {
    ++queueCountsRequestIdRef.current;
  }, []);

  useEffect(() => {
    void loadQueueCounts();
    return invalidateQueueCountsRequest;
  }, [invalidateQueueCountsRequest, loadQueueCounts]);

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
    if (!initialLoading || records.length > 0) {
      setShowInitialSkeleton(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setShowInitialSkeleton(true), 300);
    return () => window.clearTimeout(timeoutId);
  }, [initialLoading, records.length]);

  const refreshAfterLifecycle = useCallback(async () => {
    await Promise.all([loadPage(listParams, { soft: true }), loadQueueCounts()]);
  }, [listParams, loadPage, loadQueueCounts]);

  useEffect(() => {
    if (exactMode) return;
    if (statusIntersectionIsEmpty) {
      ++requestIdRef.current;
      setRecords([]);
      setMeta(buildPageMetaFixture({ page: 1, limit: pageSize, total: 0 }, 0, pageSize));
      setInitialLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }
    const requestIdState = requestIdRef;
    void loadPage(listParams, { soft: true });
    return () => {
      ++requestIdState.current;
    };
  }, [listParams, loadPage, exactMode, statusIntersectionIsEmpty, pageSize]);

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
    setTextSearch('');
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
    textSearch || queueSlug || statusFilter || personTypeFilter || segmentFilter || stratumFilter,
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
    setTextSearch('');
    setFilters({
      search: null,
      queue: null,
      status: null,
      personType: null,
      customerSegment: null,
      stratum: null,
    });
  }

  function selectQueue(queue: SubscriberQueueKey) {
    setFilters({ queue: queueSlug === queue ? null : queue });
  }

  const activeFilterItems: SubscriberActiveFilter[] = [];
  if (queueSlug) {
    const option = SUBSCRIBER_QUEUE_OPTIONS.find((item) => item.value === queueSlug);
    if (option) activeFilterItems.push({ key: 'queue', label: 'Cola', value: option.label });
  }
  if (textSearch) {
    activeFilterItems.push({ key: 'search', label: 'Búsqueda', value: textSearch });
  }
  if (statusFilter) {
    activeFilterItems.push({
      key: 'status',
      label: 'Estado',
      value: SUBSCRIBER_STATUS_OPTIONS.find((item) => item.value === statusFilter)?.label ?? '',
    });
  }
  if (personTypeFilter) {
    activeFilterItems.push({
      key: 'personType',
      label: 'Tipo de persona',
      value: PERSON_TYPE_OPTIONS.find((item) => item.value === personTypeFilter)?.label ?? '',
    });
  }
  if (segmentFilter) {
    activeFilterItems.push({
      key: 'customerSegment',
      label: 'Segmento',
      value: CUSTOMER_SEGMENT_OPTIONS.find((item) => item.value === segmentFilter)?.label ?? '',
    });
  }
  if (stratumFilter) {
    activeFilterItems.push({
      key: 'stratum',
      label: 'Estrato',
      value: STRATUM_OPTIONS.find((item) => item.value === stratumFilter)?.label ?? '',
    });
  }

  function removeFilter(key: string) {
    if (key === 'search') {
      setSearchDraft('');
      setTextSearch('');
      return;
    }
    setFilters({ [key]: null });
  }

  function openPeek(subscriberId: string, index: number) {
    peekOriginRef.current = { subscriberId, index };
    setActiveRowId(subscriberId);
    setQuery({ filters: { peek: subscriberId } }, { history: 'push' });
  }

  function closePeek() {
    setQuery({ filters: { peek: null } }, { history: 'replace' });
    window.requestAnimationFrame(() => {
      const origin = peekOriginRef.current;
      const originRow = origin ? rowRefs.current.get(origin.subscriberId) : null;
      if (originRow?.isConnected) {
        originRow.focus();
        return;
      }

      const fallbackIndex = Math.min(origin?.index ?? 0, records.length - 1);
      const fallbackSubscriber = records[fallbackIndex];
      if (fallbackSubscriber) {
        rowRefs.current.get(fallbackSubscriber.id)?.focus();
        return;
      }

      tableShellRef.current?.focus();
    });
  }

  useEffect(() => {
    if (!peekParam || peekId) return;
    setQuery({ filters: { peek: null } }, { history: 'replace' });
  }, [peekId, peekParam, setQuery]);

  useEffect(() => {
    if (records.length === 0) {
      setActiveRowId(null);
      return;
    }
    if (!activeRowId || !records.some((record) => record.id === activeRowId)) {
      setActiveRowId(records[0]?.id ?? null);
    }
  }, [activeRowId, records]);

  function handleRowKeyDown(
    event: React.KeyboardEvent<HTMLTableRowElement>,
    subscriberId: string,
    index: number,
  ) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      openPeek(subscriberId, index);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    const nextIndex = Math.max(
      0,
      Math.min(records.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
    );
    const next = records[nextIndex];
    if (!next) return;
    setActiveRowId(next.id);
    rowRefs.current.get(next.id)?.focus();
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
            <div className="space-y-4">
              <SubscriberQueueChips
                counts={queueCounts}
                loading={queueCountsLoading}
                error={queueCountsError}
                selected={queueSlug}
                onSelect={selectQueue}
                onRetry={() => void loadQueueCounts()}
              />
              <SubscriberMoreFilters
                expanded={filtersExpanded}
                onExpandedChange={setFiltersExpanded}
                status={statusFilter}
                personType={personTypeFilter}
                segment={segmentFilter}
                stratum={stratumFilter}
                onStatusChange={(value) => setFilters({ status: value || null })}
                onPersonTypeChange={(value) => setFilters({ personType: value || null })}
                onSegmentChange={(value) => setFilters({ customerSegment: value || null })}
                onStratumChange={(value) => setFilters({ stratum: value || null })}
                activeFilters={activeFilterItems}
                onRemoveFilter={removeFilter}
                onClearFilters={clearFilters}
              />
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
          <div ref={tableShellRef} tabIndex={-1} className={portalDataTableShellClassName}>
            <div
              className={
                initialLoading || refreshing
                  ? `overflow-x-auto ${portalDataBusyRegionClassName}`
                  : 'overflow-x-auto'
              }
              aria-busy={initialLoading || refreshing || undefined}
            >
              <table className="w-full text-sm" aria-label="Listado de suscriptores">
                <thead className={portalDataTableHeadRowClassName}>
                  <tr>
                    {renderHead(null, 'Suscriptor')}
                    {renderHead(null, 'Servicio principal')}
                    {renderHead('status', 'Estado')}
                    {renderHead('createdAt', 'Creado')}
                  </tr>
                </thead>
                <tbody className={portalDataTableBodyClassName}>
                  {initialLoading && showInitialSkeleton && records.length === 0
                    ? Array.from({ length: 5 }, (_, index) => (
                        <tr key={`subscriber-skeleton-${index}`}>
                          <td className={portalDataTableCellClassName} colSpan={4}>
                            <PortalSkeletonBlock className="h-10 w-full rounded-xl" />
                          </td>
                        </tr>
                      ))
                    : null}

                  {!initialLoading && !error && records.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={cn(portalDataTableCellClassName, 'py-12')}>
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
                    records.map((subscriber, index) => {
                      const privacyRedacted =
                        subscriber.privacyRestricted || Boolean(subscriber.anonymizedAt);
                      const documentAvailable =
                        subscriber.personType === PersonType.JURIDICA
                          ? Boolean(subscriber.nit?.trim())
                          : Boolean(subscriber.documentNumber?.trim());
                      const identityDetails = privacyRedacted
                        ? ''
                        : [
                            ...(documentAvailable ? [formatDocumentDisplay(subscriber)] : []),
                            PERSON_TYPE_META[subscriber.personType].label,
                            CUSTOMER_SEGMENT_META[subscriber.customerSegment].label,
                          ].join(' · ');
                      const service = subscriber.primaryService;
                      const serviceSubline = !service
                        ? 'Sin servicios vigentes'
                        : service.status === 'DRAFT'
                          ? [
                              ...(!privacyRedacted
                                ? [formatLocationLabel(service.city) || 'Sin ubicación']
                                : []),
                              'Borrador',
                              'Sin servicios vigentes',
                            ].join(' · ')
                          : [
                              ...(!privacyRedacted
                                ? [formatLocationLabel(service.city) || 'Sin ubicación']
                                : []),
                              ...(subscriber.otherLiveServicesCount > 0
                                ? [
                                    `+${subscriber.otherLiveServicesCount} ${subscriber.otherLiveServicesCount === 1 ? 'servicio' : 'servicios'}`,
                                  ]
                                : []),
                            ].join(' · ');

                      return (
                        <tr
                          key={subscriber.id}
                          ref={(node) => {
                            if (node) rowRefs.current.set(subscriber.id, node);
                            else rowRefs.current.delete(subscriber.id);
                          }}
                          tabIndex={activeRowId === subscriber.id ? 0 : -1}
                          onFocus={() => setActiveRowId(subscriber.id)}
                          onKeyDown={(event) => handleRowKeyDown(event, subscriber.id, index)}
                          onClick={(event) => {
                            const target = event.target;
                            if (
                              target instanceof Element &&
                              target.closest('a,button,input,select,textarea')
                            ) {
                              return;
                            }
                            event.currentTarget.focus();
                            openPeek(subscriber.id, index);
                          }}
                          className={cn(portalTableRowHoverClassName, interactiveFocusClassName)}
                        >
                          <td className={portalDataTableCellClassName}>
                            <Link
                              href={`/dashboard/crm/subscribers/${encodeURIComponent(subscriber.id)}`}
                              className="group block min-h-11"
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
                              {identityDetails ? (
                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                  {identityDetails}
                                </p>
                              ) : null}
                            </Link>
                          </td>
                          <td className={portalDataTableCellClassName}>
                            {service ? (
                              <>
                                <p className="font-medium">
                                  {service.planName || 'Plan no disponible'}
                                </p>
                                {serviceSubline ? (
                                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                    {serviceSubline}
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <>
                                <p className="font-medium">Sin servicio principal</p>
                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                  Sin servicios vigentes
                                </p>
                              </>
                            )}
                          </td>
                          <td className={portalDataTableCellClassName}>
                            <Badge
                              variant={SUBSCRIBER_STATUS_META[subscriber.status].variant}
                              className="rounded-full px-3 py-1 text-xs font-semibold"
                            >
                              {SUBSCRIBER_STATUS_META[subscriber.status].label}
                            </Badge>
                          </td>
                          <td className={portalDataTableCellClassName}>
                            {formatSubscriberDate(subscriber.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
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
      <SubscriberPeek
        open={Boolean(peekId)}
        subscriberId={peekId}
        onClose={closePeek}
        onChanged={refreshAfterLifecycle}
        onGoToServices={() => {
          if (!peekId) return;
          router.push(`/dashboard/crm/subscribers/${encodeURIComponent(peekId)}?tab=servicios`);
        }}
      />
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
