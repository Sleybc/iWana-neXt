'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Select,
} from '@iwana/ui';
import { PurchaseRequestStatus, PurchaseRequestType } from '@iwana/shared';
import type { PurchaseRequestLineAwardInput } from '@iwana/shared';
import type { InventoryItemRecord, PurchaseRequestDetailRecord } from '@/lib/api-client';
import { PortalAlert, PortalEmptyState, PortalSectionHeader } from '@/components/shared/portal-ui';
import {
  assignQuoteColumn,
  buildAwardMatrix,
  getAwardColumnControlId,
  getAwardEmptySelectionNotice,
  getAwardMatrixProgress,
  isCurrencyMixed,
  setLineQuantity,
  summarizeBySupplier,
  toCreateAwardsDto,
  toggleCell,
  type AwardMatrixState,
} from './award-matrix';
import { formatInventoryDateOnly } from './inventory-labels';
import { focusElementById } from './line-focus';
import { AwardMatrixTable } from './AwardMatrixTable';
import { AwardQuoteAccordion } from './AwardQuoteAccordion';
import { AwardSelectionBar } from './AwardSelectionBar';
import { SupplierPicker } from './SupplierPicker';

/**
 * Contenedor de adjudicación por cotización (MOD12 Compras, Fase 30, tracks
 * FE-2/FE-3).
 *
 * Contrato congelado: spec 2026-09-11 §5.2 (las siete props base son exactas;
 * las opcionales de FE-3 son aditivas y compatibles hacia atrás). Estados de
 * excepción §4.5, conmutación matriz↔acordeón §3/§4 (auto con >3 cotizaciones
 * o viewport <1024px + conmutador manual), diálogo de revocación §6.5 y
 * escotilla §7 (formulario completo con persistencia).
 *
 * El tipo de `onDraftsChange`/`onSubmit`/`onSaveOnly`/`onDirectAward` es el
 * del contrato congelado (`@iwana/shared`, cantidades como cadena decimal).
 * El DTO del api-client (`@/lib/api-client`, cantidades numéricas) lo compone
 * el punto de integración (`PurchaseRequestWorkbenchDrawer`, mapeo
 * string→number).
 */

export interface AwardMatrixPanelProps {
  detail: PurchaseRequestDetailRecord;
  items: InventoryItemRecord[];
  supplierLabels?: Record<string, string> | undefined;
  disabled?: boolean | undefined;
  error?: string | null | undefined;
  onDraftsChange?: ((drafts: PurchaseRequestLineAwardInput[]) => void) | undefined;
  /** Revocación confirmada en el diálogo §6.5; resuelve el éxito para cerrar o avisar. */
  onRevokeAward?: ((awardId: string) => Promise<boolean>) | undefined;
  /** Envío «Adjudicar y continuar»: persiste el draft y avanza al flujo de órdenes. */
  onSubmit?: ((drafts: PurchaseRequestLineAwardInput[]) => Promise<void>) | undefined;
  /** Guardado «Guardar adjudicación»: persiste sin avanzar. */
  onSaveOnly?: ((drafts: PurchaseRequestLineAwardInput[]) => Promise<void>) | undefined;
  /** Creación y persistencia del operador; el padre refresca el detalle. */
  submitting?: boolean | undefined;
  /** CTA del estado «Sin cotizaciones»: navega al tab Cotizar del drawer. */
  onGoToQuotes?: (() => void) | undefined;
  /**
   * Cotización a enfocar al entrar desde «Adjudicar productos de esta
   * cotización» (`QuoteComparisonPanel`, patrón `line-focus.ts`). El panel
   * enfoca el control de columna una vez y avisa con `onFocusedQuoteConsumed`.
   */
  focusedQuoteId?: string | null | undefined;
  onFocusedQuoteConsumed?: (() => void) | undefined;
  /** Persistencia de la escotilla §7 (proveedor sin cotización, con costo). */
  onDirectAward?: ((draft: PurchaseRequestLineAwardInput) => Promise<void>) | undefined;
}

export { getAwardColumnControlId };

type AwardMatrixView = 'matrix' | 'accordion';

function buildPanelState(
  detail: PurchaseRequestDetailRecord,
  items: InventoryItemRecord[],
  supplierLabels: Record<string, string> | undefined,
  disabled: boolean | undefined,
): AwardMatrixState {
  return buildAwardMatrix(detail, items, {
    ...(supplierLabels ? { supplierLabels } : {}),
    ...(disabled !== undefined ? { disabled } : {}),
  });
}

export function AwardMatrixPanel({
  detail,
  items,
  supplierLabels,
  disabled,
  error,
  onDraftsChange,
  onRevokeAward,
  onSubmit,
  onSaveOnly,
  submitting = false,
  onGoToQuotes,
  focusedQuoteId = null,
  onFocusedQuoteConsumed,
  onDirectAward,
}: AwardMatrixPanelProps) {
  const [matrixState, setMatrixState] = useState<AwardMatrixState>(() =>
    buildPanelState(detail, items, supplierLabels, disabled),
  );
  const [viewOverride, setViewOverride] = useState<AwardMatrixView | null>(null);
  const [narrowViewport, setNarrowViewport] = useState(false);
  const [revokeAwardId, setRevokeAwardId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [hatchOpen, setHatchOpen] = useState(false);
  const [hatchSupplierId, setHatchSupplierId] = useState<string | null>(null);
  const [hatchSupplierLabel, setHatchSupplierLabel] = useState<string | null>(null);
  const [hatchLineId, setHatchLineId] = useState('');
  const [hatchQuantity, setHatchQuantity] = useState('');
  const [hatchUnitCost, setHatchUnitCost] = useState('');
  const [hatchNotes, setHatchNotes] = useState('');
  const [hatchError, setHatchError] = useState<string | null>(null);
  const [hatchSubmitting, setHatchSubmitting] = useState(false);

  // Firma serializada: el padre puede entregar un objeto de etiquetas nuevo
  // con contenido equivalente en cada render (p. ej. `supplierLabels = {}` por
  // defecto); depender de la identidad realimentaría
  // `onDraftsChange → setState del padre → render` en un bucle infinito.
  const supplierLabelsSignature = JSON.stringify(supplierLabels ?? null);
  useEffect(() => {
    setMatrixState(buildPanelState(detail, items, supplierLabels, disabled));
    // La dependencia es la firma, no la identidad del objeto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, items, supplierLabelsSignature, disabled]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia('(max-width: 1023px)');
    const update = (): void => setNarrowViewport(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const handleToggleCell = useCallback((lineId: string, quoteId: string): void => {
    setMatrixState((current) => toggleCell(current, lineId, quoteId));
  }, []);

  const handleToggleColumn = useCallback((quoteId: string): void => {
    setMatrixState((current) => assignQuoteColumn(current, quoteId));
  }, []);

  const handleQuantityChange = useCallback((lineId: string, value: string): void => {
    setMatrixState((current) => setLineQuantity(current, lineId, value));
  }, []);

  /**
   * La tabla invoca con el `purchaseRequestLineId` (la fila del contrato no
   * expone `awardId`): se resuelve aquí contra `state.locks`, único dueño de
   * los ids persistidos. Filas ordenadas (bloqueo duro) no ofrecen revocación.
   */
  const handleRevokeRequest = useCallback(
    (lineId: string): void => {
      const lock = matrixState.locks[lineId];
      if (lock && !lock.ordered && lock.awardId) {
        setRevokeError(null);
        setRevokeAwardId(lock.awardId);
      }
    },
    [matrixState.locks],
  );

  const handleConfirmRevoke = useCallback(async (): Promise<void> => {
    if (revokeAwardId === null || !onRevokeAward) {
      return;
    }
    setRevoking(true);
    try {
      const ok = await onRevokeAward(revokeAwardId);
      if (ok) {
        setRevokeAwardId(null);
        setRevokeError(null);
      } else {
        // El servidor es la autoridad (AWARD_ALREADY_ORDERED): mensaje
        // genérico, sin PII ni detalle técnico.
        setRevokeError(
          'No se pudo revocar la adjudicación. Si ya tiene una orden de compra, no se puede revocar.',
        );
      }
    } catch {
      setRevokeError(
        'No se pudo revocar la adjudicación. Si ya tiene una orden de compra, no se puede revocar.',
      );
    } finally {
      setRevoking(false);
    }
  }, [revokeAwardId, onRevokeAward]);

  const closeRevokeDialog = useCallback((): void => {
    if (!revoking) {
      setRevokeAwardId(null);
      setRevokeError(null);
    }
  }, [revoking]);

  // Foco gestionado al entrar desde la comparación (patrón `line-focus.ts`):
  // una sola vez por cotización enfocada; sin `document` no hace nada (SSR).
  useEffect(() => {
    if (!focusedQuoteId) {
      return;
    }
    focusElementById(getAwardColumnControlId(focusedQuoteId));
    onFocusedQuoteConsumed?.();
    // Solo depende del identificador: el consumo lo notifica una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedQuoteId]);

  const handleSubmit = useCallback((): void => {
    if (submitting) {
      return;
    }
    void onSubmit?.(toCreateAwardsDto(matrixState).awards);
  }, [matrixState, onSubmit, submitting]);

  const handleSaveOnly = useCallback((): void => {
    if (submitting) {
      return;
    }
    void onSaveOnly?.(toCreateAwardsDto(matrixState).awards);
  }, [matrixState, onSaveOnly, submitting]);

  const drafts = useMemo(() => toCreateAwardsDto(matrixState).awards, [matrixState]);

  useEffect(() => {
    onDraftsChange?.(drafts);
  }, [drafts, onDraftsChange]);

  const summaries = useMemo(() => summarizeBySupplier(matrixState), [matrixState]);
  const progress = useMemo(() => getAwardMatrixProgress(matrixState), [matrixState]);
  const currencyMixed = isCurrencyMixed(matrixState);
  const quantityEditable = matrixState.requestType === PurchaseRequestType.PROJECT;
  const approved = detail.request.status === PurchaseRequestStatus.APPROVED;
  const converted = detail.request.status === PurchaseRequestStatus.CONVERTED_TO_PO;
  const normalizedError = error?.trim() ? error.trim() : null;
  const emptySelectionNotice = getAwardEmptySelectionNotice(matrixState);

  // Escotilla §7: solo filas libres (sin award persistido) son adjudicables
  // en directo. Fuera de PROJECT la cantidad queda bloqueada a la solicitada
  // (paridad con `lockQuantity` de la matriz, spec §6.2).
  const hatchFreeRows = useMemo(
    () =>
      matrixState.rows.filter((row) => matrixState.locks[row.purchaseRequestLineId] === undefined),
    [matrixState.rows, matrixState.locks],
  );
  const hatchLocksQuantity = detail.request.requestType !== PurchaseRequestType.PROJECT;
  const hatchSelectedRow = hatchFreeRows.find((row) => row.purchaseRequestLineId === hatchLineId);

  function openHatch(): void {
    setHatchError(null);
    if (!hatchLineId && hatchFreeRows.length > 0) {
      const first = hatchFreeRows[0];
      if (first) {
        setHatchLineId(first.purchaseRequestLineId);
        setHatchQuantity(first.quantityRequested);
      }
    }
    setHatchOpen(true);
  }

  function closeHatch(): void {
    if (hatchSubmitting) {
      return;
    }
    setHatchOpen(false);
    setHatchError(null);
  }

  function handleHatchLineChange(lineId: string): void {
    setHatchLineId(lineId);
    const row = hatchFreeRows.find((entry) => entry.purchaseRequestLineId === lineId);
    if (row) {
      setHatchQuantity(row.quantityRequested);
    }
  }

  const hatchQuantityError = (() => {
    if (!hatchSelectedRow) {
      return null;
    }
    const parsed = Number(hatchQuantity);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 'Indica una cantidad válida mayor que cero.';
    }
    if (parsed > Number(hatchSelectedRow.quantityRequested) + 1e-9) {
      return `La cantidad no puede superar la solicitada (${hatchSelectedRow.quantityRequested}).`;
    }
    return null;
  })();

  const hatchUnitCostError = (() => {
    const parsed = Number(hatchUnitCost);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 'Indica el costo unitario: es obligatorio en la adjudicación sin cotización.';
    }
    return null;
  })();

  const hatchReady =
    hatchSupplierId !== null &&
    hatchSelectedRow !== undefined &&
    hatchQuantityError === null &&
    hatchUnitCostError === null &&
    matrixState.canEdit;

  const handleConfirmHatch = useCallback(async (): Promise<void> => {
    if (!hatchReady || !hatchSupplierId || !hatchSelectedRow || !onDirectAward) {
      return;
    }
    setHatchSubmitting(true);
    setHatchError(null);
    try {
      const quantity = hatchLocksQuantity
        ? hatchSelectedRow.quantityRequested
        : Number(hatchQuantity).toFixed(2);
      const draft: PurchaseRequestLineAwardInput = {
        purchaseRequestLineId: hatchSelectedRow.purchaseRequestLineId,
        awardedPartyRefId: hatchSupplierId,
        awardedQuantity: Number(quantity).toFixed(2),
        unitCost: Number(hatchUnitCost).toFixed(2),
        ...(hatchNotes.trim() ? { awardNotes: hatchNotes.trim() } : {}),
      };
      await onDirectAward(draft);
      setHatchOpen(false);
      setHatchSupplierId(null);
      setHatchSupplierLabel(null);
      setHatchLineId('');
      setHatchQuantity('');
      setHatchUnitCost('');
      setHatchNotes('');
    } catch {
      // Sin PII ni detalle técnico: el padre deja el error de red en awardsError.
      setHatchError(
        'No se pudo guardar la adjudicación directa. Revisa los datos e inténtalo de nuevo.',
      );
    } finally {
      setHatchSubmitting(false);
    }
  }, [
    hatchReady,
    hatchSupplierId,
    hatchSelectedRow,
    hatchLocksQuantity,
    hatchQuantity,
    hatchUnitCost,
    hatchNotes,
    onDirectAward,
  ]);

  const autoAccordion = matrixState.columns.length > 3 || narrowViewport;
  const view: AwardMatrixView = viewOverride ?? (autoAccordion ? 'accordion' : 'matrix');

  const headerDescription = useMemo(() => {
    const count = matrixState.columns.length;
    const quoteWord = count === 1 ? 'cotización' : 'cotizaciones';
    const validityDates = detail.quotes
      .map((quote) => quote.validUntil)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .sort();
    const nearest = validityDates[0];
    if (!nearest) {
      return `Compara ${count} ${quoteWord} por producto.`;
    }
    return `Compara ${count} ${quoteWord} por producto · validez más próxima: ${formatInventoryDateOnly(nearest)}.`;
  }, [detail.quotes, matrixState.columns.length]);

  return (
    <div className="space-y-4">
      <PortalSectionHeader
        eyebrow="Adjudicación"
        title="Adjudicar productos a proveedores"
        description={headerDescription}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="secondary" size="sm">
                Acciones
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={openHatch}>
                Adjudicar a proveedor sin cotización
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {normalizedError ? (
        <PortalAlert variant="error" title="No se pudo adjudicar" description={normalizedError} />
      ) : null}

      {converted ? (
        <p className="text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400">
          La solicitud ya fue convertida en orden de compra: la adjudicación queda como registro y
          el seguimiento continúa en Abastecer.
        </p>
      ) : !approved ? (
        <p className="text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400">
          La adjudicación solo está disponible cuando la solicitud está aprobada.
        </p>
      ) : null}

      {matrixState.columns.length === 0 ? (
        <PortalEmptyState
          title="Sin cotizaciones para comparar"
          description="Registra al menos una cotización antes de adjudicar."
          action={
            onGoToQuotes ? (
              <Button type="button" variant="secondary" size="sm" onClick={onGoToQuotes}>
                Ir a cotizar
              </Button>
            ) : undefined
          }
        />
      ) : matrixState.rows.length === 0 ? (
        <PortalEmptyState
          title="Sin productos adjudicables"
          description="Solo los productos de catálogo se pueden adjudicar en esta etapa."
        />
      ) : (
        <>
          {currencyMixed ? (
            <PortalAlert
              variant="info"
              title="Monedas distintas"
              description="Las cotizaciones están en monedas distintas: la comparación de precios está desactivada."
            />
          ) : null}

          <div role="group" aria-label="Vista de adjudicación" className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={view === 'matrix' ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={view === 'matrix'}
              onClick={() => setViewOverride('matrix')}
            >
              Matriz
            </Button>
            <Button
              type="button"
              variant={view === 'accordion' ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={view === 'accordion'}
              onClick={() => setViewOverride('accordion')}
            >
              Por cotización
            </Button>
          </div>

          {view === 'matrix' ? (
            <AwardMatrixTable
              rows={matrixState.rows}
              columns={matrixState.columns}
              canEdit={matrixState.canEdit}
              quantityEditable={quantityEditable}
              onToggleCell={handleToggleCell}
              onToggleColumn={handleToggleColumn}
              onQuantityChange={handleQuantityChange}
              {...(onRevokeAward ? { onRevokeRequest: handleRevokeRequest } : {})}
            />
          ) : (
            <AwardQuoteAccordion
              rows={matrixState.rows}
              columns={matrixState.columns}
              selections={matrixState.selections}
              canEdit={matrixState.canEdit}
              onToggleCell={handleToggleCell}
              onToggleColumn={handleToggleColumn}
            />
          )}

          <AwardSelectionBar
            summaries={summaries}
            pendingCount={progress.pendingCount}
            totalCount={progress.totalCount}
            currencyMixed={currencyMixed}
            submitting={submitting}
            onSubmit={handleSubmit}
            onSaveOnly={handleSaveOnly}
            emptySelectionNotice={emptySelectionNotice}
          />
        </>
      )}

      <Dialog
        open={revokeAwardId !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeRevokeDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revocar adjudicación</DialogTitle>
            <DialogDescription>
              Se eliminará la adjudicación de este producto. Podrás volver a adjudicarlo después.
            </DialogDescription>
          </DialogHeader>
          {revokeError ? (
            <PortalAlert variant="error" title="No se pudo revocar" description={revokeError} />
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={revoking}
              onClick={closeRevokeDialog}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={revoking}
              onClick={() => void handleConfirmRevoke()}
            >
              Revocar adjudicación
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={hatchOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeHatch();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjudicar a proveedor sin cotización</DialogTitle>
            <DialogDescription>
              Compra directa sin cotización registrada. El costo unitario es obligatorio: es el
              único camino donde lo aporta el operador.
            </DialogDescription>
          </DialogHeader>
          {hatchError ? (
            <PortalAlert variant="error" title="No se pudo guardar" description={hatchError} />
          ) : null}
          {hatchFreeRows.length === 0 ? (
            <p className="text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400">
              No hay productos libres para adjudicar en directo.
            </p>
          ) : (
            <div className="space-y-3">
              <SupplierPicker
                label="Proveedor adjudicado"
                value={hatchSupplierId}
                selectedLabel={hatchSupplierLabel}
                disabled={hatchSubmitting}
                onChange={(partyRefId, displayName) => {
                  setHatchSupplierId(partyRefId);
                  setHatchSupplierLabel(displayName);
                }}
              />
              <Select
                label="Producto"
                value={hatchLineId}
                disabled={hatchSubmitting}
                options={hatchFreeRows.map((row) => ({
                  value: row.purchaseRequestLineId,
                  label: `${row.itemName || 'Sin nombre'}${row.sku.trim() ? ` · ${row.sku.trim()}` : ''} · ${row.quantityRequested} ${row.unitOfMeasure}`,
                }))}
                onChange={(event) => handleHatchLineChange(event.target.value)}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Cantidad adjudicada"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={hatchQuantity}
                  disabled={hatchSubmitting || hatchLocksQuantity}
                  onChange={(event) => setHatchQuantity(event.target.value)}
                  error={hatchQuantityError ?? undefined}
                  helperText={
                    hatchLocksQuantity
                      ? 'En este tipo de compra la adjudicación cubre la cantidad total.'
                      : undefined
                  }
                />
                <Input
                  label="Costo unitario"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  requiredIndicator
                  value={hatchUnitCost}
                  disabled={hatchSubmitting}
                  onChange={(event) => setHatchUnitCost(event.target.value)}
                  error={
                    hatchUnitCostError && hatchUnitCost.trim() ? hatchUnitCostError : undefined
                  }
                />
              </div>
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-gray-900 dark:text-white">
                  Notas de adjudicación
                </span>
                <textarea
                  aria-label="Notas de la adjudicación directa"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-iwana-neutral-600 dark:bg-dark-surface-3 dark:text-white"
                  rows={2}
                  value={hatchNotes}
                  disabled={hatchSubmitting}
                  onChange={(event) => setHatchNotes(event.target.value)}
                />
              </label>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={hatchSubmitting}
              onClick={closeHatch}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              loading={hatchSubmitting}
              disabled={!hatchReady || hatchSubmitting || !onDirectAward}
              onClick={() => void handleConfirmHatch()}
            >
              Guardar adjudicación
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
