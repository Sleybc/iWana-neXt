'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AccessPermissionKey } from '@iwana/shared';
import type { Ipv4NetworkExtendedDto, RouterDto } from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import { Network as NetworkIcon, Pencil, Plus, ToggleLeft } from 'lucide-react';
import { usePermissions } from '@/components/access-control/permissions-context';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalPanel,
  PortalTablePager,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableHeadRowClassName,
  portalDataTableInactiveRowClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import { Ipv4NetworkDrawer } from '@/components/network/Ipv4NetworkDrawer';
import { NetworkCatalogTableSkeleton } from '@/components/network/NetworkCatalogDrawerFrame';
import {
  getCatalogStatusLabel,
  getCatalogStatusVariant,
  getControlMethodLabel,
  getNetworkApiErrorMessage,
} from '@/components/network/network-catalog-labels';
import { useNetworkCatalogQuery } from '@/components/network/use-network-catalog-query';
import {
  EMPTY_LIST_META,
  collectListPages,
  listPageWindow,
  normalizeListMeta,
} from '@/lib/list-meta';
import { networkApi } from '@/lib/api-client';
import type { NetworkCatalogListParams } from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';

const NETWORK_FILTER_KEYS = ['status', 'routerId'] as const;

export function Ipv4NetworkCatalogClient() {
  const appRouter = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(AccessPermissionKey.NETWORK_CATALOG_MANAGE);
  const query = useNetworkCatalogQuery('networks', NETWORK_FILTER_KEYS);
  const [networks, setNetworks] = useState<Ipv4NetworkExtendedDto[]>([]);
  const [meta, setMeta] = useState(EMPTY_LIST_META);
  const [routers, setRouters] = useState<RouterDto[]>([]);
  const [routerOptionsError, setRouterOptionsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRouters, setIsLoadingRouters] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingNetworkId, setPendingNetworkId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingNetwork, setEditingNetwork] = useState<Ipv4NetworkExtendedDto | null>(null);
  const [routerContext, setRouterContext] = useState<RouterDto | null>(null);
  const loadRequestId = useRef(0);

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
      ...(status ? { status } : {}),
      ...(query.filters.routerId ? { routerId: query.filters.routerId } : {}),
    };
  }, [query.filters.routerId, query.filters.status, query.page, query.pageSize]);

  const loadNetworks = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setIsLoading(true);
    setLoadError(null);
    setAccessDenied(false);
    try {
      const result = await networkApi.listIpv4Networks(requestParams);
      if (requestId !== loadRequestId.current) return;
      const data = Array.isArray(result.data) ? result.data : [];
      setNetworks(data);
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
        setLoadError(
          getNetworkApiErrorMessage(error, 'No pudimos cargar las redes IPv4. Reintenta.'),
        );
      }
    } finally {
      if (requestId === loadRequestId.current) setIsLoading(false);
    }
  }, [query.pageSize, requestParams]);

  useEffect(() => {
    void loadNetworks();
  }, [loadNetworks]);

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

  useEffect(() => {
    let active = true;
    setIsLoadingRouters(true);
    setRouterOptionsError(null);
    void collectListPages((page) => networkApi.listRouters({ page, limit: 100 }), {
      maxPages: 50,
      limit: 100,
    })
      .then((result) => {
        if (active) setRouters(result.data);
      })
      .catch((error: unknown) => {
        if (active) {
          setRouterOptionsError(
            getNetworkApiErrorMessage(error, 'No pudimos cargar la lista de routers.'),
          );
        }
      })
      .finally(() => {
        if (active) setIsLoadingRouters(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const { from, to } = listPageWindow({
    page: meta.page ?? query.page,
    limit: meta.limit || query.pageSize,
    total: meta.total,
  });
  const pageCount = Math.max(1, meta.totalPages ?? 1);
  const hasFilters = query.hasActiveFilters;

  const openCreate = () => {
    setEditingNetwork(null);
    setRouterContext(routers.find((router) => router.id === query.filters.routerId) ?? null);
    setDrawerOpen(true);
    setSuccessMessage(null);
    setMutationError(null);
  };

  const openEdit = (network: Ipv4NetworkExtendedDto) => {
    setEditingNetwork(network);
    setRouterContext(null);
    setDrawerOpen(true);
    setSuccessMessage(null);
    setMutationError(null);
  };

  const toggleStatus = async (network: Ipv4NetworkExtendedDto) => {
    setPendingNetworkId(network.id);
    setMutationError(null);
    setSuccessMessage(null);
    try {
      const nextStatus = network.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await networkApi.setIpv4NetworkStatus(network.id, network.version, nextStatus);
      setSuccessMessage(
        `Red IPv4 ${network.name} ${nextStatus === 'ACTIVE' ? 'activada' : 'desactivada'}.`,
      );
      await loadNetworks();
    } catch (error) {
      setMutationError(
        getNetworkApiErrorMessage(
          error,
          'No pudimos actualizar el estado de la red IPv4. Intenta nuevamente.',
        ),
      );
    } finally {
      setPendingNetworkId(null);
    }
  };

  useEffect(() => {
    if (searchParams.get('networks.create') !== '1' || isLoadingRouters) return;
    const requestedRouterId = searchParams.get('networks.routerId');
    setEditingNetwork(null);
    setRouterContext(routers.find((router) => router.id === requestedRouterId) ?? null);
    setDrawerOpen(true);
    setSuccessMessage(null);
    setMutationError(null);
    const nextParams = mergeUrlSearchParams(searchParams, { 'networks.create': null });
    appRouter.replace(withSearchParams(pathname, nextParams), { scroll: false });
  }, [appRouter, isLoadingRouters, pathname, routers, searchParams]);

  if (accessDenied) {
    return (
      <PortalAlert
        variant="warning"
        title="Sin acceso al catálogo de redes IPv4"
        description="No tienes acceso al catálogo de redes IPv4."
      />
    );
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="portal-eyebrow">Red</p>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Redes IPv4</h1>
        <p className="max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
          Consulta los bloques de direcciones, sus rangos asignables y la ocupación actual.
        </p>
      </header>

      {successMessage ? (
        <PortalAlert variant="success" title="Cambios guardados" description={successMessage} />
      ) : null}
      {mutationError ? (
        <PortalAlert
          variant="error"
          title="No se actualizó la red IPv4"
          description={mutationError}
        />
      ) : null}

      <PortalPanel
        eyebrow="Catálogo de red"
        title="Redes IPv4 registradas"
        description="Filtra por router o estado y revisa las direcciones reservadas, activas y libres."
        actions={
          canManage ? (
            <Button type="button" variant="primary" className="min-h-11" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Registrar red
            </Button>
          ) : undefined
        }
        contentClassName="space-y-4"
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1">
              <label
                htmlFor="ipv4-network-router-filter"
                className="block text-xs font-medium text-gray-600 dark:text-gray-300"
              >
                Router
              </label>
              <select
                id="ipv4-network-router-filter"
                value={query.filters.routerId ?? ''}
                onChange={(event) => query.setFilter('routerId', event.target.value)}
                disabled={isLoadingRouters || routers.length === 0}
                className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white sm:w-56"
              >
                <option value="">Todos los routers</option>
                {routers.map((router) => (
                  <option key={router.id} value={router.id}>
                    {router.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label
                htmlFor="ipv4-network-status-filter"
                className="block text-xs font-medium text-gray-600 dark:text-gray-300"
              >
                Estado
              </label>
              <select
                id="ipv4-network-status-filter"
                value={query.filters.status ?? ''}
                onChange={(event) => query.setFilter('status', event.target.value)}
                className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white sm:w-44"
              >
                <option value="">Todos</option>
                <option value="ACTIVE">Activas</option>
                <option value="INACTIVE">Inactivas</option>
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

        {routerOptionsError ? (
          <PortalAlert
            variant="warning"
            title="Filtro por router no disponible"
            description={routerOptionsError}
          />
        ) : null}
        {loadError ? (
          <PortalAlert
            variant="error"
            title="No pudimos cargar las redes IPv4"
            description={loadError}
            action={
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => void loadNetworks()}
              >
                Reintentar
              </Button>
            }
          />
        ) : null}

        {isLoading ? (
          <section aria-busy="true">
            <p className="sr-only" role="status" aria-live="polite">
              Cargando redes IPv4
            </p>
            <NetworkCatalogTableSkeleton columnCount={canManage ? 9 : 8} />
          </section>
        ) : !loadError && networks.length === 0 ? (
          <PortalEmptyState
            icon={NetworkIcon}
            title={
              hasFilters
                ? 'No hay redes para este filtro.'
                : 'Todavía no hay redes IPv4 registradas.'
            }
            description={
              hasFilters
                ? 'Ajusta la búsqueda o limpia los filtros para consultar otras redes.'
                : 'Registra una red para organizar sus direcciones asignables.'
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
                  Registrar red
                </Button>
              ) : undefined
            }
          />
        ) : networks.length > 0 ? (
          <div className={portalDataTableShellClassName}>
            <div
              className="overflow-x-auto"
              role="region"
              aria-label="Tabla de redes IPv4"
              tabIndex={0}
            >
              <table className="min-w-[1250px] w-full text-sm">
                <thead>
                  <tr className={portalDataTableHeadRowClassName}>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Red IPv4
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Router
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      CIDR
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Gateway
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Rango asignable
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Método por defecto
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Estado
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Ocupación
                    </th>
                    {canManage ? (
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Acciones
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className={portalDataTableBodyClassName}>
                  {networks.map((network) => {
                    const occupied = network.occupancy.reserved + network.occupancy.active;
                    const meterMax = Math.max(1, network.occupancy.total);
                    const meterValue = Math.min(occupied, meterMax);
                    return (
                      <tr
                        key={network.id}
                        className={
                          network.status === 'INACTIVE'
                            ? portalDataTableInactiveRowClassName
                            : undefined
                        }
                      >
                        <th
                          scope="row"
                          className={`${portalDataTableCellClassName} text-left font-semibold text-gray-900 dark:text-white`}
                        >
                          {network.name}
                        </th>
                        <td className={portalDataTableCellClassName}>{network.routerName}</td>
                        <td className={`${portalDataTableCellClassName} font-mono`}>
                          {network.cidr}
                        </td>
                        <td className={`${portalDataTableCellClassName} font-mono`}>
                          {network.gateway}
                        </td>
                        <td className={`${portalDataTableCellClassName} font-mono`}>
                          {network.assignableFrom} – {network.assignableTo}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {getControlMethodLabel(network.defaultControlMethod)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <Badge variant={getCatalogStatusVariant(network.status)}>
                            {getCatalogStatusLabel(network.status)}
                          </Badge>
                        </td>
                        <td className={`${portalDataTableCellClassName} min-w-56`}>
                          <div className="space-y-2">
                            <div
                              role="meter"
                              aria-label={`Ocupación de la red ${network.name}`}
                              aria-valuemin={0}
                              aria-valuemax={meterMax}
                              aria-valuenow={meterValue}
                              aria-valuetext={`${occupied} de ${network.occupancy.total} direcciones ocupadas; ${network.occupancy.free} libres`}
                              className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-surface-4"
                            >
                              <div
                                className="h-full rounded-full bg-iwana-primary"
                                style={{
                                  width: `${Math.min(100, (meterValue / meterMax) * 100)}%`,
                                }}
                              />
                            </div>
                            <p className="text-xs leading-5 text-gray-600 dark:text-gray-300">
                              {occupied.toLocaleString('es-CO')} de{' '}
                              {network.occupancy.total.toLocaleString('es-CO')} ocupadas;{' '}
                              {network.occupancy.free.toLocaleString('es-CO')} libres
                              <span className="block">
                                {network.occupancy.reserved.toLocaleString('es-CO')} reservadas ·{' '}
                                {network.occupancy.active.toLocaleString('es-CO')} activas
                              </span>
                            </p>
                          </div>
                        </td>
                        {canManage ? (
                          <td className={portalDataTableCellClassName}>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="min-h-11 min-w-11"
                                onClick={() => openEdit(network)}
                                aria-label={`Editar red ${network.name}`}
                                title={`Editar red ${network.name}`}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="min-h-11 min-w-11"
                                disabled={pendingNetworkId === network.id}
                                onClick={() => void toggleStatus(network)}
                                aria-label={`${network.status === 'ACTIVE' ? 'Desactivar' : 'Activar'} red ${network.name}`}
                                title={`${network.status === 'ACTIVE' ? 'Desactivar' : 'Activar'} red`}
                              >
                                <ToggleLeft className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
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
              resource={{ singular: 'red IPv4', plural: 'redes IPv4' }}
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
        ) : null}
      </PortalPanel>

      <Ipv4NetworkDrawer
        open={drawerOpen}
        network={editingNetwork}
        routerContext={routerContext}
        onClose={() => {
          setDrawerOpen(false);
          setRouterContext(null);
        }}
        onSaved={async () => {
          await loadNetworks();
          setSuccessMessage('Red IPv4 guardada.');
        }}
      />
    </main>
  );
}
