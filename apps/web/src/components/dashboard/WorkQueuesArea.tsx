'use client';

import { useId, useState } from 'react';
import { formatRelativeTime, type PlatformQueueSnapshot } from '@iwana/shared';
import { Badge, Button, Card, EmptyState, ErrorState, SkeletonBlock } from '@iwana/ui';
import {
  formatWaitingAge,
  queueLabel,
  recentFailed,
  summarizeWorkQueues,
} from '@/lib/platform-health';
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

/**
 * B3 · Colas de trabajo (P2): espera, fallidos y antigüedad por cola, con nombre en español.
 * Muestra solo las colas con novedad; las demás quedan resumidas tras «Ver todas».
 */
export function WorkQueuesArea({
  queues,
  sampledAt,
  isLoading,
  error,
  onRetry,
}: WorkQueuesAreaProps) {
  const all = queues ?? [];
  const work = summarizeWorkQueues(all);
  const [showAll, setShowAll] = useState(false);
  const tableId = useId();
  const rows = showAll ? all : work.withNews;

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
  } else if (all.length === 0) {
    body = <EmptyState className="mt-3" message={COPY.queuesEmpty} />;
  } else {
    const toggle =
      work.quietCount > 0 ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
          <span>{COPY.queuesQuiet(work.quietCount)}</span>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={showAll}
            aria-controls={tableId}
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? COPY.queuesShowNews : COPY.queuesShowAll}
          </Button>
        </div>
      ) : null;
    body =
      rows.length === 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {COPY.queuesAllQuiet(all.length)}
          </p>
          <Button variant="ghost" size="sm" aria-expanded={false} onClick={() => setShowAll(true)}>
            {COPY.queuesShowAll}
          </Button>
        </div>
      ) : (
        <>
          <table id={tableId} className="mt-3 w-full text-sm">
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
                  <td className="py-1.5 text-right tabular-nums">
                    {NUMBER.format(recentFailed(q))}
                    {q.failed > recentFailed(q) ? (
                      <span className="block text-xs text-gray-600 dark:text-gray-300">
                        {COPY.queuesFailedTotal(q.failed)}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatWaitingAge(q.oldestWaitingSeconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {toggle}
        </>
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
        {!isLoading && !error && work.state !== 'clear' ? (
          <Badge variant="warning">
            {work.state === 'failed' ? COPY.queuesFailed : COPY.queuesBacklog}
          </Badge>
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
