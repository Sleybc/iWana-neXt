'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
} from '@iwana/ui';
import { StockIssueStatus } from '@iwana/shared';
import type {
  DispatchStockIssueDto,
  InventoryItemRecord,
  SerializedAssetRecord,
  StockIssueDetailRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSectionHeader,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryDateTime,
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
  getStockIssueHandoffMethodLabel,
  getStockIssueStatusBadgeVariant,
  getStockIssueStatusLabel,
  getStockIssueTypeBadgeVariant,
  getStockIssueTypeLabel,
  STOCK_ISSUE_HANDOFF_METHOD_OPTIONS,
} from './inventory-labels';
import { formatSerializedAssetLabel } from './stock-issue-line-utils';

const CANCELLABLE_STATUSES = new Set<StockIssueStatus>([
  StockIssueStatus.REQUESTED,
  StockIssueStatus.APPROVED,
  StockIssueStatus.PICKING,
  StockIssueStatus.READY_TO_DISPATCH,
]);

const DISPATCHABLE_STATUSES = CANCELLABLE_STATUSES;

const HANDOFF_METHOD_SELECT_OPTIONS = STOCK_ISSUE_HANDOFF_METHOD_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

export interface StockIssueDetailDrawerProps {
  open: boolean;
  issue: StockIssueDetailRecord | null;
  itemsById: Map<string, InventoryItemRecord>;
  assetsById?: Map<string, SerializedAssetRecord>;
  locationsById: Map<string, StockLocationRecord>;
  onClose: () => void;
  onEdit?: (issue: StockIssueDetailRecord) => void;
  onCancel?: (issueId: string) => Promise<void>;
  onDispatch: (id: string, dto: DispatchStockIssueDto) => Promise<void>;
}

export function StockIssueDetailDrawer({
  open,
  issue,
  itemsById,
  assetsById = new Map(),
  locationsById,
  onClose,
  onEdit,
  onCancel,
  onDispatch,
}: StockIssueDetailDrawerProps) {
  const [handoffMethod, setHandoffMethod] = useState('ACTA');
  const [handoffNotes, setHandoffNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dispatchSuccess, setDispatchSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const canDispatch = Boolean(issue && DISPATCHABLE_STATUSES.has(issue.status));
  const canEdit = Boolean(issue && issue.status === StockIssueStatus.REQUESTED && onEdit);
  const canCancel = Boolean(issue && CANCELLABLE_STATUSES.has(issue.status) && onCancel);
  const isBusy = isSubmitting || isCancelling;

  useEffect(() => {
    setHandoffMethod('ACTA');
    setHandoffNotes('');
    setError(null);
    setDispatchSuccess(false);
    setIsSubmitting(false);
    setIsCancelling(false);
  }, [issue?.id]);

  const header = useMemo(() => {
    if (!issue) return null;
    const source = locationsById.get(issue.sourceLocationId);
    const dest = issue.destinationLocationId
      ? locationsById.get(issue.destinationLocationId)
      : null;
    return {
      sourceLabel: source ? `${source.code} · ${source.name}` : issue.sourceLocationId,
      destinationLabel: dest
        ? `${dest.code} · ${dest.name}`
        : (issue.destinationRefId ?? 'Sin destino'),
      movementLabel: issue.stockMovementId ? 'Registrado' : 'Pendiente de despacho',
      handoffLabel: issue.handoffMethod
        ? getStockIssueHandoffMethodLabel(issue.handoffMethod)
        : null,
    };
  }, [issue, locationsById]);

  async function cancelIssue() {
    if (!issue || !onCancel) return;
    const confirmed = window.confirm('¿Confirmas cancelar esta salida?');
    if (!confirmed) {
      return;
    }

    setError(null);
    setDispatchSuccess(false);
    setIsCancelling(true);
    try {
      await onCancel(issue.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cancelar la salida.');
    } finally {
      setIsCancelling(false);
    }
  }

  async function dispatch() {
    if (!issue) return;
    setError(null);
    setDispatchSuccess(false);
    setIsSubmitting(true);
    try {
      await onDispatch(issue.id, {
        handoffMethod: handoffMethod.trim(),
        handoffNotes: handoffNotes.trim() || null,
        handoffAttachments: [],
      });
      setDispatchSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible despachar la salida.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function formatLineTrackingLabel(line: StockIssueDetailRecord['lines'][number]): string {
    if (line.serializedAssetId) {
      const asset = assetsById.get(line.serializedAssetId);
      return asset
        ? formatSerializedAssetLabel(asset)
        : line.serializedAssetId.slice(0, 8).toUpperCase();
    }
    if (line.lotId) {
      return line.lotNumber
        ? `Lote ${line.lotNumber}`
        : `Lote ${line.lotId.slice(0, 8).toUpperCase()}`;
    }
    return '—';
  }

  function renderActions(showDispatchPrimary: boolean) {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {canCancel ? (
          <Button
            type="button"
            variant="ghost"
            loading={isCancelling}
            disabled={isBusy}
            onClick={() => void cancelIssue()}
          >
            Cancelar salida
          </Button>
        ) : null}
        {canEdit ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isBusy}
            onClick={() => onEdit?.(issue!)}
          >
            Editar
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={onClose} disabled={isBusy}>
          Cerrar
        </Button>
        {showDispatchPrimary ? (
          <Button
            type="button"
            loading={isSubmitting}
            disabled={!handoffMethod.trim() || isBusy}
            onClick={() => void dispatch()}
          >
            Confirmar despacho
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setError(null);
          setDispatchSuccess(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <p className="portal-eyebrow">Salidas</p>
          <DialogTitle className="mt-1">Detalle de salida</DialogTitle>
          <DialogDescription>
            {issue
              ? 'Consulta el estado, las líneas y confirma el despacho cuando corresponda.'
              : 'Selecciona una salida para ver el detalle.'}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <PortalAlert
            variant="error"
            title="No fue posible completar la acción"
            description={error}
          />
        ) : null}

        {dispatchSuccess ? (
          <PortalAlert
            variant="success"
            title="Despacho confirmado"
            description="El movimiento quedó registrado. Puedes cerrar este panel o revisar el historial."
          />
        ) : null}

        {issue && header ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getStockIssueTypeBadgeVariant(issue.type)}>
                {getStockIssueTypeLabel(issue.type)}
              </Badge>
              <Badge variant={getStockIssueStatusBadgeVariant(issue.status)}>
                {getStockIssueStatusLabel(issue.status)}
              </Badge>
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                {issue.id.slice(0, 8).toUpperCase()}
              </span>
            </div>

            <div className="grid gap-4 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3 sm:grid-cols-2">
              <dl className="text-sm">
                <dt className="portal-eyebrow-muted">Origen</dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {header.sourceLabel}
                </dd>
              </dl>
              <dl className="text-sm">
                <dt className="portal-eyebrow-muted">Destino</dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {header.destinationLabel}
                </dd>
              </dl>
              <dl className="text-sm">
                <dt className="portal-eyebrow-muted">Creada</dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {formatInventoryDateTime(issue.createdAt)}
                </dd>
              </dl>
              <dl className="text-sm">
                <dt className="portal-eyebrow-muted">Movimiento</dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {header.movementLabel}
                </dd>
              </dl>
              {header.handoffLabel ? (
                <dl className="text-sm sm:col-span-2">
                  <dt className="portal-eyebrow-muted">Método de entrega</dt>
                  <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                    {header.handoffLabel}
                  </dd>
                </dl>
              ) : null}
            </div>

            <div>
              <PortalSectionHeader
                title="Líneas de salida"
                description="Cantidades solicitadas y despachadas por producto."
              />
              {issue.lines.length === 0 ? (
                <div className="mt-3">
                  <PortalEmptyState
                    title="Sin líneas en esta salida"
                    description="Edita la salida para agregar productos antes de despachar."
                  />
                </div>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2">
                  <table className="w-full min-w-[480px] text-sm">
                    <caption className="sr-only">Líneas de la salida</caption>
                    <thead>
                      <tr className="border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3">
                        <th scope="col" className={portalDataTableHeadClassName}>
                          Producto
                        </th>
                        <th scope="col" className={portalDataTableHeadClassName}>
                          Condición
                        </th>
                        <th scope="col" className={portalDataTableHeadClassName}>
                          Lote / serial
                        </th>
                        <th scope="col" className={portalDataTableHeadClassName}>
                          Solicitado
                        </th>
                        <th scope="col" className={portalDataTableHeadClassName}>
                          Despachado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {issue.lines.map((line) => {
                        const item = itemsById.get(line.itemId);
                        return (
                          <tr
                            key={line.id}
                            className={`border-b border-gray-100 dark:border-dark-border ${portalTableRowHoverClassName}`}
                          >
                            <td className={portalDataTableCellClassName}>
                              {item ? `${item.sku} · ${item.name}` : line.itemId}
                            </td>
                            <td className={portalDataTableCellClassName}>
                              {getStockBalanceConditionLabel(line.condition)}
                            </td>
                            <td className={portalDataTableCellClassName}>
                              {formatLineTrackingLabel(line)}
                            </td>
                            <td className={portalDataTableCellClassName}>
                              {formatInventoryQuantity(line.requestedQty)}
                            </td>
                            <td className={portalDataTableCellClassName}>
                              {line.dispatchedQty
                                ? formatInventoryQuantity(line.dispatchedQty)
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {canDispatch && !dispatchSuccess ? (
              <section className="space-y-4 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
                <PortalSectionHeader
                  title="Confirmar despacho"
                  description="Indica cómo se entregó el material y registra la salida."
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <Select
                    id="issue-handoff-method"
                    label="Método de entrega"
                    value={handoffMethod}
                    onChange={(event) => setHandoffMethod(event.target.value)}
                    options={HANDOFF_METHOD_SELECT_OPTIONS}
                  />
                  <Input
                    label="Notas (opcional)"
                    value={handoffNotes}
                    onChange={(event) => setHandoffNotes(event.target.value)}
                  />
                </div>
                {renderActions(true)}
              </section>
            ) : (
              renderActions(false)
            )}
          </div>
        ) : (
          <PortalEmptyState
            title="No hay salida seleccionada"
            description="Abre una salida desde el listado para ver su detalle."
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
