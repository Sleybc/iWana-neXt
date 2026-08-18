'use client';

import { Badge } from '@iwana/ui';
import type { OperationalTaskRecord } from '@/lib/api-client';
import {
  PortalResultsStrip,
  PortalDataTableHead,
  PortalTablePagination,
  interactiveFocusClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatTaskDateTime,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  getTaskTypeLabel,
  TASK_STATUS_VARIANTS,
} from './operations-labels';

export interface TasksTableProps {
  tasks: OperationalTaskRecord[];
  onSelect?: (task: OperationalTaskRecord) => void;
  selectedTaskId?: string | null;
  totalCount?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

function formatTasksResultsLabel(loaded: number, total: number, hasMore: boolean): string {
  const resource = total === 1 ? 'tarea' : 'tareas';
  if (hasMore) {
    return `${loaded} de ${total} ${resource}`;
  }
  return `${total} ${resource}`;
}

export function TasksTable({
  tasks,
  onSelect,
  selectedTaskId,
  totalCount,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: TasksTableProps) {
  const resolvedTotal = totalCount ?? tasks.length;
  const resultsLabel = formatTasksResultsLabel(tasks.length, resolvedTotal, hasMore);

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-300">
        No hay tareas operativas para los filtros actuales.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />
      <div className={portalDataTableShellClassName}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className={portalDataTableHeadRowClassName}>
              <tr>
                <PortalDataTableHead>Número</PortalDataTableHead>
                <PortalDataTableHead>Título</PortalDataTableHead>
                <PortalDataTableHead>Tipo</PortalDataTableHead>
                <PortalDataTableHead>Estado</PortalDataTableHead>
                <PortalDataTableHead>Prioridad</PortalDataTableHead>
                <PortalDataTableHead>Destinatario</PortalDataTableHead>
                <PortalDataTableHead>Creada</PortalDataTableHead>
              </tr>
            </thead>
            <tbody className={portalDataTableBodyClassName}>
              {tasks.map((task) => (
                <tr
                  key={task.id}
                  className={`${portalTableRowHoverClassName} ${
                    selectedTaskId === task.id
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
                    {onSelect ? (
                      <button
                        type="button"
                        className={`text-left text-inherit underline-offset-4 hover:underline ${interactiveFocusClassName}`}
                        onClick={() => onSelect(task)}
                      >
                        {task.title}
                      </button>
                    ) : (
                      task.title
                    )}
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
                    className={`${portalDataTableCellClassName} text-gray-600 dark:text-gray-400`}
                  >
                    {formatTaskDateTime(task.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {onLoadMore ? (
          <PortalTablePagination
            hasMore={hasMore}
            onLoadMore={onLoadMore}
            loading={isLoadingMore}
            resourceLabel="tareas"
            shown={tasks.length}
            total={resolvedTotal}
          />
        ) : null}
      </div>
    </div>
  );
}
