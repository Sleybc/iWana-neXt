'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ExecutionOrderItemAction,
  type InventoryConsumptionRejectionReasonCode,
  type InventoryReversalRejectionReasonCode,
  type ExecutionOrderItemUsage,
  type InventoryDisposition,
} from '@iwana/shared';
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
  SkeletonBlock,
} from '@iwana/ui';
import { getSerializedAssetStatusLabel } from '@/components/inventory/inventory-labels';
import {
  PortalAlert,
  PortalEmptyState,
  PortalTablePagination,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import type {
  ExecutionOrderDetailResponse,
  RegisterExecutionOrderItemUsageDto,
} from '@/lib/api-client';
import { collectionCountLabel } from './execution-order-collections';
import type { ExecutionOrderCustodyOption } from './execution-order-console-types';
import type {
  ExecutionOrderCaptureSlotProps,
  ExecutionOrderHistorySlotProps,
} from './execution-order-slots';
import { isProlongedPendingInventoryConsumption } from './use-execution-order-custody';
import { isTerminalStatus } from './execution-order-moment';

// SLOT R3 — consumo y custodia por requisito (propiedad de R3).
//
// Acto «Registrar equipo instalado» (captura) e historial de consumos (lectura):
// dos superficies separadas bajo el mismo requisito MATERIAL (UX §4.1 y §6). El
// slot no consulta nada por su cuenta: la custodia y el inventario los carga bajo
// demanda `use-execution-order-custody.ts` al abrir esta hoja y llegan por
// `context` ya filtrados por la categoría del requisito (`itemOptions`,
// `executorCustody*`). Sobre de props:
// `ExecutionOrderCaptureSlotProps<'MATERIAL', 'consumption'>` y
// `ExecutionOrderHistorySlotProps<'MATERIAL'>` (`execution-order-slots.ts`).
// La disponibilidad en custodia es lectura; el consumo es lo ya registrado: no se
// presentan como si fueran lo mismo.

const ITEM_ACTION_LABELS: Record<string, string> = {
  INSTALL: 'Instalar',
  CONSUME: 'Consumir',
  RETURN: 'Devolver',
  REMOVE: 'Retirar',
};

const MOVEMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  REJECTED: 'Rechazado',
};

const DISPOSITION_LABELS: Record<string, string> = {
  INSTALLED_AT_CUSTOMER: 'Instalado en cliente',
  INTERNAL_CONSUMPTION: 'Consumo interno',
  RETURNED_TO_TECHNICIAN_STOCK: 'Retorno a custodia técnica',
  RETURNED_TO_WAREHOUSE: 'Retorno a bodega',
  DAMAGED_OR_LOST: 'Dañado o perdido',
  NOT_REQUIRED: 'No requiere conciliación',
  PENDING: 'Conciliación pendiente',
  CONFIRMED: 'Conciliación confirmada',
  REJECTED: 'Conciliación rechazada',
  DIVERGED: 'Conciliación divergente',
};

const ACTION_OPTIONS = [
  { value: ExecutionOrderItemAction.INSTALL, label: 'Instalar' },
  { value: ExecutionOrderItemAction.CONSUME, label: 'Consumir' },
  { value: ExecutionOrderItemAction.RETURN, label: 'Devolver' },
  { value: ExecutionOrderItemAction.REMOVE, label: 'Retirar' },
];

// Destinos que el usuario puede elegir al registrar (las claves de conciliación
// PENDING/CONFIRMED/... de DISPOSITION_LABELS solo se muestran, no se eligen).
const DISPOSITION_OPTIONS = [
  'INSTALLED_AT_CUSTOMER',
  'INTERNAL_CONSUMPTION',
  'RETURNED_TO_TECHNICIAN_STOCK',
  'RETURNED_TO_WAREHOUSE',
  'DAMAGED_OR_LOST',
].map((value) => ({ value, label: DISPOSITION_LABELS[value] as string }));

type CaptureContext = ExecutionOrderCaptureSlotProps<'MATERIAL', 'consumption'>['context'];

/** Concordancia del sustantivo con el total que se informa («1 equipo», «3 equipos»). */
function noun(total: number, singular: string, plural: string): string {
  return total === 1 ? singular : plural;
}

/** Normaliza el string numérico de stock a una cifra legible sin ceros forzados. */
function custodyQuantityLabel(quantityOnHand: string): string {
  const value = Number(quantityOnHand);
  return Number.isFinite(value) ? String(value) : quantityOnHand;
}

/** Custodia del ejecutor en lectura pura, dentro del acto de consumo. */
function ExecutorCustodyReadout({
  context,
  onRetry,
}: {
  context: CaptureContext;
  onRetry: (() => void) | undefined;
}) {
  const {
    executorCustodyState = 'available',
    executorCustodyName = null,
    executorCustodyAssets = [],
    executorCustodyAssetsMeta,
    executorCustodyBalances = [],
    executorCustodyBalancesMeta,
    isLoadingMoreExecutorCustody,
    onLoadMoreExecutorCustody,
    itemOptions = [],
  } = context;
  const itemLabelById = useMemo(
    () => new Map(itemOptions.map((option) => [option.value, option.label])),
    [itemOptions],
  );

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        En custodia del ejecutor
      </p>
      {executorCustodyState === 'unavailable' ? (
        <PortalAlert
          variant="warning"
          title="Custodia no disponible"
          description="No pudimos consultar la custodia del ejecutor. El resto de la orden sigue disponible."
          action={
            onRetry ? (
              <Button type="button" onClick={onRetry}>
                Reintentar
              </Button>
            ) : undefined
          }
          className="mt-2"
        />
      ) : executorCustodyState === 'loading' ? (
        <div aria-busy="true" aria-label="Cargando custodia del ejecutor" className="mt-2">
          <SkeletonBlock className="h-20" />
        </div>
      ) : executorCustodyAssets.length === 0 && executorCustodyBalances.length === 0 ? (
        <PortalEmptyState
          className="mt-2"
          title="No hay equipos de esta categoría en tu custodia"
          description="Contacta a supervisión para revisar la disponibilidad."
        />
      ) : (
        <div className="mt-2 space-y-2">
          {executorCustodyName && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{executorCustodyName}</p>
          )}
          {executorCustodyAssets.length > 0 && (
            <>
              {executorCustodyAssetsMeta && executorCustodyAssetsMeta.total > 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
                  {collectionCountLabel(
                    executorCustodyAssets.length,
                    executorCustodyAssetsMeta.total,
                    noun(executorCustodyAssetsMeta.total, 'equipo', 'equipos'),
                  )}
                </p>
              ) : null}
              {executorCustodyAssets.map((asset) => (
                <article
                  key={asset.id}
                  className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {asset.serialNumber ?? 'Equipo en custodia'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {[
                        itemLabelById.get(asset.inventoryItemId),
                        getSerializedAssetStatusLabel(asset.currentStatus),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </article>
              ))}
            </>
          )}
          {executorCustodyBalances.length > 0 && (
            <>
              {executorCustodyBalancesMeta && executorCustodyBalancesMeta.total > 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
                  {collectionCountLabel(
                    executorCustodyBalances.length,
                    executorCustodyBalancesMeta.total,
                    noun(executorCustodyBalancesMeta.total, 'material', 'materiales'),
                  )}
                </p>
              ) : null}
              {executorCustodyBalances.map((balance) => (
                <article
                  key={balance.id}
                  className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {itemLabelById.get(balance.itemId) ?? 'Material en custodia'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Cantidad disponible: {custodyQuantityLabel(balance.quantityOnHand)}
                    </p>
                  </div>
                </article>
              ))}
            </>
          )}
          <PortalTablePagination
            hasMore={
              executorCustodyAssetsMeta?.hasMore === true ||
              executorCustodyBalancesMeta?.hasMore === true
            }
            onLoadMore={() => void onLoadMoreExecutorCustody()}
            loading={isLoadingMoreExecutorCustody}
            resourceLabel="elementos en custodia"
            shown={executorCustodyAssets.length + executorCustodyBalances.length}
            total={
              (executorCustodyAssetsMeta?.total ?? 0) + (executorCustodyBalancesMeta?.total ?? 0)
            }
          />
        </div>
      )}
    </div>
  );
}

/** Texto de ayuda del selector de equipo según el estado de la carga bajo demanda. */
function itemHelperText(state: 'loading' | 'available' | 'unavailable', optionCount: number) {
  if (state === 'loading') return 'Consultando tu custodia.';
  if (state === 'unavailable') {
    return 'No pudimos consultar tu custodia. Usa Reintentar para volver a consultarla.';
  }
  return optionCount === 0
    ? 'No hay equipos de esta categoría para seleccionar.'
    : 'Selecciona un equipo de tu custodia';
}

/** Captura inline: custodia en lectura y formulario de consumo del requisito. */
export function ExecutionOrderMaterialAction({
  order,
  requirement,
  action,
  context,
  bindSubmit,
}: ExecutionOrderCaptureSlotProps<'MATERIAL', 'consumption'>) {
  const {
    isSubmitting,
    itemOptions = [],
    itemsState = 'available',
    custodyOptions,
    onRegisterItemUsage,
    onOpenRequirementAction,
    onRefreshDetail,
  } = context;
  const [itemId, setItemId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemSerial, setItemSerial] = useState('');
  const [itemAction, setItemAction] = useState<ExecutionOrderItemAction | ''>('');
  const [selectedCustodyId, setSelectedCustodyId] = useState('');
  const [itemDisposition, setItemDisposition] = useState<InventoryDisposition | ''>('');

  const resolvedCustodyOptions = useMemo<ExecutionOrderCustodyOption[]>(() => {
    if (custodyOptions && custodyOptions.length > 0) {
      return custodyOptions;
    }
    // Red de seguridad: si el boundary no aporta opciones, la custodia elegible
    // por contrato es el técnico/cuadrilla asignados a la OT.
    if (order.assignee?.id && order.assignee.type) {
      return [
        {
          type: order.assignee.type,
          id: order.assignee.id,
          label: order.assignee.displayLabel ?? 'Custodia asignada',
        },
      ];
    }
    return [];
  }, [custodyOptions, order.assignee]);
  const custodySelectOptions = useMemo(
    () => resolvedCustodyOptions.map(({ id, label }) => ({ value: id, label })),
    [resolvedCustodyOptions],
  );

  // Con una sola custodia elegible (la del responsable de la OT) no hay nada que elegir.
  const custodyId =
    selectedCustodyId || (resolvedCustodyOptions.length === 1 ? resolvedCustodyOptions[0]!.id : '');
  // Solo vale lo que el selector ofrece: un ítem de otra categoría no satisface el requisito.
  const selectedItemId = itemOptions.some((option) => option.value === itemId) ? itemId : '';
  // El destino lo declara el requisito cuando corresponde; en ese caso no se elige.
  const requiredDisposition = action.finalDisposition as InventoryDisposition | undefined;
  const disposition = requiredDisposition ?? itemDisposition;
  const dispositionOptions = requiredDisposition
    ? [
        {
          value: requiredDisposition,
          label: DISPOSITION_LABELS[requiredDisposition] ?? 'Destino del requisito',
        },
      ]
    : DISPOSITION_OPTIONS;

  const itemQuantityError =
    itemQty.trim().length === 0
      ? 'Ingresa una cantidad entera mayor que cero.'
      : !Number.isInteger(Number(itemQty)) || Number(itemQty) <= 0
        ? 'La cantidad debe ser entera y mayor que cero.'
        : null;

  async function submit() {
    const quantity = Number(itemQty);
    if (
      !selectedItemId ||
      !itemAction ||
      !custodyId ||
      !disposition ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return;
    }
    const payload: RegisterExecutionOrderItemUsageDto = {
      itemId: selectedItemId,
      requirementKey: requirement.key,
      technicianCustodyId: custodyId,
      quantity,
      action: itemAction,
      finalDisposition: disposition,
    };
    const serial = itemSerial.trim();
    if (serial) payload.serialNumber = serial;
    // Si el boundary informa un fallo, la captura permanece intacta para que el
    // operador pueda corregirla o actualizar el detalle sin perderla.
    const result = await onRegisterItemUsage(payload);
    if (result === false) return;
    setItemId('');
    setItemQty('1');
    setItemSerial('');
    setItemAction('');
    setSelectedCustodyId('');
  }

  useEffect(() => {
    bindSubmit(submit);
    return () => bindSubmit(null);
  });

  // Reintentar la custodia vuelve a abrir este mismo acto (solo recarga la custodia);
  // sin esa vía el drawer ofrece actualizar el detalle completo.
  const retry = onOpenRequirementAction
    ? () => onOpenRequirementAction(action)
    : onRefreshDetail
      ? () => void onRefreshDetail()
      : undefined;

  const idSuffix = `${requirement.key}-capture`;
  return (
    <div className="space-y-3">
      <ExecutorCustodyReadout context={context} onRetry={retry} />
      <form
        data-requirement-submit
        className="mt-4 space-y-3 rounded-xl border border-dashed border-gray-300 p-3 dark:border-dark-border"
      >
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Agregar material o equipo
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            id={`eo-item-id-${idSuffix}`}
            label="Ítem"
            value={selectedItemId}
            options={itemOptions}
            placeholder={
              itemsState === 'loading'
                ? 'Cargando inventario…'
                : itemsState === 'unavailable'
                  ? 'Inventario no disponible'
                  : itemOptions.length === 0
                    ? 'No hay equipos de esta categoría'
                    : 'Selecciona un equipo'
            }
            helperText={itemHelperText(itemsState, itemOptions.length)}
            disabled={isSubmitting || itemsState !== 'available' || itemOptions.length === 0}
            onChange={(event) => setItemId(event.target.value)}
          />
          <Input
            id={`eo-item-qty-${idSuffix}`}
            label="Cantidad"
            type="number"
            min="1"
            step="1"
            value={itemQty}
            error={itemQuantityError ?? undefined}
            disabled={isSubmitting}
            onChange={(event) => setItemQty(event.target.value)}
          />
          <Input
            id={`eo-item-serial-${idSuffix}`}
            label="Serial o lote"
            value={itemSerial}
            disabled={isSubmitting}
            onChange={(event) => setItemSerial(event.target.value)}
            placeholder="Opcional"
          />
          <Select
            id={`eo-item-action-${idSuffix}`}
            label="Acción"
            value={itemAction}
            placeholder="Selecciona una acción"
            options={ACTION_OPTIONS}
            disabled={isSubmitting}
            onChange={(event) => setItemAction(event.target.value as ExecutionOrderItemAction)}
          />
          <Select
            id={`eo-item-custody-${idSuffix}`}
            label="Custodia de origen"
            value={custodyId}
            placeholder={
              resolvedCustodyOptions.length > 0
                ? 'Selecciona una custodia'
                : 'No hay custodia elegible'
            }
            options={custodySelectOptions}
            disabled={isSubmitting || resolvedCustodyOptions.length === 0}
            {...(resolvedCustodyOptions.length === 0
              ? { helperText: 'La orden no tiene una custodia técnica o de cuadrilla elegible.' }
              : {})}
            onChange={(event) => setSelectedCustodyId(event.target.value)}
          />
          <Select
            id={`eo-item-disposition-${idSuffix}`}
            label="Destino"
            value={disposition}
            options={dispositionOptions}
            disabled={isSubmitting || requiredDisposition !== undefined}
            {...(requiredDisposition ? { helperText: 'Lo define el requisito.' } : {})}
            onChange={(event) => setItemDisposition(event.target.value as InventoryDisposition)}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={
            isSubmitting ||
            selectedItemId.length === 0 ||
            itemQuantityError !== null ||
            !itemAction ||
            !custodyId ||
            !disposition
          }
        >
          Registrar material
        </Button>
      </form>
    </div>
  );
}

/** Historial de consumos bajo el requisito; la disponibilidad en custodia no se confunde con consumo. */
export function ExecutionOrderMaterialHistory({
  order,
  requirement,
  context,
}: ExecutionOrderHistorySlotProps<'MATERIAL'>) {
  const { itemUsage, itemUsageMeta } = context;
  const requirementUsages = itemUsage.filter((usage) => usage.requirementKey === requirement.key);
  const usageHistoryComplete =
    itemUsageMeta !== undefined && itemUsageMeta.hasMore !== true && context.itemUsageError == null;
  return (
    <section
      aria-labelledby={`eo-materials-heading-${requirement.key}-history`}
      className="space-y-3"
    >
      <h3
        id={`eo-materials-heading-${requirement.key}-history`}
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Equipos y materiales
      </h3>
      <div className="mt-3 space-y-2">
        {requirementUsages.length > 0 ? (
          <MaterialUsageRecords usages={requirementUsages} order={order} context={context} />
        ) : usageHistoryComplete ? (
          <PortalEmptyState
            title="Todavía no hay consumos registrados para este requisito"
            description="Los equipos y materiales registrados aparecerán aquí."
          />
        ) : null}
      </div>
    </section>
  );
}

/** Historial que no tiene clave de requisito: se presenta fuera de cualquier fila. */
export function ExecutionOrderMaterialUnattributedHistory({
  order,
  context,
}: {
  order: ExecutionOrderDetailResponse;
  context: ExecutionOrderHistorySlotProps<'MATERIAL'>['context'];
}) {
  const unattributedUsages = context.itemUsage.filter((usage) => usage.requirementKey == null);
  if (unattributedUsages.length === 0) return null;

  return (
    <section
      aria-labelledby="eo-materials-unattributed-heading"
      aria-describedby="eo-materials-unattributed-description"
      className="space-y-3"
    >
      <h3
        id="eo-materials-unattributed-heading"
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Consumos sin requisito asociado
      </h3>
      <p
        id="eo-materials-unattributed-description"
        className="text-sm text-gray-500 dark:text-gray-400"
      >
        Estos registros no indican a qué requisito corresponden.
      </p>
      <MaterialUsageRecords usages={unattributedUsages} order={order} context={context} />
    </section>
  );
}

/** Conteo y paginador globales: itemUsage es una colección única por OT. */
export function ExecutionOrderMaterialHistoryFooter({
  order,
  context,
}: {
  order: ExecutionOrderHistorySlotProps<'MATERIAL'>['order'];
  context: ExecutionOrderHistorySlotProps<'MATERIAL'>['context'];
}) {
  const {
    itemUsage,
    itemUsageMeta,
    itemUsageError,
    isLoadingMoreItemUsage,
    onLoadMoreItemUsage,
    onRetryItemUsage,
  } = context;
  const hasCount = itemUsageMeta !== undefined && itemUsageMeta.total > 0;
  const hasMore = itemUsageMeta?.hasMore === true;
  const usageCountLabel = hasCount
    ? materialUsageCountLabel(itemUsage.length, itemUsageMeta.total, itemUsageMeta.totalIsEstimate)
    : null;
  if (
    !hasCount &&
    !hasMore &&
    itemUsageError == null &&
    order.inventoryReconciliation === 'NOT_REQUIRED'
  ) {
    return null;
  }

  return (
    <div
      aria-busy={isLoadingMoreItemUsage}
      className="space-y-2 border-t border-gray-100 pt-3 dark:border-dark-border"
    >
      {usageCountLabel ? (
        <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
          {usageCountLabel}
        </p>
      ) : null}
      {itemUsageError ? (
        <PortalAlert
          variant="error"
          live="assertive"
          title="No pudimos consultar los consumos"
          description={itemUsageError}
          action={
            onRetryItemUsage ? (
              <Button
                className="min-h-11"
                disabled={isLoadingMoreItemUsage}
                loading={isLoadingMoreItemUsage}
                onClick={() => void onRetryItemUsage()}
              >
                Reintentar
              </Button>
            ) : undefined
          }
        />
      ) : null}
      <PortalTablePagination
        hasMore={itemUsageError == null && hasMore}
        onLoadMore={() => void onLoadMoreItemUsage()}
        loading={isLoadingMoreItemUsage}
        resourceLabel="consumos"
      />
      {order.inventoryReconciliation !== 'NOT_REQUIRED' && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {DISPOSITION_LABELS[order.inventoryReconciliation] ?? 'Estado de conciliación'}
        </p>
      )}
    </div>
  );
}

function MaterialUsageRecords({
  usages,
  order,
  context,
}: {
  usages: ExecutionOrderItemUsage[];
  order: ExecutionOrderHistorySlotProps<'MATERIAL'>['order'];
  context: ExecutionOrderHistorySlotProps<'MATERIAL'>['context'];
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <ul className="space-y-2" aria-label="Registros de consumo">
      {usages.map((usage) => (
        <MaterialUsageRecord
          key={usage.id}
          usage={usage}
          order={order}
          context={context}
          now={now}
        />
      ))}
    </ul>
  );
}

function MaterialUsageRecord({
  usage,
  order,
  context,
  now,
}: {
  usage: ExecutionOrderItemUsage;
  order: ExecutionOrderHistorySlotProps<'MATERIAL'>['order'];
  context: ExecutionOrderHistorySlotProps<'MATERIAL'>['context'];
  now: number;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [showReasonError, setShowReasonError] = useState(false);
  const [isReversing, setIsReversing] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const reversal = usage.reversal ?? null;
  const allowedToReverse =
    order.allowedActions?.includes('REVERSE_ITEM_USAGE') === true &&
    usage.movementStatus === 'CONFIRMED' &&
    reversal?.status !== 'PENDING' &&
    reversal?.status !== 'CONFIRMED';
  const reversalStatus = reversal?.status ?? null;
  const rejectionMessage = reversal?.rejectionReasonCode
    ? REVERSAL_REJECTION_COPY[reversal.rejectionReasonCode]
    : null;
  const requirementIsPending =
    usage.requirementKey != null &&
    order.completion.requirements?.find(
      (requirementStatus) => requirementStatus.requirementId === usage.requirementKey,
    )?.satisfied === false;
  const showPostCloseCorrection = reversalStatus === 'CONFIRMED' && isTerminalStatus(order.status);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (isReversing && !nextOpen) return;
    setDialogOpen(nextOpen);
    if (!nextOpen) {
      setReason('');
      setShowReasonError(false);
    }
  };

  async function submitReversal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setShowReasonError(true);
      reasonRef.current?.focus();
      return;
    }
    if (!context.onReverseItemUsage) return;

    setIsReversing(true);
    try {
      const result = await context.onReverseItemUsage(usage.id, { reason: normalizedReason });
      if (result === false) return;
      setDialogOpen(false);
      setReason('');
      setShowReasonError(false);
    } finally {
      setIsReversing(false);
    }
  }

  return (
    <li>
      <article className="rounded-xl border border-gray-200 p-3 dark:border-dark-border">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {usage.serial ?? 'Material registrado'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {[
                ITEM_ACTION_LABELS[usage.action] ?? 'Movimiento registrado',
                `Cantidad: ${usage.quantity}`,
                usage.finalDisposition ? DISPOSITION_LABELS[usage.finalDisposition] : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge
              variant={
                usage.movementStatus === 'CONFIRMED'
                  ? 'success'
                  : usage.movementStatus === 'REJECTED'
                    ? 'error'
                    : 'warning'
              }
            >
              {MOVEMENT_STATUS_LABELS[usage.movementStatus] ?? 'Pendiente de conciliación'}
            </Badge>
            {reversalStatus ? (
              <Badge
                variant={
                  reversalStatus === 'CONFIRMED'
                    ? 'success'
                    : reversalStatus === 'REJECTED'
                      ? 'error'
                      : 'warning'
                }
              >
                {REVERSAL_STATUS_LABELS[reversalStatus]}
              </Badge>
            ) : null}
          </div>
        </div>

        {reversalStatus === 'REJECTED' ? (
          <PortalAlert
            variant="warning"
            title="No se pudo revertir. Revisa el motivo y sigue la acción indicada."
            description={
              rejectionMessage ? (
                <div className="space-y-2">
                  <p>
                    <span className="font-medium">Qué pasó:</span> {rejectionMessage.whatHappened}
                  </p>
                  <p>
                    <span className="font-medium">Qué hacer:</span> {rejectionMessage.nextStep}
                  </p>
                </div>
              ) : undefined
            }
            className="mt-2"
          />
        ) : null}
        {reversalStatus === 'PENDING' ? (
          <PortalAlert
            variant="info"
            title="Reverso pendiente."
            description="Estamos verificando el inventario. No vuelvas a enviar la solicitud; el estado se actualizará cuando recibamos una respuesta."
            className="mt-2"
          />
        ) : null}
        {reversalStatus === 'CONFIRMED' ? (
          <PortalAlert
            variant="success"
            title="Reverso aplicado."
            description="El movimiento contrario quedó registrado en el inventario."
            className="mt-2"
          />
        ) : null}
        {showPostCloseCorrection ? (
          <PortalAlert
            variant="info"
            title="Corrección posterior al cierre."
            description="El reverso se registró después del cierre. El resultado y el cierre de la orden se conservan."
            className="mt-2"
          />
        ) : null}
        {reversalStatus === 'CONFIRMED' && requirementIsPending ? (
          <PortalAlert
            variant="warning"
            title="Material pendiente."
            description="El consumo que cumplía este requisito se revirtió. En una orden abierta, registra el material necesario para volver a cumplirlo. Si la orden ya está cerrada, el resultado y el cierre se conservan."
            className="mt-2"
          />
        ) : null}
        {usage.movementStatus === 'REJECTED' && usage.rejectionReasonCode ? (
          <InventoryConsumptionMessage
            message={INVENTORY_REJECTION_COPY[usage.rejectionReasonCode]}
          />
        ) : null}
        {usage.movementStatus === 'PENDING' &&
        isProlongedPendingInventoryConsumption(usage.createdAt, now) ? (
          <InventoryConsumptionMessage message={PROLONGED_PENDING_COPY} />
        ) : null}

        {allowedToReverse && context.onReverseItemUsage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setDialogOpen(true)}
          >
            Revertir consumo
          </Button>
        ) : null}

        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="max-w-xl" initialFocusRef={reasonRef}>
            <DialogHeader>
              <DialogTitle>Revertir consumo</DialogTitle>
              <DialogDescription>
                Se revertirá todo este consumo. Si se trata de un equipo instalado en el cliente,
                volverá a la custodia móvil del técnico y se cerrará el comodato asociado (préstamo
                del equipo al cliente). Si es un consumo por cantidad, las unidades volverán a la
                custodia de origen. El movimiento original permanecerá en el historial y se
                registrará el movimiento contrario.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" noValidate onSubmit={(event) => void submitReversal(event)}>
              <div className="space-y-1.5">
                <label
                  htmlFor={`eo-reversal-reason-${usage.id}`}
                  className="text-sm font-medium text-gray-900 dark:text-white"
                >
                  Motivo del reverso (obligatorio)
                </label>
                <textarea
                  ref={reasonRef}
                  id={`eo-reversal-reason-${usage.id}`}
                  className={portalTextareaClassName}
                  value={reason}
                  maxLength={2000}
                  aria-required="true"
                  aria-invalid={showReasonError && reason.trim().length === 0}
                  aria-describedby={`eo-reversal-help-${usage.id}${showReasonError && reason.trim().length === 0 ? ` eo-reversal-error-${usage.id}` : ''}`}
                  disabled={isReversing}
                  onChange={(event) => {
                    setReason(event.target.value);
                    if (event.target.value.trim()) setShowReasonError(false);
                  }}
                />
                <p
                  id={`eo-reversal-help-${usage.id}`}
                  className="text-sm text-gray-500 dark:text-gray-400"
                >
                  Explica por qué solicitas este reverso. No incluyas datos personales.
                </p>
                {showReasonError && reason.trim().length === 0 ? (
                  <p
                    id={`eo-reversal-error-${usage.id}`}
                    className="text-sm text-error-700"
                    role="alert"
                  >
                    Escribe un motivo para continuar.
                  </p>
                ) : null}
                {context.error ? (
                  <PortalAlert
                    variant="error"
                    title="No se pudo enviar la solicitud de reverso"
                    description={context.error}
                  />
                ) : null}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isReversing}
                  onClick={() => handleDialogOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={isReversing}>
                  {isReversing ? 'Enviando…' : 'Confirmar reverso'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </article>
    </li>
  );
}

const REVERSAL_STATUS_LABELS: Record<
  NonNullable<ExecutionOrderItemUsage['reversal']>['status'],
  string
> = {
  PENDING: 'Reverso pendiente',
  CONFIRMED: 'Reverso aplicado',
  REJECTED: 'Reverso rechazado',
};

const REVERSAL_REJECTION_COPY: Record<
  InventoryReversalRejectionReasonCode,
  { whatHappened: string; nextStep: string }
> = {
  REVERSAL_ASSET_MOVED: {
    whatHappened: 'El equipo ya no está en la ubicación donde quedó tras el consumo.',
    nextStep:
      'Verifica su ubicación actual y el movimiento más reciente en el inventario antes de corregir la orden. Cuando resuelvas la causa, puedes solicitar un nuevo reverso.',
  },
  REVERSAL_CUSTODY_INACTIVE: {
    whatHappened: 'La custodia del técnico ya no está activa.',
    nextStep:
      'Revisa el estado de la custodia y coordina su regularización antes de corregir la orden. Cuando resuelvas la causa, puedes solicitar un nuevo reverso.',
  },
  REVERSAL_ORIGINAL_NOT_FOUND: {
    whatHappened: 'No encontramos el movimiento de inventario necesario para aplicar el reverso.',
    nextStep:
      'Revisa el historial de inventario. Si el movimiento no aparece, solicita una revisión antes de corregir la orden. Cuando resuelvas la causa, puedes solicitar un nuevo reverso.',
  },
  REVERSAL_LOAN_MISMATCH: {
    whatHappened: 'El préstamo del equipo al cliente no está abierto como se esperaba.',
    nextStep: 'Revisa el estado del préstamo en el inventario antes de corregir la orden.',
  },
};

const INVENTORY_REJECTION_COPY: Record<
  InventoryConsumptionRejectionReasonCode,
  { whatHappened: string; nextStep: string }
> = {
  CUSTODY_INSUFFICIENT: {
    whatHappened: 'No hay suficientes unidades disponibles en tu inventario asignado.',
    nextStep:
      'Revisa la cantidad solicitada. Si necesitas más unidades, pide a tu supervisor que actualice tu inventario asignado.',
  },
  SERIAL_NOT_IN_CUSTODY: {
    whatHappened: 'El equipo con ese número de serie no figura en tu inventario asignado.',
    nextStep:
      'Comprueba el número de serie. Si es correcto, pide a tu supervisor que revise la asignación del equipo.',
  },
  SUBSCRIBER_REQUIRED: {
    whatHappened: 'La orden no indica el cliente o la sede donde se instalará el equipo.',
    nextStep:
      'Pide a tu supervisor que complete esos datos en la orden y vuelve a registrar el consumo.',
  },
  ITEM_INACTIVE: {
    whatHappened: 'El producto seleccionado ya no está disponible para registrar consumos.',
    nextStep:
      'Elige otro producto disponible. Si necesitas usar este producto, pide a tu supervisor que revise su disponibilidad.',
  },
};

const PROLONGED_PENDING_COPY = {
  whatHappened: 'El consumo aún no se ha aplicado al inventario.',
  nextStep:
    'No lo registres de nuevo. Revisa el estado de la orden más tarde; si sigue igual, avisa a tu supervisor.',
};

function InventoryConsumptionMessage({
  message,
}: {
  message: { whatHappened: string; nextStep: string };
}) {
  return (
    <PortalAlert
      variant="warning"
      title={message.whatHappened}
      description={message.nextStep}
      className="mt-2"
    />
  );
}

function materialUsageCountLabel(visible: number, total: number, isEstimate: boolean): string {
  const usageNoun = noun(total, 'consumo', 'consumos');
  if (isEstimate) {
    return `Mostrando ${visible} de más de ${total.toLocaleString('es-CO')} ${usageNoun}`;
  }
  return collectionCountLabel(visible, total, usageNoun);
}
