'use client';

import { useMemo, useState } from 'react';
import { Button, Input } from '@iwana/ui';
import { StockIssueStatus, StockIssueType, StockLocationType } from '@iwana/shared';
import type {
  CreateStockIssueDto,
  DispatchStockIssueDto,
  InventoryItemRecord,
  StockIssueDetailRecord,
  StockIssueRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import { PortalAlert, PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import {
  formatInventoryDateTime,
  formatInventoryQuantity,
  getStockLocationTypeLabel,
} from './inventory-labels';
import { StockIssueFormDrawer } from './StockIssueFormDrawer';
import { StockIssueDetailDrawer } from './StockIssueDetailDrawer';

const DISPATCHABLE_STATUSES = new Set<StockIssueStatus>([
  StockIssueStatus.REQUESTED,
  StockIssueStatus.APPROVED,
  StockIssueStatus.PICKING,
  StockIssueStatus.READY_TO_DISPATCH,
]);

function resolveIssueTypeLabel(type: StockIssueType): string {
  switch (type) {
    case StockIssueType.TECHNICIAN_CUSTODY:
      return 'Custodia técnico';
    case StockIssueType.CREW_CUSTODY:
      return 'Custodia cuadrilla';
    case StockIssueType.OFFICE_REPLENISHMENT:
      return 'Reposición oficina';
    case StockIssueType.NODE_REPLENISHMENT:
      return 'Reposición nodo';
    case StockIssueType.SALE_DISPATCH:
      return 'Salida por venta';
    case StockIssueType.INTERNAL_CONSUMPTION:
      return 'Consumo interno';
    case StockIssueType.WAREHOUSE_TO_WAREHOUSE:
      return 'Entre bodegas';
    default:
      return type;
  }
}

function resolveIssueStatusLabel(status: StockIssueStatus): string {
  switch (status) {
    case StockIssueStatus.DRAFT:
      return 'Borrador';
    case StockIssueStatus.REQUESTED:
      return 'Solicitada';
    case StockIssueStatus.APPROVED:
      return 'Aprobada';
    case StockIssueStatus.PICKING:
      return 'En picking';
    case StockIssueStatus.READY_TO_DISPATCH:
      return 'Lista para despacho';
    case StockIssueStatus.DISPATCHED:
      return 'Despachada';
    case StockIssueStatus.RECEIVED:
      return 'Recibida';
    case StockIssueStatus.CANCELLED:
      return 'Cancelada';
    default:
      return status;
  }
}

export interface StockIssuesWorkspaceProps {
  items: InventoryItemRecord[];
  locations: StockLocationRecord[];
  issues: StockIssueRecord[];
  isLoading: boolean;
  isSubmitting?: boolean;
  error?: string | null;
  onCreate: (dto: CreateStockIssueDto) => Promise<void>;
  onDispatch: (id: string, dto: DispatchStockIssueDto) => Promise<void>;
  onOpenDetail: (id: string) => Promise<StockIssueDetailRecord>;
  onRefresh: () => void;
}

export function StockIssuesWorkspace({
  items,
  locations,
  issues,
  isLoading,
  isSubmitting,
  error,
  onCreate,
  onDispatch,
  onOpenDetail,
  onRefresh,
}: StockIssuesWorkspaceProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<StockIssueDetailRecord | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );

  const filteredIssues = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return issues;
    }

    return issues.filter((issue) => {
      const source = issue.sourceLocationId
        ? (locationMap.get(issue.sourceLocationId)?.name ?? issue.sourceLocationId)
        : '';
      const destination = issue.destinationLocationId
        ? (locationMap.get(issue.destinationLocationId)?.name ?? issue.destinationLocationId)
        : (issue.destinationRefId ?? '');
      const ref = issue.commercialRefId ?? issue.originRefId ?? issue.costCenter ?? '';

      return (
        issue.id.toLowerCase().includes(needle) ||
        source.toLowerCase().includes(needle) ||
        destination.toLowerCase().includes(needle) ||
        ref.toLowerCase().includes(needle)
      );
    });
  }, [issues, locationMap, search]);

  async function openDetail(issueId: string) {
    setDetailError(null);
    setActionError(null);
    try {
      const loaded = await onOpenDetail(issueId);
      setDetail(loaded);
      setDetailOpen(true);
    } catch (err) {
      setDetail(null);
      setDetailOpen(false);
      setDetailError(err instanceof Error ? err.message : 'No fue posible abrir la salida.');
    }
  }

  const destinationOptions = useMemo(() => {
    const byType = new Map<StockLocationType, StockLocationRecord[]>();
    locations.forEach((loc) => {
      const next = byType.get(loc.type) ?? [];
      next.push(loc);
      byType.set(loc.type, next);
    });
    return byType;
  }, [locations]);

  return (
    <PortalPanel
      eyebrow="Despachos"
      title="Salidas"
      description="Registra salidas operativas desde bodega principal hacia custodias, oficinas, nodos, venta o consumo interno."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onRefresh} loading={isLoading}>
            Actualizar
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)} disabled={isLoading}>
            Crear salida
          </Button>
        </div>
      }
      contentClassName="space-y-4"
    >
      {error ? (
        <PortalAlert variant="error" title="No fue posible cargar salidas" description={error} />
      ) : null}
      {detailError ? (
        <PortalAlert
          variant="warning"
          title="No fue posible abrir la salida"
          description={detailError}
        />
      ) : null}
      {actionError ? (
        <PortalAlert
          variant="error"
          title="No fue posible completar la acción"
          description={actionError}
        />
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <Input
          label="Buscar"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Busca por ubicación o referencia…"
        />
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
          Cargando salidas…
        </div>
      ) : filteredIssues.length === 0 ? (
        <PortalEmptyState
          title="Sin salidas registradas"
          description="Crea una salida para empezar a despachar material desde bodega principal."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
            <thead className="bg-gray-50 dark:bg-dark-surface-2">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Número
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Tipo
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Estado
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Origen
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Destino
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Líneas
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Referencia
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {filteredIssues.map((issue) => {
                const source = locationMap.get(issue.sourceLocationId);
                const destination = issue.destinationLocationId
                  ? locationMap.get(issue.destinationLocationId)
                  : null;
                const destinationLabel = destination
                  ? `${destination.code} · ${destination.name}`
                  : (issue.destinationRefId ?? '—');
                const ref = issue.commercialRefId ?? issue.originRefId ?? issue.costCenter ?? '—';

                return (
                  <tr key={issue.id}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {issue.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {resolveIssueTypeLabel(issue.type)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {resolveIssueStatusLabel(issue.status)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {source ? `${source.code} · ${source.name}` : issue.sourceLocationId}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {destinationLabel}
                      {destination ? (
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {getStockLocationTypeLabel(destination.type)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {typeof (issue as unknown as { linesCount?: number }).linesCount === 'number'
                        ? (issue as unknown as { linesCount?: number }).linesCount
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{ref}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {formatInventoryDateTime(issue.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void openDetail(issue.id)}
                        >
                          Ver
                        </Button>
                        {DISPATCHABLE_STATUSES.has(issue.status) ? (
                          <Button type="button" size="sm" onClick={() => void openDetail(issue.id)}>
                            Despachar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <StockIssueFormDrawer
        open={createOpen}
        items={items}
        locations={locations.filter((loc) => loc.type !== StockLocationType.CUSTOMER_SITE)}
        destinationOptions={destinationOptions}
        isSubmitting={Boolean(isSubmitting)}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (dto) => {
          setActionError(null);
          try {
            await onCreate(dto);
            setCreateOpen(false);
          } catch (err) {
            setActionError(err instanceof Error ? err.message : 'No fue posible crear la salida.');
            throw err instanceof Error ? err : new Error('No fue posible crear la salida.');
          }
        }}
      />

      <StockIssueDetailDrawer
        open={detailOpen}
        issue={detail}
        itemsById={itemMap}
        locationsById={locationMap}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        onDispatch={async (issueId, dto) => {
          setActionError(null);
          try {
            await onDispatch(issueId, dto);
            const refreshed = await onOpenDetail(issueId);
            setDetail(refreshed);
          } catch (err) {
            setActionError(
              err instanceof Error ? err.message : 'No fue posible despachar la salida.',
            );
            throw err instanceof Error ? err : new Error('No fue posible despachar la salida.');
          }
        }}
      />
    </PortalPanel>
  );
}
