import Link from 'next/link';
import { formatRelativeTime } from '@iwana/shared';
import {
  Badge,
  Card,
  cn,
  EmptyState,
  ErrorState,
  interactiveFocusClassName,
  SkeletonBlock,
} from '@iwana/ui';
import type { TenantListItem } from '@/lib/api-client';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { labelForTenantStatus, variantForTenantStatus } from '@/lib/tenant-status-label';

const COPY = PLATFORM_UI_COPY.dashboard;

const shortDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });

interface LatestTenantsPanelProps {
  tenants: readonly TenantListItem[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const linkClassName = cn(
  'inline-flex min-h-11 items-center text-sm font-medium text-iwana-primary dark:text-white',
  interactiveFocusClassName,
);

/** B4 · Últimas empresas: tabla en tarjeta, 5 filas, sin paginador. */
export function LatestTenantsPanel({
  tenants,
  isLoading,
  error,
  onRetry,
}: LatestTenantsPanelProps) {
  return (
    <Card role="region" aria-labelledby="ultimas-empresas" className="w-full p-5">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="ultimas-empresas"
          className="text-base font-semibold text-iwana-primary dark:text-white"
        >
          {COPY.latestTitle}
        </h2>
        {!isLoading && !error ? (
          <Link href="/tenants" className={linkClassName}>
            {COPY.latestFooter}
          </Link>
        ) : null}
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={`latest-skeleton-${index}`} className="h-6 w-full rounded" />
          ))}
        </div>
      ) : error ? (
        <ErrorState className="mt-4" message={error} onRetry={onRetry} retryLabel={COPY.retry} />
      ) : tenants.length === 0 ? (
        <EmptyState className="mt-4" message={COPY.latestEmpty} />
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{COPY.latestTitle}</caption>
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-600 dark:border-dark-border dark:text-gray-300">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {COPY.latestColCompany}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {COPY.latestColStatus}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {COPY.latestColCreated}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {COPY.latestColUpdated}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td className="py-1 pr-3">
                    <Link href={`/tenants/${tenant.id}/settings`} className={linkClassName}>
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="py-1 pr-3">
                    <Badge variant={variantForTenantStatus(tenant.status)}>
                      {labelForTenantStatus(tenant.status, { form: 'singular' })}
                    </Badge>
                  </td>
                  <td className="py-1 pr-3 font-mono text-xs tabular-nums text-gray-600 dark:text-gray-300">
                    <time dateTime={tenant.createdAt}>
                      {shortDate.format(new Date(tenant.createdAt))}
                    </time>
                  </td>
                  <td className="py-1 text-xs text-gray-600 dark:text-gray-300">
                    <time dateTime={tenant.updatedAt}>{formatRelativeTime(tenant.updatedAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
