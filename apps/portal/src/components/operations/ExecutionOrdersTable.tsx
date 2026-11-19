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
// v1.2 (E4-portal, CA-12): con `schedule.window` nulo la columna 5 pinta
// «Por programar» (estado abierto) o «Sin ventana planificada» (terminal), vía
// `execution-order-window-copy.ts`; el orden lo publica el servidor, la tabla
// no ordena (ni siquiera localmente).
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
} from './operations-labels';
import { getExecutionOrderWindowAbsence } from './execution-order-window-copy';
import { formatExecutionOrderWindow } from './execution-order-window-relative';

const ORDERS_RESOURCE = { singular: 'orden de ejecución', plural: 'órdenes de ejecución' } as const;
const ORDERS_COLUMN_COUNT = 8;
/** Tope de filas skeleton de la carga inicial (contrato §6.5). */
const SKELETON_ROW_LIMIT = 8;
/** F · Móvil (spec 2026-11-19 §3 F): bajo 768 px la misma tabla se lee como
 * lista de tarjetas (patrón de la bandeja de tickets), sin desplazamiento lateral. */
const cellClassName = `${portalDataTableCellClassName} max-md:block max-md:border-0 max-md:px-4 max-md:py-1 md:px-3 md:py-2`;
/** CA-2 (≥7 filas a 1440×900): desde md las columnas cortas van en una línea;
 * Cliente queda libre (sin nowrap ni truncado) y absorbe el ancho restante. */
const nowrapCellClassName = `${cellClassName} md:whitespace-nowrap`;
/** Encabezado compacto en una línea desde md (en móvil el thead es sr-only). */
const headClassName = 'md:whitespace-nowrap md:px-3 md:py-2';

/** P-3: rótulo del dato en la tarjeta móvil; en escritorio lo da el encabezado
 * de columna y aquí queda solo para lectores de pantalla. */
function MobileCaption({ children }: { children: string }) {
  return <span className="md:sr-only">{children} </span>;
}

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
          refreshing ? `md:overflow-x-auto ${portalDataBusyRegionClassName}` : 'md:overflow-x-auto'
        }
        aria-busy={refreshing || undefined}
      >
        <table
          className="w-full text-sm max-md:block md:min-w-[1024px]"
          aria-label="Bandeja de órdenes de ejecución"
        >
          <thead className={`${portalDataTableHeadRowClassName} max-md:sr-only`}>
            <tr>
              <PortalDataTableHead className={headClassName}>Número</PortalDataTableHead>
              <PortalDataTableHead className={headClassName}>Estado</PortalDataTableHead>
              <PortalDataTableHead className={headClassName}>Resultado</PortalDataTableHead>
              <PortalDataTableHead className={headClassName}>Tipo de trabajo</PortalDataTableHead>
              <PortalDataTableHead className={headClassName}>
                Ventana planificada
              </PortalDataTableHead>
              <PortalDataTableHead className={headClassName}>Asignado a</PortalDataTableHead>
              <PortalDataTableHead className={headClassName}>Cliente</PortalDataTableHead>
              <PortalDataTableHead className={headClassName}>Municipio</PortalDataTableHead>
            </tr>
          </thead>
          <tbody className={`${portalDataTableBodyClassName} max-md:block`}>
            {isLoading && orders.length === 0
              ? Array.from({ length: SKELETON_ROW_LIMIT }, (_, index) => (
                  <tr key={`skeleton-${index}`} className="max-md:block">
                    <td colSpan={ORDERS_COLUMN_COUNT} className={cellClassName}>
                      <PortalSkeletonBlock className="h-10 rounded-xl" />
                    </td>
                  </tr>
                ))
              : null}

            {!isLoading &&
              orders.map((order) => (
                // D · La fila entera abre la consola; el número sigue siendo el
                // control de teclado (un solo destino, sin doble apertura).
                <tr
                  key={order.id}
                  onClick={() => onOpenRow(order)}
                  className={`${portalTableRowHoverClassName} cursor-pointer max-md:block max-md:py-3 ${
                    activeRowId === order.id
                      ? 'bg-iwana-primary-50/60 dark:bg-iwana-primary-950/30'
                      : ''
                  }`}
                >
                  <td className={`${nowrapCellClassName} font-mono text-xs`}>
                    <button
                      type="button"
                      className={`text-left font-medium underline-offset-4 hover:underline max-md:min-h-11 ${interactiveFocusClassName}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenRow(order);
                      }}
                    >
                      {order.number}
                    </button>
                  </td>
                  <td className={nowrapCellClassName}>
                    <Badge variant={EXECUTION_ORDER_STATUS_VARIANTS[order.status]}>
                      {EXECUTION_ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                  </td>
                  <td className={nowrapCellClassName}>
                    <MobileCaption>Resultado:</MobileCaption>
                    {order.result ? (
                      <Badge variant={EXECUTION_ORDER_RESULT_VARIANTS[order.result]}>
                        {EXECUTION_ORDER_RESULT_LABELS[order.result]}
                      </Badge>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  <td className={nowrapCellClassName}>
                    <MobileCaption>Tipo de trabajo:</MobileCaption>
                    <span>{EXECUTION_ORDER_WORK_TYPE_LABELS[order.workType]}</span>
                  </td>
                  <WindowCell order={order} />
                  <td className={cellClassName}>
                    <MobileCaption>Asignado a:</MobileCaption>
                    <span>{order.assignee?.displayLabel ?? 'Sin asignar'}</span>
                  </td>
                  <td className={cellClassName}>
                    <MobileCaption>Cliente:</MobileCaption>
                    <span>{order.customerDisplayLabel}</span>
                  </td>
                  <td className={cellClassName}>
                    <MobileCaption>Municipio:</MobileCaption>
                    <span>{order.municipality ?? '—'}</span>
                  </td>
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

/**
 * Ventana planificada (contrato v1.2 §7.2 col. 5; spec 2026-11-19 §3 E). Con
 * ventana: día y hora relativos («Hoy 14:00», «Mañana 9:00», fecha si está más
 * lejos), en mono técnico, con el intervalo exacto en `title`. Sin ventana:
 * texto del estado publicado (fuente única `execution-order-window-copy.ts`),
 * sin mono: no es una fecha.
 */
function WindowCell({ order }: { order: ExecutionOrderListItem }) {
  const window = order.schedule.window;

  if (!window) {
    return (
      // E4 protege el texto exacto de la celda: el rótulo móvil va en un
      // pseudo-elemento (visible bajo 768 px, fuera del contenido de la celda).
      <td
        className={`${nowrapCellClassName} max-md:before:mr-1 max-md:before:content-['Ventana:']`}
      >
        {getExecutionOrderWindowAbsence(order.status).label}
      </td>
    );
  }

  const { label, title, endLabel } = formatExecutionOrderWindow(window);

  // P-1: en escritorio el fin viaja en `title`; en la tarjeta móvil (sin
  // puntero que lo revele) se pinta junto al inicio.
  return (
    <td
      className={`${nowrapCellClassName} font-mono text-xs text-gray-600 dark:text-gray-400`}
      title={title}
    >
      <MobileCaption>Ventana:</MobileCaption>
      <span>{label}</span>
      {endLabel ? <span className="md:hidden"> {endLabel}</span> : null}
    </td>
  );
}
