import Link from 'next/link';
import {
  Card,
  cn,
  EmptyState,
  ErrorState,
  interactiveFocusClassName,
  SkeletonBlock,
} from '@iwana/ui';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

export interface RecentActivityItem {
  id: string;
  label: string;
  dateTime: string;
  relative: string;
}

interface RecentActivityPanelProps {
  items: RecentActivityItem[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function RecentActivityPanel({
  items,
  isLoading,
  error,
  onRetry,
}: RecentActivityPanelProps) {
  return (
    <Card role="region" aria-labelledby="actividad-reciente" className="w-full p-5">
      <h2
        id="actividad-reciente"
        className="text-base font-semibold text-iwana-primary dark:text-white"
      >
        {PLATFORM_UI_COPY.dashboard.activityTitle}
      </h2>

      {isLoading ? (
        <div className="mt-4 space-y-3" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={`activity-skeleton-${index}`} className="h-4 w-full rounded" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          className="mt-4"
          message={error}
          onRetry={onRetry}
          retryLabel={PLATFORM_UI_COPY.dashboard.retry}
        />
      ) : items.length === 0 ? (
        <EmptyState className="mt-4" message={PLATFORM_UI_COPY.dashboard.activityEmpty} />
      ) : (
        <ol className="relative mt-4 border-l border-gray-200 dark:border-dark-border">
          {items.map((item, index) => (
            <li key={item.id} className="relative ml-4 pb-4 last:pb-0">
              <span
                className={cn(
                  'absolute -left-5.25 top-1.5 h-2 w-2 rounded-full',
                  index === 0 ? 'bg-iwana-primary' : 'bg-iwana-primary/20',
                )}
                aria-hidden="true"
              />
              <p className="text-sm text-gray-700 dark:text-gray-200">{item.label}</p>
              <time
                dateTime={item.dateTime}
                className="mt-1 block font-mono text-xs tabular-nums text-gray-600 dark:text-gray-300"
              >
                {item.relative}
              </time>
            </li>
          ))}
        </ol>
      )}

      {!isLoading && !error ? (
        <div className="mt-4">
          <Link
            href="/audit-logs"
            className={cn(
              'inline-flex min-h-11 items-center text-sm font-medium text-iwana-primary dark:text-white',
              interactiveFocusClassName,
            )}
          >
            {PLATFORM_UI_COPY.dashboard.activityFooter}
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
