'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@iwana/ui';
import { StockIssueStatus } from '@iwana/shared';
import type {
  DispatchStockIssueDto,
  InventoryItemRecord,
  SerializedAssetRecord,
  StockIssueDetailRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import { PortalAlert, PortalSectionHeader } from '@/components/shared/portal-ui';
import {
  formatInventoryDateTime,
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
  getStockIssueStatusBadgeVariant,
  getStockIssueStatusLabel,
  getStockIssueTypeBadgeVariant,
  getStockIssueTypeLabel,
} from './inventory-labels';
import { formatSerializedAssetLabel } from './stock-issue-line-utils';

const CANCELLABLE_STATUSES = new Set<StockIssueStatus>([
  StockIssueStatus.REQUESTED,
  StockIssueStatus.APPROVED,
  StockIssueStatus.PICKING,
  StockIssueStatus.READY_TO_DISPATCH,
]);

const tableHeadClass =
  'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400';
const cellClass = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';

const DISPATCHABLE_STATUSES = CANCELLABLE_STATUSES;

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const canDispatch = Boolean(issue && DISPATCHABLE_STATUSES.has(issue.status));
  const canEdit = Boolean(issue && issue.status === StockIssueStatus.REQUESTED && onEdit);
  const canCancel = Boolean(issue && CANCELLABLE_STATUSES.has(issue.status) && onCancel);

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
    };
  }, [issue, locationsById]);

  async function cancelIssue() {
    if (!issue || !onCancel) return;
    const confirmed = window.confirm('¿Confirmas cancelar esta salida?');
    if (!confirmed) {
      return;
    }

    setError(null);
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
    setIsSubmitting(true);
    try {
      await onDispatch(issue.id, {
        handoffMethod: handoffMethod.trim(),
        handoffNotes: handoffNotes.trim() || null,
        handoffAttachments: [],
      });
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
      return `Lote ${line.lotId.slice(0, 8).toUpperCase()}`;
    }
    return '—';
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setError(null);
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

            <div className="grid gap-4 md:grid-cols-2">
              <dl className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <dt className="text-xs text-gray-500 dark:text-gray-400">Origen</dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {header.sourceLabel}
                </dd>
              </dl>
              <dl className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <dt className="text-xs text-gray-500 dark:text-gray-400">Destino</dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {header.destinationLabel}
                </dd>
              </dl>
              <dl className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <dt className="text-xs text-gray-500 dark:text-gray-400">Creada</dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {formatInventoryDateTime(issue.createdAt)}
                </dd>
              </dl>
              <dl className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <dt className="text-xs text-gray-500 dark:text-gray-400">Movimiento</dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {issue.stockMovementId ?? 'Pendiente de despacho'}
                </dd>
              </dl>
            </div>

            <div>
              <PortalSectionHeader
                title="Líneas de salida"
                description="Cantidades solicitadas y despachadas por ítem."
              />
              <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3">
                <table className="w-full min-w-[480px] text-sm">
                  <caption className="sr-only">Líneas de la salida</caption>
                  <thead>
                    <tr className="border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3">
                      <th scope="col" className={tableHeadClass}>
                        Ítem
                      </th>
                      <th scope="col" className={tableHeadClass}>
                        Condición
                      </th>
                      <th scope="col" className={tableHeadClass}>
                        Lote / serial
                      </th>
                      <th scope="col" className={tableHeadClass}>
                        Solicitado
                      </th>
                      <th scope="col" className={tableHeadClass}>
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
                          className="border-b border-gray-100 dark:border-dark-border"
                        >
                          <td className={cellClass}>
                            {item ? `${item.sku} · ${item.name}` : line.itemId}
                          </td>
                          <td className={cellClass}>
                            {getStockBalanceConditionLabel(line.condition)}
                          </td>
                          <td className={cellClass}>{formatLineTrackingLabel(line)}</td>
                          <td className={cellClass}>
                            {formatInventoryQuantity(line.requestedQty)}
                          </td>
                          <td className={cellClass}>
                            {line.dispatchedQty ? formatInventoryQuantity(line.dispatchedQty) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {canDispatch ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3">
                <PortalSectionHeader
                  title="Despachar"
                  description="Confirma el método de entrega para generar el movimiento de stock."
                />
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <Input
                    label="Método de entrega"
                    value={handoffMethod}
                    onChange={(event) => setHandoffMethod(event.target.value)}
                  />
                  <Input
                    label="Notas (opcional)"
                    value={handoffNotes}
                    onChange={(event) => setHandoffNotes(event.target.value)}
                  />
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {canCancel ? (
                    <Button
                      type="button"
                      variant="ghost"
                      loading={isCancelling}
                      disabled={isSubmitting || isCancelling}
                      onClick={() => void cancelIssue()}
                    >
                      Cancelar salida
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isSubmitting || isCancelling}
                      onClick={() => onEdit?.(issue)}
                    >
                      Editar
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onClose}
                    disabled={isSubmitting || isCancelling}
                  >
                    Cerrar
                  </Button>
                  <Button
                    type="button"
                    loading={isSubmitting}
                    disabled={!handoffMethod.trim() || isCancelling}
                    onClick={() => void dispatch()}
                  >
                    Confirmar despacho
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                {canCancel ? (
                  <Button
                    type="button"
                    variant="ghost"
                    loading={isCancelling}
                    onClick={() => void cancelIssue()}
                  >
                    Cancelar salida
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button type="button" variant="secondary" onClick={() => onEdit?.(issue)}>
                    Editar
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cerrar
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-6 text-sm text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
            No hay salida seleccionada.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
