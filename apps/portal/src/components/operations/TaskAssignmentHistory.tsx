import type { OperationalTaskAssignmentHistoryRecord } from '@/lib/api-client';
import { formatTaskDateTime } from './operations-labels';

export interface TaskAssignmentHistoryProps {
  records: OperationalTaskAssignmentHistoryRecord[];
  resolveResponsibleLabel?: ((value: string | null | undefined) => string) | undefined;
}

export function TaskAssignmentHistory({
  records,
  resolveResponsibleLabel,
}: TaskAssignmentHistoryProps) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
        Historial de reasignaciones
      </h3>
      {records.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">Sin reasignaciones registradas.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {records.map((record) => (
            <li
              key={record.id}
              className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
            >
              <p className="font-medium text-gray-950 dark:text-white">
                {resolveResponsibleLabel?.(record.previousResponsibleRefId) ??
                  record.previousResponsibleRefId}{' '}
                →{' '}
                {resolveResponsibleLabel?.(record.newResponsibleRefId) ??
                  record.newResponsibleRefId}
              </p>
              {record.reason && <p className="text-gray-600 dark:text-gray-300">{record.reason}</p>}
              <p className="text-gray-500 dark:text-gray-400">
                {formatTaskDateTime(record.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
