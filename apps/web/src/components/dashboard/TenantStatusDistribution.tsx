import Link from 'next/link';
import type { Ref } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  cn,
  interactiveFocusClassName,
  SkeletonBlock,
} from '@iwana/ui';
import { describeTenantDirectorySummary } from '@/lib/tenant-directory-summary';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

export type TenantStatusKey =
  | 'ACTIVE'
  | 'PROVISIONING'
  | 'PROVISIONING_FAILED'
  | 'SUSPENDED'
  | 'INACTIVE'
  | 'MARKED_FOR_DELETION';

export type StatusTone = 'success' | 'warning' | 'error' | 'neutral';

export interface StatusSegment {
  key: TenantStatusKey;
  label: string;
  count: number;
  tone: StatusTone;
  hiddenWhenZero?: boolean;
}

interface TenantStatusDistributionProps {
  segments: StatusSegment[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
  titleRef?: Ref<HTMLHeadingElement>;
}

const FILL_CLASS: Record<StatusTone, string> = {
  success: 'bg-success-500',
  warning: 'bg-amber-500',
  error: 'bg-error-500',
  neutral: 'bg-gray-400 dark:bg-gray-500',
};

const VALUE_CLASS: Record<StatusTone, string> = {
  success: 'text-success-700 dark:text-success-400',
  warning: 'text-amber-700 dark:text-amber-400',
  error: 'text-error-700 dark:text-error-400',
  neutral: 'text-gray-600 dark:text-gray-400',
};

const TILE_BG_CLASS: Record<StatusTone, string> = {
  success: 'bg-success-50 dark:bg-dark-surface-3/30',
  warning: 'bg-amber-50 dark:bg-dark-surface-3/30',
  error: 'bg-error-50 dark:bg-dark-surface-3/30',
  neutral: 'bg-gray-50 dark:bg-dark-surface-3/80',
};

const tileShellClassName =
  'flex h-full min-h-24 flex-col rounded-2xl border border-transparent p-3';

const STATUS_HINT: Record<TenantStatusKey, string> = {
  ACTIVE: PLATFORM_UI_COPY.dashboard.statusHintActive,
  PROVISIONING: PLATFORM_UI_COPY.dashboard.statusHintProvisioning,
  PROVISIONING_FAILED: PLATFORM_UI_COPY.dashboard.statusHintFailed,
  SUSPENDED: PLATFORM_UI_COPY.dashboard.statusHintSuspended,
  INACTIVE: PLATFORM_UI_COPY.dashboard.statusHintInactive,
  MARKED_FOR_DELETION: PLATFORM_UI_COPY.dashboard.statusHintDeletion,
};

export function TenantStatusDistribution({
  segments,
  isLoading,
  error,
  onRetry,
  titleRef,
}: TenantStatusDistributionProps) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const countByKey = (key: TenantStatusKey) =>
    segments.find((segment) => segment.key === key)?.count ?? 0;
  const summary = describeTenantDirectorySummary(
    {
      active: countByKey('ACTIVE'),
      provisioning: countByKey('PROVISIONING'),
      failed: countByKey('PROVISIONING_FAILED'),
      suspended: countByKey('SUSPENDED'),
      inactive: countByKey('INACTIVE'),
      markedForDeletion: countByKey('MARKED_FOR_DELETION'),
    },
    total,
  );
  const barSegments = segments.filter((segment) => segment.count > 0);
  const legendSegments = segments.filter((segment) => !segment.hiddenWhenZero || segment.count > 0);
  const barAriaLabel = barSegments
    .map((segment) => `${segment.count} ${segment.label.toLowerCase()}`)
    .join(', ');
  const showReading = !isLoading && !error && total > 0;

  return (
    <section
      className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2"
      aria-labelledby="empresas-por-estado"
    >
      <div className="border-b border-gray-100 pb-4 dark:border-dark-border">
        <p className="portal-eyebrow">{PLATFORM_UI_COPY.dashboard.statusEyebrow}</p>
        <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h3
              id="empresas-por-estado"
              ref={titleRef}
              tabIndex={-1}
              className="text-base font-semibold text-iwana-primary outline-none dark:text-white"
            >
              {PLATFORM_UI_COPY.dashboard.statusTitle}
            </h3>
            {showReading ? (
              <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{summary}</p>
            ) : null}
          </div>
          {showReading ? (
            <div className="rounded-2xl bg-iwana-surface-soft px-3 py-2 text-xs text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300">
              {PLATFORM_UI_COPY.dashboard.statusTotalLabel}
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-iwana-primary dark:text-white">
                {total === 1 ? '1 empresa' : `${total} empresas`}
              </p>
            </div>
          ) : null}
        </div>
        {showReading ? (
          <div
            role="img"
            aria-label={barAriaLabel}
            className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-dark-surface-3"
          >
            {barSegments.map((segment) => (
              <span
                key={segment.key}
                style={{ width: `${(segment.count / total) * 100}%` }}
                className={cn('h-full', FILL_CLASS[segment.tone])}
              />
            ))}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={`status-legend-skeleton-${index}`} className="h-20 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-4 flex flex-1 flex-col justify-center">
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
      ) : total === 0 ? (
        <div className="mt-4 flex flex-1 flex-col justify-center">
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
            {PLATFORM_UI_COPY.dashboard.statusEmpty}
          </p>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {PLATFORM_UI_COPY.dashboard.statusEmptyHint}
          </p>
          <Button asChild variant="secondary" size="sm" className="mt-3">
            <Link href="/tenants/new">{PLATFORM_UI_COPY.dashboard.statusEmptyCta}</Link>
          </Button>
        </div>
      ) : (
        <>
          <ul className="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            {legendSegments.map((segment) => {
              const tileClassName = cn(tileShellClassName, TILE_BG_CLASS[segment.tone]);
              const content = (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('h-2.5 w-2.5 shrink-0 rounded-full', FILL_CLASS[segment.tone])}
                      aria-hidden="true"
                    />
                    <span className={cn('text-xs font-medium', VALUE_CLASS[segment.tone])}>
                      {segment.label}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                    {segment.count}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                    {STATUS_HINT[segment.key]}
                  </p>
                </>
              );

              if (segment.count > 0) {
                return (
                  <li key={segment.key} className="h-full">
                    <Link
                      href={`/tenants?status=${segment.key}`}
                      aria-label={`${segment.label}: ${segment.count}`}
                      className={cn(tileClassName, interactiveFocusClassName)}
                    >
                      {content}
                    </Link>
                  </li>
                );
              }

              return (
                <li key={segment.key} className={tileClassName}>
                  {content}
                </li>
              );
            })}
          </ul>

          <div className="mt-auto pt-4">
            <Link
              href="/tenants"
              className={cn(
                'inline-flex min-h-11 items-center text-sm font-medium text-iwana-primary dark:text-white',
                interactiveFocusClassName,
              )}
            >
              {PLATFORM_UI_COPY.dashboard.statusFooter}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
