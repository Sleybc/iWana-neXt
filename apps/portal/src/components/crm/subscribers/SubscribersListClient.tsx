'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Select, cn } from '@iwana/ui';
import type { ListMeta } from '@iwana/shared';
import { CustomerSegment, PersonType, SubscriberStatus } from '@iwana/shared';
import { CircleDashed, Plus } from 'lucide-react';
import {
  ApiError,
  type ListSubscribersParams,
  type SubscriberRecord,
  subscribersApi,
} from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import { PageHeader } from '@/components/layout/PageHeader';
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
  formatVatTreatmentLabel,
} from './subscriber-ui';

const SUBSCRIBERS_RESOURCE = { singular: 'suscriptor', plural: 'suscriptores' } as const;

const FILTER_KEYS = ['search', 'status', 'personType', 'customerSegment', 'stratum'] as const;

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

  const [records, setRecords] = useState<SubscriberRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '');

  const urlSearch = filters.search ?? '';
  const statusFilter = filters.status ?? '';
  const personTypeFilter = filters.personType ?? '';
  const segmentFilter = filters.customerSegment ?? '';
  const stratumFilter = filters.stratum ?? '';

  const sortableFields = meta.capabilities.sortableFields;
  const canSort = sortableFields.length > 0;
  const activeSort = sort && sortableFields.includes(sort.by) ? sort : null;

  useEffect(() => {
    setSearchDraft(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const next = searchDraft.trim();
      if (next === urlSearch) return;
      setFilters({ search: next || null });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchDraft, setFilters, urlSearch]);

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
      const soft = opts?.soft === true && hasLoadedOnceRef.current;
      if (soft) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      setError(null);

      try {
        const response = await subscribersApi.list(params);
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
        setError(mapError(loadError));
        if (!soft) {
          setRecords([]);
          setMeta(EMPTY_LIST_META);
        }
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [setQuery],
  );

  useEffect(() => {
    void loadPage(listParams, { soft: true });
  }, [listParams, loadPage]);

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

  const showPager = !initialLoading && meta.total > 0;
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
              value={searchDraft}
              onChange={setSearchDraft}
              placeholder="Buscar por nombre, NIT o razón social"
              label="Buscar suscriptor"
              className="min-w-0 flex-1"
            />
            <Button asChild size="sm" className="h-11 min-h-11 w-full shrink-0 px-3 sm:w-auto">
              <Link href="/dashboard/crm/subscribers/new">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Nuevo suscriptor
              </Link>
            </Button>
          </div>

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
        </div>

        {canSort ? (
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
                    {renderHead(null, 'IVA')}
                    {renderHead(null, 'Ubicación')}
                    {renderHead('status', 'Estado')}
                    {renderHead('createdAt', 'Creado')}
                  </tr>
                </thead>
                <tbody className={portalDataTableBodyClassName}>
                  {initialLoading && records.length === 0
                    ? Array.from({ length: 5 }, (_, index) => (
                        <tr key={`subscriber-skeleton-${index}`}>
                          <td className={portalDataTableCellClassName} colSpan={8}>
                            <PortalSkeletonBlock className="h-10 w-full rounded-xl" />
                          </td>
                        </tr>
                      ))
                    : null}

                  {!initialLoading && records.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={cn(portalDataTableCellClassName, 'py-12')}>
                        <PortalEmptyState
                          title={
                            hasActiveFilters
                              ? 'No se encontraron resultados'
                              : 'Aún no hay suscriptores'
                          }
                          description={
                            hasActiveFilters
                              ? 'Ajusta la búsqueda o limpia los filtros para ver otros suscriptores.'
                              : 'Registra el primero para iniciar el ciclo comercial y postventa.'
                          }
                          icon={CircleDashed}
                          className="w-full text-left"
                          action={
                            hasActiveFilters ? (
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
                              {formatSubscriberName(subscriber)}
                            </p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {subscriber.email || subscriber.phone || 'Sin contacto principal'}
                            </p>
                          </Link>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {formatDocumentDisplay(subscriber)}
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
                          {formatVatTreatmentLabel(subscriber.vatTreatment)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {formatSubscriberLocation(subscriber.city, subscriber.department)}
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
