'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@iwana/ui';
import { InventoryResponsibleType, StockLocationType } from '@iwana/shared';
import type {
  AssetLifecycleEventRecord,
  AssetLoanRecord,
  SerializedAssetDetailRecord,
  StockMovementKardexRecord,
} from '@/lib/api-client';
import {
  PortalEmptyState,
  PortalSkeletonBlock,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryCostOrNone,
  formatInventoryDate,
  formatInventoryDateTime,
  formatInventoryOpaqueRef,
  formatInventoryQuantity,
  getAssetLifecycleEventTypeLabel,
  getAssetLoanStatusLabel,
  getInventoryResponsibleTypeLabel,
  getSerializedAssetStatusLabel,
  getStockMovementOriginLabel,
  getUsefulLifeStatusBadgeVariant,
  getUsefulLifeStatusLabel,
  getWarrantyCoverageLabel,
  INVENTORY_UNIT_COST_LABEL,
} from './inventory-labels';

interface SerializedAssetDetailDrawerProps {
  open: boolean;
  detail: SerializedAssetDetailRecord | null;
  isLoading?: boolean;
  isLoadingMoreLifecycle?: boolean;
  isLoadingMoreMovements?: boolean;
  onClose: () => void;
  onLoadMoreLifecycle?: () => void;
  onLoadMoreMovements?: () => void;
  onOpenKardex?: (assetId: string) => void;
}

function renderOptionalValue(value: string | null | undefined): string {
  return value?.trim() ? value : 'Sin dato';
}

function formatLifecycleTransition(event: AssetLifecycleEventRecord): string | null {
  if (!event.fromStatus && !event.toStatus) {
    return null;
  }

  const fromLabel = event.fromStatus ? getSerializedAssetStatusLabel(event.fromStatus) : '—';
  const toLabel = event.toStatus ? getSerializedAssetStatusLabel(event.toStatus) : '—';
  return `${fromLabel} → ${toLabel}`;
}

function resolveMovementQuantityForAsset(
  movement: StockMovementKardexRecord,
  assetId: string,
): string {
  const assetLines = movement.lines.filter((line) => line.serializedAssetId === assetId);
  if (assetLines.length === 0) {
    return formatInventoryQuantity(movement.lines[0]?.quantity ?? '0');
  }

  const total = assetLines.reduce((sum, line) => sum + Number.parseFloat(line.quantity), 0);
  const formatted = formatInventoryQuantity(total);
  return total > 0 ? `+${formatted}` : formatted;
}

function resolveMovementUnitCostForAsset(
  movement: StockMovementKardexRecord,
  assetId: string,
): string {
  const assetLine = movement.lines.find((line) => line.serializedAssetId === assetId);
  return formatInventoryCostOrNone(assetLine?.unitCost ?? movement.lines[0]?.unitCost ?? null);
}

function formatCustodian(detail: SerializedAssetDetailRecord): string {
  const typeLabel = getInventoryResponsibleTypeLabel(detail.currentResponsibleType);
  if (
    detail.currentResponsibleType === InventoryResponsibleType.NONE ||
    !detail.currentResponsibleRefId?.trim()
  ) {
    return typeLabel;
  }

  const refType =
    detail.currentResponsibleType === InventoryResponsibleType.TECHNICIAN
      ? 'technician'
      : detail.currentResponsibleType === InventoryResponsibleType.CUSTOMER
        ? 'subscriber'
        : 'technician';

  const opaque = formatInventoryOpaqueRef(refType, detail.currentResponsibleRefId);
  const [, abbreviatedRef] = opaque.split(' · ');
  return abbreviatedRef ? `${typeLabel} · ${abbreviatedRef}` : typeLabel;
}

function SectionCard({
  eyebrow,
  title,
  children,
  testId,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <article
      data-testid={testId}
      className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3"
    >
      <p className="portal-eyebrow">{eyebrow}</p>
      <h3 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="mt-3">{children}</div>
    </article>
  );
}

export function SerializedAssetDetailDrawer({
  open,
  detail,
  isLoading = false,
  isLoadingMoreLifecycle = false,
  isLoadingMoreMovements = false,
  onClose,
  onLoadMoreLifecycle,
  onLoadMoreMovements,
  onOpenKardex,
}: SerializedAssetDetailDrawerProps) {
  const [highlightedMovementId, setHighlightedMovementId] = useState<string | null>(null);

  const handleGoToMovement = useCallback(
    (movementId: string, detailRecord: SerializedAssetDetailRecord) => {
      const isLoaded = detailRecord.movements.data.some((movement) => movement.id === movementId);
      if (!isLoaded) {
        onOpenKardex?.(detailRecord.id);
        return;
      }

      setHighlightedMovementId(movementId);
      const row = document.querySelector(`[data-movement-id="${movementId}"]`);
      if (typeof row?.scrollIntoView === 'function') {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    },
    [onOpenKardex],
  );

  if (!open && !isLoading) {
    return null;
  }

  const assetId = detail?.id ?? '';
  const isCustomerSite = detail?.currentLocation?.type === StockLocationType.CUSTOMER_SITE;
  const hasMoreLifecycle = detail != null && detail.lifecycle.data.length < detail.lifecycle.total;
  const hasMoreMovements = detail != null && detail.movements.data.length < detail.movements.total;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-4xl overflow-y-auto"
        data-testid="serialized-asset-detail-drawer"
      >
        <DialogHeader>
          <DialogTitle>Ficha 360 del activo</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div data-testid="asset-detail-loading">
            <PortalSkeletonBlock className="h-64" />
          </div>
        ) : null}

        {!isLoading && detail ? (
          <div className="space-y-4">
            <SectionCard
              eyebrow="Identificación"
              title="Cabecera"
              testId="asset-detail-section-header"
            >
              <dl className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Producto</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {detail.item
                      ? `${detail.item.sku} · ${detail.item.name}`
                      : 'Producto no encontrado'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Estado</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {getSerializedAssetStatusLabel(detail.currentStatus)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Serial</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {renderOptionalValue(detail.serialNumber)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">MAC</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {renderOptionalValue(detail.macAddress)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Etiqueta de activo</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {renderOptionalValue(detail.assetTag)}
                  </dd>
                </div>
              </dl>
            </SectionCard>

            <SectionCard
              eyebrow="Custodia"
              title="Dónde y quién"
              testId="asset-detail-section-location"
            >
              {detail.currentLocation ? (
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Ubicación actual</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {detail.currentLocation.code} · {detail.currentLocation.name}
                    </dd>
                  </div>
                  {isCustomerSite && detail.subscriberRefId ? (
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">Sitio del cliente</dt>
                      <dd className="font-medium text-gray-900 dark:text-white">
                        En sitio de cliente ·{' '}
                        {formatInventoryOpaqueRef('subscriber', detail.subscriberRefId)}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Custodio</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {formatCustodian(detail)}
                    </dd>
                  </div>
                  {detail.contractRefId ? (
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">Contrato</dt>
                      <dd className="font-medium text-gray-900 dark:text-white">
                        {formatInventoryOpaqueRef('contract', detail.contractRefId)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Sin ubicación registrada.
                </p>
              )}
            </SectionCard>

            <SectionCard
              eyebrow="Abastecimiento"
              title="Origen de compra"
              testId="asset-detail-section-purchase-origin"
            >
              {detail.purchaseOrigin ? (
                <dl className="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Orden de compra</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {detail.purchaseOrigin.purchaseOrderNumber ??
                        renderOptionalValue(detail.purchaseOrderRef)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Fecha de recepción</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {formatInventoryDate(detail.purchaseOrigin.receivedAt ?? detail.purchaseDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Proveedor</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {detail.purchaseOrigin.supplierDisplayName ?? 'Proveedor no identificado'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Costo unitario</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {formatInventoryCostOrNone(detail.purchaseOrigin.unitCost)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <PortalEmptyState
                  title="Sin origen de compra registrado"
                  description="Este activo no tiene una recepción de compra asociada en el sistema."
                />
              )}
            </SectionCard>

            <SectionCard
              eyebrow="Depreciación"
              title="Vida útil y garantía"
              testId="asset-detail-section-useful-life"
            >
              {detail.usefulLife.status === 'sin-dato' ? (
                <PortalEmptyState
                  title="Sin datos de vida útil"
                  description="El producto no tiene meses de vida útil o fecha de compra registrados."
                />
              ) : (
                <dl className="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Estado de vida útil</dt>
                    <dd className="mt-1">
                      <Badge variant={getUsefulLifeStatusBadgeVariant(detail.usefulLife.status)}>
                        {getUsefulLifeStatusLabel(detail.usefulLife.status)}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Meses transcurridos</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {detail.usefulLife.monthsElapsed ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Meses restantes</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {detail.usefulLife.monthsRemaining ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">Garantía</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {formatInventoryDate(detail.usefulLife.warrantyUntil ?? detail.warrantyUntil)}{' '}
                      ·{' '}
                      {getWarrantyCoverageLabel(
                        detail.usefulLife.warrantyUntil ?? detail.warrantyUntil,
                      )}
                    </dd>
                  </div>
                </dl>
              )}
            </SectionCard>

            <SectionCard
              eyebrow="Trazabilidad"
              title="Ciclo de vida"
              testId="asset-detail-section-lifecycle"
            >
              {detail.lifecycle.total === 0 ? (
                <PortalEmptyState
                  title="Sin eventos de ciclo de vida"
                  description="Este activo aún no registra movimientos en su historial operativo."
                />
              ) : (
                <ol className="space-y-3">
                  {detail.lifecycle.data.map((event) => {
                    const transition = formatLifecycleTransition(event);
                    return (
                      <li
                        key={event.id}
                        className="rounded-xl border border-gray-100 px-3 py-3 dark:border-dark-border"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {getAssetLifecycleEventTypeLabel(event.eventType)}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {formatInventoryDateTime(event.occurredAt)}
                          </p>
                        </div>
                        {transition ? (
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            {transition}
                          </p>
                        ) : null}
                        {event.locationName ? (
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            Ubicación: {event.locationName}
                          </p>
                        ) : null}
                        {event.responsibleRefId ? (
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            {formatInventoryOpaqueRef('technician', event.responsibleRefId)}
                          </p>
                        ) : null}
                        {event.notes ? (
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {event.notes}
                          </p>
                        ) : null}
                        {event.stockMovementId ? (
                          <div className="mt-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                detail && handleGoToMovement(event.stockMovementId!, detail)
                              }
                              data-testid={`asset-detail-lifecycle-movement-link-${event.id}`}
                            >
                              Ver movimiento
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
              {hasMoreLifecycle ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={isLoadingMoreLifecycle}
                    onClick={() => onLoadMoreLifecycle?.()}
                    data-testid="asset-detail-lifecycle-load-more"
                  >
                    {isLoadingMoreLifecycle ? 'Cargando…' : 'Ver más'}
                  </Button>
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              eyebrow="Ledger"
              title="Movimientos"
              testId="asset-detail-section-movements"
            >
              <div className="mb-3 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onOpenKardex?.(assetId)}
                  data-testid="asset-detail-open-kardex"
                >
                  Ver en kardex
                </Button>
              </div>
              {detail.movements.total === 0 ? (
                <PortalEmptyState
                  title="Sin movimientos registrados"
                  description="Este activo no aparece en movimientos del ledger todavía."
                />
              ) : (
                <div className={portalDataTableShellClassName}>
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className={portalDataTableHeadClassName}>Número</th>
                        <th className={portalDataTableHeadClassName}>Origen</th>
                        <th className={portalDataTableHeadClassName}>Fecha</th>
                        <th className={portalDataTableHeadClassName}>Cantidad</th>
                        <th className={portalDataTableHeadClassName}>
                          {INVENTORY_UNIT_COST_LABEL}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.movements.data.map((movement) => (
                        <tr
                          key={movement.id}
                          data-movement-id={movement.id}
                          className={
                            highlightedMovementId === movement.id
                              ? 'bg-iwana-primary-50 dark:bg-iwana-primary-950/30'
                              : undefined
                          }
                        >
                          <td className={portalDataTableCellClassName}>
                            {movement.movementNumber}
                          </td>
                          <td className={portalDataTableCellClassName}>
                            {getStockMovementOriginLabel(movement.origin)}
                          </td>
                          <td className={portalDataTableCellClassName}>
                            {formatInventoryDateTime(movement.createdAt)}
                          </td>
                          <td className={portalDataTableCellClassName}>
                            {resolveMovementQuantityForAsset(movement, assetId)}
                          </td>
                          <td className={portalDataTableCellClassName}>
                            {resolveMovementUnitCostForAsset(movement, assetId)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {hasMoreMovements ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={isLoadingMoreMovements}
                    onClick={() => onLoadMoreMovements?.()}
                    data-testid="asset-detail-movements-load-more"
                  >
                    {isLoadingMoreMovements ? 'Cargando…' : 'Ver más'}
                  </Button>
                </div>
              ) : null}
            </SectionCard>

            <SectionCard eyebrow="Comodato" title="Comodatos" testId="asset-detail-section-loans">
              {detail.loans.total === 0 ? (
                <PortalEmptyState
                  title="Sin comodatos registrados"
                  description="Las entregas en comodato aparecerán aquí cuando se registren en campo."
                />
              ) : (
                <LoanTable loans={detail.loans.data} />
              )}
            </SectionCard>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LoanTable({ loans }: { loans: AssetLoanRecord[] }) {
  return (
    <div className={portalDataTableShellClassName}>
      <table className="min-w-full">
        <thead>
          <tr>
            <th className={portalDataTableHeadClassName}>Suscriptor</th>
            <th className={portalDataTableHeadClassName}>Contrato</th>
            <th className={portalDataTableHeadClassName}>Estado</th>
            <th className={portalDataTableHeadClassName}>Instalado</th>
            <th className={portalDataTableHeadClassName}>Retirado</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((loan) => (
            <tr key={loan.id}>
              <td className={portalDataTableCellClassName}>
                {formatInventoryOpaqueRef('subscriber', loan.subscriberRefId)}
              </td>
              <td className={portalDataTableCellClassName}>
                {formatInventoryOpaqueRef('contract', loan.contractRefId)}
              </td>
              <td className={portalDataTableCellClassName}>
                {getAssetLoanStatusLabel(loan.status)}
              </td>
              <td className={portalDataTableCellClassName}>
                {formatInventoryDateTime(loan.installedAt)}
              </td>
              <td className={portalDataTableCellClassName}>
                {loan.removedAt ? formatInventoryDateTime(loan.removedAt) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
