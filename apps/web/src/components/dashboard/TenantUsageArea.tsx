'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import type { TenantUsageItem } from '@iwana/shared';
import {
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  ErrorState,
  interactiveFocusClassName,
  SkeletonBlock,
  StackedBar,
} from '@iwana/ui';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { summarizeTenantUsage, usageDisplayPercent, usageTone } from '@/lib/tenant-usage';

const COPY = PLATFORM_UI_COPY.dashboard;
const NUMBER = new Intl.NumberFormat('es-CO');
/** ADR-114 D5: una medición de más de 2 h se marca desactualizada. */
export const USAGE_STALE_MS = 2 * 60 * 60 * 1000;
/** Tope de filas visibles, igual que la cola de atención (dirección v1.2 §8.2). */
export const USAGE_VISIBLE_ROWS = 6;

export function isUsageStale(measuredAt: string | null, now: number = Date.now()): boolean {
  if (!measuredAt) return false;
  const at = Date.parse(measuredAt);
  return Number.isFinite(at) && now - at > USAGE_STALE_MS;
}

interface TenantUsageAreaProps {
  items: readonly TenantUsageItem[] | null;
  isLoading: boolean;
  error: boolean;
  onRetry: () => void;
  className?: string;
}

/** B3 · Uso por empresa (P4, ADR-114): suscriptores activos sobre el cupo contratado. */
export function TenantUsageArea({
  items,
  isLoading,
  error,
  onRetry,
  className,
}: TenantUsageAreaProps) {
  const { rows, state } = summarizeTenantUsage(items);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hidden = rows.length - USAGE_VISIBLE_ROWS;
  const visibleRows = expanded || hidden <= 0 ? rows : rows.slice(0, USAGE_VISIBLE_ROWS);
  const now = Date.now();

  let body;
  if (isLoading) {
    body = (
      <div className="mt-3 space-y-2" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={`usage-skeleton-${index}`} className="h-4 w-full rounded" />
        ))}
      </div>
    );
  } else if (error || !items) {
    body = (
      <ErrorState
        className="mt-3"
        message={COPY.usageError}
        onRetry={onRetry}
        retryLabel={COPY.retry}
      />
    );
  } else if (rows.length === 0) {
    body = <EmptyState className="mt-3" message={COPY.usageEmpty} />;
  } else {
    body = (
      <>
        <ul id={listId} className="mt-3 space-y-2 text-sm">
          {visibleRows.map((item) => (
            <UsageRow key={item.tenantId} item={item} stale={isUsageStale(item.measuredAt, now)} />
          ))}
        </ul>
        {hidden > 0 ? (
          // F4-D5: se expande en el sitio, como Colas de trabajo; no se persiste en la URL.
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
            {expanded ? <span /> : <span>{COPY.usageMore(hidden)}</span>}
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? COPY.usageShowLess : COPY.usageShowAll}
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <Card
      role="region"
      className={cn('flex h-full flex-col p-4', className)}
      aria-labelledby="uso-por-empresa"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="uso-por-empresa"
          className="text-base font-semibold text-iwana-primary dark:text-white"
        >
          {COPY.usageTitle}
        </h2>
        {!isLoading && !error && state !== 'clear' ? (
          <Badge variant={state === 'reached' ? 'error' : 'warning'}>
            {state === 'reached' ? COPY.usageQuotaReached : COPY.usageNearQuota}
          </Badge>
        ) : null}
      </div>
      {body}
      {!isLoading && !error && items ? (
        <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-xs text-gray-600 dark:text-gray-300">
          <span>{COPY.usageFooter}</span>
          <Link
            href="/tenants?status=ACTIVE"
            className={cn(
              'inline-flex min-h-11 items-center text-sm font-medium text-iwana-primary dark:text-white',
              interactiveFocusClassName,
            )}
          >
            {COPY.usageLink}
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

function UsageRow({ item, stale }: { item: TenantUsageItem; stale: boolean }) {
  const pct = usageDisplayPercent(item);
  const tone = usageTone(item);
  const active = item.activeSubscribers;

  let figure: string;
  let visual = null;
  if (active === null) {
    // CA-PP4-02: sin medición es «sin dato», nunca 0.
    figure = COPY.usageNoData;
  } else if (item.maxSubscribers === 0) {
    // Cupo 0 = no admite nuevos suscriptores (migración 007); nunca se divide por cero.
    figure = COPY.usageSubscribers(NUMBER.format(active));
    visual = (
      <span className="min-w-0 flex-1">
        <Badge variant={active > 0 ? 'error' : 'warning'}>{COPY.usageClosed}</Badge>
      </span>
    );
  } else if (pct === null || tone === null || item.maxSubscribers === null) {
    figure = COPY.usageSubscribers(NUMBER.format(active));
  } else {
    figure = COPY.usagePercent(pct);
    const used = Math.min(active, item.maxSubscribers);
    visual = (
      <StackedBar
        size="sm"
        className="min-w-0 flex-1"
        ariaLabel={COPY.usageBarLabel(
          item.name,
          NUMBER.format(active),
          NUMBER.format(item.maxSubscribers),
          pct,
        )}
        segments={[
          { key: 'used', label: item.name, value: used, tone },
          {
            key: 'free',
            label: COPY.usageNoQuota,
            value: item.maxSubscribers - used,
            tone: 'neutral',
            emphasis: 'soft',
          },
        ]}
      />
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="w-28 min-w-0 truncate text-gray-900 dark:text-white" title={item.name}>
        {item.name}
      </span>
      {visual ?? <span className="min-w-0 flex-1" />}
      <span
        className={cn(
          'font-mono tabular-nums',
          active === null
            ? 'text-gray-600 dark:text-gray-300'
            : 'font-semibold text-gray-900 dark:text-white',
        )}
      >
        {figure}
      </span>
      {stale ? (
        <Badge variant="warning" className="basis-full sm:basis-auto">
          {COPY.usageStale}
        </Badge>
      ) : null}
    </li>
  );
}
