'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Input, Select } from '@iwana/ui';
import { StockCountStatus, type ListMeta } from '@iwana/shared';
import {
  ApiError,
  inventoryApi,
  type CreateStockCountDto,
  type InventoryCategoryRecord,
  type StockCountDetailRecord,
  type StockCountRecord,
  type StockLocationRecord,
  type UpdateStockCountDto,
} from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalPanel,
  PortalResultsStrip,
  PortalSkeletonBlock,
  PortalTablePager,
  PortalTablePagination,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
  portalDataBusyRegionClassName,
} from '@/components/shared/portal-ui';
import {
  STOCK_COMMITTED_NEXT_STEP_TEXT,
  formatInventoryQuantity,
  getStockCountStatusBadgeVariant,
  getStockCountStatusLabel,
} from './inventory-labels';
import { InventoryLocationPicker } from './InventoryLocationPicker';
import { resolveBarcodeToCatalogItem } from './inventory-barcode-capture';

/**
 * El backend explica por qué se bloqueó el movimiento pero no el próximo paso.
 * Cuando el rechazo viene del material comprometido, completamos el mensaje sin reescribirlo.
 */
function isCommittedStockError(message: string): boolean {
  return /comprometid/i.test(message);
}

function StockCountErrorAlert({ message }: { message: string }) {
  return (
    <PortalAlert
      variant="error"
      title="Error"
      description={
        isCommittedStockError(message) ? (
          <>
            <p>{message}</p>
            <p className="mt-1">{STOCK_COMMITTED_NEXT_STEP_TEXT}</p>
          </>
        ) : (
          message
        )
      }
    />
  );
}

export interface StockCountsWorkspaceProps {
  locations: StockLocationRecord[];
  categories: InventoryCategoryRecord[];
  canClose: boolean;
  /** Incrementar tras mutaciones del padre. */
  listRevision?: number;
  error?: string | null;
  onCreate: (dto: CreateStockCountDto) => Promise<StockCountDetailRecord>;
  onUpdate: (id: string, dto: UpdateStockCountDto) => Promise<StockCountDetailRecord>;
  onClose: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  onOpenDetail: (id: string) => Promise<StockCountDetailRecord>;
  onRefresh: () => void | Promise<void>;
}

type WorkspaceMode = 'inbox' | 'create' | 'detail';

const COUNTS_RESOURCE = { singular: 'conteo', plural: 'conteos' } as const;
const COUNTS_NAMESPACE = 'counts';
const COUNTS_FILTER_KEYS = ['status'] as const;
const PAGE_OUT_OF_RANGE_NOTICE = 'Esa página ya no existe. Mostrando la última página disponible.';

function mapCountsListError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para consultar conteos.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
    return error.message;
  }
  return 'No fue posible cargar los conteos.';
}

function StockCountsWorkspaceInner({
  locations,
  categories,
  canClose,
  listRevision = 0,
  error,
  onCreate,
  onUpdate,
  onClose,
  onCancel,
  onOpenDetail,
  onRefresh,
}: StockCountsWorkspaceProps) {
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const tableShellRef = useRef<HTMLDivElement | null>(null);

  const { page, pageSize, filters, setPage, setPageSize, setFilters, setQuery } =
    useTableQueryState({
      namespace: COUNTS_NAMESPACE,
      filterKeys: COUNTS_FILTER_KEYS,
      defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
    });

  const statusFilter = (filters.status as StockCountStatus | undefined) ?? '';

  const [counts, setCounts] = useState<StockCountRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);

  const [mode, setMode] = useState<WorkspaceMode>('inbox');
  const [locationId, setLocationId] = useState('');
  const [locationSelectedLabel, setLocationSelectedLabel] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [detail, setDetail] = useState<StockCountDetailRecord | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // F4 (RF-CAT-16): captura por código — ubica la línea del conteo sin búsqueda manual.
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [isLocatingBarcode, setIsLocatingBarcode] = useState(false);
  const [barcodeNotice, setBarcodeNotice] = useState<string | null>(null);
  const [locatedLineId, setLocatedLineId] = useState<string | null>(null);

  useEffect(() => {
    setBarcodeQuery('');
    setBarcodeNotice(null);
    setLocatedLineId(null);
  }, [detail?.id]);

  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );

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
        const response = await inventoryApi.listCounts({
          page,
          limit: pageSize,
          ...(statusFilter ? { status: statusFilter } : {}),
        });
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

        setCounts(response.data);
        setMeta(nextMeta);
        hasLoadedOnceRef.current = true;
      } catch (loadError: unknown) {
        setListError(mapCountsListError(loadError));
        if (!soft) {
          setCounts([]);
          setMeta(EMPTY_LIST_META);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, pageSize, setQuery, statusFilter],
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
  const resultsLabel =
    meta.total === 0 && !statusFilter
      ? '0 conteos'
      : counts.length === 0
        ? 'Sin resultados con estos filtros'
        : `${from}–${to} de ${meta.total} conteo${meta.total === 1 ? '' : 's'}`;

  const kpis = useMemo(() => {
    const byStatus = {
      [StockCountStatus.COUNTING]: 0,
      [StockCountStatus.CLOSED]: 0,
      [StockCountStatus.CANCELLED]: 0,
      [StockCountStatus.OPEN]: 0,
    };
    for (const row of counts) {
      byStatus[row.status] += 1;
    }
    return byStatus;
  }, [counts]);

  async function handleCreate() {
    if (!locationId) {
      setActionError('Selecciona una bodega para iniciar el conteo.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      const created = await onCreate({
        locationId,
        categoryId: categoryId || null,
        notes: notes.trim() || null,
      });
      setDetail(created);
      setQuantities(
        Object.fromEntries(
          created.lines.map((line) => [line.id, line.countedQty ?? line.expectedQty]),
        ),
      );
      setMode('detail');
      await onRefresh();
    } catch (createError) {
      setActionError(
        createError instanceof Error ? createError.message : 'No fue posible crear el conteo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOpen(id: string) {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const opened = await onOpenDetail(id);
      setDetail(opened);
      setQuantities(
        Object.fromEntries(opened.lines.map((line) => [line.id, line.countedQty ?? ''])),
      );
      setMode('detail');
    } catch (openError) {
      setActionError(
        openError instanceof Error ? openError.message : 'No fue posible abrir el conteo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * F4 (RF-CAT-16, CA-F4-05): el código entra como `q` al lookup E-4 existente
   * (el backend ya resuelve `barcode`) y la línea queda ubicada y enfocada sin
   * búsqueda manual. La etiqueta del hallazgo se muestra para verificación.
   */
  async function handleBarcodeLocate() {
    if (!detail) {
      return;
    }

    setIsLocatingBarcode(true);
    try {
      const result = await resolveBarcodeToCatalogItem(barcodeQuery);
      if (result.status === 'empty') {
        setLocatedLineId(null);
        setBarcodeNotice('Escribe o escanea un código para ubicar su línea.');
        return;
      }
      if (result.status === 'not-found') {
        setLocatedLineId(null);
        setBarcodeNotice('Ningún producto del catálogo usa ese código.');
        return;
      }
      const hitLabel = result.hit.sublabel
        ? `${result.hit.sublabel} · ${result.hit.label}`
        : result.hit.label;
      const line = detail.lines.find((entry) => entry.itemId === result.hit.itemId);
      if (!line) {
        setLocatedLineId(null);
        setBarcodeNotice(`Ese código es de ${hitLabel}, que no está en este conteo.`);
        return;
      }
      setLocatedLineId(line.id);
      setBarcodeNotice(`Ubicado: ${hitLabel}.`);
      const countedInput = document.getElementById(`count-qty-${line.id}`);
      countedInput?.focus();
      try {
        countedInput?.scrollIntoView({ block: 'center' });
      } catch {
        // jsdom
      }
    } catch (locateError) {
      setLocatedLineId(null);
      setBarcodeNotice(
        locateError instanceof Error ? locateError.message : 'No fue posible ubicar el código.',
      );
    } finally {
      setIsLocatingBarcode(false);
    }
  }

  async function handleSaveQuantities() {
    if (!detail) {
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      const updated = await onUpdate(detail.id, {
        lines: detail.lines.map((line) => ({
          id: line.id,
          countedQty: Number.parseFloat(quantities[line.id] || '0'),
        })),
      });
      setDetail(updated);
      await onRefresh();
    } catch (updateError) {
      setActionError(
        updateError instanceof Error
          ? updateError.message
          : 'No fue posible guardar las cantidades.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClose() {
    if (!detail) {
      return;
    }

    if (!window.confirm('¿Cerrar el conteo y aplicar el ajuste de inventario?')) {
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      const updated = await onUpdate(detail.id, {
        lines: detail.lines.map((line) => ({
          id: line.id,
          countedQty: Number.parseFloat(quantities[line.id] || '0'),
        })),
      });
      setDetail(updated);
      await onClose(updated.id);
      setMode('inbox');
      setDetail(null);
      await onRefresh();
    } catch (closeError) {
      setActionError(
        closeError instanceof Error ? closeError.message : 'No fue posible cerrar el conteo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!detail) {
      return;
    }

    if (!window.confirm('¿Cancelar este conteo sin afectar el stock?')) {
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      await onCancel(detail.id);
      setMode('inbox');
      setDetail(null);
      await onRefresh();
    } catch (cancelError) {
      setActionError(
        cancelError instanceof Error ? cancelError.message : 'No fue posible cancelar el conteo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const editable =
    detail?.status === StockCountStatus.COUNTING || detail?.status === StockCountStatus.OPEN;

  if (mode === 'create') {
    return (
      <PortalPanel
        eyebrow="Conteos"
        title="Nuevo conteo físico"
        description="Elige bodega y, si aplica, una categoría para congelar lo esperado."
        actions={
          <Button type="button" variant="secondary" onClick={() => setMode('inbox')}>
            Volver
          </Button>
        }
      >
        <div className="space-y-4">
          {actionError ? <StockCountErrorAlert message={actionError} /> : null}
          <InventoryLocationPicker
            id="count-location"
            label="Bodega"
            value={locationId || null}
            selectedLabel={locationSelectedLabel}
            onChange={(nextId, item) => {
              setLocationId(nextId ?? '');
              setLocationSelectedLabel(item ? item.label : null);
            }}
          />
          <Select
            label="Categoría (opcional)"
            aria-label="Categoría del conteo"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            options={[
              { value: '', label: 'Todas' },
              ...categories.map((category) => ({ value: category.id, label: category.name })),
            ]}
          />
          <label className="block space-y-1 text-sm">
            <span>Notas</span>
            <Input
              aria-label="Notas del conteo"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <Button type="button" onClick={() => void handleCreate()} disabled={isSubmitting}>
            Iniciar conteo
          </Button>
        </div>
      </PortalPanel>
    );
  }

  if (mode === 'detail' && detail) {
    return (
      <PortalPanel
        eyebrow="Conteos"
        title={detail.countNumber}
        description={`${locationMap.get(detail.locationId)?.name ?? 'Bodega'} · ${getStockCountStatusLabel(detail.status)}`}
        actions={
          <Button type="button" variant="secondary" onClick={() => setMode('inbox')}>
            Volver
          </Button>
        }
      >
        <div className="space-y-4">
          {actionError ? <StockCountErrorAlert message={actionError} /> : null}
          <div className="rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <Input
                label="Código de barras"
                value={barcodeQuery}
                onChange={(event) => setBarcodeQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleBarcodeLocate();
                  }
                }}
                helperText="Escanea o escribe el código para ubicar su línea sin buscar a mano."
              />
              <Button
                type="button"
                variant="secondary"
                loading={isLocatingBarcode}
                onClick={() => void handleBarcodeLocate()}
              >
                Ubicar línea
              </Button>
            </div>
            {barcodeNotice ? (
              <p role="status" className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                {barcodeNotice}
              </p>
            ) : null}
          </div>
          <div className={portalDataTableShellClassName}>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={portalDataTableHeadClassName}>SKU</th>
                  <th className={portalDataTableHeadClassName}>Producto</th>
                  <th className={portalDataTableHeadClassName}>Esperado</th>
                  <th className={portalDataTableHeadClassName}>Contado</th>
                  <th className={portalDataTableHeadClassName}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line) => (
                  <tr
                    key={line.id}
                    className={`${portalTableRowHoverClassName} ${
                      locatedLineId === line.id ? 'bg-iwana-primary/5 dark:bg-dark-surface-2' : ''
                    }`}
                  >
                    <td className={portalDataTableCellClassName}>{line.itemSku ?? '—'}</td>
                    <td className={portalDataTableCellClassName}>{line.itemName ?? line.itemId}</td>
                    <td className={`${portalDataTableCellClassName} tabular-nums`}>
                      {formatInventoryQuantity(line.expectedQty)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {editable ? (
                        <Input
                          id={`count-qty-${line.id}`}
                          type="number"
                          min="0"
                          step="any"
                          aria-label={`Cantidad contada ${line.itemSku ?? line.itemId}`}
                          className="w-28 tabular-nums"
                          value={quantities[line.id] ?? ''}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [line.id]: event.target.value,
                            }))
                          }
                        />
                      ) : (
                        <span className="tabular-nums">
                          {line.countedQty == null ? '—' : formatInventoryQuantity(line.countedQty)}
                        </span>
                      )}
                    </td>
                    <td className={`${portalDataTableCellClassName} tabular-nums`}>
                      {line.variance == null ? '—' : formatInventoryQuantity(line.variance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleSaveQuantities()}
                disabled={isSubmitting}
              >
                Guardar cantidades
              </Button>
            ) : null}
            {editable && canClose ? (
              <Button type="button" onClick={() => void handleClose()} disabled={isSubmitting}>
                Cerrar conteo
              </Button>
            ) : null}
            {editable ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleCancel()}
                disabled={isSubmitting}
              >
                Cancelar conteo
              </Button>
            ) : null}
          </div>
        </div>
      </PortalPanel>
    );
  }

  return (
    <PortalPanel
      eyebrow="Operación"
      title="Conteos físicos"
      description="Reconcilia el saldo del sistema contra lo contado en bodega."
      actions={
        <Button type="button" variant="primary" onClick={() => setMode('create')}>
          Nuevo conteo
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <StockCountErrorAlert message={error} /> : null}
        {listError ? <StockCountErrorAlert message={listError} /> : null}
        {actionError ? <StockCountErrorAlert message={actionError} /> : null}

        {outOfRangeNotice ? (
          <PortalAlert
            variant="warning"
            title="Página fuera de rango"
            description={outOfRangeNotice}
            live="polite"
          />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 p-4">
            <p className="portal-eyebrow-muted">En conteo</p>
            <p className="text-2xl font-semibold tabular-nums">{kpis[StockCountStatus.COUNTING]}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 p-4">
            <p className="portal-eyebrow-muted">Cerrados</p>
            <p className="text-2xl font-semibold tabular-nums">{kpis[StockCountStatus.CLOSED]}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 p-4">
            <p className="portal-eyebrow-muted">Cancelados</p>
            <p className="text-2xl font-semibold tabular-nums">
              {kpis[StockCountStatus.CANCELLED]}
            </p>
          </div>
        </div>

        <div className="max-w-xs">
          <Select
            label="Estado"
            aria-label="Filtrar conteos por estado"
            value={statusFilter}
            onChange={(event) =>
              setFilters({
                status: event.target.value ? event.target.value : null,
              })
            }
            options={[
              { value: '', label: 'Todos' },
              ...Object.values(StockCountStatus).map((status) => ({
                value: status,
                label: getStockCountStatusLabel(status),
              })),
            ]}
          />
        </div>

        {counts.length === 0 && !isLoading ? (
          <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />
        ) : null}

        {isLoading ? (
          <PortalSkeletonBlock className="h-48 rounded-xl" />
        ) : counts.length === 0 ? (
          <PortalEmptyState
            title={statusFilter ? 'Sin resultados con estos filtros' : 'Sin conteos'}
            description={
              statusFilter
                ? 'Cambia el filtro de estado o limpia el filtro para ver otros conteos.'
                : 'Crea un conteo por bodega para capturar diferencias y cerrar el ajuste.'
            }
            action={
              statusFilter ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setFilters({ status: null })}
                >
                  Limpiar filtro
                </Button>
              ) : (
                <Button type="button" variant="primary" onClick={() => setMode('create')}>
                  Nuevo conteo
                </Button>
              )
            }
          />
        ) : (
          <div ref={tableShellRef} className={portalDataTableShellClassName}>
            <div
              className={
                isRefreshing
                  ? `overflow-x-auto ${portalDataBusyRegionClassName}`
                  : 'overflow-x-auto'
              }
              aria-busy={isRefreshing || undefined}
            >
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className={portalDataTableHeadClassName}>Número</th>
                    <th className={portalDataTableHeadClassName}>Bodega</th>
                    <th className={portalDataTableHeadClassName}>Estado</th>
                    <th className={portalDataTableHeadClassName}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {counts.map((row) => (
                    <tr
                      key={row.id}
                      className={portalTableRowHoverClassName}
                      data-testid={`count-row-${row.id}`}
                    >
                      <td className={portalDataTableCellClassName}>{row.countNumber}</td>
                      <td className={portalDataTableCellClassName}>
                        {locationMap.get(row.locationId)?.name ?? row.locationId}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <Badge variant={getStockCountStatusBadgeVariant(row.status)}>
                          {getStockCountStatusLabel(row.status)}
                        </Badge>
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleOpen(row.id)}
                        >
                          Abrir
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {showPager && randomAccess ? (
              <PortalTablePager
                page={effectivePage}
                pageCount={Math.max(1, pageCount)}
                onPageChange={setPage}
                from={from}
                to={to}
                total={meta.total}
                resource={COUNTS_RESOURCE}
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
                resourceLabel="conteos"
                shown={to}
                total={meta.total}
              />
            ) : null}
          </div>
        )}
      </div>
    </PortalPanel>
  );
}

export function StockCountsWorkspace(props: StockCountsWorkspaceProps) {
  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-72" />}>
      <StockCountsWorkspaceInner {...props} />
    </Suspense>
  );
}
