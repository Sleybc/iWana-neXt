'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button, Input, OperationalSidePeek, Select } from '@iwana/ui';
import { StockBalanceCondition, getInventoryUnitOfMeasureLabel } from '@iwana/shared';
import {
  SearchableMultiPicker,
  type SearchablePickerItem,
} from '@/components/shared/SearchablePicker';
import {
  STOCK_AVAILABLE_AT_SOURCE_LABEL,
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
} from './inventory-labels';
import { isRequestedQtyExceedingAvailable } from './stock-issue-balance-utils';
import {
  fallbackSerializedAssetLabel,
  formatLotOptionLabel,
  getAvailableQtyByCondition,
  getAvailableQtyForDraftLine,
  isSerializedTrackingMode,
  listAvailableConditionsForDraftLine,
  listLotOptionsFromPickableLots,
  resolveSingleLotIdFromLots,
  searchPickableSerializedAssets,
} from './stock-issue-line-utils';
import type { StockIssueDraftLine } from './stock-issue-draft';
import { resolveLineSerializedAssetIds } from './stock-issue-draft';

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
  initialFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: (result: StockIssueLineSidePeekResult) => void;
}

/**
 * Panel lateral de captura de línea (MOD12 S2, receta §9): condición, lote,
 * seriales y cantidad se deciden aquí, no con controles inline en la tabla.
 * Construido sobre `OperationalSidePeek` de `@iwana/ui` — sin tokens nuevos.
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
  initialFocusRef,
  onConfirm,
}: StockIssueLineSidePeekProps) {
  const [condition, setCondition] = useState<StockBalanceCondition>(
    line?.condition ?? StockBalanceCondition.NEW,
  );
  const [lotId, setLotId] = useState('');
  const [serials, setSerials] = useState<SearchablePickerItem[]>([]);
  const [requestedQty, setRequestedQty] = useState('1');
  const [closeNotice, setCloseNotice] = useState('');
  const dirtyRef = useRef(false);

  const serialized = line ? isSerializedTrackingMode(line.trackingMode) : false;
  const noSerialsInSource = serialized && (line?.availableSerialCount ?? 0) === 0;

  // Estado inicial por apertura: cada apertura reconfigura el panel con los
  // valores de la línea; la resolución tardía de etiquetas no reinicia la
  // captura del operador (por eso no va en las dependencias).
  useEffect(() => {
    if (!open || !line) {
      return;
    }
    const ids = resolveLineSerializedAssetIds(line);
    setCondition(line.condition);
    setLotId(line.lotId.trim() || resolveSingleLotIdFromLots(line.lots, line.condition));
    setSerials(
      ids.map((id) => ({
        id,
        label: serialLabelsById[id] ?? fallbackSerializedAssetLabel(id),
      })),
    );
    setRequestedQty(ids.length > 0 ? String(ids.length) : line.requestedQty);
    setCloseNotice('');
    dirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicio solo al abrir o cambiar de línea
  }, [open, line?.id]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

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
  const lotOptions = useMemo(
    () => (line && !serialized ? listLotOptionsFromPickableLots(line.lots, condition) : []),
    [line, serialized, condition],
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

  /**
   * `onBeforeClose` (receta §9): un clic fuera o Escape no descarta en silencio
   * la captura en curso. Cancelar, en el pie, es la salida deliberada.
   */
  const handleBeforeClose = useCallback((): boolean => {
    if (!dirtyRef.current) {
      return true;
    }
    setCloseNotice(
      'Hay cambios sin guardar en esta línea. Confírmalos con el botón del pie o descártalos con Cancelar.',
    );
    return false;
  }, []);

  const handleCancel = useCallback(() => {
    dirtyRef.current = false;
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
    dirtyRef.current = false;
    onConfirm({
      condition,
      // La línea serializada no participa de la tupla de lote (S1).
      lotId: serialized ? '' : lotId,
      serializedAssetIds: serials.map((item) => item.id),
      serializedAssetLabels: Object.fromEntries(serials.map((item) => [item.id, item.label])),
      requestedQty: serialized ? String(serials.length) : requestedQty,
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
      {...(initialFocusRef ? { initialFocusRef } : {})}
      onBeforeClose={handleBeforeClose}
      footer={
        <div className="flex flex-col gap-2">
          {closeNotice ? (
            <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
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
          onChange={(event) => {
            markDirty();
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
              onChange={(next) => {
                markDirty();
                setSerials(next);
              }}
              onSearch={searchSerials}
              minChars={0}
              placeholder="Buscar serial disponible"
              disabled={noSerialsInSource}
            />
            {noSerialsInSource ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Este producto serializado no tiene seriales disponibles en esta bodega.
              </p>
            ) : null}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Cantidad</p>
              <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">
                {serials.length}
              </p>
              <p role="status" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Cantidad: {serials.length}. {SERIAL_QTY_HELP_TEXT}
              </p>
            </div>
          </div>
        ) : (
          <Input
            label="Cantidad"
            value={requestedQty}
            inputMode="decimal"
            onChange={(event) => {
              markDirty();
              setRequestedQty(event.target.value);
            }}
          />
        )}

        {!serialized && lotOptions.length > 0 ? (
          <Select
            label="Lote"
            value={lotId}
            onChange={(event) => {
              markDirty();
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

        {exceedsAvailable ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Supera el material disponible en origen. No podrás crear la salida hasta ajustar la
            cantidad.
          </p>
        ) : null}
      </div>
    </OperationalSidePeek>
  );
}
