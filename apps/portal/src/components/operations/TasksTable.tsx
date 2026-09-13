// apps/portal/src/components/operations/TasksTable.tsx
// Tabla operativa de la bandeja de tareas — contrato de componente
// docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md
// v1.0 (AI-DS-OWNER, congelado): 7 columnas (§7.1) con «Vence» sustituyendo a
// «Creada», un solo pie elegido por el discriminador `pagination.randomAccess`
// en un único ternario (§5), skeleton con forma en carga inicial (§6.5),
// `aria-busy` en refresco, sin strip de conteo (§3.2) y sin PortalPanel ni
// toolbar (§3.1). Encabezados no ordenables mientras
// `meta.capabilities.sortableFields` esté vacío (§8.1 — prohibido
// `PortalDataTableSortableHead`).
//
// Gramática de la celda «Vence» (UX spec §7.3): vencida en escala error con
// texto + icono (nunca solo color, nunca lima); hoy en escala de atención;
// mañana/futura neutra; tarea resuelta o cancelada sin señal de vencimiento.
// La comparación temporal se evalúa tras montar (H4 §7.1) para no inducir
// mismatch de hidratación: antes del primer efecto se pinta la fecha neutra.
'use client';

import { useEffect, useState } from 'react';
import { AlarmClock } from 'lucide-react';
import { Badge } from '@iwana/ui';
import { TaskStatus } from '@iwana/shared';
import type { OperationalTaskRecord } from '@/lib/api-client';
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
  formatTaskDateTime,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  getTaskTypeLabel,
  TASK_STATUS_VARIANTS,
} from './operations-labels';

const TASKS_RESOURCE = { singular: 'tarea', plural: 'tareas' } as const;
const TASKS_COLUMN_COUNT = 7;
/** Tope de filas skeleton de la carga inicial (contrato §6.5). */
const SKELETON_ROW_LIMIT = 8;

const TERMINAL_TASK_STATUSES = new Set<TaskStatus>([TaskStatus.RESOLVED, TaskStatus.CANCELLED]);

const shortDateFormatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const shortTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

type DueCellTone = 'neutral' | 'attention' | 'overdue';

interface DueCell {
  text: string;
  tone: DueCellTone;
  withIcon: boolean;
  /** Fecha y hora completas para el texto accesible (UX spec §7.3). */
  fullLabel: string;
}

function buildDueCell(task: OperationalTaskRecord, now: Date | null): DueCell {
  if (!task.dueAt) {
    return { text: '—', tone: 'neutral', withIcon: false, fullLabel: '' };
  }
  const due = new Date(task.dueAt);
  const plainDate = Number.isNaN(due.getTime()) ? null : shortDateFormatter.format(due);
  const fullLabel = formatTaskDateTime(task.dueAt);
  if (!plainDate) {
    return { text: '—', tone: 'neutral', withIcon: false, fullLabel: '' };
  }
  // Resuelta o cancelada: la fecha, sin énfasis — ya no ordena trabajo.
  if (TERMINAL_TASK_STATUSES.has(task.status) || !now) {
    return { text: plainDate, tone: 'neutral', withIcon: false, fullLabel };
  }

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfDayAfterTomorrow = new Date(startOfTomorrow);
  startOfDayAfterTomorrow.setDate(startOfDayAfterTomorrow.getDate() + 1);

  if (due.getTime() < startOfToday.getTime()) {
    return { text: `Vencida · ${plainDate}`, tone: 'overdue', withIcon: true, fullLabel };
  }
  if (due.getTime() < startOfTomorrow.getTime()) {
    return {
      text: `Hoy · ${shortTimeFormatter.format(due)}`,
      tone: 'attention',
      withIcon: false,
      fullLabel,
    };
  }
  if (due.getTime() < startOfDayAfterTomorrow.getTime()) {
    return {
      text: `Mañana · ${shortTimeFormatter.format(due)}`,
      tone: 'neutral',
      withIcon: false,
      fullLabel,
    };
  }
  return { text: plainDate, tone: 'neutral', withIcon: false, fullLabel };
}

const DUE_TONE_CLASS_NAME: Record<DueCellTone, string> = {
  neutral: 'text-gray-600 dark:text-gray-400',
  attention: 'font-medium text-amber-700 dark:text-amber-400',
  overdue: 'font-medium text-iwana-error-700 dark:text-error-400',
};

export interface TasksTableProps {
  tasks: OperationalTaskRecord[];
  total: number;
  isLoading: boolean;
  /** Refresco con datos ya pintados: aria-busy + pie disabled, sin opacity. */
  refreshing?: boolean;
  /** Posición 1-based de las filas visibles (ambos pies la consumen). */
  from: number;
  to: number;
  /** Apertura del detalle (drawer por URL, spec de diseño §4.6). */
  onOpenRow: (task: OperationalTaskRecord) => void;
  /** Fila con el detalle abierto (deep link ?taskId=). */
  activeRowId?: string | null;
  /** Grupo exclusivo: exactamente una variante (contrato §4.1). */
  pagination: OperationsTablePagination;
}

export function TasksTable({
  tasks,
  total,
  isLoading,
  refreshing = false,
  from,
  to,
  onOpenRow,
  activeRowId,
  pagination,
}: TasksTableProps) {
  // Reloj de vencimiento tras montar (H4 §7.1): SSR y primer render pintan la
  // fecha neutra; el énfasis de vencida aparece con el efecto.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);

  const showPager = !isLoading && total > 0;

  return (
    <div className={portalDataTableShellClassName}>
      <div
        className={
          refreshing ? `overflow-x-auto ${portalDataBusyRegionClassName}` : 'overflow-x-auto'
        }
        aria-busy={refreshing || undefined}
      >
        <table className="w-full min-w-[880px] text-sm" aria-label="Bandeja de tareas operativas">
          <thead className={portalDataTableHeadRowClassName}>
            <tr>
              <PortalDataTableHead>Número</PortalDataTableHead>
              <PortalDataTableHead>Título</PortalDataTableHead>
              <PortalDataTableHead>Tipo</PortalDataTableHead>
              <PortalDataTableHead>Estado</PortalDataTableHead>
              <PortalDataTableHead>Prioridad</PortalDataTableHead>
              <PortalDataTableHead>Destinatario</PortalDataTableHead>
              <PortalDataTableHead>Vence</PortalDataTableHead>
            </tr>
          </thead>
          <tbody className={portalDataTableBodyClassName}>
            {isLoading && tasks.length === 0
              ? Array.from({ length: SKELETON_ROW_LIMIT }, (_, index) => (
                  <tr key={`skeleton-${index}`}>
                    <td colSpan={TASKS_COLUMN_COUNT} className={portalDataTableCellClassName}>
                      <PortalSkeletonBlock className="h-10 rounded-xl" />
                    </td>
                  </tr>
                ))
              : null}

            {!isLoading &&
              tasks.map((task) => {
                const dueCell = buildDueCell(task, now);
                return (
                  <tr
                    key={task.id}
                    className={`${portalTableRowHoverClassName} ${
                      activeRowId === task.id
                        ? 'bg-iwana-primary-50/60 dark:bg-iwana-primary-950/30'
                        : ''
                    }`}
                  >
                    <td className={`${portalDataTableCellClassName} font-mono text-xs`}>
                      {task.taskNumber}
                    </td>
                    <td
                      className={`${portalDataTableCellClassName} font-medium text-gray-950 dark:text-white`}
                    >
                      <button
                        type="button"
                        className={`text-left text-inherit underline-offset-4 hover:underline ${interactiveFocusClassName}`}
                        onClick={() => onOpenRow(task)}
                      >
                        {task.title}
                      </button>
                    </td>
                    <td className={portalDataTableCellClassName}>{getTaskTypeLabel(task.type)}</td>
                    <td className={portalDataTableCellClassName}>
                      <Badge variant={TASK_STATUS_VARIANTS[task.status]}>
                        {getTaskStatusLabel(task.status)}
                      </Badge>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {getTaskPriorityLabel(task.priority)}
                    </td>
                    <td className={portalDataTableCellClassName}>{task.recipientLabel ?? '—'}</td>
                    <td
                      className={`${portalDataTableCellClassName} font-mono text-xs ${DUE_TONE_CLASS_NAME[dueCell.tone]}`}
                      {...(dueCell.fullLabel ? { title: dueCell.fullLabel } : {})}
                    >
                      <span className="inline-flex items-center gap-1">
                        {dueCell.withIcon ? (
                          <AlarmClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        ) : null}
                        {dueCell.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
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
            resource={TASKS_RESOURCE}
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
            resourceLabel={TASKS_RESOURCE.plural}
            shown={to}
            total={total}
          />
        )
      ) : null}
    </div>
  );
}
