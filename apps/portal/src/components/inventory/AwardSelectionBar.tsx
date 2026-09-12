'use client';

import { useId } from 'react';
import { Button } from '@iwana/ui';
import type { AwardSupplierSummary } from '@iwana/shared';
import { PortalActionToolbar } from '@/components/shared/portal-ui';
import { formatInventoryMoney } from './inventory-labels';
import { AWARD_EMPTY_SELECTION_MESSAGE } from './award-matrix';

/**
 * Resumen en vivo de la adjudicación (MOD12 Compras, Fase 30, track FE-2).
 *
 * Contrato congelado: spec 2026-09-11 §5.2 (props exactas) + §4.4 (contenido).
 * Patrón `PortalActionToolbar` como en `PurchaseSelectionBar`, con
 * `role="status"` y `aria-live="polite"`.
 *
 * La frase «Se generarán N órdenes de compra» replica palabra por palabra la
 * cita de la spec §4.4 (el drawer batch de `PurchaseOrderDrawer` dice
 * «Se generarán N órdenes (una por proveedor adjudicado)…»: la barra usa la
 * cita literal de la spec, con la misma pluralización orden/órdenes).
 */

export interface AwardSelectionBarProps {
  summaries: AwardSupplierSummary[];
  pendingCount: number;
  totalCount: number;
  /** Con monedas mixtas los totales van separados por moneda (spec §6.3). */
  currencyMixed: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onSaveOnly: () => void;
  /**
   * Razón contextual con cero selecciones (prop aditiva FE-3): el panel la
   * calcula vía `getAwardEmptySelectionNotice` porque «nada marcado» con todas
   * las filas bloqueadas no se resuelve con los conteos de esta barra. Sin
   * valor aplica el mensaje de selección vacía.
   */
  emptySelectionNotice?: string | undefined;
}

function formatSupplierPill(summary: AwardSupplierSummary): string {
  const productWord = summary.productCount === 1 ? 'producto' : 'productos';
  const totals = summary.totalsByCurrency
    .map((entry) => formatInventoryMoney(entry.total, entry.currency))
    .join(' · ');
  return `${summary.supplierLabel} · ${summary.productCount} ${productWord} · ${totals}`;
}

export function AwardSelectionBar({
  summaries,
  pendingCount,
  totalCount,
  currencyMixed,
  submitting,
  onSubmit,
  onSaveOnly,
  emptySelectionNotice,
}: AwardSelectionBarProps) {
  const reasonId = useId();
  const awardedCount = totalCount - pendingCount;
  const hasSelection = summaries.length > 0;
  const orderCount = summaries.length;
  const orderWord = orderCount === 1 ? 'orden' : 'órdenes';
  const pendingWord = pendingCount === 1 ? 'pendiente' : 'pendientes';
  const controlsDisabled = !hasSelection || submitting;
  const reasonText = emptySelectionNotice ?? AWARD_EMPTY_SELECTION_MESSAGE;

  return (
    <PortalActionToolbar className="mt-3 flex-col items-stretch gap-2">
      <span
        role="status"
        aria-live="polite"
        className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200"
      >
        {awardedCount} de {totalCount}{' '}
        {totalCount === 1 ? 'producto adjudicado' : 'productos adjudicados'} · {pendingCount}{' '}
        {pendingWord}
      </span>

      {hasSelection ? (
        <ul aria-label="Totales por proveedor" className="flex flex-wrap items-center gap-2 px-3">
          {summaries.map((summary) => (
            <li
              key={summary.supplierPartyRefId}
              className="inline-flex min-h-6 items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200"
            >
              {formatSupplierPill(summary)}
            </li>
          ))}
        </ul>
      ) : null}

      {hasSelection ? (
        <p className="px-3 text-sm text-gray-600 dark:text-gray-300">
          Se generarán {orderCount} {orderWord} de compra
          {currencyMixed ? ' · totales separados por moneda' : null}
        </p>
      ) : null}

      <span className="flex flex-wrap items-center gap-2 px-3 pb-2">
        <Button
          type="button"
          size="sm"
          loading={submitting}
          disabled={controlsDisabled}
          aria-describedby={controlsDisabled && !submitting ? reasonId : undefined}
          onClick={onSubmit}
        >
          Adjudicar y continuar
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={controlsDisabled}
          aria-describedby={controlsDisabled && !submitting ? reasonId : undefined}
          onClick={onSaveOnly}
        >
          Guardar adjudicación
        </Button>
      </span>

      {controlsDisabled && !submitting ? (
        <p id={reasonId} className="px-3 pb-2 text-xs text-iwana-secondary-700 dark:text-gray-300">
          {reasonText}
        </p>
      ) : null}
    </PortalActionToolbar>
  );
}
