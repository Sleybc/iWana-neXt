'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Select } from '@iwana/ui';
import {
  ApiError,
  inventoryApi,
  type UsefulLifeAlertRecord,
  type UsefulLifeAlertStatus,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSkeletonBlock,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryDate,
  getUsefulLifeStatusBadgeVariant,
  getUsefulLifeStatusLabel,
  USEFUL_LIFE_STATUS_LABELS,
} from './inventory-labels';

export type UsefulLifeAlertStatusFilter = UsefulLifeAlertStatus | 'all';

interface UsefulLifeAlertsPanelProps {
  onOpenAssetDetail: (assetId: string) => void;
  onNavigateToReplenishment?: () => void;
}

const DEFAULT_PAGE_SIZE = 20;

const STATUS_FILTER_OPTIONS: Array<{ value: UsefulLifeAlertStatusFilter; label: string }> = [
  { value: 'all', label: 'Por vencer y vencida' },
  { value: 'por-vencer', label: USEFUL_LIFE_STATUS_LABELS['por-vencer'] },
  { value: 'vencida', label: USEFUL_LIFE_STATUS_LABELS.vencida },
];

function mapInventoryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para consultar alertas de vida útil.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
    return error.message;
  }

  return 'No fue posible cargar las alertas de vida útil.';
}

function resolveAssetLabel(alert: UsefulLifeAlertRecord): string {
  const sku = alert.sku?.trim() || 'Sin SKU';
  const serial = alert.serialNumber?.trim() || alert.assetTag?.trim() || 'Sin serial';
  return `${sku} · ${serial}`;
}

function formatMonthsRemaining(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  if (value <= 0) {
    return '0';
  }
  return String(value);
}

export function UsefulLifeAlertsPanel({
  onOpenAssetDetail,
  onNavigateToReplenishment,
}: UsefulLifeAlertsPanelProps) {
  const [alerts, setAlerts] = useState<UsefulLifeAlertRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<UsefulLifeAlertStatusFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await inventoryApi.listUsefulLifeAlerts({
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      });
      setAlerts(response.data);
      setTotal(response.total);
    } catch (loadError: unknown) {
      setError(mapInventoryError(loadError));
      setAlerts([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  function handleStatusFilterChange(next: UsefulLifeAlertStatusFilter) {
    setStatusFilter(next);
    setPage(1);
  }

  return (
    <div className="space-y-4" data-testid="useful-life-alerts-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs">
          <Select
            label="Estado"
            value={statusFilter}
            onChange={(event) =>
              handleStatusFilterChange(event.target.value as UsefulLifeAlertStatusFilter)
            }
            options={STATUS_FILTER_OPTIONS}
            data-testid="useful-life-alerts-status-filter"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {onNavigateToReplenishment ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onNavigateToReplenishment}
              data-testid="useful-life-alerts-replenishment-cta"
            >
              Ver reposición
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={() => void loadAlerts()}>
            Actualizar
          </Button>
        </div>
      </div>

      {onNavigateToReplenishment ? (
        <p className="text-sm text-iwana-secondary-700 dark:text-gray-300">
          Para productos con stock bajo usa la bandeja de reposición en Existencias; no se duplica
          aquí.
        </p>
      ) : null}

      {error ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar alertas de vida útil"
          description={error}
        />
      ) : null}

      {isLoading ? (
        <PortalSkeletonBlock className="h-72" />
      ) : alerts.length === 0 ? (
        <PortalEmptyState
          title="Sin alertas de vida útil"
          description="No hay activos por vencer ni con vida útil vencida con los filtros actuales."
        />
      ) : (
        <>
          <div className={portalDataTableShellClassName}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
                <thead className="bg-gray-50 dark:bg-dark-surface-2">
                  <tr>
                    <th className={portalDataTableHeadClassName}>Activo</th>
                    <th className={portalDataTableHeadClassName}>Producto</th>
                    <th className={portalDataTableHeadClassName}>Estado</th>
                    <th className={portalDataTableHeadClassName}>Meses restantes</th>
                    <th className={portalDataTableHeadClassName}>Compra</th>
                    <th className={portalDataTableHeadClassName}>Garantía</th>
                    <th className={portalDataTableHeadClassName}>Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {alerts.map((alert) => (
                    <tr key={alert.id} data-testid={`useful-life-alert-row-${alert.id}`}>
                      <td className={`${portalDataTableCellClassName} font-mono text-xs`}>
                        {resolveAssetLabel(alert)}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        {alert.itemName?.trim() || 'Producto no identificado'}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <Badge variant={getUsefulLifeStatusBadgeVariant(alert.status)}>
                          {getUsefulLifeStatusLabel(alert.status)}
                        </Badge>
                      </td>
                      <td className={`${portalDataTableCellClassName} tabular-nums`}>
                        {formatMonthsRemaining(alert.monthsRemaining)}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        {formatInventoryDate(alert.purchaseDate)}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        {formatInventoryDate(alert.warrantyUntil)}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => onOpenAssetDetail(alert.id)}
                        >
                          Ver ficha 360
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </Button>
            <span className="text-sm text-iwana-secondary-700 dark:text-gray-300">
              Página {page} de {totalPages} · {total} alertas
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((current) => current + 1)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
