'use client';

import { useMemo, useState } from 'react';
import { WriteOffReason, WriteOffStatus } from '@iwana/shared';
import { Button, cn, Input, Select } from '@iwana/ui';
import type {
  InventoryItemRecord,
  InventoryWriteOffRecord,
  SerializedAssetRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import {
  interactiveFocusClassName,
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryDateTime,
  formatInventoryQuantity,
  getWriteOffReasonLabel,
  getWriteOffStatusLabel,
  WRITE_OFF_REASON_LABELS,
  WRITE_OFF_STATUS_LABELS,
} from './inventory-labels';

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
  history: InventoryWriteOffRecord[];
  historyStatusFilter: WriteOffHistoryStatusFilter;
  onHistoryStatusFilterChange: (status: WriteOffHistoryStatusFilter) => void;
  items: InventoryItemRecord[];
  assets: SerializedAssetRecord[];
  locations: StockLocationRecord[];
  requestForm: WriteOffRequestFormState;
  onRequestFormChange: (next: WriteOffRequestFormState) => void;
  isSubmittingRequest: boolean;
  requestError: string | null;
  requestSuccess: string | null;
  onSubmitRequest: () => void;
  userLabelById: Map<string, string>;
  currentUserId?: string;
  isLoadingPending: boolean;
  isLoadingHistory: boolean;
  pendingError: string | null;
  historyError: string | null;
  actionError: string | null;
  processingWriteOffId: string | null;
  /** Aprobación de bajas (flag independiente de canAdjustStock). El API sigue siendo autoridad. */
  canApprove?: boolean;
  onRefreshPending: () => void;
  onRefreshHistory: () => void;
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

export function WriteOffsPanel({
  pending,
  history,
  historyStatusFilter,
  onHistoryStatusFilterChange,
  items,
  assets,
  locations,
  requestForm,
  onRequestFormChange,
  isSubmittingRequest,
  requestError,
  requestSuccess,
  onSubmitRequest,
  userLabelById,
  currentUserId,
  isLoadingPending,
  isLoadingHistory,
  pendingError,
  historyError,
  actionError,
  processingWriteOffId,
  canApprove = false,
  onRefreshPending,
  onRefreshHistory,
  onApprove,
  onReject,
  onOpenMovement,
}: WriteOffsPanelProps) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState('');

  const itemSelectOptions = useMemo(
    () => [
      { value: '', label: 'Selecciona un producto' },
      ...items.map((item) => ({
        value: item.id,
        label: `${item.sku} · ${item.name}`,
      })),
    ],
    [items],
  );

  const locationSelectOptions = useMemo(
    () => [
      { value: '', label: 'Selecciona una bodega' },
      ...locations.map((location) => ({
        value: location.id,
        label: `${location.code} · ${location.name}`,
      })),
    ],
    [locations],
  );

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
          <Select
            label="Producto"
            value={requestForm.itemId}
            onChange={(event) =>
              onRequestFormChange({ ...requestForm, itemId: event.target.value })
            }
            options={itemSelectOptions}
          />
          <Input
            label="Equipo con serial (opcional)"
            value={requestForm.serializedAssetId}
            onChange={(event) =>
              onRequestFormChange({
                ...requestForm,
                serializedAssetId: event.target.value,
              })
            }
          />
          <Select
            label="Ubicación"
            value={requestForm.locationId}
            onChange={(event) =>
              onRequestFormChange({ ...requestForm, locationId: event.target.value })
            }
            options={locationSelectOptions}
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
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
                <thead className="bg-gray-50 dark:bg-dark-surface-2">
                  <tr>
                    <th className={portalDataTableHeadClassName}>Referencia</th>
                    <th className={portalDataTableHeadClassName}>Bodega</th>
                    <th className={portalDataTableHeadClassName}>Cantidad</th>
                    <th className={portalDataTableHeadClassName}>Motivo</th>
                    <th className={portalDataTableHeadClassName}>Solicitante</th>
                    <th className={portalDataTableHeadClassName}>Solicitada el</th>
                    <th className={portalDataTableHeadClassName}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {pending.map((writeOff) => {
                    const isSelfRequest = currentUserId === writeOff.requestedByUserId;
                    const isProcessing = processingWriteOffId === writeOff.id;
                    const isRejecting = rejectingId === writeOff.id;

                    return (
                      <tr key={writeOff.id} data-testid={`write-off-pending-row-${writeOff.id}`}>
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

      <PortalPanel
        eyebrow="Historial"
        title="Solicitudes de baja"
        description="Consulta el estado de las solicitudes y accede al movimiento cuando esté completada."
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Select
            label="Estado"
            value={historyStatusFilter}
            onChange={(event) =>
              onHistoryStatusFilterChange(event.target.value as WriteOffHistoryStatusFilter)
            }
            options={HISTORY_STATUS_OPTIONS}
            data-testid="write-offs-history-status-filter"
          />
          <Button type="button" size="sm" variant="secondary" onClick={onRefreshHistory}>
            Actualizar
          </Button>
        </div>

        {historyError ? (
          <PortalAlert
            variant="error"
            title="No fue posible cargar el historial"
            description={historyError}
          />
        ) : null}

        {isLoadingHistory ? (
          <PortalSkeletonBlock className="h-48" />
        ) : history.length === 0 ? (
          <PortalEmptyState
            title="Sin solicitudes registradas"
            description="Las bajas solicitadas aparecerán aquí con su estado y trazabilidad."
          />
        ) : (
          <div className={portalDataTableShellClassName}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
                <thead className="bg-gray-50 dark:bg-dark-surface-2">
                  <tr>
                    <th className={portalDataTableHeadClassName}>Referencia</th>
                    <th className={portalDataTableHeadClassName}>Motivo</th>
                    <th className={portalDataTableHeadClassName}>Estado</th>
                    <th className={portalDataTableHeadClassName}>Solicitante</th>
                    <th className={portalDataTableHeadClassName}>Solicitada el</th>
                    <th className={portalDataTableHeadClassName}>Movimiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {history.map((writeOff) => (
                    <tr key={writeOff.id} data-testid={`write-off-history-row-${writeOff.id}`}>
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
                        {writeOff.status === WriteOffStatus.COMPLETED &&
                        writeOff.stockMovementId ? (
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
                        ) : writeOff.status === WriteOffStatus.REJECTED &&
                          writeOff.rejectionNotes ? (
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
          </div>
        )}
      </PortalPanel>
    </div>
  );
}
