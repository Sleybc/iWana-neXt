'use client';

import { Badge } from '@iwana/ui';
import type { OperationalTaskRecord } from '@/lib/api-client';
import {
  PortalResultsStrip,
  PortalTablePagination,
  interactiveFocusClassName,
  portalDataTableShellClassName,
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
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
            <thead className="bg-gray-50 dark:bg-dark-surface-2">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400"
                >
                  Número
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400"
                >
                  Título
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400"
                >
                  Tipo
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400"
                >
                  Estado
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400"
                >
                  Prioridad
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400"
                >
                  Destinatario
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400"
                >
                  Creada
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2">
              {tasks.map((task) => (
                <tr
                  key={task.id}
                  className={
                    selectedTaskId === task.id
                      ? 'bg-iwana-primary-50/60 dark:bg-iwana-primary-950/30'
                      : undefined
                  }
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                    {task.taskNumber}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-950 dark:text-white">
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
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {getTaskTypeLabel(task.type)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={TASK_STATUS_VARIANTS[task.status]}>
                      {getTaskStatusLabel(task.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {getTaskPriorityLabel(task.priority)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {task.recipientLabel ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
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
