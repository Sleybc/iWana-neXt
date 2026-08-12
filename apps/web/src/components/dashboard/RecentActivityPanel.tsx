import Link from 'next/link';
import {
  Alert,
  AlertDescription,
  Button,
  cn,
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
    <section
      aria-labelledby="actividad-reciente"
      className="w-full rounded-2xl border border-gray-200 bg-white p-5 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2"
    >
      <h3
        id="actividad-reciente"
        className="text-base font-semibold text-iwana-primary dark:text-white"
      >
        {PLATFORM_UI_COPY.dashboard.activityTitle}
      </h3>

      {isLoading ? (
        <div className="mt-4 space-y-3" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={`activity-skeleton-${index}`} className="h-4 w-full rounded" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-4">
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
            {onRetry ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={onRetry}
              >
                {PLATFORM_UI_COPY.dashboard.retry}
              </Button>
            ) : null}
          </Alert>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
          {PLATFORM_UI_COPY.dashboard.activityEmpty}
        </p>
      ) : (
        <ol className="relative mt-4 border-l border-gray-200 dark:border-dark-border">
          {items.map((item, index) => (
            <li key={item.id} className="relative ml-4 pb-4 last:pb-0">
              <span
                className={cn(
                  'absolute -left-[21px] top-1.5 h-2 w-2 rounded-full',
                  index === 0 ? 'bg-iwana-secondary' : 'bg-iwana-primary/20',
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
    </section>
  );
}
