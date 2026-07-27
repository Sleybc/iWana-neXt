'use client';

import type { ReactNode } from 'react';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Truck } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import type { ListMeta } from '@iwana/shared';
import { ApiError, purchasingApi, type SupplierProfileRecord } from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalResultsStrip,
  PortalSearchField,
  PortalSkeletonBlock,
  PortalTablePager,
  PortalTablePagination,
  portalDataTableShellClassName,
  portalDataBusyRegionClassName,
} from '@/components/shared/portal-ui';
import { SuppliersTable } from './SuppliersTable';
import { InventoryCatalogProductsSkeleton } from './InventoryCatalogProductsSkeleton';

interface SuppliersPanelProps {
  onCreate: () => void;
  onRowClick: (supplier: SupplierProfileRecord) => void;
  createAction?: ReactNode;
  /** Incrementar tras mutaciones del padre. */
  listRevision?: number;
}

const SUPPLIERS_RESOURCE = { singular: 'proveedor', plural: 'proveedores' } as const;
const SUPPLIERS_NAMESPACE = 'suppliers';
const SUPPLIERS_FILTER_KEYS = ['search'] as const;
const PAGE_OUT_OF_RANGE_NOTICE = 'Esa página ya no existe. Mostrando la última página disponible.';

function mapSuppliersListError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para consultar proveedores.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
    return error.message;
  }
  return 'No fue posible cargar los proveedores.';
}

function SuppliersPanelInner({
  onCreate,
  onRowClick,
  createAction,
  listRevision = 0,
}: SuppliersPanelProps) {
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const tableShellRef = useRef<HTMLDivElement | null>(null);

  const { page, pageSize, filters, setPage, setPageSize, setFilters, setQuery } =
    useTableQueryState({
      namespace: SUPPLIERS_NAMESPACE,
      filterKeys: SUPPLIERS_FILTER_KEYS,
      defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
    });

  const search = filters.search ?? '';
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    const trimmed = searchInput.trim();
    const current = search.trim();
    if (trimmed === current) {
      return;
    }
    const handle = window.setTimeout(
      () => {
        setFilters({ search: trimmed || null });
      },
      trimmed ? 300 : 0,
    );
    return () => window.clearTimeout(handle);
  }, [search, searchInput, setFilters]);

  const [suppliers, setSuppliers] = useState<SupplierProfileRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);

  const loadPage = useCallback(
    async (opts?: { soft?: boolean }) => {
      const soft = opts?.soft === true && hasLoadedOnceRef.current;
      if (soft) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setListError(null);

      try {
        const response = await purchasingApi.listSuppliers({
          page,
          limit: pageSize,
          ...(search.trim() ? { search: search.trim() } : {}),
        });
        const nextMeta = normalizeListMeta(
          response.meta ?? {
            page: response.page,
            limit: response.limit ?? pageSize,
            total: response.total,
            mode: 'page',
            capabilities: { randomAccess: true, sortableFields: [] },
          },
          { dataLength: response.data.length, limit: pageSize },
        );
        const requestedPage = page;
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
          setQuery({ page: Math.max(1, totalPages || requestedPage - 1) }, { history: 'replace' });
          return;
        }

        setSuppliers(response.data);
        setMeta(nextMeta);
        hasLoadedOnceRef.current = true;
      } catch (loadError: unknown) {
        setListError(mapSuppliersListError(loadError));
        if (!soft) {
          setSuppliers([]);
          setMeta(EMPTY_LIST_META);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, pageSize, search, setQuery],
  );

  useEffect(() => {
    void loadPage({ soft: true });
  }, [loadPage, listRevision]);

  const prevPageRef = useRef(page);
  useEffect(() => {
    if (prevPageRef.current === page) return;
    prevPageRef.current = page;
    const el = tableShellRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } catch {
        // jsdom
      }
    }
  }, [page]);

  const pageCount = meta.totalPages ?? (meta.total > 0 ? 1 : 0);
  const effectivePage = meta.page ?? page;
  const { from, to } = listPageWindow({
    page: effectivePage,
    limit: meta.limit || pageSize,
    total: meta.total,
  });
  const randomAccess = meta.capabilities.randomAccess;
  const showPager = !isLoading && meta.total > 0;
  const showPageSize = showPager && randomAccess && meta.total > Math.min(10, 20, 50);
  const hasSearch = Boolean(search.trim());
  const resultsLabel =
    meta.total === 0 && !hasSearch
      ? '0 proveedores'
      : suppliers.length === 0
        ? 'Sin resultados con esta búsqueda'
        : `${from}–${to} de ${meta.total} proveedor${meta.total === 1 ? '' : 'es'}`;

  const emptyAction = createAction ?? (
    <Button type="button" onClick={onCreate}>
      Nuevo proveedor
    </Button>
  );

  if (isLoading && suppliers.length === 0 && !hasLoadedOnceRef.current) {
    return listError ? (
      <PortalAlert
        variant="error"
        title="No fue posible cargar los proveedores"
        description={listError}
      />
    ) : (
      <InventoryCatalogProductsSkeleton />
    );
  }

  return (
    <div className="space-y-4">
      {listError ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar los proveedores"
          description={listError}
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

      <div className="space-y-3 border-b border-gray-100 pb-4 dark:border-dark-border">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_auto] xl:items-end">
          <PortalSearchField
            id="suppliers-search"
            label="Buscar proveedor"
            placeholder="Nombre o código"
            value={searchInput}
            onChange={setSearchInput}
          />
          {hasSearch || searchInput.trim() ? (
            <Button
              type="button"
              variant="secondary"
              className="h-12 px-4"
              onClick={() => {
                setSearchInput('');
                setFilters({ search: null });
              }}
            >
              Limpiar búsqueda
            </Button>
          ) : null}
        </div>
      </div>

      {suppliers.length === 0 ? (
        <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />
      ) : null}

      {!isLoading && suppliers.length === 0 && !hasSearch ? (
        <PortalEmptyState
          title="Sin proveedores registrados"
          description="Registra proveedores para vincularlos a compras y cotizaciones."
          icon={Truck}
          action={emptyAction}
        />
      ) : !isLoading && suppliers.length === 0 ? (
        <PortalEmptyState
          title="Sin resultados con esta búsqueda"
          description="Cambia la búsqueda para encontrar otro proveedor."
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSearchInput('');
                setFilters({ search: null });
              }}
            >
              Limpiar búsqueda
            </Button>
          }
        />
      ) : (
        <div ref={tableShellRef} className={portalDataTableShellClassName}>
          <div
            className={
              isRefreshing ? `overflow-x-auto ${portalDataBusyRegionClassName}` : 'overflow-x-auto'
            }
            aria-busy={isRefreshing || undefined}
          >
            <SuppliersTable
              suppliers={suppliers}
              isLoading={isLoading}
              isRefreshing={isRefreshing}
              suppressEmptyState
              onRowClick={onRowClick}
            />
          </div>
          {showPager && randomAccess ? (
            <PortalTablePager
              page={effectivePage}
              pageCount={Math.max(1, pageCount)}
              onPageChange={setPage}
              from={from}
              to={to}
              total={meta.total}
              resource={SUPPLIERS_RESOURCE}
              loading={isRefreshing}
              pageSizeControl={
                showPageSize ? (
                  <PortalPageSizeSelect
                    value={pageSize}
                    onChange={setPageSize}
                    disabled={isRefreshing}
                  />
                ) : undefined
              }
            />
          ) : null}
          {showPager && !randomAccess ? (
            <PortalTablePagination
              hasMore={meta.hasMore}
              onLoadMore={() => setPage(page + 1)}
              loading={isRefreshing}
              resourceLabel="proveedores"
              shown={to}
              total={meta.total}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export function SuppliersPanel(props: SuppliersPanelProps) {
  return (
    <Suspense fallback={<InventoryCatalogProductsSkeleton />}>
      <SuppliersPanelInner {...props} />
    </Suspense>
  );
}
