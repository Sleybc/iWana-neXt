import { formatRelativeTime, type PlatformQueueSnapshot } from '@iwana/shared';
import { Badge, Card, EmptyState, ErrorState, SkeletonBlock } from '@iwana/ui';
import { formatWaitingAge, queueLabel } from '@/lib/platform-health';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const COPY = PLATFORM_UI_COPY.dashboard;
const NUMBER = new Intl.NumberFormat('es-CO');

interface WorkQueuesAreaProps {
  queues: readonly PlatformQueueSnapshot[] | null;
  sampledAt: string | null;
  isLoading: boolean;
  error: boolean;
  onRetry: () => void;
}

/** B3 · Colas de trabajo (P2): espera, fallidos y antigüedad por cola, con nombre en español. */
export function WorkQueuesArea({
  queues,
  sampledAt,
  isLoading,
  error,
  onRetry,
}: WorkQueuesAreaProps) {
  const rows = queues ?? [];
  const backlog = rows.some((q) => q.waiting > 0 || q.failed > 0);

  let body;
  if (isLoading) {
    body = (
      <div className="mt-3 space-y-2" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={`queues-skeleton-${index}`} className="h-4 w-full rounded" />
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <ErrorState
        className="mt-3"
        message={COPY.queuesError}
        onRetry={onRetry}
        retryLabel={COPY.retry}
      />
    );
  } else if (rows.length === 0) {
    body = <EmptyState className="mt-3" message={COPY.queuesEmpty} />;
  } else {
    body = (
      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">{COPY.queuesTitle}</caption>
        <thead>
          <tr className="text-left text-xs text-gray-600 dark:text-gray-300">
            <th scope="col" className="pb-1 font-medium">
              {COPY.queuesColName}
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              {COPY.queuesColWaiting}
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              {COPY.queuesColFailed}
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              {COPY.queuesColOldest}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.name} className="border-t border-gray-100 dark:border-dark-border">
              <th
                scope="row"
                className="py-1.5 pr-2 text-left font-normal text-gray-900 dark:text-white"
              >
                {queueLabel(q.name)}
              </th>
              <td className="py-1.5 text-right tabular-nums">{NUMBER.format(q.waiting)}</td>
              <td className="py-1.5 text-right tabular-nums">{NUMBER.format(q.failed)}</td>
              <td className="py-1.5 text-right tabular-nums">
                {formatWaitingAge(q.oldestWaitingSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <Card role="region" className="flex h-full flex-col p-4" aria-labelledby="colas-de-trabajo">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="colas-de-trabajo"
          className="text-base font-semibold text-iwana-primary dark:text-white"
        >
          {COPY.queuesTitle}
        </h2>
        {!isLoading && !error && backlog ? (
          <Badge variant="warning">{COPY.queuesBacklog}</Badge>
        ) : null}
      </div>
      {sampledAt && !error ? (
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
          {COPY.queuesSampled(formatRelativeTime(sampledAt))}
        </p>
      ) : null}
      {body}
    </Card>
  );
}
