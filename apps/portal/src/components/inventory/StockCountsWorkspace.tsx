'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Input, Select } from '@iwana/ui';
import { StockCountStatus } from '@iwana/shared';
import type {
  CreateStockCountDto,
  InventoryCategoryRecord,
  StockCountDetailRecord,
  StockCountRecord,
  StockLocationRecord,
  UpdateStockCountDto,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  STOCK_COMMITTED_NEXT_STEP_TEXT,
  formatInventoryQuantity,
  getStockCountStatusBadgeVariant,
  getStockCountStatusLabel,
} from './inventory-labels';

/**
 * El backend explica por qué se bloqueó el movimiento pero no el próximo paso.
 * Cuando el rechazo viene del material comprometido, completamos el mensaje sin reescribirlo.
 */
function isCommittedStockError(message: string): boolean {
  return /comprometid/i.test(message);
}

function StockCountErrorAlert({ message }: { message: string }) {
  return (
    <PortalAlert
      variant="error"
      title="Error"
      description={
        isCommittedStockError(message) ? (
          <>
            <p>{message}</p>
            <p className="mt-1">{STOCK_COMMITTED_NEXT_STEP_TEXT}</p>
          </>
        ) : (
          message
        )
      }
    />
  );
}

export interface StockCountsWorkspaceProps {
  locations: StockLocationRecord[];
  categories: InventoryCategoryRecord[];
  counts: StockCountRecord[];
  isLoading: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  canClose: boolean;
  onCreate: (dto: CreateStockCountDto) => Promise<StockCountDetailRecord>;
  onUpdate: (id: string, dto: UpdateStockCountDto) => Promise<StockCountDetailRecord>;
  onClose: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  onOpenDetail: (id: string) => Promise<StockCountDetailRecord>;
  onRefresh: () => void;
}

type WorkspaceMode = 'inbox' | 'create' | 'detail';

export function StockCountsWorkspace({
  locations,
  categories,
  counts,
  isLoading,
  error,
  canClose,
  onCreate,
  onUpdate,
  onClose,
  onCancel,
  onOpenDetail,
  onRefresh,
}: StockCountsWorkspaceProps) {
  const [mode, setMode] = useState<WorkspaceMode>('inbox');
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [detail, setDetail] = useState<StockCountDetailRecord | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StockCountStatus | ''>('');

  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );

  const filteredCounts = useMemo(
    () => (statusFilter ? counts.filter((row) => row.status === statusFilter) : counts),
    [counts, statusFilter],
  );

  const kpis = useMemo(() => {
    const byStatus = {
      [StockCountStatus.COUNTING]: 0,
      [StockCountStatus.CLOSED]: 0,
      [StockCountStatus.CANCELLED]: 0,
      [StockCountStatus.OPEN]: 0,
    };
    for (const row of counts) {
      byStatus[row.status] += 1;
    }
    return byStatus;
  }, [counts]);

  async function handleCreate() {
    if (!locationId) {
      setActionError('Selecciona una bodega para iniciar el conteo.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      const created = await onCreate({
        locationId,
        categoryId: categoryId || null,
        notes: notes.trim() || null,
      });
      setDetail(created);
      setQuantities(
        Object.fromEntries(
          created.lines.map((line) => [line.id, line.countedQty ?? line.expectedQty]),
        ),
      );
      setMode('detail');
      onRefresh();
    } catch (createError) {
      setActionError(
        createError instanceof Error ? createError.message : 'No fue posible crear el conteo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOpen(id: string) {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const opened = await onOpenDetail(id);
      setDetail(opened);
      setQuantities(
        Object.fromEntries(opened.lines.map((line) => [line.id, line.countedQty ?? ''])),
      );
      setMode('detail');
    } catch (openError) {
      setActionError(
        openError instanceof Error ? openError.message : 'No fue posible abrir el conteo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveQuantities() {
    if (!detail) {
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      const updated = await onUpdate(detail.id, {
        lines: detail.lines.map((line) => ({
          id: line.id,
          countedQty: Number.parseFloat(quantities[line.id] || '0'),
        })),
      });
      setDetail(updated);
      onRefresh();
    } catch (updateError) {
      setActionError(
        updateError instanceof Error
          ? updateError.message
          : 'No fue posible guardar las cantidades.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClose() {
    if (!detail) {
      return;
    }

    if (!window.confirm('¿Cerrar el conteo y aplicar el ajuste de inventario?')) {
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      const updated = await onUpdate(detail.id, {
        lines: detail.lines.map((line) => ({
          id: line.id,
          countedQty: Number.parseFloat(quantities[line.id] || '0'),
        })),
      });
      setDetail(updated);
      await onClose(updated.id);
      setMode('inbox');
      setDetail(null);
      onRefresh();
    } catch (closeError) {
      setActionError(
        closeError instanceof Error ? closeError.message : 'No fue posible cerrar el conteo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!detail) {
      return;
    }

    if (!window.confirm('¿Cancelar este conteo sin afectar el stock?')) {
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      await onCancel(detail.id);
      setMode('inbox');
      setDetail(null);
      onRefresh();
    } catch (cancelError) {
      setActionError(
        cancelError instanceof Error ? cancelError.message : 'No fue posible cancelar el conteo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const editable =
    detail?.status === StockCountStatus.COUNTING || detail?.status === StockCountStatus.OPEN;

  if (mode === 'create') {
    return (
      <PortalPanel
        eyebrow="Conteos"
        title="Nuevo conteo físico"
        description="Elige bodega y, si aplica, una categoría para congelar lo esperado."
        actions={
          <Button type="button" variant="secondary" onClick={() => setMode('inbox')}>
            Volver
          </Button>
        }
      >
        <div className="space-y-4">
          {actionError ? <StockCountErrorAlert message={actionError} /> : null}
          <Select
            label="Bodega"
            aria-label="Bodega del conteo"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            options={[
              { value: '', label: 'Selecciona bodega' },
              ...locations.map((location) => ({ value: location.id, label: location.name })),
            ]}
          />
          <Select
            label="Categoría (opcional)"
            aria-label="Categoría del conteo"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            options={[
              { value: '', label: 'Todas' },
              ...categories.map((category) => ({ value: category.id, label: category.name })),
            ]}
          />
          <label className="block space-y-1 text-sm">
            <span>Notas</span>
            <Input
              aria-label="Notas del conteo"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <Button type="button" onClick={() => void handleCreate()} disabled={isSubmitting}>
            Iniciar conteo
          </Button>
        </div>
      </PortalPanel>
    );
  }

  if (mode === 'detail' && detail) {
    return (
      <PortalPanel
        eyebrow="Conteos"
        title={detail.countNumber}
        description={`${locationMap.get(detail.locationId)?.name ?? 'Bodega'} · ${getStockCountStatusLabel(detail.status)}`}
        actions={
          <Button type="button" variant="secondary" onClick={() => setMode('inbox')}>
            Volver
          </Button>
        }
      >
        <div className="space-y-4">
          {actionError ? <StockCountErrorAlert message={actionError} /> : null}
          <div className={portalDataTableShellClassName}>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={portalDataTableHeadClassName}>SKU</th>
                  <th className={portalDataTableHeadClassName}>Producto</th>
                  <th className={portalDataTableHeadClassName}>Esperado</th>
                  <th className={portalDataTableHeadClassName}>Contado</th>
                  <th className={portalDataTableHeadClassName}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line) => (
                  <tr key={line.id} className={portalTableRowHoverClassName}>
                    <td className={portalDataTableCellClassName}>{line.itemSku ?? '—'}</td>
                    <td className={portalDataTableCellClassName}>{line.itemName ?? line.itemId}</td>
                    <td className={`${portalDataTableCellClassName} tabular-nums`}>
                      {formatInventoryQuantity(line.expectedQty)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {editable ? (
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          aria-label={`Cantidad contada ${line.itemSku ?? line.itemId}`}
                          className="w-28 tabular-nums"
                          value={quantities[line.id] ?? ''}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [line.id]: event.target.value,
                            }))
                          }
                        />
                      ) : (
                        <span className="tabular-nums">
                          {line.countedQty == null ? '—' : formatInventoryQuantity(line.countedQty)}
                        </span>
                      )}
                    </td>
                    <td className={`${portalDataTableCellClassName} tabular-nums`}>
                      {line.variance == null ? '—' : formatInventoryQuantity(line.variance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleSaveQuantities()}
                disabled={isSubmitting}
              >
                Guardar cantidades
              </Button>
            ) : null}
            {editable && canClose ? (
              <Button type="button" onClick={() => void handleClose()} disabled={isSubmitting}>
                Cerrar conteo
              </Button>
            ) : null}
            {editable ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleCancel()}
                disabled={isSubmitting}
              >
                Cancelar conteo
              </Button>
            ) : null}
          </div>
        </div>
      </PortalPanel>
    );
  }

  return (
    <PortalPanel
      eyebrow="Operación"
      title="Conteos físicos"
      description="Reconcilia el saldo del sistema contra lo contado en bodega."
      actions={
        <Button type="button" onClick={() => setMode('create')}>
          Nuevo conteo
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <StockCountErrorAlert message={error} /> : null}
        {actionError ? <StockCountErrorAlert message={actionError} /> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 p-4">
            <p className="portal-eyebrow-muted">En conteo</p>
            <p className="text-2xl font-semibold tabular-nums">{kpis[StockCountStatus.COUNTING]}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 p-4">
            <p className="portal-eyebrow-muted">Cerrados</p>
            <p className="text-2xl font-semibold tabular-nums">{kpis[StockCountStatus.CLOSED]}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 p-4">
            <p className="portal-eyebrow-muted">Cancelados</p>
            <p className="text-2xl font-semibold tabular-nums">
              {kpis[StockCountStatus.CANCELLED]}
            </p>
          </div>
        </div>

        <div className="max-w-xs">
          <Select
            label="Estado"
            aria-label="Filtrar conteos por estado"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StockCountStatus | '')}
            options={[
              { value: '', label: 'Todos' },
              ...Object.values(StockCountStatus).map((status) => ({
                value: status,
                label: getStockCountStatusLabel(status),
              })),
            ]}
          />
        </div>

        {isLoading ? (
          <PortalSkeletonBlock className="h-48 rounded-xl" />
        ) : filteredCounts.length === 0 ? (
          <PortalEmptyState
            title="Sin conteos"
            description="Crea un conteo por bodega para capturar diferencias y cerrar el ajuste."
          />
        ) : (
          <div className={portalDataTableShellClassName}>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={portalDataTableHeadClassName}>Número</th>
                  <th className={portalDataTableHeadClassName}>Bodega</th>
                  <th className={portalDataTableHeadClassName}>Estado</th>
                  <th className={portalDataTableHeadClassName}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredCounts.map((row) => (
                  <tr key={row.id} className={portalTableRowHoverClassName}>
                    <td className={portalDataTableCellClassName}>{row.countNumber}</td>
                    <td className={portalDataTableCellClassName}>
                      {locationMap.get(row.locationId)?.name ?? row.locationId}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Badge variant={getStockCountStatusBadgeVariant(row.status)}>
                        {getStockCountStatusLabel(row.status)}
                      </Badge>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleOpen(row.id)}
                      >
                        Abrir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PortalPanel>
  );
}
