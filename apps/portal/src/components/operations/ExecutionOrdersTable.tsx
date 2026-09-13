// apps/portal/src/components/operations/ExecutionOrdersTable.tsx
// Tabla operativa de la bandeja de OT — contrato de componente
// docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md
// v1.0 (AI-DS-OWNER, congelado): 8 columnas de la proyección
// `ExecutionOrderListItem` (§7.2), un solo pie elegido por el discriminador
// `pagination.randomAccess` en un único ternario (§5), skeleton con forma en
// carga inicial (§6.5), `aria-busy` en refresco, sin strip de conteo (§3.2),
// sin PortalPanel ni toolbar (§3.1), encabezados no ordenables mientras
// `meta.capabilities.sortableFields` esté vacío (§8.1 — prohibido
// `PortalDataTableSortableHead`).
//
// Nota de anclaje: el contrato §7.2 nombra la columna 1 «executionOrderNumber»,
// pero el campo del contrato de API congelado `ExecutionOrderListItem` es
// `number` (execution-orders-list.ts v1); el contrato §2 se ancla a sí mismo
// en ese tipo, así que la tabla consume `order.number`.
'use client';

import { Badge } from '@iwana/ui';
import type { ExecutionOrderListItem } from '@/lib/api-client';
import {
  PortalDataTableHead,
  PortalPageSizeSelect,
  PortalSkeletonBlock,
  PortalTablePager,
  PortalTablePagination,
  interactiveFocusClassName,
  portalDataBusyRegionClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import type { OperationsTablePagination } from './operations-table-pagination';
import {
  EXECUTION_ORDER_RESULT_LABELS,
  EXECUTION_ORDER_RESULT_VARIANTS,
  EXECUTION_ORDER_STATUS_LABELS,
  EXECUTION_ORDER_STATUS_VARIANTS,
  EXECUTION_ORDER_WORK_TYPE_LABELS,
  formatTaskDateTime,
} from './operations-labels';

const ORDERS_RESOURCE = { singular: 'orden de ejecución', plural: 'órdenes de ejecución' } as const;
const ORDERS_COLUMN_COUNT = 8;
/** Tope de filas skeleton de la carga inicial (contrato §6.5). */
const SKELETON_ROW_LIMIT = 8;

export interface ExecutionOrdersTableProps {
  orders: ExecutionOrderListItem[];
  total: number;
  isLoading: boolean;
  /** Refresco con datos ya pintados: aria-busy + pie disabled, sin opacity. */
  refreshing?: boolean;
  /** Posición 1-based de las filas visibles (ambos pies la consumen). */
  from: number;
  to: number;
  /** Apertura del detalle (drawer por URL, spec de diseño §4.6). */
  onOpenRow: (order: ExecutionOrderListItem) => void;
  /** Fila con el detalle abierto (deep link ?executionOrderId=). */
  activeRowId?: string | null;
  /** Grupo exclusivo: exactamente una variante (contrato §4.1). */
  pagination: OperationsTablePagination;
}

export function ExecutionOrdersTable({
  orders,
  total,
  isLoading,
  refreshing = false,
  from,
  to,
  onOpenRow,
  activeRowId,
  pagination,
}: ExecutionOrdersTableProps) {
  const showPager = !isLoading && total > 0;

  return (
    <div className={portalDataTableShellClassName}>
      <div
        className={
          refreshing ? `overflow-x-auto ${portalDataBusyRegionClassName}` : 'overflow-x-auto'
        }
        aria-busy={refreshing || undefined}
      >
        <table
          className="w-full min-w-[1024px] text-sm"
          aria-label="Bandeja de órdenes de ejecución"
        >
          <thead className={portalDataTableHeadRowClassName}>
            <tr>
              <PortalDataTableHead>Número</PortalDataTableHead>
              <PortalDataTableHead>Estado</PortalDataTableHead>
              <PortalDataTableHead>Resultado</PortalDataTableHead>
              <PortalDataTableHead>Tipo de trabajo</PortalDataTableHead>
              <PortalDataTableHead>Ventana planificada</PortalDataTableHead>
              <PortalDataTableHead>Asignado a</PortalDataTableHead>
              <PortalDataTableHead>Cliente</PortalDataTableHead>
              <PortalDataTableHead>Municipio</PortalDataTableHead>
            </tr>
          </thead>
          <tbody className={portalDataTableBodyClassName}>
            {isLoading && orders.length === 0
              ? Array.from({ length: SKELETON_ROW_LIMIT }, (_, index) => (
                  <tr key={`skeleton-${index}`}>
                    <td colSpan={ORDERS_COLUMN_COUNT} className={portalDataTableCellClassName}>
                      <PortalSkeletonBlock className="h-10 rounded-xl" />
                    </td>
                  </tr>
                ))
              : null}

            {!isLoading &&
              orders.map((order) => (
                <tr
                  key={order.id}
                  className={`${portalTableRowHoverClassName} ${
                    activeRowId === order.id
                      ? 'bg-iwana-primary-50/60 dark:bg-iwana-primary-950/30'
                      : ''
                  }`}
                >
                  <td className={`${portalDataTableCellClassName} font-mono text-xs`}>
                    <button
                      type="button"
                      className={`text-left font-medium underline-offset-4 hover:underline ${interactiveFocusClassName}`}
                      onClick={() => onOpenRow(order)}
                    >
                      {order.number}
                    </button>
                  </td>
                  <td className={portalDataTableCellClassName}>
                    <Badge variant={EXECUTION_ORDER_STATUS_VARIANTS[order.status]}>
                      {EXECUTION_ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                  </td>
                  <td className={portalDataTableCellClassName}>
                    {order.result ? (
                      <Badge variant={EXECUTION_ORDER_RESULT_VARIANTS[order.result]}>
                        {EXECUTION_ORDER_RESULT_LABELS[order.result]}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={portalDataTableCellClassName}>
                    {EXECUTION_ORDER_WORK_TYPE_LABELS[order.workType]}
                  </td>
                  <td
                    className={`${portalDataTableCellClassName} font-mono text-xs text-gray-600 dark:text-gray-400`}
                  >
                    {formatExecutionOrderWindow(order)}
                  </td>
                  <td className={portalDataTableCellClassName}>
                    {order.assignee?.displayLabel ?? 'Sin asignar'}
                  </td>
                  <td className={portalDataTableCellClassName}>{order.customerDisplayLabel}</td>
                  <td className={portalDataTableCellClassName}>{order.municipality ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Un solo pie: un único ternario sobre el discriminador (contrato §5.2). */}
      {showPager ? (
        pagination.randomAccess ? (
          <PortalTablePager
            page={pagination.page}
            pageCount={Math.max(1, pagination.pageCount)}
            onPageChange={pagination.onPageChange}
            from={from}
            to={to}
            total={total}
            resource={ORDERS_RESOURCE}
            loading={refreshing}
            pageSizeControl={
              <PortalPageSizeSelect
                value={pagination.pageSize}
                onChange={pagination.onPageSizeChange}
                disabled={refreshing}
              />
            }
          />
        ) : (
          <PortalTablePagination
            hasMore={pagination.hasMore}
            onLoadMore={pagination.onLoadMore}
            loading={refreshing}
            resourceLabel={ORDERS_RESOURCE.plural}
            shown={to}
            total={total}
          />
        )
      ) : null}
    </div>
  );
}

/** Ventana planificada: inicio; con fin distinto, «– fin» (contrato §7.2 col. 5). */
function formatExecutionOrderWindow(order: ExecutionOrderListItem): string {
  const start = formatTaskDateTime(order.schedule.window.startAt);
  const endAt = order.schedule.window.endAt;
  if (endAt && endAt !== order.schedule.window.startAt) {
    return `${start} – ${formatTaskDateTime(endAt)}`;
  }
  return start;
}
