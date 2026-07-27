'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button } from '@iwana/ui';
import { StockIssueStatus, type ListMeta } from '@iwana/shared';
import type {
  CreateStockIssueDto,
  DispatchStockIssueDto,
  InventoryItemRecord,
  SerializedAssetRecord,
  StockBalanceRecord,
  StockIssueDetailRecord,
  StockIssueRecord,
  StockLocationRecord,
  UpdateStockIssueDto,
} from '@/lib/api-client';
import { ApiError, inventoryApi } from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import {
  PortalAlert,
  PortalPageSizeSelect,
  PortalPanel,
  PortalResultsStrip,
  PortalSkeletonBlock,
  PortalTablePager,
  PortalTablePagination,
  portalDataTableShellClassName,
  portalDataBusyRegionClassName,
} from '@/components/shared/portal-ui';
import {
  buildStockIssuesListParams,
  hasActiveIssueFilters,
  issueFiltersFromTableQuery,
  STOCK_ISSUES_FILTER_KEYS,
  STOCK_ISSUES_NAMESPACE,
  tableQueryFromIssueFilters,
} from './issue-list-query';
import type { StockIssueFilters } from './issue-filters';
import { getStockIssueStatusLabel } from './inventory-labels';
import { PurchaseCreateModeShell } from './PurchaseCreateModeShell';
import { StockIssueComposer } from './StockIssueComposer';
import { StockIssueCreateModeHeader } from './StockIssueCreateModeHeader';
import { StockIssueDetailDrawer } from './StockIssueDetailDrawer';
import { StockIssuesSummary } from './StockIssuesSummary';
import { StockIssuesTable } from './StockIssuesTable';
import { StockIssuesToolbar } from './StockIssuesToolbar';

type StockIssuesWorkspaceMode = 'inbox' | 'create' | 'edit';

const ISSUES_RESOURCE = { singular: 'salida', plural: 'salidas' } as const;
const PAGE_OUT_OF_RANGE_NOTICE = 'Esa página ya no existe. Mostrando la última página disponible.';

function mapIssuesListError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para consultar salidas.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
    return error.message;
  }
  return 'No fue posible cargar las salidas.';
}

export interface StockIssuesWorkspaceProps {
  items?: InventoryItemRecord[];
  balances?: StockBalanceRecord[];
  assets?: SerializedAssetRecord[];
  locations?: StockLocationRecord[];
  issueItemFrequency?: Record<string, number>;
  /** Incrementar tras mutaciones del padre. */
  listRevision?: number;
  isSubmitting?: boolean;
  error?: string | null;
  onCreate: (dto: CreateStockIssueDto) => Promise<void>;
  onUpdate: (id: string, dto: UpdateStockIssueDto) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  onDispatch: (id: string, dto: DispatchStockIssueDto) => Promise<void>;
  onOpenDetail: (id: string) => Promise<StockIssueDetailRecord>;
  onRefresh: () => void | Promise<void>;
}

function StockIssuesWorkspaceInner({
  items = [],
  balances = [],
  assets = [],
  locations = [],
  issueItemFrequency = {},
  listRevision = 0,
  isSubmitting,
  error,
  onCreate,
  onUpdate,
  onCancel,
  onDispatch,
  onOpenDetail,
  onRefresh,
}: StockIssuesWorkspaceProps) {
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const tableShellRef = useRef<HTMLDivElement | null>(null);

  const {
    page,
    pageSize,
    filters: urlFilters,
    setPage,
    setPageSize,
    setFilters: setUrlFilters,
    setQuery,
  } = useTableQueryState({
    namespace: STOCK_ISSUES_NAMESPACE,
    filterKeys: STOCK_ISSUES_FILTER_KEYS,
    defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
  });

  const filters = useMemo(() => issueFiltersFromTableQuery(urlFilters), [urlFilters]);
  const setFilters = useCallback(
    (next: StockIssueFilters) => {
      setUrlFilters(tableQueryFromIssueFilters(next));
    },
    [setUrlFilters],
  );

  const [issues, setIssues] = useState<StockIssueRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);

  const [workspaceMode, setWorkspaceMode] = useState<StockIssuesWorkspaceMode>('inbox');
  const [editingIssue, setEditingIssue] = useState<StockIssueDetailRecord | null>(null);
  const [composerDirty, setComposerDirty] = useState(false);
  const [draftLineCount, setDraftLineCount] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<StockIssueDetailRecord | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

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
        const response = await inventoryApi.listIssues(
          buildStockIssuesListParams(filters, page, pageSize),
        );
        const nextMeta = normalizeListMeta(response.meta, {
          dataLength: response.data.length,
          limit: pageSize,
        });
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

        setIssues(response.data);
        setMeta(nextMeta);
        hasLoadedOnceRef.current = true;
      } catch (loadError: unknown) {
        setListError(mapIssuesListError(loadError));
        if (!soft) {
          setIssues([]);
          setMeta(EMPTY_LIST_META);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [filters, page, pageSize, setQuery],
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
  const activeFilters = hasActiveIssueFilters(filters);
  const resultsLabel =
    meta.total === 0 && !activeFilters
      ? '0 salidas'
      : issues.length === 0
        ? 'Sin resultados con estos filtros'
        : `${from}–${to} de ${meta.total} salida${meta.total === 1 ? '' : 's'}`;

  function openCreateMode() {
    setDetailOpen(false);
    setDetail(null);
    setEditingIssue(null);
    setWorkspaceMode('create');
  }

  function openEditMode(issue: StockIssueDetailRecord) {
    setDetailOpen(false);
    setDetail(null);
    setEditingIssue(issue);
    setWorkspaceMode('edit');
  }

  function closeComposerMode(force = false) {
    if (!force && composerDirty) {
      const confirmed = window.confirm(
        workspaceMode === 'edit'
          ? 'Hay cambios sin guardar en la edición. ¿Quieres volver al listado y descartarlos?'
          : 'Hay cambios sin guardar en la salida. ¿Quieres volver al listado y descartar este borrador?',
      );
      if (!confirmed) {
        return;
      }
    }

    setWorkspaceMode('inbox');
    setEditingIssue(null);
    setComposerDirty(false);
    setDraftLineCount(0);
  }

  const createAction = (
    <Button type="button" variant="primary" onClick={openCreateMode} disabled={isLoading}>
      Crear salida
    </Button>
  );

  function handleStatusKpiChange(status: StockIssueStatus) {
    if (filters.status === status) {
      const next = { ...filters };
      delete next.status;
      setFilters(next);
      return;
    }
    setFilters({ ...filters, status });
  }

  async function handleToolbarRefresh() {
    await onRefresh();
    await loadPage();
  }

  async function openDetail(issueId: string) {
    setDetailError(null);
    setActionError(null);
    try {
      const loaded = await onOpenDetail(issueId);
      setDetail(loaded);
      setDetailOpen(true);
    } catch (err) {
      setDetail(null);
      setDetailOpen(false);
      setDetailError(err instanceof Error ? err.message : 'No fue posible abrir la salida.');
    }
  }

  async function handleCreate(dto: CreateStockIssueDto) {
    setActionError(null);
    try {
      await onCreate(dto);
      closeComposerMode(true);
      await loadPage({ soft: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No fue posible crear la salida.');
      throw err instanceof Error ? err : new Error('No fue posible crear la salida.');
    }
  }

  async function handleUpdate(issueId: string, dto: UpdateStockIssueDto) {
    setActionError(null);
    try {
      await onUpdate(issueId, dto);
      closeComposerMode(true);
      await loadPage({ soft: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No fue posible guardar la salida.');
      throw err instanceof Error ? err : new Error('No fue posible guardar la salida.');
    }
  }

  const composer = (
    <StockIssueComposer
      mode={workspaceMode === 'edit' ? 'edit' : 'create'}
      editIssue={workspaceMode === 'edit' ? editingIssue : null}
      items={items}
      balances={balances}
      assets={assets}
      issueItemFrequency={issueItemFrequency}
      isSubmitting={Boolean(isSubmitting)}
      error={actionError}
      onDirtyChange={setComposerDirty}
      onDraftLineCountChange={setDraftLineCount}
      onSubmit={handleCreate}
      onUpdate={handleUpdate}
    />
  );

  return (
    <div className="space-y-6">
      {error || listError ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar salidas"
          description={listError ?? error}
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
      {detailError ? (
        <PortalAlert
          variant="warning"
          title="No fue posible abrir la salida"
          description={detailError}
        />
      ) : null}
      {workspaceMode === 'inbox' && actionError ? (
        <PortalAlert
          variant="error"
          title="No fue posible completar la acción"
          description={actionError}
        />
      ) : null}

      {workspaceMode === 'inbox' ? (
        <>
          {/* Conteos KPI page-local hasta agregación servidor. */}
          <StockIssuesSummary
            issues={issues}
            activeStatus={filters.status}
            isLoading={isLoading}
            onStatusFilterChange={handleStatusKpiChange}
          />

          <PortalPanel
            eyebrow="Despachos"
            title="Salidas"
            description="Registra salidas desde bodega principal hacia custodias, oficinas, nodos, venta o consumo interno."
            actions={createAction}
          >
            <div className="space-y-4">
              <StockIssuesToolbar
                filters={filters}
                resultCount={issues.length}
                totalCount={meta.total}
                isRefreshing={isRefreshing}
                onFiltersChange={setFilters}
                onRefresh={() => void handleToolbarRefresh()}
                onClearFilters={() => setFilters({})}
                hideResultsLabel
              />
              {issues.length === 0 ? (
                <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />
              ) : null}
              <div ref={tableShellRef} className={portalDataTableShellClassName}>
                <div
                  className={isRefreshing ? `p-4 ${portalDataBusyRegionClassName}` : 'p-4'}
                  aria-busy={isRefreshing || undefined}
                >
                  <StockIssuesTable
                    issues={issues}
                    locationMap={locationMap}
                    isLoading={isLoading}
                    isRefreshing={isRefreshing}
                    hasActiveFilters={activeFilters}
                    issuesIsEmpty={meta.total === 0 && !activeFilters}
                    onOpenDetail={(issueId) => void openDetail(issueId)}
                    emptyAction={createAction}
                    onClearFilters={() => setFilters({})}
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
                    resource={ISSUES_RESOURCE}
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
                    resourceLabel="salidas"
                    shown={to}
                    total={meta.total}
                  />
                ) : null}
              </div>
            </div>
          </PortalPanel>
        </>
      ) : workspaceMode === 'create' ? (
        <PurchaseCreateModeShell
          header={
            <StockIssueCreateModeHeader
              draftLineCount={draftLineCount}
              onBack={() => closeComposerMode()}
            />
          }
        >
          {composer}
        </PurchaseCreateModeShell>
      ) : (
        <PurchaseCreateModeShell
          header={
            <StockIssueCreateModeHeader
              draftLineCount={draftLineCount}
              eyebrow="Edición"
              title="Editar salida"
              description="Ajusta líneas y contexto mientras la salida siga en estado solicitada."
              {...(editingIssue
                ? {
                    referenceLabel: editingIssue.id.slice(0, 8).toUpperCase(),
                    statusLabel: getStockIssueStatusLabel(editingIssue.status),
                  }
                : {})}
              onBack={() => closeComposerMode()}
            />
          }
        >
          {composer}
        </PurchaseCreateModeShell>
      )}

      <StockIssueDetailDrawer
        open={workspaceMode === 'inbox' && detailOpen}
        issue={detail}
        itemsById={itemMap}
        assetsById={assetsById}
        locationsById={locationMap}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        onEdit={(issue) => openEditMode(issue)}
        onCancel={async (issueId) => {
          setActionError(null);
          try {
            await onCancel(issueId);
            setDetailOpen(false);
            setDetail(null);
            await loadPage({ soft: true });
          } catch (err) {
            setActionError(
              err instanceof Error ? err.message : 'No fue posible cancelar la salida.',
            );
            throw err instanceof Error ? err : new Error('No fue posible cancelar la salida.');
          }
        }}
        onDispatch={async (issueId, dto) => {
          setActionError(null);
          try {
            await onDispatch(issueId, dto);
            const refreshed = await onOpenDetail(issueId);
            setDetail(refreshed);
            await loadPage({ soft: true });
          } catch (err) {
            setActionError(
              err instanceof Error ? err.message : 'No fue posible despachar la salida.',
            );
            throw err instanceof Error ? err : new Error('No fue posible despachar la salida.');
          }
        }}
      />
    </div>
  );
}

export function StockIssuesWorkspace(props: StockIssuesWorkspaceProps) {
  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-96" />}>
      <StockIssuesWorkspaceInner {...props} />
    </Suspense>
  );
}
