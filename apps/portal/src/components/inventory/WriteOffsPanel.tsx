'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WriteOffReason, WriteOffStatus, type ListMeta } from '@iwana/shared';
import { Button, cn, Input, Select } from '@iwana/ui';
import {
  ApiError,
  inventoryApi,
  type InventoryItemRecord,
  type InventoryWriteOffRecord,
  type SerializedAssetRecord,
  type StockLocationRecord,
} from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import {
  interactiveFocusClassName,
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalPanel,
  PortalSkeletonBlock,
  PortalTablePager,
  PortalTablePagination,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
  portalTextareaClassName,
  portalDataBusyRegionClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryDateTime,
  formatInventoryQuantity,
  getWriteOffReasonLabel,
  getWriteOffStatusLabel,
  WRITE_OFF_REASON_LABELS,
  WRITE_OFF_STATUS_LABELS,
} from './inventory-labels';
import { InventoryAssetPicker } from './InventoryAssetPicker';
import { InventoryItemPicker } from './InventoryItemPicker';
import { InventoryLocationPicker } from './InventoryLocationPicker';

export type WriteOffHistoryStatusFilter = WriteOffStatus | 'all';

export interface WriteOffRequestFormState {
  itemId: string;
  serializedAssetId: string;
  locationId: string;
  quantity: string;
  reason: WriteOffReason;
  notes: string;
}

interface WriteOffsPanelProps {
  pending: InventoryWriteOffRecord[];
  /** Opcional: solo enriquecer etiquetas de listados (ya no alimenta pickers). */
  items?: InventoryItemRecord[];
  assets?: SerializedAssetRecord[];
  locations?: StockLocationRecord[];
  requestForm: WriteOffRequestFormState;
  onRequestFormChange: (next: WriteOffRequestFormState) => void;
  isSubmittingRequest: boolean;
  requestError: string | null;
  requestSuccess: string | null;
  onSubmitRequest: () => void;
  userLabelById: Map<string, string>;
  currentUserId?: string;
  isLoadingPending: boolean;
  pendingError: string | null;
  actionError: string | null;
  processingWriteOffId: string | null;
  /** Aprobación de bajas (flag independiente de canAdjustStock). El API sigue siendo autoridad. */
  canApprove?: boolean;
  onRefreshPending: () => void;
  /** Incrementar tras mutaciones para recargar historial. */
  historyRevision?: number;
  onApprove: (writeOffId: string) => void;
  onReject: (writeOffId: string, rejectionNotes?: string | null) => void;
  onOpenMovement: (stockMovementId: string) => void;
}

const requestFieldClassName = cn(
  'portal-input-surface w-full px-3 py-2 text-sm text-gray-900 dark:text-white',
  interactiveFocusClassName,
);

function resolveSubjectLabel(
  writeOff: InventoryWriteOffRecord,
  items: InventoryItemRecord[],
  assets: SerializedAssetRecord[],
): string {
  if (writeOff.serializedAssetId) {
    const asset = assets.find((entry) => entry.id === writeOff.serializedAssetId);
    const item = items.find((entry) => entry.id === (asset?.inventoryItemId ?? writeOff.itemId));
    const sku = item?.sku ?? 'Sin SKU';
    const serial = asset?.serialNumber ?? asset?.assetTag ?? writeOff.serializedAssetId.slice(0, 8);
    return `${sku} · ${serial}`;
  }

  const item = items.find((entry) => entry.id === writeOff.itemId);
  if (item) {
    return `${item.sku} · ${item.name}`;
  }

  return writeOff.itemId ? `Producto ${writeOff.itemId.slice(0, 8)}` : 'Sin referencia';
}

function resolveLocationLabel(
  writeOff: InventoryWriteOffRecord,
  locations: StockLocationRecord[],
): string {
  const location = locations.find((entry) => entry.id === writeOff.locationId);
  if (location) {
    return `${location.code} · ${location.name}`;
  }

  return writeOff.locationId.slice(0, 8);
}

function resolveUserLabel(userLabelById: Map<string, string>, userId: string): string {
  return userLabelById.get(userId) ?? `Usuario ${userId.slice(0, 8)}`;
}

const HISTORY_STATUS_OPTIONS: Array<{ value: WriteOffHistoryStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: WriteOffStatus.COMPLETED, label: WRITE_OFF_STATUS_LABELS[WriteOffStatus.COMPLETED] },
  { value: WriteOffStatus.REJECTED, label: WRITE_OFF_STATUS_LABELS[WriteOffStatus.REJECTED] },
  {
    value: WriteOffStatus.PENDING_APPROVAL,
    label: WRITE_OFF_STATUS_LABELS[WriteOffStatus.PENDING_APPROVAL],
  },
];

const HISTORY_RESOURCE = { singular: 'baja', plural: 'bajas' } as const;
const HISTORY_FILTER_KEYS = ['status'] as const;
const PAGE_OUT_OF_RANGE_NOTICE = 'Esa página ya no existe. Mostrando la última página disponible.';

function mapHistoryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para consultar bajas.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
    return error.message;
  }

  return 'No fue posible cargar el historial de bajas.';
}

interface WriteOffHistorySectionProps {
  items: InventoryItemRecord[];
  assets: SerializedAssetRecord[];
  userLabelById: Map<string, string>;
  historyRevision: number;
  onOpenMovement: (stockMovementId: string) => void;
}

function WriteOffHistorySectionInner({
  items,
  assets,
  userLabelById,
  historyRevision,
  onOpenMovement,
}: WriteOffHistorySectionProps) {
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const tableShellRef = useRef<HTMLDivElement | null>(null);

  const { page, pageSize, filters, setPage, setPageSize, setFilters, setQuery } =
    useTableQueryState({
      namespace: 'writeOffHistory',
      filterKeys: HISTORY_FILTER_KEYS,
      defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
    });

  const statusFilter = (filters.status as WriteOffHistoryStatusFilter | undefined) ?? 'all';
  const [history, setHistory] = useState<InventoryWriteOffRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);

  const loadPage = useCallback(
    async (opts?: { soft?: boolean }) => {
      const soft = opts?.soft === true && hasLoadedOnceRef.current;
      if (soft) {
        setRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await inventoryApi.writeOffs.list({
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
          page,
          limit: pageSize,
        });
        const nextMeta = normalizeListMeta(
          {
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

        setHistory(response.data);
        setMeta(nextMeta);
        hasLoadedOnceRef.current = true;
      } catch (loadError: unknown) {
        setError(mapHistoryError(loadError));
        if (!soft) {
          setHistory([]);
          setMeta(EMPTY_LIST_META);
        }
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
    },
    [page, pageSize, setQuery, statusFilter],
  );

  useEffect(() => {
    void loadPage({ soft: true });
  }, [loadPage, historyRevision]);

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

  return (
    <PortalPanel
      eyebrow="Historial"
      title="Solicitudes de baja"
      description="Consulta el estado de las solicitudes y accede al movimiento cuando esté completada."
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs">
          <Select
            label="Estado"
            value={statusFilter}
            onChange={(event) =>
              setFilters({
                status:
                  event.target.value === 'all'
                    ? null
                    : (event.target.value as WriteOffHistoryStatusFilter),
              })
            }
            options={HISTORY_STATUS_OPTIONS}
            data-testid="write-offs-history-status-filter"
          />
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => void loadPage()}>
          Actualizar
        </Button>
      </div>

      {error ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar el historial"
          description={error}
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

      {isLoading ? (
        <PortalSkeletonBlock className="h-48" />
      ) : history.length === 0 ? (
        <PortalEmptyState
          title="Sin solicitudes registradas"
          description="Las bajas solicitadas aparecerán aquí con su estado y trazabilidad."
        />
      ) : (
        <div ref={tableShellRef} className={portalDataTableShellClassName}>
          <div
            className={
              refreshing ? `overflow-x-auto ${portalDataBusyRegionClassName}` : 'overflow-x-auto'
            }
            aria-busy={refreshing || undefined}
          >
            <table className="min-w-full text-sm">
              <thead className={portalDataTableHeadRowClassName}>
                <tr>
                  <PortalDataTableHead>Referencia</PortalDataTableHead>
                  <PortalDataTableHead>Motivo</PortalDataTableHead>
                  <PortalDataTableHead>Estado</PortalDataTableHead>
                  <PortalDataTableHead>Solicitante</PortalDataTableHead>
                  <PortalDataTableHead>Solicitada el</PortalDataTableHead>
                  <PortalDataTableHead>Movimiento</PortalDataTableHead>
                </tr>
              </thead>
              <tbody className={portalDataTableBodyClassName}>
                {history.map((writeOff) => (
                  <tr
                    key={writeOff.id}
                    className={portalTableRowHoverClassName}
                    data-testid={`write-off-history-row-${writeOff.id}`}
                  >
                    <td className={portalDataTableCellClassName}>
                      {resolveSubjectLabel(writeOff, items, assets)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {getWriteOffReasonLabel(writeOff.reason)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {getWriteOffStatusLabel(writeOff.status)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {resolveUserLabel(userLabelById, writeOff.requestedByUserId)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatInventoryDateTime(writeOff.createdAt)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {writeOff.status === WriteOffStatus.COMPLETED && writeOff.stockMovementId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => onOpenMovement(writeOff.stockMovementId!)}
                        >
                          {writeOff.movementNumber
                            ? `Ver ${writeOff.movementNumber}`
                            : 'Ver en kardex'}
                        </Button>
                      ) : writeOff.status === WriteOffStatus.REJECTED && writeOff.rejectionNotes ? (
                        <span className="text-gray-600 dark:text-gray-300">
                          {writeOff.rejectionNotes}
                        </span>
                      ) : (
                        '—'
                      )}
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
              resource={HISTORY_RESOURCE}
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
          {showPager && !randomAccess ? (
            <PortalTablePagination
              hasMore={meta.hasMore}
              onLoadMore={() => setPage(page + 1)}
              loading={refreshing}
              resourceLabel="bajas"
              shown={to}
              total={meta.total}
            />
          ) : null}
        </div>
      )}
    </PortalPanel>
  );
}

function WriteOffHistorySection(props: WriteOffHistorySectionProps) {
  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-48" />}>
      <WriteOffHistorySectionInner {...props} />
    </Suspense>
  );
}

export function WriteOffsPanel({
  pending,
  items = [],
  assets = [],
  locations = [],
  requestForm,
  onRequestFormChange,
  isSubmittingRequest,
  requestError,
  requestSuccess,
  onSubmitRequest,
  userLabelById,
  currentUserId,
  isLoadingPending,
  pendingError,
  actionError,
  processingWriteOffId,
  canApprove = false,
  onRefreshPending,
  historyRevision = 0,
  onApprove,
  onReject,
  onOpenMovement,
}: WriteOffsPanelProps) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [itemSelectedLabel, setItemSelectedLabel] = useState<string | null>(null);
  const [locationSelectedLabel, setLocationSelectedLabel] = useState<string | null>(null);
  const [assetSelectedLabel, setAssetSelectedLabel] = useState<string | null>(null);

  const writeOffReasonOptions = useMemo(
    () =>
      (Object.keys(WRITE_OFF_REASON_LABELS) as WriteOffReason[]).map((reason) => ({
        value: reason,
        label: getWriteOffReasonLabel(reason),
      })),
    [],
  );

  const pendingCountLabel = useMemo(() => {
    if (pending.length === 0) {
      return 'Sin solicitudes en espera';
    }
    return `${pending.length} solicitud${pending.length === 1 ? '' : 'es'} en espera`;
  }, [pending.length]);

  function handleStartReject(writeOffId: string) {
    setRejectingId(writeOffId);
    setRejectionNotes('');
  }

  function handleCancelReject() {
    setRejectingId(null);
    setRejectionNotes('');
  }

  function handleConfirmReject(writeOffId: string) {
    onReject(writeOffId, rejectionNotes.trim() || null);
    setRejectingId(null);
    setRejectionNotes('');
  }

  return (
    <div className="space-y-6" data-testid="write-offs-panel">
      <PortalPanel
        eyebrow="Bajas"
        title="Solicitar baja"
        description="Registra una solicitud de salida definitiva por daño, pérdida u obsolescencia. Un segundo usuario debe aprobarla antes de afectar el inventario."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <InventoryItemPicker
            id="write-off-item"
            label="Producto"
            value={requestForm.itemId || null}
            selectedLabel={itemSelectedLabel}
            minChars={0}
            debounceMs={0}
            onChange={(itemId, item) => {
              setItemSelectedLabel(item ? item.label : null);
              onRequestFormChange({ ...requestForm, itemId: itemId ?? '' });
            }}
          />
          <InventoryAssetPicker
            id="write-off-asset"
            label="Equipo con serial (opcional)"
            value={requestForm.serializedAssetId || null}
            selectedLabel={assetSelectedLabel}
            onChange={(assetId, item) => {
              setAssetSelectedLabel(item ? item.label : null);
              onRequestFormChange({
                ...requestForm,
                serializedAssetId: assetId ?? '',
              });
            }}
          />
          <InventoryLocationPicker
            id="write-off-location"
            label="Ubicación"
            value={requestForm.locationId || null}
            selectedLabel={locationSelectedLabel}
            minChars={0}
            debounceMs={0}
            onChange={(locationId, item) => {
              setLocationSelectedLabel(item ? item.label : null);
              onRequestFormChange({ ...requestForm, locationId: locationId ?? '' });
            }}
          />
          <Input
            label="Cantidad"
            type="number"
            min="0"
            step="0.01"
            value={requestForm.quantity}
            onChange={(event) =>
              onRequestFormChange({ ...requestForm, quantity: event.target.value })
            }
          />
          <Select
            label="Motivo"
            value={requestForm.reason}
            onChange={(event) =>
              onRequestFormChange({
                ...requestForm,
                reason: event.target.value as WriteOffReason,
              })
            }
            options={writeOffReasonOptions}
          />
          <label className="space-y-1 text-sm xl:col-span-3">
            <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Notas</span>
            <textarea
              rows={3}
              value={requestForm.notes}
              onChange={(event) =>
                onRequestFormChange({ ...requestForm, notes: event.target.value })
              }
              className={requestFieldClassName}
            />
          </label>
        </div>

        {requestSuccess ? (
          <PortalAlert variant="success" title="Solicitud enviada" description={requestSuccess} />
        ) : null}

        {requestError ? (
          <PortalAlert
            variant="error"
            title="No fue posible registrar la solicitud"
            description={requestError}
          />
        ) : null}

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            loading={isSubmittingRequest}
            disabled={
              !requestForm.locationId || (!requestForm.itemId && !requestForm.serializedAssetId)
            }
            onClick={onSubmitRequest}
          >
            Solicitar baja
          </Button>
        </div>
      </PortalPanel>

      <PortalPanel
        eyebrow="Aprobación"
        title="Pendientes de aprobación"
        description={pendingCountLabel}
      >
        <div className="mb-4 flex justify-end">
          <Button type="button" size="sm" variant="secondary" onClick={onRefreshPending}>
            Actualizar
          </Button>
        </div>

        {actionError ? (
          <PortalAlert
            variant="error"
            title="No se pudo procesar la solicitud"
            description={actionError}
          />
        ) : null}

        {pendingError ? (
          <PortalAlert
            variant="error"
            title="No fue posible cargar pendientes"
            description={pendingError}
          />
        ) : null}

        {isLoadingPending ? (
          <PortalSkeletonBlock className="h-48" />
        ) : pending.length === 0 ? (
          <PortalEmptyState
            title="Sin bajas pendientes"
            description="Las solicitudes en espera de un segundo usuario aparecerán aquí."
          />
        ) : (
          <div className={portalDataTableShellClassName}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className={portalDataTableHeadRowClassName}>
                  <tr>
                    <PortalDataTableHead>Referencia</PortalDataTableHead>
                    <PortalDataTableHead>Bodega</PortalDataTableHead>
                    <PortalDataTableHead>Cantidad</PortalDataTableHead>
                    <PortalDataTableHead>Motivo</PortalDataTableHead>
                    <PortalDataTableHead>Solicitante</PortalDataTableHead>
                    <PortalDataTableHead>Solicitada el</PortalDataTableHead>
                    <PortalDataTableHead>Acciones</PortalDataTableHead>
                  </tr>
                </thead>
                <tbody className={portalDataTableBodyClassName}>
                  {pending.map((writeOff) => {
                    const isSelfRequest = currentUserId === writeOff.requestedByUserId;
                    const isProcessing = processingWriteOffId === writeOff.id;
                    const isRejecting = rejectingId === writeOff.id;

                    return (
                      <tr
                        key={writeOff.id}
                        className={portalTableRowHoverClassName}
                        data-testid={`write-off-pending-row-${writeOff.id}`}
                      >
                        <td className={portalDataTableCellClassName}>
                          {resolveSubjectLabel(writeOff, items, assets)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {resolveLocationLabel(writeOff, locations)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {formatInventoryQuantity(writeOff.quantity)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {getWriteOffReasonLabel(writeOff.reason)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {resolveUserLabel(userLabelById, writeOff.requestedByUserId)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {formatInventoryDateTime(writeOff.createdAt)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {!canApprove ? (
                            <span className="text-gray-500 dark:text-gray-400">—</span>
                          ) : isRejecting ? (
                            <div className="space-y-2 min-w-[14rem]">
                              <textarea
                                aria-label="Motivo del rechazo"
                                className={portalTextareaClassName}
                                rows={2}
                                placeholder="Motivo del rechazo (opcional)"
                                value={rejectionNotes}
                                onChange={(event) => setRejectionNotes(event.target.value)}
                              />
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  loading={isProcessing}
                                  onClick={() => handleConfirmReject(writeOff.id)}
                                >
                                  Confirmar rechazo
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={isProcessing}
                                  onClick={handleCancelReject}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                loading={isProcessing}
                                disabled={isSelfRequest || isProcessing}
                                title={
                                  isSelfRequest
                                    ? 'No puedes aprobar una solicitud que creaste tú mismo'
                                    : undefined
                                }
                                onClick={() => onApprove(writeOff.id)}
                              >
                                Aprobar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={isSelfRequest || isProcessing}
                                title={
                                  isSelfRequest
                                    ? 'No puedes rechazar una solicitud que creaste tú mismo'
                                    : undefined
                                }
                                onClick={() => handleStartReject(writeOff.id)}
                              >
                                Rechazar
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PortalPanel>

      <WriteOffHistorySection
        items={items}
        assets={assets}
        userLabelById={userLabelById}
        historyRevision={historyRevision}
        onOpenMovement={onOpenMovement}
      />
    </div>
  );
}
