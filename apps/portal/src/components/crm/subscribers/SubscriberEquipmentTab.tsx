'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from '@iwana/ui';
import { History, MoreHorizontal, Package, Router } from 'lucide-react';
import {
  AccessPermissionKey,
  getInventoryUnitOfMeasureLabel,
  type SubscriberEquipmentItem,
  type SubscriberMaterialItem,
} from '@iwana/shared';
import { usePermissions } from '@/components/access-control/permissions-context';
import { SerializedAssetDetailDrawer } from '@/components/inventory/SerializedAssetDetailDrawer';
import { useSerializedAssetDetail } from '@/components/inventory/use-serialized-asset-detail';
import {
  formatInventoryDate,
  formatInventoryQuantity,
  getAssetLifecycleEventTypeLabel,
  getSerializedAssetStatusBadgeVariant,
  getSerializedAssetStatusLabel,
  SUBSCRIBER_EQUIPMENT_RETIRED_LABEL,
} from '@/components/inventory/inventory-labels';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  PortalTablePagination,
  PortalTimeline,
  portalCheckboxClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableInactiveRowClassName,
  portalDataTableShellClassName,
  portalFieldClassName,
  portalInlineTextLinkClassName,
  type PortalTimelineItem,
} from '@/components/shared/portal-ui';
import {
  SUBSCRIBER_EQUIPMENT_EMPTY_DESCRIPTION,
  SUBSCRIBER_EQUIPMENT_EMPTY_TITLE,
} from './SubscriberOverviewCards';
import type { SubscriberEquipmentLoad } from './use-subscriber-equipment';

const EQUIPMENT_COLUMNS = ['Equipo', 'Serial', 'MAC', 'Estado', 'Desde'] as const;
const MATERIAL_COLUMNS = ['Fecha', 'Material', 'Cantidad', 'OT'] as const;
const SKELETON_ROWS = 3;
const monoCellClassName = cn(portalDataTableCellClassName, 'font-mono tabular-nums');
const mutedClassName = 'text-gray-500 dark:text-gray-400';

/** Ruta existente de OT del portal (deep link `?executionOrderId=`). */
export function executionOrderHref(executionOrderRefId: string): string {
  return `/dashboard/operations/execution-orders?executionOrderId=${encodeURIComponent(executionOrderRefId)}`;
}

function equipmentName(item: Pick<SubscriberEquipmentItem, 'model' | 'itemName'>): string {
  return item.model ?? item.itemName;
}

/** Texto fijo: el drawer no refleja el error del backend. */
function mapAssetDetailError(): string {
  return 'Reintenta en unos minutos.';
}

/** Vuelve a poner el foco en el título cuando termina la recarga pedida por «Reintentar». */
function useFocusAfterRetry(loading: boolean, titleRef: RefObject<HTMLHeadingElement | null>) {
  const retried = useRef(false);
  useEffect(() => {
    if (retried.current && !loading) {
      retried.current = false;
      titleRef.current?.focus();
    }
  }, [loading, titleRef]);
  return () => {
    retried.current = true;
  };
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" className="min-h-11" onClick={onClick}>
      Reintentar
    </Button>
  );
}

/** Skeleton con la rejilla de la tabla: encabezados reales y filas de bloques. */
function TableSkeleton({ caption, columns }: { caption: string; columns: readonly string[] }) {
  return (
    <div role="status" className={portalDataTableShellClassName}>
      <span className="sr-only">Cargando {caption.toLowerCase()}…</span>
      <table className="min-w-full" aria-hidden="true">
        <thead>
          <tr className={portalDataTableHeadRowClassName}>
            {columns.map((column) => (
              <th key={column} scope="col" className="px-4 py-3 text-left portal-eyebrow-muted">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={portalDataTableBodyClassName}>
          {Array.from({ length: SKELETON_ROWS }, (_, row) => (
            <tr key={row} data-table-skeleton-row="">
              {columns.map((column) => (
                <td key={column} className={portalDataTableCellClassName}>
                  <PortalSkeletonBlock className="h-4 w-full rounded-md" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Menú ⋯ por equipo ────────────────────────────────────────────────────────

function EquipmentActionsMenu({
  item,
  orderHref,
  onOpenDetail,
  onCopy,
}: {
  item: SubscriberEquipmentItem;
  /** null: sin OT, sin permiso o con el titular anonimizado (§2.3). */
  orderHref: string | null;
  /** null con el titular anonimizado: el drawer muestra notas libres del equipo (§2.3, C1). */
  onOpenDetail: (() => void) | null;
  onCopy: (label: 'Serial' | 'MAC', value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const name = equipmentName(item);
  if (!onOpenDetail && !orderHref && !item.serialNumber && !item.macAddress) {
    return null;
  }
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11"
          aria-label={
            item.serialNumber
              ? `Acciones de ${name}, serial ${item.serialNumber}`
              : `Acciones de ${name}`
          }
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        {onOpenDetail ? (
          <DropdownMenuItem className="min-h-11" onClick={onOpenDetail}>
            Ver ficha del equipo
          </DropdownMenuItem>
        ) : null}
        {orderHref ? (
          <DropdownMenuItem asChild className="min-h-11">
            <Link href={orderHref}>Ver OT</Link>
          </DropdownMenuItem>
        ) : null}
        {item.serialNumber ? (
          <DropdownMenuItem
            className="min-h-11"
            onClick={() => onCopy('Serial', item.serialNumber as string)}
          >
            Copiar serial
          </DropdownMenuItem>
        ) : null}
        {item.macAddress ? (
          <DropdownMenuItem
            className="min-h-11"
            onClick={() => onCopy('MAC', item.macAddress as string)}
          >
            Copiar MAC
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Equipos instalados ───────────────────────────────────────────────────────

function InstalledEquipmentSection({
  equipment,
  orderHref,
  anonymized,
}: {
  equipment: SubscriberEquipmentLoad;
  orderHref: (executionOrderRefId: string | null) => string | null;
  anonymized: boolean;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const switchId = useId();
  const markRetried = useFocusAfterRetry(equipment.loading, titleRef);
  const [showRetired, setShowRetired] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const assetDetail = useSerializedAssetDetail(mapAssetDetailError);
  const items = equipment.equipment ?? [];
  const retiredCount = items.filter((item) => item.removedAt !== null).length;
  const rows = showRetired ? items : items.filter((item) => item.removedAt === null);

  async function copy(label: 'Serial' | 'MAC', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(label === 'Serial' ? 'Serial copiado.' : 'MAC copiada.');
    } catch {
      setCopyStatus('No pudimos copiar. Selecciona el texto y cópialo manualmente.');
    }
  }

  const retiredSwitch =
    retiredCount > 0 ? (
      <label
        htmlFor={switchId}
        className="flex min-h-11 items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
      >
        <input
          id={switchId}
          type="checkbox"
          role="switch"
          aria-checked={showRetired}
          className={portalCheckboxClassName}
          checked={showRetired}
          onChange={(event) => setShowRetired(event.target.checked)}
        />
        Mostrar retirados
      </label>
    ) : undefined;

  let body;
  if (equipment.loading && equipment.equipment === null) {
    body = <TableSkeleton caption="Equipos instalados" columns={EQUIPMENT_COLUMNS} />;
  } else if (equipment.error) {
    body = (
      <PortalAlert
        variant="error"
        density="compact"
        title={equipment.error}
        action={
          <RetryButton
            onClick={() => {
              markRetried();
              equipment.reload();
            }}
          />
        }
      />
    );
  } else if (items.length === 0) {
    body = (
      <PortalEmptyState
        embedded
        icon={Router}
        title={SUBSCRIBER_EQUIPMENT_EMPTY_TITLE}
        description={SUBSCRIBER_EQUIPMENT_EMPTY_DESCRIPTION}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <PortalEmptyState
        embedded
        icon={Router}
        title="Sin equipos instalados"
        description="Activa «Mostrar retirados» para ver los equipos que ya se retiraron."
      />
    );
  } else {
    body = (
      <div className={portalDataTableShellClassName}>
        <table className="min-w-full">
          <caption className="sr-only">Equipos instalados</caption>
          <thead>
            <tr className={portalDataTableHeadRowClassName}>
              {EQUIPMENT_COLUMNS.map((column) => (
                <PortalDataTableHead key={column}>{column}</PortalDataTableHead>
              ))}
              <PortalDataTableHead>
                <span className="sr-only">Acciones</span>
              </PortalDataTableHead>
            </tr>
          </thead>
          <tbody className={portalDataTableBodyClassName}>
            {rows.map((item) => {
              const retired = item.removedAt !== null;
              return (
                <tr
                  key={item.loanId}
                  className={cn(retired && portalDataTableInactiveRowClassName)}
                >
                  <td className={portalDataTableCellClassName}>
                    <span className="block font-medium text-gray-900 dark:text-white">
                      {equipmentName(item)}
                    </span>
                    {item.model ? (
                      <span className={cn('block text-xs', mutedClassName)}>{item.itemName}</span>
                    ) : null}
                  </td>
                  <td className={monoCellClassName}>
                    {item.serialNumber ?? <span className={mutedClassName}>Sin serial</span>}
                  </td>
                  <td className={monoCellClassName}>
                    {item.macAddress ?? <span className={mutedClassName}>Sin MAC</span>}
                  </td>
                  <td className={portalDataTableCellClassName}>
                    {retired ? (
                      <Badge variant="neutral">{SUBSCRIBER_EQUIPMENT_RETIRED_LABEL}</Badge>
                    ) : (
                      <Badge variant={getSerializedAssetStatusBadgeVariant(item.status)}>
                        {getSerializedAssetStatusLabel(item.status)}
                      </Badge>
                    )}
                  </td>
                  <td className={cn(portalDataTableCellClassName, 'whitespace-nowrap')}>
                    <time dateTime={item.installedAt}>{formatInventoryDate(item.installedAt)}</time>
                    {item.removedAt ? (
                      <span className={cn('block text-xs', mutedClassName)}>
                        Retirado el{' '}
                        <time dateTime={item.removedAt}>{formatInventoryDate(item.removedAt)}</time>
                      </span>
                    ) : null}
                  </td>
                  <td className={cn(portalDataTableCellClassName, 'w-12 text-right')}>
                    <EquipmentActionsMenu
                      item={item}
                      orderHref={orderHref(item.executionOrderRefId)}
                      onOpenDetail={
                        anonymized ? null : () => void assetDetail.open(item.assetId)
                      }
                      onCopy={(label, value) => void copy(label, value)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <PortalPanel
      as="section"
      labelled
      title="Equipos instalados"
      titleRef={titleRef}
      titleTabIndex={-1}
      busy={equipment.loading}
      actions={retiredSwitch}
      contentClassName="space-y-3"
    >
      {body}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          'text-sm font-medium text-emerald-700 dark:text-emerald-300',
          !copyStatus && 'sr-only',
        )}
      >
        {copyStatus}
      </p>
      {assetDetail.error ? (
        <PortalAlert
          variant="warning"
          density="compact"
          title="No pudimos abrir la ficha del equipo"
          description={assetDetail.error}
        />
      ) : null}
      <SerializedAssetDetailDrawer
        open={Boolean(assetDetail.targetId)}
        detail={assetDetail.detail}
        isLoading={assetDetail.isLoading}
        isLoadingMoreLifecycle={assetDetail.isLoadingMoreLifecycle}
        isLoadingMoreMovements={assetDetail.isLoadingMoreMovements}
        onClose={assetDetail.close}
        onLoadMoreLifecycle={() => void assetDetail.loadMoreLifecycle()}
        onLoadMoreMovements={() => void assetDetail.loadMoreMovements()}
      />
    </PortalPanel>
  );
}

// ── Materiales usados ────────────────────────────────────────────────────────

function MaterialOrderCell({
  material,
  orderHref,
}: {
  material: SubscriberMaterialItem;
  orderHref: (executionOrderRefId: string | null) => string | null;
}) {
  const href = orderHref(material.executionOrderRefId);
  if (href) {
    return (
      <Link
        href={href}
        className={portalInlineTextLinkClassName}
        aria-label={`Ver OT del movimiento ${material.movementNumber}`}
      >
        Ver OT
      </Link>
    );
  }
  return (
    <span className={mutedClassName}>{material.executionOrderRefId ? 'Con OT' : 'Sin OT'}</span>
  );
}

function MaterialsSection({
  equipment,
  orderHref,
}: {
  equipment: SubscriberEquipmentLoad;
  orderHref: (executionOrderRefId: string | null) => string | null;
}) {
  const { materials } = equipment;
  let body;
  if (equipment.loading && equipment.equipment === null) {
    body = <TableSkeleton caption="Materiales usados" columns={MATERIAL_COLUMNS} />;
  } else if (materials.items.length === 0) {
    body = (
      <PortalEmptyState
        embedded
        icon={Package}
        title="Sin materiales registrados"
        description="Los materiales instalados en las órdenes de trabajo aparecerán aquí."
      />
    );
  } else {
    body = (
      <div className={portalDataTableShellClassName}>
        <table className="min-w-full">
          <caption className="sr-only">Materiales usados</caption>
          <thead>
            <tr className={portalDataTableHeadRowClassName}>
              {MATERIAL_COLUMNS.map((column) => (
                <PortalDataTableHead key={column}>{column}</PortalDataTableHead>
              ))}
            </tr>
          </thead>
          <tbody className={portalDataTableBodyClassName}>
            {/* `movementId` se repite si el movimiento lleva varios ítems (aviso de A2). */}
            {materials.items.map((material, index) => (
              <tr key={`${material.movementId}:${material.itemName}:${index}`}>
                <td className={cn(portalDataTableCellClassName, 'whitespace-nowrap')}>
                  <time dateTime={material.occurredAt}>
                    {formatInventoryDate(material.occurredAt)}
                  </time>
                </td>
                <td className={portalDataTableCellClassName}>{material.itemName}</td>
                <td className={cn(monoCellClassName, 'whitespace-nowrap')}>
                  {formatInventoryQuantity(material.quantity)}{' '}
                  <span className="font-sans">
                    {getInventoryUnitOfMeasureLabel(material.unitOfMeasure)}
                  </span>
                </td>
                <td className={portalDataTableCellClassName}>
                  <MaterialOrderCell material={material} orderHref={orderHref} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PortalTablePagination
          hasMore={Boolean(materials.meta?.hasMore) && !materials.error}
          loading={materials.loadingMore}
          onLoadMore={materials.loadMore}
          resourceLabel="materiales"
          shown={materials.items.length}
          total={materials.meta?.total}
        />
      </div>
    );
  }

  return (
    <PortalPanel
      as="section"
      labelled
      title="Materiales usados"
      busy={equipment.loading || materials.loadingMore}
      contentClassName="space-y-3"
    >
      {body}
      {materials.error ? (
        <PortalAlert
          variant="error"
          density="compact"
          title={materials.error}
          action={<RetryButton onClick={materials.retry} />}
        />
      ) : null}
    </PortalPanel>
  );
}

// ── Historial de equipos ─────────────────────────────────────────────────────

function HistorySection({ equipment }: { equipment: SubscriberEquipmentLoad }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const filterId = useId();
  const { history } = equipment;
  const items = equipment.equipment ?? [];
  const byAsset = new Map(items.map((item) => [item.assetId, item]));
  const filterOptions = [...byAsset.values()];

  const timelineItems: PortalTimelineItem[] = history.items.map((event) => {
    const asset = byAsset.get(event.assetId);
    const serial = event.serialNumber ?? asset?.serialNumber ?? null;
    const parts = [
      ...(asset ? [equipmentName(asset)] : []),
      serial ? `Serial ${serial}` : 'Sin serial',
    ];
    return {
      id: event.id,
      title: getAssetLifecycleEventTypeLabel(event.eventType),
      at: event.occurredAt,
      detail: parts.join(' · '),
    };
  });

  const empty = history.assetId ? (
    <PortalEmptyState
      embedded
      icon={History}
      title="Ningún evento coincide con el filtro"
      description="Este equipo no tiene eventos mientras estuvo con el suscriptor."
      action={
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11"
          onClick={() => history.setAssetId(null)}
        >
          Quitar filtro
        </Button>
      }
    />
  ) : (
    <PortalEmptyState
      embedded
      icon={History}
      title="Sin eventos de equipos"
      description="Aquí verás instalaciones, retiros y reparaciones de los equipos del suscriptor."
    />
  );

  return (
    <PortalPanel
      as="section"
      labelled
      title="Historial de equipos"
      titleRef={titleRef}
      titleTabIndex={-1}
      contentClassName="space-y-3"
      actions={
        filterOptions.length > 0 ? (
          <div className="flex min-h-11 items-center gap-2">
            <label
              htmlFor={filterId}
              className="text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Equipo
            </label>
            <select
              id={filterId}
              value={history.assetId ?? ''}
              className={cn(portalFieldClassName, 'min-h-11 w-auto')}
              onChange={(event) => history.setAssetId(event.target.value || null)}
            >
              <option value="">Todos los equipos</option>
              {filterOptions.map((item) => (
                <option key={item.assetId} value={item.assetId}>
                  {item.serialNumber
                    ? `${equipmentName(item)} · ${item.serialNumber}`
                    : equipmentName(item)}
                </option>
              ))}
            </select>
          </div>
        ) : undefined
      }
    >
      <PortalTimeline
        label="Historial de equipos"
        items={timelineItems}
        empty={empty}
        busy={(equipment.loading && equipment.equipment === null) || history.filtering}
        error={history.error}
        onRetry={history.retry}
        headingRef={titleRef}
        hasMore={Boolean(history.meta?.hasMore)}
        onLoadMore={history.loadMore}
        loadingMore={history.loadingMore}
      />
    </PortalPanel>
  );
}

// ── Pestaña ──────────────────────────────────────────────────────────────────

/**
 * Pestaña «Equipos» de la ficha (spec 2026-11-16 equipos del suscriptor §2.2–§2.4). Solo de
 * lectura (D2); la fuente es el comodato de Inventario (D5). La ficha la monta solo con
 * INVENTORY_STOCK_READ (D4) y le pasa la lectura compartida con la Vista general.
 */
export function SubscriberEquipmentTab({
  equipment,
  anonymized,
}: {
  equipment: SubscriberEquipmentLoad;
  /** Titular anonimizado: equipos e historial visibles, sin acciones hacia sus datos (§2.3). */
  anonymized: boolean;
}) {
  const { hasPermission } = usePermissions();
  const canOpenOrders = hasPermission(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ);
  const orderHref = (executionOrderRefId: string | null) =>
    executionOrderRefId && canOpenOrders && !anonymized
      ? executionOrderHref(executionOrderRefId)
      : null;
  const failed = equipment.error !== null && equipment.equipment === null;

  return (
    <div className="space-y-4">
      <InstalledEquipmentSection
        equipment={equipment}
        orderHref={orderHref}
        anonymized={anonymized}
      />
      {/* Sin la primera lectura no hay materiales ni historial: el aviso con «Reintentar» vive arriba. */}
      {failed ? null : (
        <>
          <MaterialsSection equipment={equipment} orderHref={orderHref} />
          <HistorySection equipment={equipment} />
        </>
      )}
    </div>
  );
}
