import Link from 'next/link';
import type { Ref } from 'react';
import {
  Button,
  Card,
  cn,
  EmptyState,
  ErrorState,
  interactiveFocusClassName,
  SkeletonBlock,
  StackedBar,
  toneFillVariants,
  toneMutedTextVariants,
  toneSurfaceVariants,
  toneTextVariants,
  type Tone,
} from '@iwana/ui';
import { describeTenantDirectorySummary } from '@/lib/tenant-directory-summary';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import type { TenantStatus } from '@/lib/tenant-status-label';

/** Tono de un estado del directorio; subconjunto de `Tone` del DS (contrato 2026-11-21 §2). */
export type StatusTone = Extract<Tone, 'success' | 'warning' | 'error' | 'neutral'>;

export interface StatusSegment {
  key: TenantStatus;
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
  /** `compact`: barra y leyenda en una columna, sin frase ni baldosas (contrato DS v1.3 §7bis.4). */
  density?: 'default' | 'compact';
}

const tileShellClassName = 'flex h-full min-h-24 flex-col rounded-2xl border p-3';

const STATUS_HINT: Record<TenantStatus, string> = {
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
  density = 'default',
}: TenantStatusDistributionProps) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const countByKey = (key: TenantStatus) =>
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
  const legendSegments = segments.filter((segment) => !segment.hiddenWhenZero || segment.count > 0);
  const showReading = !isLoading && !error && total > 0;

  if (density === 'compact') {
    return (
      <CompactDistribution
        segments={legendSegments}
        total={total}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        titleRef={titleRef}
      />
    );
  }

  return (
    <Card role="region" className="flex h-full flex-col p-5" aria-labelledby="empresas-por-estado">
      <div className="border-b border-gray-100 pb-4 dark:border-dark-border">
        <p className="portal-eyebrow">{PLATFORM_UI_COPY.dashboard.statusEyebrow}</p>
        <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h2
              id="empresas-por-estado"
              ref={titleRef}
              tabIndex={-1}
              className="text-base font-semibold text-iwana-primary outline-none dark:text-white"
            >
              {PLATFORM_UI_COPY.dashboard.statusTitle}
            </h2>
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
          <StackedBar
            className="mt-3"
            size="md"
            ariaLabel={PLATFORM_UI_COPY.dashboard.statusTitle}
            segments={segments.map((segment) => ({
              key: segment.key,
              label: segment.label,
              value: segment.count,
              tone: segment.tone,
            }))}
          />
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
          <ErrorState
            message={error}
            onRetry={onRetry}
            retryLabel={PLATFORM_UI_COPY.dashboard.retry}
          />
        </div>
      ) : total === 0 ? (
        <EmptyDirectory className="mt-4 flex flex-1 flex-col justify-center" />
      ) : (
        <>
          <ul className="mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            {legendSegments.map((segment) => {
              const tileClassName = cn(
                tileShellClassName,
                toneSurfaceVariants({ tone: segment.tone }),
              );
              const content = (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        toneFillVariants({ tone: segment.tone }),
                      )}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        'text-xs font-medium',
                        toneTextVariants({ tone: segment.tone }),
                      )}
                    >
                      {segment.label}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                    {segment.count}
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-xs leading-5',
                      toneMutedTextVariants({ tone: segment.tone }),
                    )}
                  >
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
    </Card>
  );
}

function EmptyDirectory({ className }: { className?: string }) {
  return (
    <EmptyState
      className={className}
      message={
        <>
          {PLATFORM_UI_COPY.dashboard.statusEmpty}
          <span className="mt-1 block text-gray-500 dark:text-gray-400">
            {PLATFORM_UI_COPY.dashboard.statusEmptyHint}
          </span>
        </>
      }
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/tenants/new">{PLATFORM_UI_COPY.dashboard.statusEmptyCta}</Link>
        </Button>
      }
    />
  );
}

function CompactDistribution({
  segments,
  total,
  isLoading,
  error,
  onRetry,
  titleRef,
}: {
  /** Ya sin los tramos `hiddenWhenZero` a 0 (§7bis.4). */
  segments: StatusSegment[];
  total: number;
  isLoading: boolean;
  error?: string | null | undefined;
  onRetry?: (() => void) | undefined;
  titleRef?: Ref<HTMLHeadingElement> | undefined;
}) {
  const COPY = PLATFORM_UI_COPY.dashboard;

  return (
    <Card role="region" className="flex h-full flex-col p-4" aria-labelledby="empresas-por-estado">
      <h2
        id="empresas-por-estado"
        ref={titleRef}
        tabIndex={-1}
        className="text-base font-semibold text-iwana-primary outline-none dark:text-white"
      >
        {COPY.companiesTitle}
      </h2>

      {isLoading ? (
        <div className="mt-3 space-y-2" aria-hidden="true">
          <SkeletonBlock className="h-2 w-full rounded-full" />
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock
              key={`status-compact-skeleton-${index}`}
              className="h-4 w-full rounded"
            />
          ))}
        </div>
      ) : error ? (
        <ErrorState className="mt-3" message={error} onRetry={onRetry} retryLabel={COPY.retry} />
      ) : total === 0 ? (
        <EmptyDirectory className="mt-3" />
      ) : (
        <>
          <StackedBar
            className="mt-3"
            size="sm"
            ariaLabel={COPY.statusTitle}
            segments={segments.map((segment) => ({
              key: segment.key,
              label: segment.label,
              value: segment.count,
              tone: segment.tone,
            }))}
          />
          <dl className="mt-3 space-y-1.5">
            {segments.map((segment) => (
              <div key={segment.key} className="flex items-center gap-2 text-sm">
                <dt className="flex min-w-0 flex-1 items-center gap-2 text-gray-700 dark:text-gray-200">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 shrink-0 rounded-full',
                      toneFillVariants({ tone: segment.tone }),
                    )}
                    aria-hidden="true"
                  />
                  {/* Mismo destino que las baldosas de la variante default: un tramo en 0 no es control. */}
                  {segment.count > 0 ? (
                    <Link
                      href={`/tenants?status=${segment.key}`}
                      aria-label={`${segment.label}: ${segment.count}`}
                      className={cn(
                        'inline-flex min-h-6 items-center rounded hover:underline',
                        interactiveFocusClassName,
                      )}
                    >
                      {segment.label}
                    </Link>
                  ) : (
                    segment.label
                  )}
                </dt>
                <dd className="font-mono font-semibold tabular-nums text-gray-900 dark:text-white">
                  {segment.count}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-xs text-gray-600 dark:text-gray-300">
            <span>{COPY.companiesTotal(total)}</span>
            <Link
              href="/tenants"
              className={cn(
                'inline-flex min-h-11 items-center text-sm font-medium text-iwana-primary dark:text-white',
                interactiveFocusClassName,
              )}
            >
              {COPY.companiesFooter}
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}
