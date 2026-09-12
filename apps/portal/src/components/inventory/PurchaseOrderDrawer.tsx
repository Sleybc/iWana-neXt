'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  cn,
} from '@iwana/ui';
import { PurchaseOrderStatus } from '@iwana/shared';
import type {
  CreatePurchaseOrderDto,
  InventoryItemRecord,
  PurchaseOrderRecord,
  PurchaseRequestDetailRecord,
  PurchaseRequestRecord,
} from '@/lib/api-client';
import { purchasingApi } from '@/lib/api-client';
import { triggerBlobDownload } from '@/lib/blob-download';
import {
  PortalAlert,
  PortalEmptyState,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';
import { SupplierPicker } from './SupplierPicker';
import {
  toDateFromLocalDateValue,
  toLocalDateValue,
  toLocalDateValueFromApi,
} from './inventory-date';
import {
  formatInventoryCurrency,
  formatInventoryDateOnly,
  getPurchaseRequestStatusLabel,
} from './inventory-labels';
import {
  buildOrdersFromAwards,
  canGenerateOrdersFromAwards,
  hasMissingUnitCosts,
  previewsToCreateOrderDto,
  type AwardOrderPreview,
} from './purchase-orders-from-awards';

interface PurchaseOrderDrawerProps {
  open: boolean;
  request: PurchaseRequestRecord | null;
  detail?: PurchaseRequestDetailRecord | null;
  items: InventoryItemRecord[];
  supplierLabels?: Record<string, string>;
  latestOrder: PurchaseOrderRecord | null;
  createError: string | null;
  isSubmittingOrder: boolean;
  onClose: () => void;
  /** Devuelve las órdenes creadas: habilita la descarga inmediata del PDF (Fase 31). */
  onCreateOrder: (payload: CreatePurchaseOrderDto) => Promise<PurchaseOrderRecord[]>;
  onOrderCreated?: () => void;
}

interface PurchaseOrderLineDraft {
  id: string;
  itemId: string;
  quantity: string;
  unitCost: string;
}

let orderLineSequence = 0;

function createOrderLine(): PurchaseOrderLineDraft {
  orderLineSequence += 1;
  return { id: `order-line-${orderLineSequence}`, itemId: '', quantity: '1', unitCost: '0' };
}

const ITEM_OPTIONS = (items: InventoryItemRecord[]) => [
  { value: '', label: 'Selecciona un producto' },
  ...items.map((item) => ({
    value: item.id,
    label: `${item.sku} · ${item.name}`,
  })),
];

function buildLineLabels(
  detail: PurchaseRequestDetailRecord,
  items: InventoryItemRecord[],
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const line of detail.lines) {
    if (line.freeTextDescription?.trim()) {
      labels[line.id] = line.freeTextDescription.trim();
      continue;
    }
    if (line.inventoryItemId) {
      const item = items.find((entry) => entry.id === line.inventoryItemId);
      if (item) {
        labels[line.id] = `${item.sku} — ${item.name}`;
        continue;
      }
    }
    labels[line.id] = 'Línea adjudicada';
  }
  return labels;
}

export function PurchaseOrderDrawer({
  open,
  request,
  detail = null,
  items,
  supplierLabels,
  latestOrder,
  createError,
  isSubmittingOrder,
  onClose,
  onCreateOrder,
  onOrderCreated,
}: PurchaseOrderDrawerProps) {
  const [partyRefId, setPartyRefId] = useState('');
  const [partyDisplayName, setPartyDisplayName] = useState<string | null>(null);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PurchaseOrderLineDraft[]>([createOrderLine()]);
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [unitCostOverrides, setUnitCostOverrides] = useState<Record<string, number>>({});
  const [createdOrderCount, setCreatedOrderCount] = useState(0);
  const [createdOrderIds, setCreatedOrderIds] = useState<string[]>([]);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfDownloadError, setPdfDownloadError] = useState<string | null>(null);
  /**
   * Foto del preview emitido (DEF-AWD-002): tras generar el batch el refetch
   * deja las líneas en ORDERED y el preview filtrado quedaría vacío, lo que
   * cambiaría el título del diálogo y ocultaría el resumen de lo emitido. Se
   * congela lo enviado para la vista de éxito; al reabrir se recalcula.
   */
  const [committedPreviews, setCommittedPreviews] = useState<AwardOrderPreview[] | null>(null);

  const batchMode = Boolean(
    detail && (committedPreviews !== null || canGenerateOrdersFromAwards(detail)),
  );

  const previews: AwardOrderPreview[] = useMemo(() => {
    if (!detail) {
      return [];
    }
    if (committedPreviews) {
      return committedPreviews;
    }
    if (!batchMode) {
      return [];
    }
    return buildOrdersFromAwards(detail, {
      ...(supplierLabels ? { supplierLabels } : {}),
      lineLabels: buildLineLabels(detail, items),
      unitCostOverrides,
    });
  }, [batchMode, committedPreviews, detail, items, supplierLabels, unitCostOverrides]);

  const orderJustCreated = showOrderSuccess && Boolean(request);

  useEffect(() => {
    if (!open) {
      setPartyRefId('');
      setPartyDisplayName(null);
      setExpectedDeliveryDate('');
      setNotes('');
      setLines([createOrderLine()]);
      setShowOrderSuccess(false);
      setUnitCostOverrides({});
      setCreatedOrderCount(0);
      setCreatedOrderIds([]);
      setIsDownloadingPdf(false);
      setPdfDownloadError(null);
      setCommittedPreviews(null);
      return;
    }

    // Solo precargar al abrir / si el campo sigue vacío (no pisar selección del usuario).
    setExpectedDeliveryDate((current) => current || toLocalDateValueFromApi(request?.neededByDate));
  }, [open, request?.neededByDate]);

  function resolveExpectedDeliveryDateForSubmit(): string | null {
    return expectedDeliveryDate.trim() || toLocalDateValueFromApi(request?.neededByDate) || null;
  }

  async function handleCreateBatchOrders() {
    if (!request || previews.length === 0) {
      return;
    }

    const deliveryDate = resolveExpectedDeliveryDateForSubmit();
    if (!deliveryDate) {
      return;
    }

    try {
      const created =
        (await onCreateOrder(
          previewsToCreateOrderDto(request.id, previews, {
            expectedDeliveryDate: deliveryDate,
            notes: notes.trim() || null,
          }),
        )) ?? [];
      setCreatedOrderCount(created.length > 0 ? created.length : previews.length);
      setCreatedOrderIds(created.map((order) => order.id));
      setCommittedPreviews(previews);
      setShowOrderSuccess(true);
    } catch {
      // El padre deja createError; no cerrar ni navegar (CA-22-01).
    }
  }

  async function handleCreateOrder() {
    if (!request) {
      return;
    }

    const deliveryDate = resolveExpectedDeliveryDateForSubmit();
    if (!deliveryDate || !partyRefId) {
      return;
    }

    try {
      const created =
        (await onCreateOrder({
          purchaseRequestId: request.id,
          partyRefId,
          expectedDeliveryDate: deliveryDate,
          notes: notes.trim() || null,
          status: PurchaseOrderStatus.APPROVED,
          lines: lines
            .filter((line) => line.itemId)
            .map((line) => ({
              itemId: line.itemId,
              quantity: Number(line.quantity || '0'),
              unitCost: Number(line.unitCost || '0'),
            })),
        })) ?? [];
      setCreatedOrderCount(created.length > 0 ? created.length : 1);
      setCreatedOrderIds(created.map((order) => order.id));
      setShowOrderSuccess(true);
    } catch {
      // El padre deja createError; no cerrar ni navegar (CA-22-01).
    }
  }

  /** PDF de lo recién generado: orden única directa; ZIP por solicitud si fueron varias. */
  async function handleDownloadCreatedOrdersPdf() {
    if (!request || createdOrderIds.length === 0) {
      return;
    }
    setIsDownloadingPdf(true);
    setPdfDownloadError(null);
    try {
      const [singleOrderId] = createdOrderIds;
      const { blob, filename } =
        singleOrderId !== undefined && createdOrderIds.length === 1
          ? await purchasingApi.downloadPurchaseOrderPdf(singleOrderId)
          : await purchasingApi.downloadRequestOrdersZip(request.id);
      triggerBlobDownload(blob, filename);
    } catch {
      setPdfDownloadError(
        'No fue posible descargar el PDF. Inténtalo de nuevo desde la pestaña Órdenes.',
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  function handleContinueAfterSuccess() {
    onOrderCreated?.();
    onClose();
  }

  const batchBlocked = hasMissingUnitCosts(previews);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {batchMode ? 'Órdenes de compra desde adjudicación' : 'Orden de compra'}
          </DialogTitle>
        </DialogHeader>

        {!request ? null : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <p className="portal-eyebrow-muted">Solicitud</p>
                <p className="mt-2 font-medium text-gray-900 dark:text-white">
                  {request.requestNumber}
                </p>
                <p className="text-gray-500 dark:text-gray-400">{request.title}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <p className="portal-eyebrow-muted">Estado solicitud</p>
                <p className="mt-2 font-medium text-gray-900 dark:text-white">
                  {getPurchaseRequestStatusLabel(request.status)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <p className="portal-eyebrow-muted">Fecha requerida</p>
                <p className="mt-2 font-medium text-gray-900 dark:text-white">
                  {formatInventoryDateOnly(request.neededByDate)}
                </p>
              </div>
            </div>

            {orderJustCreated ? (
              <>
                <PortalAlert
                  variant="success"
                  title={
                    createdOrderCount > 1
                      ? `${createdOrderCount} órdenes de compra generadas`
                      : latestOrder
                        ? `Orden de compra ${latestOrder.orderNumber} generada`
                        : 'Orden de compra generada'
                  }
                  description="Descarga el PDF para enviarlo al proveedor y continúa a Recepciones para registrar la mercancía."
                  action={
                    <span className="flex flex-wrap gap-2">
                      {createdOrderIds.length > 0 ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          loading={isDownloadingPdf}
                          onClick={() => void handleDownloadCreatedOrdersPdf()}
                        >
                          {createdOrderIds.length > 1 ? 'Descargar todos (ZIP)' : 'Descargar PDF'}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleContinueAfterSuccess}
                      >
                        Ir a recepciones
                      </Button>
                    </span>
                  }
                />
                {pdfDownloadError ? (
                  <PortalAlert
                    variant="error"
                    title="No se pudo descargar el PDF"
                    description={pdfDownloadError}
                  />
                ) : null}
              </>
            ) : null}

            {batchMode ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Se generarán {previews.length} orden{previews.length === 1 ? '' : 'es'} (una por
                  proveedor adjudicado) en una sola operación.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <DatePicker
                    id="purchase-order-expected-delivery-batch"
                    label="Entrega esperada"
                    placeholder="Seleccionar fecha"
                    requiredIndicator
                    value={toDateFromLocalDateValue(expectedDeliveryDate)}
                    onChange={(date) => setExpectedDeliveryDate(toLocalDateValue(date))}
                    disabled={isSubmittingOrder}
                  />
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Notas (aplican a todas las órdenes)
                    </span>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className={cn(
                        'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white',
                        interactiveFocusClassName,
                      )}
                    />
                  </label>
                </div>

                {previews.length === 0 ? (
                  <PortalEmptyState
                    title="Sin líneas convertibles"
                    description="Las adjudicaciones necesitan ítem de inventario asociado para generar órdenes."
                  />
                ) : (
                  <div className="space-y-3">
                    {previews.map((preview) => (
                      <div
                        key={preview.partyRefId}
                        className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {preview.partyLabel}
                            </p>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                              {preview.lines.length} línea{preview.lines.length === 1 ? '' : 's'}
                            </p>
                          </div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatInventoryCurrency(preview.subtotal)}
                          </p>
                        </div>
                        <ul className="mt-3 space-y-2">
                          {preview.lines.map((line) => {
                            const overrideKey = `${preview.partyRefId}:${line.purchaseRequestLineId}`;
                            return (
                              <li
                                key={overrideKey}
                                className="grid gap-2 rounded-xl border border-gray-100 p-3 text-sm dark:border-dark-border md:grid-cols-[1fr_8rem]"
                              >
                                <div>
                                  <p className="font-medium text-gray-900 dark:text-white">
                                    {line.label}
                                  </p>
                                  <p className="text-gray-600 dark:text-gray-300">
                                    Cantidad {line.quantity}
                                    {line.unitCostSource === 'missing'
                                      ? ' · Indica el costo unitario'
                                      : null}
                                  </p>
                                </div>
                                <Input
                                  label="Costo unitario"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={String(line.unitCost || '')}
                                  onChange={(event) => {
                                    const next = Number(event.target.value);
                                    setUnitCostOverrides((current) => ({
                                      ...current,
                                      [overrideKey]: Number.isFinite(next) ? next : 0,
                                    }));
                                  }}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {createError ? (
                  <PortalAlert
                    variant="error"
                    title="No fue posible crear las órdenes de compra"
                    description={createError}
                  />
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    loading={isSubmittingOrder}
                    disabled={
                      previews.length === 0 ||
                      batchBlocked ||
                      !resolveExpectedDeliveryDateForSubmit()
                    }
                    onClick={() => void handleCreateBatchOrders()}
                  >
                    Generar {previews.length} {previews.length === 1 ? 'orden' : 'órdenes'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {detail && detail.awards.length === 0 ? (
                  <PortalAlert
                    variant="info"
                    title="Sin adjudicaciones"
                    description="Adjudica líneas en la pestaña Adjudicación para generar órdenes por proveedor. También puedes crear una orden manual."
                  />
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <SupplierPicker
                    label="Proveedor"
                    value={partyRefId || null}
                    selectedLabel={partyDisplayName}
                    onChange={(nextPartyRefId, displayName) => {
                      setPartyRefId(nextPartyRefId ?? '');
                      setPartyDisplayName(displayName);
                    }}
                  />
                  <DatePicker
                    id="purchase-order-expected-delivery"
                    label="Entrega esperada"
                    placeholder="Seleccionar fecha"
                    requiredIndicator
                    value={toDateFromLocalDateValue(expectedDeliveryDate)}
                    onChange={(date) => setExpectedDeliveryDate(toLocalDateValue(date))}
                    disabled={isSubmittingOrder}
                  />
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Notas
                    </span>
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className={cn(
                        'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white',
                        interactiveFocusClassName,
                      )}
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  {lines.map((line) => (
                    <div
                      key={line.id}
                      className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-3"
                    >
                      <Select
                        id={`purchase-order-item-${line.id}`}
                        label="Producto"
                        value={line.itemId}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((entry) =>
                              entry.id === line.id
                                ? { ...entry, itemId: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        options={ITEM_OPTIONS(items)}
                      />
                      <Input
                        label="Cantidad"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.quantity}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((entry) =>
                              entry.id === line.id
                                ? { ...entry, quantity: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                      <Input
                        label="Costo unitario"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitCost}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((entry) =>
                              entry.id === line.id
                                ? { ...entry, unitCost: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>

                {createError ? (
                  <PortalAlert
                    variant="error"
                    title="No fue posible crear la orden de compra"
                    description={createError}
                  />
                ) : null}

                <div className="flex flex-wrap justify-between gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setLines((current) => [...current, createOrderLine()])}
                  >
                    Agregar línea
                  </Button>
                  <Button
                    type="button"
                    loading={isSubmittingOrder}
                    disabled={
                      !partyRefId ||
                      lines.every((line) => !line.itemId) ||
                      !resolveExpectedDeliveryDateForSubmit()
                    }
                    onClick={() => void handleCreateOrder()}
                  >
                    Generar orden de compra
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
