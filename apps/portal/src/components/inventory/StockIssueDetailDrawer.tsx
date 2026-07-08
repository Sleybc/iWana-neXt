'use client';

import { useMemo, useState } from 'react';
import {
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
  StockIssueDetailRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { formatInventoryDateTime, formatInventoryQuantity } from './inventory-labels';

const DISPATCHABLE_STATUSES = new Set<StockIssueStatus>([
  StockIssueStatus.REQUESTED,
  StockIssueStatus.APPROVED,
  StockIssueStatus.PICKING,
  StockIssueStatus.READY_TO_DISPATCH,
]);

export interface StockIssueDetailDrawerProps {
  open: boolean;
  issue: StockIssueDetailRecord | null;
  itemsById: Map<string, InventoryItemRecord>;
  locationsById: Map<string, StockLocationRecord>;
  onClose: () => void;
  onDispatch: (id: string, dto: DispatchStockIssueDto) => Promise<void>;
}

export function StockIssueDetailDrawer({
  open,
  issue,
  itemsById,
  locationsById,
  onClose,
  onDispatch,
}: StockIssueDetailDrawerProps) {
  const [handoffMethod, setHandoffMethod] = useState('ACTA');
  const [handoffNotes, setHandoffNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canDispatch = Boolean(issue && DISPATCHABLE_STATUSES.has(issue.status));

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
              ? `Estado actual: ${issue.status}.`
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
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Origen</p>
                <p className="mt-1 font-medium text-gray-900 dark:text-white">
                  {header.sourceLabel}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Destino</p>
                <p className="mt-1 font-medium text-gray-900 dark:text-white">
                  {header.destinationLabel}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Creada</p>
                <p className="mt-1 font-medium text-gray-900 dark:text-white">
                  {formatInventoryDateTime(issue.createdAt)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Movimiento</p>
                <p className="mt-1 font-medium text-gray-900 dark:text-white">
                  {issue.stockMovementId ?? 'Pendiente de despacho'}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
                <thead className="bg-gray-50 dark:bg-dark-surface-2">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Ítem
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Solicitado
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Despachado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {issue.lines.map((line) => {
                    const item = itemsById.get(line.itemId);
                    return (
                      <tr key={line.id}>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {item ? `${item.sku} · ${item.name}` : line.itemId}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {formatInventoryQuantity(line.requestedQty)}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {line.dispatchedQty ? formatInventoryQuantity(line.dispatchedQty) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canDispatch ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Despachar</p>
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
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onClose}
                    disabled={isSubmitting}
                  >
                    Cerrar
                  </Button>
                  <Button
                    type="button"
                    loading={isSubmitting}
                    disabled={!handoffMethod.trim()}
                    onClick={() => void dispatch()}
                  >
                    Confirmar despacho
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cerrar
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
            No hay salida seleccionada.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
