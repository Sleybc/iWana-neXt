'use client';

import { Badge } from '@iwana/ui';
import type { OperationalTaskRecord } from '@/lib/api-client';
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
}

export function TasksTable({ tasks, onSelect, selectedTaskId }: TasksTableProps) {
  if (tasks.length === 0) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-300">
        No hay tareas operativas para los filtros actuales.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-200"
            >
              Número
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-200"
            >
              Título
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-200"
            >
              Tipo
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-200"
            >
              Estado
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-200"
            >
              Prioridad
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-200"
            >
              Destinatario
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-200"
            >
              Creada
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-900 dark:bg-gray-950">
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
                    className="text-left text-inherit underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary-500"
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
  );
}
