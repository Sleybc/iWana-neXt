'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ExecutionOrderItemAction,
  InventoryDisposition,
  getInventoryUnitOfMeasureDimension,
  getInventoryUnitOfMeasureLabelForQuantity,
  type InventoryConsumptionRejectionReasonCode,
  type InventoryReversalRejectionReasonCode,
  type ExecutionOrderItemUsage,
  InventoryTrackingMode,
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
  RadioCardGroup,
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
import type {
  ExecutionOrderItemUsageBatchRow,
  ExecutionOrderItemUsageBatchResult,
} from './execution-order-console-types';
import type {
  ExecutionOrderCaptureSlotProps,
  ExecutionOrderHistorySlotProps,
} from './execution-order-slots';
import { isProlongedPendingInventoryConsumption } from './use-execution-order-custody';
import { isTerminalStatus } from './execution-order-moment';

// SLOT R3 — consumo y custodia por requisito (propiedad de R3).
//
// Acto de registro de material (captura) e historial de consumos (lectura):
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

const DISPOSITION_OPTIONS = Object.values(InventoryDisposition).map((value) => ({
  value,
  label:
    value === InventoryDisposition.INSTALLED_AT_CUSTOMER
      ? 'Instalado en el sitio del cliente'
      : (DISPOSITION_LABELS[value] ?? value),
}));

/** La acción del comando se deriva del destino elegido o fijado en el snapshot. */
const ACTION_BY_DISPOSITION: Record<InventoryDisposition, ExecutionOrderItemAction> = {
  [InventoryDisposition.INSTALLED_AT_CUSTOMER]: ExecutionOrderItemAction.INSTALL,
  [InventoryDisposition.INTERNAL_CONSUMPTION]: ExecutionOrderItemAction.CONSUME,
  [InventoryDisposition.RETURNED_TO_TECHNICIAN_STOCK]: ExecutionOrderItemAction.RETURN,
  [InventoryDisposition.RETURNED_TO_WAREHOUSE]: ExecutionOrderItemAction.RETURN,
  [InventoryDisposition.DAMAGED_OR_LOST]: ExecutionOrderItemAction.REMOVE,
};

type CaptureScope = 'serialized' | 'consumables';
type CaptureRow = ExecutionOrderItemUsageBatchRow & { reference: string; scope: CaptureScope };
type CaptureResult = ExecutionOrderItemUsageBatchResult;

function noun(total: number, singular: string, plural: string): string {
  return total === 1 ? singular : plural;
}

/** Las unidades de conteo son enteras; las unidades físicas siguen la escala del ledger (2). */
function getQuantityPrecision(unitCode: string): number {
  const dimension = getInventoryUnitOfMeasureDimension(unitCode);
  return dimension && dimension !== 'COUNT' ? 2 : 0;
}

function roundQuantity(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatInventoryQuantity(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value);
}

function newIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

/** Captura compacta: el modo del artículo decide entre activo serializado y fila de cantidad. */
export function ExecutionOrderMaterialAction({
  order,
  requirement,
  action,
  context,
  bindSubmit,
  onClose,
}: ExecutionOrderCaptureSlotProps<'MATERIAL', 'consumption'>) {
  const {
    isSubmitting,
    itemOptions = [],
    itemsState = 'available',
    executorCustodyState = 'available',
    executorCustodyName,
    executorCustodyAssets = [],
    executorCustodyAssetsMeta,
    executorCustodyBalances = [],
    executorCustodyBalancesMeta,
    isLoadingMoreExecutorCustody,
    onLoadMoreExecutorCustody,
    custodyOptions,
    onRegisterItemUsage,
    onRegisterItemUsageBatch,
    onOpenRequirementAction,
    onRefreshDetail,
  } = context;
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Record<string, CaptureResult>>({});
  const [activeScope, setActiveScope] = useState<CaptureScope | null>(null);
  const [itemDisposition, setItemDisposition] = useState<InventoryDisposition | ''>('');
  const submitScopeRef = useRef<CaptureScope | null>(null);
  const idempotencyKeys = useRef(new Map<string, { fingerprint: string; key: string }>());

  const itemById = useMemo(
    () => new Map(itemOptions.map((item) => [item.value, item])),
    [itemOptions],
  );
  const serializedItems = useMemo(
    () => itemOptions.filter((item) => item.trackingMode === InventoryTrackingMode.SERIALIZED),
    [itemOptions],
  );
  const serializedItemIds = useMemo(
    () => new Set(serializedItems.map((item) => item.value)),
    [serializedItems],
  );
  const serializedAssets = useMemo(
    () => executorCustodyAssets.filter((asset) => serializedItemIds.has(asset.inventoryItemId)),
    [executorCustodyAssets, serializedItemIds],
  );
  const visibleAssets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    if (serializedAssets.length <= 8 || query.length === 0) return serializedAssets;
    return serializedAssets.filter((asset) =>
      [asset.serialNumber?.trim(), asset.macAddress?.trim()]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase('es').includes(query)),
    );
  }, [search, serializedAssets]);
  const consumableRows = useMemo(() => {
    const availableByItem = new Map<string, number>();
    for (const balance of executorCustodyBalances) {
      const item = itemById.get(balance.itemId);
      if (!item || item.trackingMode === InventoryTrackingMode.SERIALIZED) continue;
      const onHand = Number(balance.quantityOnHand);
      const reserved = Number(balance.quantityReserved);
      const net = onHand - reserved;
      if (!Number.isFinite(net)) continue;
      availableByItem.set(balance.itemId, (availableByItem.get(balance.itemId) ?? 0) + net);
    }
    return [...availableByItem]
      .filter(([, available]) => available > 0)
      .map(([itemId, available]) => ({ item: itemById.get(itemId)!, itemId, available }))
      .sort((left, right) => left.item.name.localeCompare(right.item.name, 'es'));
  }, [executorCustodyBalances, itemById]);

  const resolvedCustodyOptions = useMemo(() => {
    if (custodyOptions && custodyOptions.length > 0) return custodyOptions;
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
  const custody = resolvedCustodyOptions.length === 1 ? resolvedCustodyOptions[0] : null;
  const custodyId = custody?.id ?? '';
  const custodyName = executorCustodyName ?? custody?.label ?? 'custodia asignada';
  const requiredDisposition = action.finalDisposition as InventoryDisposition | undefined;
  const disposition = requiredDisposition ?? itemDisposition;
  const derivedAction = disposition ? ACTION_BY_DISPOSITION[disposition] : null;
  const retryLoad = onOpenRequirementAction
    ? () => onOpenRequirementAction(action)
    : onRefreshDetail
      ? () => void onRefreshDetail()
      : undefined;

  function getIdempotencyKey(rowKey: string, payload: RegisterExecutionOrderItemUsageDto) {
    const fingerprint = JSON.stringify(payload);
    const previous = idempotencyKeys.current.get(rowKey);
    if (previous?.fingerprint === fingerprint) return previous.key;
    const key = newIdempotencyKey();
    idempotencyKeys.current.set(rowKey, { fingerprint, key });
    return key;
  }

  function buildConsumableRow(row: (typeof consumableRows)[number]): CaptureRow | null {
    const quantity = quantities[row.itemId] ?? 0;
    const precision = getQuantityPrecision(row.item.unitOfMeasure ?? 'UNIT');
    const roundedQuantity = roundQuantity(quantity, precision);
    if (
      !custodyId ||
      !derivedAction ||
      !disposition ||
      !Number.isFinite(quantity) ||
      quantity !== roundedQuantity ||
      roundedQuantity <= 0 ||
      roundedQuantity > row.available
    ) {
      return null;
    }
    const rowKey = `item:${row.itemId}`;
    const payload: RegisterExecutionOrderItemUsageDto = {
      itemId: row.itemId,
      requirementKey: requirement.key,
      technicianCustodyId: custodyId,
      quantity: roundedQuantity,
      action: derivedAction,
      finalDisposition: disposition,
    };
    return {
      key: rowKey,
      idempotencyKey: getIdempotencyKey(rowKey, payload),
      payload,
      reference: row.item.name,
      scope: 'consumables',
    };
  }

  async function registerRows(rows: CaptureRow[]) {
    if (rows.length === 0 || isSubmitting) return;
    setActiveScope(rows[0]!.scope);
    setResults((current) => {
      const next = { ...current };
      for (const row of rows) delete next[row.key];
      return next;
    });

    let outcomes: CaptureResult[];
    if (onRegisterItemUsageBatch) {
      try {
        outcomes = await onRegisterItemUsageBatch(
          rows.map(({ key, idempotencyKey, payload }) => ({
            key,
            idempotencyKey,
            payload,
          })),
        );
      } catch {
        outcomes = rows.map(({ key }) => ({ key, status: 'error' }));
      }
    } else {
      outcomes = [];
      for (const row of rows) {
        try {
          const result = await onRegisterItemUsage(row.payload);
          outcomes.push({ key: row.key, status: result === false ? 'error' : 'success' });
        } catch {
          outcomes.push({ key: row.key, status: 'error' });
        }
      }
    }

    const outcomeByKey = new Map(outcomes.map((outcome) => [outcome.key, outcome]));
    const completed = rows.map(
      (row) => outcomeByKey.get(row.key) ?? { key: row.key, status: 'error' as const },
    );
    setResults((current) => ({
      ...current,
      ...Object.fromEntries(completed.map((outcome) => [outcome.key, outcome])),
    }));
    const succeeded = new Set(
      completed.filter((outcome) => outcome.status === 'success').map((outcome) => outcome.key),
    );
    for (const row of rows) {
      if (!succeeded.has(row.key)) continue;
      idempotencyKeys.current.delete(row.key);
      if (row.scope === 'consumables') {
        const itemId = row.payload.itemId;
        setQuantities((current) => ({ ...current, [itemId]: 0 }));
      }
    }
    setActiveScope(null);
  }

  async function submit() {
    const scope = submitScopeRef.current ?? (selectedAssetId ? 'serialized' : 'consumables');
    submitScopeRef.current = null;
    if (
      !custodyId ||
      !derivedAction ||
      !disposition ||
      itemsState !== 'available' ||
      executorCustodyState !== 'available'
    )
      return;

    const rows: CaptureRow[] = [];
    if (scope === 'serialized') {
      const asset = serializedAssets.find((candidate) => candidate.id === selectedAssetId);
      const serialNumber = asset?.serialNumber?.trim();
      if (asset && serialNumber) {
        const rowKey = `asset:${asset.id}`;
        if (results[rowKey]?.status === 'success') return;
        const payload: RegisterExecutionOrderItemUsageDto = {
          itemId: asset.inventoryItemId,
          requirementKey: requirement.key,
          technicianCustodyId: custodyId,
          quantity: 1,
          serialNumber,
          action: derivedAction,
          finalDisposition: disposition,
        };
        rows.push({
          key: rowKey,
          idempotencyKey: getIdempotencyKey(rowKey, payload),
          payload,
          reference: itemById.get(asset.inventoryItemId)?.name ?? serialNumber,
          scope,
        });
      }
    } else {
      for (const row of consumableRows) {
        const captureRow = buildConsumableRow(row);
        if (captureRow) rows.push(captureRow);
      }
    }
    await registerRows(rows);
  }

  useEffect(() => {
    bindSubmit(submit);
    return () => bindSubmit(null);
  });

  const showSerialFlow = serializedItems.length > 0;
  const showConsumableFlow = itemOptions.some(
    (item) => item.trackingMode !== InventoryTrackingMode.SERIALIZED,
  );
  const destinationLabel = disposition
    ? disposition === InventoryDisposition.INSTALLED_AT_CUSTOMER
      ? 'instalado en el sitio del cliente'
      : DISPOSITION_LABELS[disposition]?.toLocaleLowerCase('es')
    : '';
  const destinationContext =
    requiredDisposition === InventoryDisposition.INSTALLED_AT_CUSTOMER
      ? `Desde ${custodyName} · Se registrará como instalado en el sitio del cliente`
      : disposition
        ? `Desde ${custodyName} · Se registrará como ${destinationLabel}`
        : `Desde ${custodyName}`;
  const serialResult = selectedAssetId ? results[`asset:${selectedAssetId}`] : undefined;
  const selectedAsset = selectedAssetId
    ? serializedAssets.find((asset) => asset.id === selectedAssetId)
    : undefined;
  const idSuffix = `${requirement.key}-capture`;
  const loadUnavailable = itemsState === 'unavailable' || executorCustodyState === 'unavailable';
  const loadPending = itemsState === 'loading' || executorCustodyState === 'loading';

  return (
    <form
      data-requirement-submit
      onSubmit={(event) => event.preventDefault()}
      className="space-y-4"
    >
      <p className="text-sm text-gray-700 dark:text-gray-200">{destinationContext}</p>
      {requiredDisposition === undefined ? (
        <Select
          id={`eo-item-disposition-${idSuffix}`}
          label="Destino"
          value={itemDisposition}
          options={DISPOSITION_OPTIONS}
          placeholder="Selecciona el destino"
          disabled={isSubmitting}
          onChange={(event) => setItemDisposition(event.target.value as InventoryDisposition)}
        />
      ) : null}

      {showSerialFlow ? (
        <section aria-labelledby={`eo-material-serial-heading-${idSuffix}`} className="space-y-3">
          <h3
            id={`eo-material-serial-heading-${idSuffix}`}
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            Selecciona el equipo que instalaste
          </h3>
          {loadPending ? (
            <div
              aria-busy="true"
              aria-label="Cargando equipos de tu custodia…"
              className="space-y-2"
            >
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Cargando equipos de tu custodia…
              </p>
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
            </div>
          ) : loadUnavailable ? (
            <PortalAlert
              variant="warning"
              title="No pudimos cargar los equipos de tu custodia."
              action={
                retryLoad ? (
                  <Button type="button" onClick={retryLoad}>
                    Reintentar
                  </Button>
                ) : undefined
              }
            />
          ) : serializedAssets.length === 0 ? (
            <PortalEmptyState
              title="No hay equipos de esta categoría en tu custodia."
              description="Contacta a supervisión para revisar la disponibilidad."
            />
          ) : (
            <>
              {serializedAssets.length > 8 ? (
                <Input
                  id={`eo-material-search-${idSuffix}`}
                  label="Buscar equipo"
                  helperText="Serial o MAC"
                  value={search}
                  disabled={isSubmitting}
                  onChange={(event) => setSearch(event.target.value)}
                />
              ) : null}
              {visibleAssets.length === 0 ? (
                <div className="space-y-2" role="status">
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    No encontramos equipos con ese serial o MAC.
                  </p>
                  <Button type="button" variant="secondary" onClick={() => setSearch('')}>
                    Limpiar búsqueda
                  </Button>
                </div>
              ) : (
                <RadioCardGroup
                  legend="Equipo instalado"
                  name={`eo-installed-asset-${idSuffix}`}
                  value={selectedAssetId}
                  onChange={setSelectedAssetId}
                  disabled={isSubmitting || !custodyId || !derivedAction}
                  options={visibleAssets.map((asset) => {
                    const item = itemById.get(asset.inventoryItemId);
                    const serialNumber = asset.serialNumber?.trim() || null;
                    const macAddress = asset.macAddress?.trim() || null;
                    const disabledReason = serialNumber
                      ? undefined
                      : macAddress
                        ? 'Este equipo no tiene serial registrado. Pide a supervisión que lo complete para poder registrarlo.'
                        : 'Este equipo no tiene serial ni MAC registrados. Pide a supervisión que los complete.';
                    const brand = item?.brand?.trim();
                    const model = item?.model?.trim();
                    const productTitle = brand && model ? `${brand} ${model}` : null;
                    const title = serialNumber
                      ? (productTitle ?? item?.name?.trim() ?? 'Equipo sin identificar')
                      : macAddress
                        ? `MAC ${macAddress}`
                        : 'Equipo sin identificar';
                    const titleIncludesSerial = Boolean(
                      serialNumber &&
                      title.toLocaleLowerCase('es').includes(serialNumber.toLocaleLowerCase('es')),
                    );
                    const description = [
                      serialNumber && !titleIncludesSerial ? `Serial ${serialNumber}` : null,
                      serialNumber && macAddress ? `MAC ${macAddress}` : null,
                    ]
                      .filter((value): value is string => Boolean(value))
                      .join('\n');
                    const status = getSerializedAssetStatusLabel(asset.currentStatus);
                    return {
                      value: asset.id,
                      title,
                      description,
                      meta: item?.sku ? `${item.sku} · ${status}` : status,
                      ...(disabledReason ? { disabled: true as const, disabledReason } : {}),
                    };
                  })}
                />
              )}
              <p className="text-xs text-gray-600 dark:text-gray-300">
                ¿No ves el equipo? Contacta a supervisión para revisar tu custodia.
              </p>
              {serialResult?.status === 'success' ? (
                <p className="text-sm text-green-800 dark:text-green-300" role="status">
                  Equipo registrado. Queda pendiente de confirmación de inventario.
                </p>
              ) : null}
              {serialResult?.status === 'error' ? (
                <div role="alert" className="space-y-2">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    No se pudo registrar el equipo. Intenta de nuevo.
                  </p>
                  {serialResult.message ? (
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                      {serialResult.message}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSubmitting}
                    onClick={() => {
                      submitScopeRef.current = 'serialized';
                      void submit();
                    }}
                  >
                    Reintentar registro
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {showConsumableFlow ? (
        <section
          aria-labelledby={`eo-material-consumables-heading-${idSuffix}`}
          className="space-y-3"
        >
          <h3
            id={`eo-material-consumables-heading-${idSuffix}`}
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            Indica cuánto usaste de cada material.
          </h3>
          {loadPending ? (
            <div
              aria-busy="true"
              aria-label="Cargando materiales de tu custodia…"
              className="space-y-2"
            >
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Cargando materiales de tu custodia…
              </p>
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
            </div>
          ) : loadUnavailable ? (
            <PortalAlert
              variant="warning"
              title="No pudimos cargar los materiales de tu custodia."
              action={
                retryLoad ? (
                  <Button type="button" onClick={retryLoad}>
                    Reintentar
                  </Button>
                ) : undefined
              }
            />
          ) : consumableRows.length === 0 ? (
            <PortalEmptyState
              title="No hay materiales disponibles para registrar."
              description="Contacta a supervisión para revisar los materiales de tu custodia."
            />
          ) : (
            <div className="space-y-3">
              {consumableRows.map(({ item, itemId, available }) => {
                const quantity = Math.min(available, Math.max(0, quantities[itemId] ?? 0));
                const result = results[`item:${itemId}`];
                const unitCode = item.unitOfMeasure ?? 'UNIT';
                const availableUnit = getInventoryUnitOfMeasureLabelForQuantity(
                  available,
                  unitCode,
                );
                const oneUnit = getInventoryUnitOfMeasureLabelForQuantity(1, unitCode);
                const pluralUnit = getInventoryUnitOfMeasureLabelForQuantity(2, unitCode);
                const precision = getQuantityPrecision(unitCode);
                const quantityStep = precision === 0 ? 1 : 1 / 10 ** precision;
                return (
                  <article
                    key={itemId}
                    className="rounded-xl border border-gray-200 bg-white p-3 dark:border-dark-border dark:bg-dark-surface-2"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.name} · disponible {formatInventoryQuantity(available)} {availableUnit}
                    </p>
                    <p className="mt-1 font-mono text-xs text-gray-600 dark:text-gray-300">
                      {item.sku}
                    </p>
                    <div className="mt-3 grid grid-cols-[2.75rem_minmax(5rem,1fr)_2.75rem] items-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 min-w-11 px-0"
                        aria-label={`Restar 1 ${oneUnit} de ${item.name}`}
                        disabled={isSubmitting || quantity <= 0}
                        onClick={() =>
                          setQuantities((current) => ({
                            ...current,
                            [itemId]: Math.max(
                              0,
                              roundQuantity((current[itemId] ?? 0) - 1, precision),
                            ),
                          }))
                        }
                      >
                        −
                      </Button>
                      <Input
                        id={`eo-material-qty-${idSuffix}-${itemId}`}
                        label={`Cantidad de ${item.name} (${pluralUnit})`}
                        type="number"
                        min="0"
                        max={available}
                        step={quantityStep}
                        value={quantity}
                        disabled={isSubmitting}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setQuantities((current) => ({
                            ...current,
                            [itemId]: Number.isFinite(next)
                              ? roundQuantity(Math.min(available, Math.max(0, next)), precision)
                              : 0,
                          }));
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 min-w-11 px-0"
                        aria-label={`Sumar 1 ${oneUnit} de ${item.name}`}
                        disabled={isSubmitting || quantity >= available}
                        onClick={() =>
                          setQuantities((current) => ({
                            ...current,
                            [itemId]: roundQuantity(
                              Math.min(available, (current[itemId] ?? 0) + 1),
                              precision,
                            ),
                          }))
                        }
                      >
                        +
                      </Button>
                    </div>
                    {result?.status === 'success' ? (
                      <p className="mt-2 text-sm text-green-800 dark:text-green-300" role="status">
                        Material registrado. Queda pendiente de confirmación de inventario.
                      </p>
                    ) : result?.status === 'error' ? (
                      <div role="alert" className="mt-2 space-y-2">
                        <p className="text-sm text-red-700 dark:text-red-300">
                          No se pudo registrar {item.name}. Intenta de nuevo.
                        </p>
                        {result.message ? (
                          <p className="text-sm text-gray-700 dark:text-gray-200">
                            {result.message}
                          </p>
                        ) : null}
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isSubmitting}
                          onClick={() => {
                            const retryRow = consumableRows.find(
                              (candidate) => candidate.itemId === itemId,
                            );
                            const captureRow = retryRow ? buildConsumableRow(retryRow) : null;
                            if (captureRow) void registerRows([captureRow]);
                          }}
                        >
                          Reintentar
                        </Button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {executorCustodyAssetsMeta?.hasMore || executorCustodyBalancesMeta?.hasMore ? (
        <PortalTablePagination
          hasMore
          onLoadMore={() => void onLoadMoreExecutorCustody()}
          loading={isLoadingMoreExecutorCustody}
          resourceLabel="equipos y materiales compatibles"
          shown={executorCustodyAssets.length + executorCustodyBalances.length}
          total={
            (executorCustodyAssetsMeta?.total ?? 0) + (executorCustodyBalancesMeta?.total ?? 0)
          }
        />
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-3 flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-dark-border dark:bg-dark-surface-2">
        {showSerialFlow ? (
          <>
            {selectedAsset?.serialNumber?.trim() ? (
              <p className="w-full font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">
                Serial {selectedAsset.serialNumber.trim()}
                {selectedAsset.macAddress?.trim()
                  ? ` · MAC ${selectedAsset.macAddress.trim()}`
                  : ''}
              </p>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              className="min-h-11"
              disabled={
                isSubmitting ||
                !selectedAssetId ||
                !selectedAsset?.serialNumber?.trim() ||
                results[`asset:${selectedAssetId}`]?.status === 'success' ||
                !custodyId ||
                !derivedAction ||
                loadPending ||
                loadUnavailable
              }
              onClick={() => {
                submitScopeRef.current = 'serialized';
              }}
            >
              {isSubmitting && activeScope === 'serialized'
                ? 'Registrando equipo…'
                : 'Registrar equipo'}
            </Button>
          </>
        ) : null}
        {showConsumableFlow ? (
          <Button
            type="submit"
            variant="primary"
            className="min-h-11"
            disabled={
              isSubmitting ||
              !custodyId ||
              !derivedAction ||
              loadPending ||
              loadUnavailable ||
              !consumableRows.some((row) => (quantities[row.itemId] ?? 0) > 0)
            }
            onClick={() => {
              submitScopeRef.current = 'consumables';
            }}
          >
            {isSubmitting && activeScope === 'consumables'
              ? 'Registrando materiales…'
              : 'Registrar materiales'}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={isSubmitting}
          onClick={onClose}
        >
          Cancelar
        </Button>
      </div>
    </form>
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
