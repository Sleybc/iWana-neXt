'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, cn } from '@iwana/ui';
import type { ListMeta, SubscriberListItem, SubscriberTag } from '@iwana/shared';
import {
  AccessPermissionKey,
  ACTIVATED_SUBSCRIBER_STATUSES,
  COUNTRY_PHONE_PREFIX,
  CustomerSegment,
  MAX_SUBSCRIBER_SEARCH_LENGTH,
  PersonType,
  SubscriberStatus,
} from '@iwana/shared';
import { CircleDashed, Plus } from 'lucide-react';
import {
  type ListSubscribersParams,
  subscriberTagsApi,
  subscribersApi,
  tenantSelfApi,
} from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePermissions } from '@/components/access-control/permissions-context';
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
  PortalSearchField,
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
  CUSTOMER_SEGMENT_OPTIONS,
  PERSON_TYPE_OPTIONS,
  STRATUM_OPTIONS,
  SUBSCRIBER_STATUS_META,
  SUBSCRIBER_STATUS_OPTIONS,
  formatSubscriberDate,
  formatSubscriberName,
  formatSubscriberListIdentityDetails,
  formatSubscriberPrimaryService,
} from './subscriber-ui';
import { SubscriberMobileCard } from './SubscriberMobileCard';
import { SubscriberDerivedBadges } from './SubscriberDerivedBadges';
import { deriveSubscriberListBadges } from './subscriber-badges';
import { SubscriberMoreFilters, type SubscriberActiveFilter } from './SubscriberMoreFilters';
import { SubscriberPeek } from './SubscriberPeek';
import { SubscriberTagChips } from './tags/SubscriberTagChips';
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
  'tagId',
  'mode',
  'queue',
  'peek',
] as const;

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

function getSupportedTenantPhonePrefix(countryCode: string | null | undefined): string | null {
  const normalizedCode = countryCode?.trim().toUpperCase();
  return normalizedCode ? (COUNTRY_PHONE_PREFIX[normalizedCode] ?? null) : null;
}

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
  const mobileSummaryRefs = useRef(new Map<string, HTMLButtonElement>());
  const peekOriginRef = useRef<{
    subscriberId: string;
    index: number;
    trigger: HTMLElement;
  } | null>(null);
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const requestIdRef = useRef(0);
  const queueCountsRequestIdRef = useRef(0);
  const { user } = useAuth();
  const { hasPermission } = usePermissions();

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
  const setQueryRef = useRef(setQuery);

  useEffect(() => {
    setQueryRef.current = setQuery;
  }, [setQuery]);

  const [records, setRecords] = useState<SubscriberListItem[]>([]);
  // Catálogo de etiquetas para el filtro; si falla, el filtro simplemente no se muestra.
  const [tagCatalog, setTagCatalog] = useState<SubscriberTag[]>([]);
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => subscriberTagsApi.list())
      .then((data) => {
        if (active) setTagCatalog(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setTagCatalog([]);
      });
    return () => {
      active = false;
    };
  }, []);
  const tagOptions = useMemo(
    () => tagCatalog.map((item) => ({ value: item.id, label: item.name })),
    [tagCatalog],
  );
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
  const [countryPrefix, setCountryPrefix] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  useEffect(() => {
    let active = true;
    const canReadTenantProfile = user?.role === 'ADMIN' || user?.role === 'SUPPORT';

    if (!canReadTenantProfile) {
      setCountryPrefix(null);
      return () => {
        active = false;
      };
    }

    setCountryPrefix(null);
    void tenantSelfApi
      .getMe()
      .then((tenant) => {
        if (active) setCountryPrefix(getSupportedTenantPhonePrefix(tenant.countryCode));
      })
      .catch(() => {
        if (active) setCountryPrefix(null);
      });

    return () => {
      active = false;
    };
  }, [user?.role, user?.tenantId]);

  const statusFilter =
    ACTIVATED_SUBSCRIBER_STATUSES.find((status) => status === filters.status) ?? '';
  const personTypeFilter = filters.personType ?? '';
  const segmentFilter = filters.customerSegment ?? '';
  const stratumFilter = filters.stratum ?? '';
  const tagFilter = filters.tagId ?? '';
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
    const obsoleteStatus = Boolean(filters.status && !statusFilter);
    if (filters.search || filters.mode || obsoleteStatus) {
      setQuery(
        {
          ...(obsoleteStatus ? { page: 1 } : {}),
          filters: { search: null, mode: null, ...(obsoleteStatus ? { status: null } : {}) },
        },
        { history: 'replace' },
      );
    }
  }, [filters.search, filters.mode, filters.status, statusFilter, setQuery]);

  useEffect(
    () => () => {
      ++requestIdRef.current;
    },
    [],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchDraft.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);

  useEffect(() => {
    if (debouncedSearch === appliedSearch) return;
    if (page !== 1) {
      setQuery({ page: 1 }, { history: 'replace' });
      return;
    }
    setAppliedSearch(debouncedSearch);
  }, [appliedSearch, debouncedSearch, page, setQuery]);

  const searchTerm = page === 1 ? debouncedSearch : appliedSearch;
  const listParams = useMemo((): ListSubscribersParams => {
    const params: ListSubscribersParams = {
      page,
      limit: pageSize,
    };
    if (searchTerm) params.search = searchTerm;
    if (queueStatus) params.status = queueStatus;
    else if (statusFilter) params.status = statusFilter;
    if (personTypeFilter) params.personType = personTypeFilter as PersonType;
    if (segmentFilter) params.customerSegment = segmentFilter as CustomerSegment;
    if (stratumFilter) params.stratum = Number(stratumFilter);
    if (tagFilter) params.tagId = tagFilter;
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
    tagFilter,
    searchTerm,
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

  const loadPage = useCallback(async (params: ListSubscribersParams, opts?: { soft?: boolean }) => {
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
        setQueryRef.current({ page: totalPages }, { history: 'replace' });
        return;
      }

      if (response.data.length === 0 && requestedPage > 1 && nextMeta.total > 0) {
        const fallback = Math.max(1, totalPages || requestedPage - 1);
        setQueryRef.current({ page: fallback }, { history: 'replace' });
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
  }, []);

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
  }, [listParams, loadPage, statusIntersectionIsEmpty, pageSize]);

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
    searchDraft.trim() ||
    queueSlug ||
    statusFilter ||
    personTypeFilter ||
    segmentFilter ||
    stratumFilter ||
    tagFilter,
  );

  const pageCount = meta.totalPages ?? (meta.total > 0 ? 1 : 0);
  const effectivePage = meta.page ?? page;
  const { from, to } = listPageWindow({
    page: effectivePage,
    limit: meta.limit || pageSize,
    total: meta.total,
  });

  const showPager = !initialLoading && meta.total > 0;
  const showPageSize = showPager && meta.total > Math.min(...[10, 20, 50]);

  function clearFilters() {
    setSearchDraft('');
    setDebouncedSearch('');
    setAppliedSearch('');
    setFilters({
      search: null,
      queue: null,
      status: null,
      personType: null,
      customerSegment: null,
      stratum: null,
      tagId: null,
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

  if (tagFilter) {
    activeFilterItems.push({
      key: 'tagId',
      label: 'Etiqueta',
      value: tagCatalog.find((item) => item.id === tagFilter)?.name ?? 'Etiqueta eliminada',
    });
  }

  function removeFilter(key: string) {
    setFilters({ [key]: null });
  }

  function openPeek(subscriberId: string, index: number, trigger: HTMLElement) {
    peekOriginRef.current = { subscriberId, index, trigger };
    setActiveRowId(subscriberId);
    setQuery({ filters: { peek: subscriberId } }, { history: 'push' });
  }

  function closePeek() {
    setQuery({ filters: { peek: null } }, { history: 'replace' });
    window.requestAnimationFrame(() => {
      const origin = peekOriginRef.current;
      const isMobileViewport = window.matchMedia('(max-width: 767px)').matches;
      const currentTrigger = origin
        ? isMobileViewport
          ? mobileSummaryRefs.current.get(origin.subscriberId)
          : rowRefs.current.get(origin.subscriberId)
        : null;
      const trigger = currentTrigger ?? origin?.trigger;
      if (trigger?.isConnected) {
        trigger.focus({ preventScroll: true });
        return;
      }

      const fallbackIndex = Math.min(origin?.index ?? 0, records.length - 1);
      const fallbackSubscriber = records[fallbackIndex];
      if (fallbackSubscriber) {
        const fallbackTrigger = isMobileViewport
          ? mobileSummaryRefs.current.get(fallbackSubscriber.id)
          : rowRefs.current.get(fallbackSubscriber.id);
        fallbackTrigger?.focus({ preventScroll: true });
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
      openPeek(subscriberId, index, event.currentTarget);
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
    if (field && sortableFields.includes(field)) {
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
        actions={
          <Button asChild variant="secondary" className="min-h-11">
            <Link href="/dashboard/crm/subscribers/agenda-corte">Agenda de corte</Link>
          </Button>
        }
      />

      {error ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar los suscriptores"
          description={error}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadPage(listParams)}
              className="min-h-11 md:min-h-8"
            >
              Reintentar
            </Button>
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <PortalSearchField
              id="subscriber-search"
              label="Buscar suscriptor"
              placeholder="Nombre, documento, teléfono o correo"
              value={searchDraft}
              maxLength={MAX_SUBSCRIBER_SEARCH_LENGTH}
              onChange={setSearchDraft}
              className="min-w-0 flex-1"
            />
            {hasPermission(AccessPermissionKey.CRM_EXPEDIENTES_READ) &&
            hasPermission(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE) ? (
              <Button asChild size="sm" className="h-11 min-h-11 w-full shrink-0 px-3 sm:w-auto">
                <Link href="/dashboard/crm/expedientes#nueva-oportunidad">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Nueva oportunidad
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="space-y-3">
            <SubscriberQueueChips
              counts={queueCounts}
              loading={queueCountsLoading}
              error={queueCountsError}
              selected={queueSlug}
              onSelect={selectQueue}
              onRetry={() => void loadQueueCounts()}
            />
            <SubscriberMoreFilters
              status={statusFilter}
              personType={personTypeFilter}
              segment={segmentFilter}
              stratum={stratumFilter}
              onStatusChange={(value) => setFilters({ status: value || null })}
              onPersonTypeChange={(value) => setFilters({ personType: value || null })}
              onSegmentChange={(value) => setFilters({ customerSegment: value || null })}
              onStratumChange={(value) => setFilters({ stratum: value || null })}
              tag={tagFilter}
              tagOptions={tagOptions}
              onTagChange={(value) => setFilters({ tagId: value || null })}
              activeFilters={activeFilterItems}
              hasActiveFilters={hasActiveFilters}
              onRemoveFilter={removeFilter}
              onClearFilters={clearFilters}
              sortValue={mobileSortValue}
              sortOptions={mobileSortOptions}
              showSort={canSort}
              sortDisabled={refreshing}
              onApply={(draft) => {
                const [sortBy, sortDir] = draft.sortValue.split(':');
                let nextSortBy: string | null = null;
                let nextSortDir: 'asc' | 'desc' | null = null;
                if (
                  sortBy &&
                  sortableFields.includes(sortBy) &&
                  (sortDir === 'asc' || sortDir === 'desc')
                ) {
                  nextSortBy = sortBy;
                  nextSortDir = sortDir;
                }
                setQuery(
                  {
                    page: 1,
                    sortBy: nextSortBy,
                    sortDir: nextSortDir,
                    filters: {
                      status: draft.status || null,
                      personType: draft.personType || null,
                      customerSegment: draft.segment || null,
                      stratum: draft.stratum || null,
                      tagId: draft.tag || null,
                    },
                  },
                  { history: 'replace' },
                );
              }}
            />
          </div>
        </div>

        <div ref={tableShellRef} tabIndex={-1} className="space-y-4 px-5 pb-5">
          {records.length > 0 || (initialLoading && showInitialSkeleton) ? (
            <div
              className="space-y-3 md:hidden"
              aria-busy={initialLoading || refreshing || undefined}
            >
              {initialLoading && showInitialSkeleton && records.length === 0 ? (
                <>
                  <p role="status" className="sr-only">
                    Cargando suscriptores…
                  </p>
                  <ul aria-label="Suscriptores" className="space-y-3">
                    {Array.from({ length: 5 }, (_, index) => (
                      <li key={`subscriber-mobile-skeleton-${index}`}>
                        <PortalSkeletonBlock className="h-40 rounded-2xl" />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {!initialLoading && records.length > 0 ? (
                <ul aria-label="Suscriptores" className="space-y-3">
                  {records.map((subscriber, index) => (
                    <SubscriberMobileCard
                      key={subscriber.id}
                      subscriber={subscriber}
                      index={index}
                      countryPrefix={countryPrefix}
                      onOpen={openPeek}
                      onSummaryRef={(subscriberId, trigger) => {
                        if (trigger) mobileSummaryRefs.current.set(subscriberId, trigger);
                        else mobileSummaryRefs.current.delete(subscriberId);
                      }}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {!initialLoading && !error && records.length === 0 ? (
            <PortalEmptyState
              title={hasActiveFilters ? 'No se encontraron resultados' : 'Aún no hay suscriptores'}
              description={
                hasActiveFilters
                  ? 'Ajusta la búsqueda o limpia los filtros para ver otros suscriptores.'
                  : 'Los suscriptores aparecen después de su primera activación.'
              }
              icon={CircleDashed}
              className="w-full text-left"
              embedded
            />
          ) : null}

          {records.length > 0 || initialLoading ? (
            <div className="hidden md:block">
              <div className={portalDataTableShellClassName}>
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

                      {!initialLoading &&
                        records.map((subscriber, index) => {
                          const identityDetails = formatSubscriberListIdentityDetails(subscriber);
                          const service = formatSubscriberPrimaryService(subscriber);

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
                                openPeek(subscriber.id, index, event.currentTarget);
                              }}
                              className={cn(
                                portalTableRowHoverClassName,
                                interactiveFocusClassName,
                              )}
                            >
                              <td className={portalDataTableCellClassName}>
                                <Link
                                  href={`/dashboard/crm/subscribers/${encodeURIComponent(subscriber.id)}`}
                                  className="group block min-h-11"
                                >
                                  <p className="font-semibold text-iwana-primary transition-colors group-hover:text-iwana-secondary-700 dark:text-white dark:group-hover:text-iwana-secondary-300">
                                    {privacyDisplayValue(
                                      subscriber.anonymizedAt
                                        ? null
                                        : formatSubscriberName(subscriber),
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
                                <SubscriberDerivedBadges
                                  badges={deriveSubscriberListBadges(subscriber)}
                                  className="mt-1"
                                />
                                <SubscriberTagChips tags={subscriber.tags} className="mt-1" />
                              </td>
                              <td className={portalDataTableCellClassName}>
                                <p className="font-medium">{service.title}</p>
                                {service.details ? (
                                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                    {service.details}
                                  </p>
                                ) : null}
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
              </div>
            </div>
          ) : null}

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
      </PortalPanel>
      <SubscriberPeek
        open={Boolean(peekId)}
        subscriberId={peekId}
        projectedContact={records.find((record) => record.id === peekId) ?? null}
        countryPrefix={countryPrefix}
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
