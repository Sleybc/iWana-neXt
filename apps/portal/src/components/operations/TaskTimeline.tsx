import type { OperationalTaskTimelineEvent } from '@/lib/api-client';
import { formatTaskDateTime, TASK_TIMELINE_EVENT_LABELS } from './operations-labels';

export interface TaskTimelineProps {
  events: OperationalTaskTimelineEvent[];
}

export function TaskTimeline({ events }: TaskTimelineProps) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-950 dark:text-white">Timeline</h3>
      {events.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">Sin eventos registrados.</p>
      ) : (
        <ol className="space-y-2 border-l border-gray-200 pl-4 dark:border-gray-800">
          {events.map((event) => (
            <li key={event.id} className="text-sm">
              <p className="font-medium text-gray-950 dark:text-white">
                {TASK_TIMELINE_EVENT_LABELS[event.eventType]}
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                {formatTaskDateTime(event.occurredAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
