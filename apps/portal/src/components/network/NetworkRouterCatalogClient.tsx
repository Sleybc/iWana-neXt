'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AccessPermissionKey } from '@iwana/shared';
import type { RouterDto, RouterListDto } from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import { Pencil, Plus, Router as RouterIcon, ToggleLeft, ToggleRight } from 'lucide-react';
import { usePermissions } from '@/components/access-control/permissions-context';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalPanel,
  PortalSearchField,
  PortalTablePager,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableHeadRowClassName,
  portalDataTableInactiveRowClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import {
  getCatalogStatusLabel,
  getCatalogStatusVariant,
  getControlMethodLabel,
  getNetworkApiErrorMessage,
} from '@/components/network/network-catalog-labels';
import { NetworkRouterDrawer } from '@/components/network/NetworkRouterDrawer';
import { NetworkRouterDetailSidePeek } from '@/components/network/NetworkRouterDetailSidePeek';
import { Ipv4NetworkDrawer } from '@/components/network/Ipv4NetworkDrawer';
import { NetworkCatalogTableSkeleton } from '@/components/network/NetworkCatalogDrawerFrame';
import { useNetworkCatalogQuery } from '@/components/network/use-network-catalog-query';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { networkApi } from '@/lib/api-client';
import type { NetworkCatalogListParams } from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';

const ROUTER_FILTER_KEYS = ['q', 'status'] as const;

function describeStatusError(error: unknown): string {
  return getNetworkApiErrorMessage(
    error,
    'No pudimos actualizar el estado del router. Intenta nuevamente.',
  );
}

export function NetworkRouterCatalogClient() {
  const appRouter = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(AccessPermissionKey.NETWORK_CATALOG_MANAGE);
  const query = useNetworkCatalogQuery('routers', ROUTER_FILTER_KEYS);
  const [routers, setRouters] = useState<RouterListDto[]>([]);
  const [meta, setMeta] = useState(EMPTY_LIST_META);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingRouterId, setPendingRouterId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRouter, setEditingRouter] = useState<RouterDto | null>(null);
  const [networkDrawerOpen, setNetworkDrawerOpen] = useState(false);
  const [networkRouterContext, setNetworkRouterContext] = useState<RouterDto | null>(null);
  const loadRequestId = useRef(0);
  const openedDetailFromList = useRef(false);
  const listHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const selectedRouterId = searchParams.get('routerId');

  const requestParams = useMemo((): NetworkCatalogListParams => {
    const status =
      query.filters.status === 'ACTIVE'
        ? 'ACTIVE'
        : query.filters.status === 'INACTIVE'
          ? 'INACTIVE'
          : undefined;
    return {
      page: query.page,
      limit: query.pageSize,
      ...(query.searchDraft.trim() ? { q: query.searchDraft.trim() } : {}),
      ...(status ? { status } : {}),
    };
  }, [query.filters.status, query.page, query.pageSize, query.searchDraft]);

  const loadRouters = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setIsLoading(true);
    setLoadError(null);
    setAccessDenied(false);
    try {
      const result = await networkApi.listRouters(requestParams);
      if (requestId !== loadRequestId.current) return;
      const data = Array.isArray(result.data) ? result.data : [];
      setRouters(data);
      setMeta(
        normalizeListMeta(result.meta, {
          dataLength: data.length,
          limit: requestParams.limit ?? query.pageSize,
        }),
      );
    } catch (error) {
      if (requestId !== loadRequestId.current) return;
      if (error instanceof ApiError && error.status === 403) {
        setAccessDenied(true);
      } else {
        setLoadError(getNetworkApiErrorMessage(error, 'No pudimos cargar los routers. Reintenta.'));
      }
    } finally {
      if (requestId === loadRequestId.current) setIsLoading(false);
    }
  }, [query.pageSize, requestParams]);

  useEffect(() => {
    void loadRouters();
  }, [loadRouters]);

  useEffect(
    () => () => {
      loadRequestId.current += 1;
    },
    [],
  );

  const setPage = query.setPage;
  const currentPage = query.page;
  useEffect(() => {
    if (
      !isLoading &&
      meta.capabilities.randomAccess &&
      meta.totalPages &&
      currentPage > meta.totalPages
    ) {
      setPage(meta.totalPages);
    }
  }, [currentPage, isLoading, meta.capabilities.randomAccess, meta.totalPages, setPage]);

  const { from, to } = listPageWindow({
    page: meta.page ?? query.page,
    limit: meta.limit || query.pageSize,
    total: meta.total,
  });
  const pageCount = Math.max(1, meta.totalPages ?? 1);
  const hasFilters = query.hasActiveFilters;

  const openCreate = () => {
    setEditingRouter(null);
    setDrawerOpen(true);
    setSuccessMessage(null);
    setMutationError(null);
  };

  const openEdit = (router: RouterDto) => {
    setEditingRouter(router);
    setDrawerOpen(true);
    setSuccessMessage(null);
    setMutationError(null);
  };

  const openDetail = (routerId: string) => {
    openedDetailFromList.current = true;
    const params = mergeUrlSearchParams(searchParams, { routerId });
    appRouter.push(withSearchParams(pathname, params), { scroll: false });
  };

  const closeDetail = () => {
    if (openedDetailFromList.current) {
      openedDetailFromList.current = false;
      appRouter.back();
      return;
    }
    const params = mergeUrlSearchParams(searchParams, { routerId: null });
    appRouter.replace(withSearchParams(pathname, params), { scroll: false });
  };

  const toggleStatus = async (router: RouterDto) => {
    setPendingRouterId(router.id);
    setMutationError(null);
    setSuccessMessage(null);
    try {
      const nextStatus = router.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await networkApi.setRouterStatus(router.id, router.version, nextStatus);
      setSuccessMessage(
        `Router ${router.name} ${nextStatus === 'ACTIVE' ? 'activado' : 'desactivado'}.`,
      );
      await loadRouters();
    } catch (error) {
      setMutationError(describeStatusError(error));
    } finally {
      setPendingRouterId(null);
    }
  };

  if (accessDenied) {
    return (
      <PortalAlert
        variant="warning"
        title="Sin acceso al catálogo de routers"
        description="No tienes acceso al catálogo de routers."
      />
    );
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="portal-eyebrow">Red</p>
        <h1
          ref={listHeadingRef}
          tabIndex={-1}
          className="text-2xl font-semibold text-gray-900 dark:text-white"
        >
          Routers
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
          Consulta los equipos de red y administra sus datos de conexión.
        </p>
      </header>

      {successMessage ? (
        <PortalAlert variant="success" title="Cambios guardados" description={successMessage} />
      ) : null}
      {mutationError ? (
        <PortalAlert
          variant="error"
          title="No se actualizó el router"
          description={mutationError}
        />
      ) : null}

      <PortalPanel
        eyebrow="Catálogo de red"
        title="Routers registrados"
        description="Busca routers, revisa sus métodos de control y consulta las redes asociadas."
        actions={
          canManage ? (
            <Button type="button" variant="primary" className="min-h-11" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Registrar router
            </Button>
          ) : undefined
        }
        contentClassName="space-y-4"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <PortalSearchField
              id="router-search"
              value={query.searchDraft}
              onChange={query.setSearchDraft}
              placeholder="Buscar routers"
              label="Buscar routers por nombre"
            />
            <div className="space-y-1">
              <label
                htmlFor="router-status-filter"
                className="block text-xs font-medium text-gray-600 dark:text-gray-300"
              >
                Estado
              </label>
              <select
                id="router-status-filter"
                value={query.filters.status ?? ''}
                onChange={(event) => query.setFilter('status', event.target.value)}
                className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white sm:w-44"
              >
                <option value="">Todos</option>
                <option value="ACTIVE">Activos</option>
                <option value="INACTIVE">Inactivos</option>
              </select>
            </div>
          </div>
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 self-start"
              onClick={query.clearFilters}
            >
              Limpiar filtros
            </Button>
          ) : null}
        </div>

        {loadError ? (
          <PortalAlert
            variant="error"
            title="No pudimos cargar los routers"
            description={loadError}
            action={
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => void loadRouters()}
              >
                Reintentar
              </Button>
            }
          />
        ) : null}

        {isLoading ? (
          <section aria-busy="true">
            <p className="sr-only" role="status" aria-live="polite">
              Cargando routers
            </p>
            <NetworkCatalogTableSkeleton columnCount={canManage ? 10 : 9} />
          </section>
        ) : !loadError && routers.length === 0 ? (
          <PortalEmptyState
            icon={RouterIcon}
            title={
              hasFilters
                ? 'No hay routers para este filtro.'
                : 'Todavía no hay routers registrados.'
            }
            description={
              hasFilters
                ? 'Ajusta la búsqueda o limpia los filtros para ver otros routers.'
                : canManage
                  ? 'Registra un router para asociar sus redes IPv4.'
                  : 'La lista aparecerá cuando se configure el catálogo.'
            }
            action={
              hasFilters ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={query.clearFilters}
                >
                  Limpiar filtros
                </Button>
              ) : canManage ? (
                <Button type="button" variant="primary" className="min-h-11" onClick={openCreate}>
                  Registrar router
                </Button>
              ) : undefined
            }
          />
        ) : routers.length > 0 ? (
          <>
            <div className={portalDataTableShellClassName}>
              <div
                className="overflow-x-auto"
                role="region"
                aria-label="Tabla de routers"
                tabIndex={0}
              >
                <table className="min-w-[1120px] w-full text-sm">
                  <thead>
                    <tr className={portalDataTableHeadRowClassName}>
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Router
                      </th>
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Dirección de administración
                      </th>
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Referencia LAN anterior
                      </th>
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Interfaces
                      </th>
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Métodos admitidos
                      </th>
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Sede
                      </th>
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Nodo comercial
                      </th>
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Redes
                      </th>
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Estado
                      </th>
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Detalle y acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className={portalDataTableBodyClassName}>
                    {routers.map((router) => (
                      <tr
                        key={router.id}
                        className={
                          router.status === 'INACTIVE'
                            ? portalDataTableInactiveRowClassName
                            : undefined
                        }
                      >
                        <th
                          scope="row"
                          className={`${portalDataTableCellClassName} text-left font-semibold text-gray-900 dark:text-white`}
                        >
                          {router.name}
                        </th>
                        <td className={`${portalDataTableCellClassName} font-mono`}>
                          {router.managementHost}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {router.lanInterface || '—'}
                        </td>
                        <td className={`${portalDataTableCellClassName} tabular-nums`}>
                          {Number.isFinite(router.interfaceCount) ? router.interfaceCount : '—'}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <ul className="space-y-1">
                            {router.supportedControlMethods.map((method) => (
                              <li key={method}>{getControlMethodLabel(method)}</li>
                            ))}
                          </ul>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {router.organizationSiteId
                            ? (router.organizationSite?.name ?? 'Sede asociada')
                            : '—'}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {router.commercialNodeId ? 'Nodo comercial asociado' : '—'}
                        </td>
                        <td className={`${portalDataTableCellClassName} tabular-nums`}>
                          {router.networkCount}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <Badge variant={getCatalogStatusVariant(router.status)}>
                            {getCatalogStatusLabel(router.status)}
                          </Badge>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              className="min-h-11"
                              onClick={() => openDetail(router.id)}
                            >
                              Ver router
                            </Button>
                            {canManage ? (
                              <>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="icon"
                                  className="min-h-11 min-w-11"
                                  onClick={() => openEdit(router)}
                                  aria-label={`Editar router ${router.name}`}
                                  title={`Editar router ${router.name}`}
                                >
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="min-h-11 min-w-11"
                                  disabled={pendingRouterId === router.id}
                                  onClick={() => void toggleStatus(router)}
                                  aria-label={`${router.status === 'ACTIVE' ? 'Desactivar' : 'Activar'} router ${router.name}`}
                                  title={`${router.status === 'ACTIVE' ? 'Desactivar' : 'Activar'} router`}
                                >
                                  {router.status === 'ACTIVE' ? (
                                    <ToggleRight
                                      className="h-5 w-5 text-iwana-secondary-700 dark:text-iwana-secondary-400"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <ToggleLeft className="h-5 w-5" aria-hidden="true" />
                                  )}
                                  {router.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PortalTablePager
                page={meta.page ?? query.page}
                pageCount={pageCount}
                onPageChange={query.setPage}
                from={from}
                to={to}
                total={meta.total}
                resource={{ singular: 'router', plural: 'routers' }}
                totalIsEstimate={meta.totalIsEstimate}
                loading={isLoading}
                pageSizeControl={
                  <PortalPageSizeSelect
                    value={query.pageSize}
                    onChange={query.setPageSize}
                    disabled={isLoading}
                  />
                }
              />
            </div>
          </>
        ) : null}
      </PortalPanel>

      <NetworkRouterDrawer
        open={drawerOpen}
        router={editingRouter}
        canManage={canManage}
        onClose={() => setDrawerOpen(false)}
        onRouterCreated={(createdRouter) => {
          setNetworkRouterContext(createdRouter);
          setNetworkDrawerOpen(true);
          setSuccessMessage('Router guardado. Completa su red IPv4.');
        }}
        onSaved={async () => {
          await loadRouters();
          setSuccessMessage('Router guardado.');
        }}
      />
      <Ipv4NetworkDrawer
        open={networkDrawerOpen}
        network={null}
        routerContext={networkRouterContext}
        onClose={() => {
          setNetworkDrawerOpen(false);
          setNetworkRouterContext(null);
        }}
        onSaved={async () => {
          await loadRouters();
          setNetworkDrawerOpen(false);
          setNetworkRouterContext(null);
          setSuccessMessage('Red IPv4 guardada.');
        }}
      />
      <NetworkRouterDetailSidePeek
        routerId={selectedRouterId}
        canManage={canManage}
        returnFocusFallbackRef={listHeadingRef}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      />
    </main>
  );
}
