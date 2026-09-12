'use client';

import { useCallback, useId, useMemo } from 'react';
import { Button, Input, OperationalSidePeek, Select } from '@iwana/ui';
import { StockBalanceCondition, getInventoryUnitOfMeasureLabel } from '@iwana/shared';
import { SearchableMultiPicker } from '@/components/shared/SearchablePicker';
import {
  STOCK_AVAILABLE_AT_SOURCE_LABEL,
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
} from './inventory-labels';
import { isRequestedQtyExceedingAvailable } from './stock-issue-balance-utils';
import {
  formatLotOptionLabel,
  getAvailableQtyByCondition,
  getAvailableQtyForDraftLine,
  listAvailableConditionsForDraftLine,
  listLotOptionsFromPickableLots,
  searchPickableSerializedAssets,
} from './stock-issue-line-utils';
import type { StockIssueDraftLine } from './stock-issue-draft';
import { useStockIssueLineForm } from './useStockIssueLineForm';

/**
 * Copy G1 aprobado (SPEC S2 §6.1): la cantidad de una línea serializada no se
 * edita, se deriva del grupo de seriales elegido.
 */
export const SERIAL_QTY_HELP_TEXT =
  'Este producto se controla por serial: la cantidad es el número de seriales seleccionados. Agrega o quita seriales para cambiarla.';

/** Configuración confirmada por el operador desde el panel. */
export interface StockIssueLineSidePeekResult {
  condition: StockBalanceCondition;
  lotId: string;
  serializedAssetIds: string[];
  serializedAssetLabels: Record<string, string>;
  requestedQty: string;
}

export interface StockIssueLineSidePeekProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Línea a configurar: recién creada (vía panel) o existente del borrador. */
  line: StockIssueDraftLine | null;
  /** `create` agrega al borrador; `edit` guarda cambios sobre la línea existente. */
  mode: 'create' | 'edit';
  sourceLocationId: string;
  /** Seriales usados en otras líneas del borrador: nunca se ofrecen otra vez. */
  excludedSerializedAssetIds: string[];
  /** Etiquetas ya resueltas de seriales (hidratación de edición y filas vivas). */
  serialLabelsById: Record<string, string>;
  busy?: boolean;
  onConfirm: (result: StockIssueLineSidePeekResult) => void;
}

/**
 * Panel lateral de captura de línea (MOD12 S2, receta §9): condición, lote,
 * seriales y cantidad se deciden aquí, no con controles inline en la tabla.
 * Construido sobre `OperationalSidePeek` de `@iwana/ui` — sin tokens nuevos.
 * El estado de captura vive en `useStockIssueLineForm` (S2.1 C1).
 */
export function StockIssueLineSidePeek({
  open,
  onOpenChange,
  line,
  mode,
  sourceLocationId,
  excludedSerializedAssetIds,
  serialLabelsById,
  busy = false,
  onConfirm,
}: StockIssueLineSidePeekProps) {
  const {
    condition,
    lotId,
    serials,
    requestedQty,
    effectiveQty,
    serialized,
    closeNotice,
    setCondition,
    setLotId,
    setSerials,
    setRequestedQty,
    handleBeforeClose,
  } = useStockIssueLineForm(line, serialLabelsById);
  const qtyHelpId = useId();

  const noSerialsInSource = serialized && (line?.availableSerialCount ?? 0) === 0;

  // Opciones de condición: solo las con saldo, pero la condición ACTUAL de la
  // línea siempre figura (una línea editada cuyo caché de disponible ya no
  // refleja su condición no puede verse como "Selecciona una opción").
  const conditionOptions = useMemo(() => {
    if (!line) {
      return [];
    }
    const withStock = listAvailableConditionsForDraftLine(line.availability);
    return withStock.includes(line.condition) ? withStock : [line.condition, ...withStock];
  }, [line]);
  // El lote aplica también a las líneas serializadas: su saldo vive en la misma
  // tupla (ítem, lote, condición) contra la que reservan la salida y el
  // despacho. Ver `applySingleLotPreselectionToDraftLines`.
  const lotOptions = useMemo(
    () => (line ? listLotOptionsFromPickableLots(line.lots, condition) : []),
    [line, condition],
  );

  const availableQty = useMemo(() => {
    if (!line || !line.itemId) {
      return null;
    }
    if (serialized) {
      return line.availableSerialCount;
    }
    return getAvailableQtyForDraftLine({
      availability: line.availability,
      lots: line.lots,
      condition,
      lotId,
      serializedAssetId: '',
    });
  }, [line, serialized, condition, lotId]);

  // Pista explícita (S2.1 C3): con lotes en la condición y ninguno elegido, el
  // disponible es 0 por falta de elección — no por falta de material. Aplica
  // igual a las serializadas: sin lote la salida reserva contra una tupla que
  // no existe y el API la rechaza por disponible 0.
  const showLotHint = lotId.trim() === '' && lotOptions.length > 0;

  const exceedsAvailable =
    availableQty != null &&
    line?.itemId &&
    (serialized
      ? serials.length > availableQty
      : isRequestedQtyExceedingAvailable(requestedQty, availableQty));

  const searchSerials = useCallback(
    (query: string, signal: AbortSignal) =>
      searchPickableSerializedAssets({
        itemId: line?.itemId ?? null,
        locationId: sourceLocationId,
        excludeIds: excludedSerializedAssetIds,
        query,
        signal,
      }),
    [line?.itemId, sourceLocationId, excludedSerializedAssetIds],
  );

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const selectedQty = serialized ? serials.length : Number.parseFloat(requestedQty);
  const canConfirm =
    Boolean(line?.itemId) &&
    !busy &&
    !exceedsAvailable &&
    (serialized ? serials.length > 0 : Number.isFinite(selectedQty) && (selectedQty ?? 0) > 0);

  const handleConfirm = () => {
    if (!line || !canConfirm) {
      return;
    }
    onConfirm({
      condition,
      lotId,
      serializedAssetIds: serials.map((item) => item.id),
      serializedAssetLabels: Object.fromEntries(serials.map((item) => [item.id, item.label])),
      requestedQty: effectiveQty,
    });
  };

  if (!line) {
    return null;
  }

  const unitLabel = line.unitOfMeasure
    ? getInventoryUnitOfMeasureLabel(line.unitOfMeasure)
    : 'unidad';
  const headerMeta = [line.sku.trim() ? `SKU ${line.sku.trim()}` : null, `Unidad: ${unitLabel}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <OperationalSidePeek
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      busy={busy}
      eyebrow="Configurar línea"
      title={line.productLabel || 'Línea manual'}
      description={headerMeta}
      onBeforeClose={handleBeforeClose}
      footer={
        <div className="flex flex-col gap-2">
          {closeNotice ? (
            <p role="alert" className="text-xs text-error-700 dark:text-error-400">
              {closeNotice}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={!canConfirm} loading={busy}>
              {mode === 'edit' ? 'Guardar cambios' : 'Agregar al borrador'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <Select
          label="Condición"
          value={condition}
          disabled={busy}
          onChange={(event) => {
            // Cambiar la condición limpia el lote: las opciones de lote dependen
            // de ella y el disponible de la tupla cambia con la elección.
            setLotId('');
            setCondition(event.target.value as StockBalanceCondition);
          }}
          options={conditionOptions.map((option) => {
            const hasData = (line.availability ?? []).some(
              (row) => row.condition === option && Number(row.available) > 0,
            );
            return {
              value: option,
              label: hasData
                ? `${getStockBalanceConditionLabel(option)} · ${formatInventoryQuantity(getAvailableQtyByCondition(line.availability, option))}`
                : getStockBalanceConditionLabel(option),
            };
          })}
        />

        {serialized ? (
          <div className="space-y-2">
            <SearchableMultiPicker
              resource={{ singular: 'serial', plural: 'seriales' }}
              label="Seriales"
              value={serials}
              onChange={setSerials}
              onSearch={searchSerials}
              minChars={0}
              placeholder="Buscar serial disponible"
              disabled={busy || noSerialsInSource}
            />
            {noSerialsInSource ? (
              <p className="text-xs text-error-700 dark:text-error-400">
                Este producto serializado no tiene seriales disponibles en esta bodega.
              </p>
            ) : null}
            <Input
              label="Cantidad"
              value={effectiveQty}
              readOnly
              inputMode="numeric"
              disabled={busy}
              aria-describedby={qtyHelpId}
            />
            <p
              id={qtyHelpId}
              role="status"
              className="mt-1 text-xs text-gray-500 dark:text-gray-400"
            >
              {SERIAL_QTY_HELP_TEXT}
            </p>
          </div>
        ) : (
          <Input
            label="Cantidad"
            value={requestedQty}
            inputMode="decimal"
            disabled={busy}
            onChange={(event) => {
              setRequestedQty(event.target.value);
            }}
          />
        )}

        {lotOptions.length > 0 ? (
          <Select
            label="Lote"
            value={lotId}
            disabled={busy}
            onChange={(event) => {
              setLotId(event.target.value);
            }}
            options={[
              { value: '', label: 'Sin lote específico' },
              ...lotOptions.map((option) => ({
                value: option.lotId,
                label: formatLotOptionLabel(option),
              })),
            ]}
          />
        ) : null}

        {availableQty != null && line.itemId ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {STOCK_AVAILABLE_AT_SOURCE_LABEL}:{' '}
            <span className="font-medium tabular-nums">
              {formatInventoryQuantity(availableQty)}
            </span>{' '}
            {serialized ? 'seriales' : unitLabel}
          </p>
        ) : null}

        {showLotHint ? (
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {serialized
              ? 'Elige el lote del que salen estos seriales.'
              : 'Elige un lote para ver el disponible de la línea.'}
          </p>
        ) : null}

        {exceedsAvailable && !showLotHint ? (
          <p className="text-xs text-error-700 dark:text-error-400">
            Supera el material disponible en origen. No podrás crear la salida hasta ajustar la
            cantidad.
          </p>
        ) : null}
      </div>
    </OperationalSidePeek>
  );
}
