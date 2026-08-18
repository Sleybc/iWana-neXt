'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Input, Select, cn } from '@iwana/ui';
import type { ListMeta } from '@iwana/shared';
import { CustomerSegment, PersonType, SubscriberStatus } from '@iwana/shared';
import { AlertTriangle, Loader2, Plus, Search, Users } from 'lucide-react';
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
  PortalPageSizeSelect,
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
        subtitle="Consulta, filtra y gestiona el ciclo de vida comercial de los suscriptores de la empresa."
        actions={
          <Button asChild variant="primary">
            <Link href="/dashboard/crm/subscribers/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo suscriptor
            </Link>
          </Button>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95">
        <div className="border-b border-gray-100/80 px-5 py-5 dark:border-dark-border">
          <div className="mb-4 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Radar de suscriptores
            </p>
            <h2 className="text-lg font-semibold text-iwana-primary dark:text-white">
              Operación comercial y postventa
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Usa filtros combinados o búsqueda por nombre, NIT o razón social.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_220px_220px_220px_180px] lg:items-end">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              />
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Buscar por nombre, NIT o razón social"
                className="h-12 pl-11"
                aria-label="Buscar suscriptores"
              />
            </div>

            <Select
              id="subscriber-status-filter"
              label="Estado"
              className="h-12"
              value={statusFilter}
              onChange={(event) => setFilters({ status: event.target.value || null })}
              options={SUBSCRIBER_STATUS_OPTIONS}
            >
              <option value="">Todos</option>
            </Select>

            <Select
              id="subscriber-person-type-filter"
              label="Tipo persona"
              className="h-12"
              value={personTypeFilter}
              onChange={(event) => setFilters({ personType: event.target.value || null })}
              options={[...PERSON_TYPE_OPTIONS]}
            >
              <option value="">Todos</option>
            </Select>

            <Select
              id="subscriber-segment-filter"
              label="Segmento"
              className="h-12"
              value={segmentFilter}
              onChange={(event) => setFilters({ customerSegment: event.target.value || null })}
              options={[...CUSTOMER_SEGMENT_OPTIONS]}
            >
              <option value="">Todos</option>
            </Select>

            <Select
              id="subscriber-stratum-filter"
              label="Estrato"
              className="h-12"
              value={stratumFilter}
              onChange={(event) => setFilters({ stratum: event.target.value || null })}
              options={[...STRATUM_OPTIONS]}
            >
              <option value="">Todos</option>
            </Select>
          </div>

          {canSort ? (
            <div className="mt-3 sm:hidden">
              <Select
                id="subscriber-mobile-sort"
                label="Ordenar por"
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
        </div>

        {error && (
          <div className="mx-5 mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-700 shadow-[var(--shadow-sm)] dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {outOfRangeNotice ? (
          <div className="mx-5 mt-5">
            <PortalAlert
              variant="warning"
              title="Página fuera de rango"
              description={outOfRangeNotice}
              live="polite"
            />
          </div>
        ) : null}

        <div className="space-y-3 px-5 pt-5">
          <div ref={tableShellRef} className={portalDataTableShellClassName}>
            <div
              className={
                refreshing ? `overflow-x-auto ${portalDataBusyRegionClassName}` : 'overflow-x-auto'
              }
              aria-busy={refreshing || undefined}
            >
              <table className="w-full text-sm">
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
                  {initialLoading && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                          Cargando suscriptores...
                        </div>
                      </td>
                    </tr>
                  )}

                  {!initialLoading && records.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                      >
                        <div className="flex flex-col items-center gap-3">
                          <Users
                            className="h-10 w-10 text-gray-300 dark:text-gray-400"
                            aria-hidden="true"
                          />
                          <div>
                            <p className="font-semibold text-gray-700 dark:text-gray-200">
                              {hasActiveFilters
                                ? 'No hay suscriptores con estos filtros.'
                                : 'No hay suscriptores para mostrar.'}
                            </p>
                            <p className="text-sm">
                              {hasActiveFilters
                                ? 'Quita filtros o amplía la búsqueda para ver más resultados.'
                                : 'Crea el primer registro de la empresa.'}
                            </p>
                          </div>
                          {hasActiveFilters ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={clearFilters}
                            >
                              Limpiar filtros
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )}

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
      </div>
    </div>
  );
}

export function SubscribersListClient() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Cargando suscriptores...
        </div>
      }
    >
      <SubscribersListClientInner />
    </Suspense>
  );
}
