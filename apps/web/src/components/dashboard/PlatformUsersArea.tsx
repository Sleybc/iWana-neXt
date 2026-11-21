import Link from 'next/link';
import { PlatformRole, type PlatformUsersSummary } from '@iwana/shared';
import {
  Badge,
  Card,
  cn,
  EmptyState,
  ErrorState,
  interactiveFocusClassName,
  SkeletonBlock,
  StackedBar,
  type Tone,
} from '@iwana/ui';
import { getWebUserRoleLabel } from '@/lib/user-labels';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const COPY = PLATFORM_UI_COPY.dashboard;

const ROLE_TONE: Record<PlatformRole, Extract<Tone, 'primary' | 'neutral'>> = {
  [PlatformRole.SYSTEM_ADMIN]: 'primary',
  [PlatformRole.IWANA_SUPPORT]: 'neutral',
};

interface PlatformUsersAreaProps {
  summary: PlatformUsersSummary | null;
  isLoading: boolean;
  error: boolean;
  onRetry: () => void;
}

/** B3 · Usuarios internos (P3): por rol, sin verificación en dos pasos y sin acceso en 30 días. */
export function PlatformUsersArea({ summary, isLoading, error, onRetry }: PlatformUsersAreaProps) {
  const needsAttention =
    summary !== null && (summary.withoutMfa > 0 || summary.withoutAccess30d > 0);
  const roles = Object.values(PlatformRole).map((role) => ({
    key: role,
    label: getWebUserRoleLabel(role),
    value: summary?.byRole[role] ?? 0,
    tone: ROLE_TONE[role],
  }));

  return (
    <Card role="region" className="flex h-full flex-col p-4" aria-labelledby="usuarios-internos">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="usuarios-internos"
          className="text-base font-semibold text-iwana-primary dark:text-white"
        >
          {COPY.usersTitle}
        </h2>
        {needsAttention ? <Badge variant="warning">{COPY.queueAttention}</Badge> : null}
      </div>

      {isLoading ? (
        <div className="mt-3 space-y-2" aria-hidden="true">
          <SkeletonBlock className="h-2 w-full rounded-full" />
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={`users-skeleton-${index}`} className="h-4 w-full rounded" />
          ))}
        </div>
      ) : error || !summary ? (
        <ErrorState
          className="mt-3"
          message={COPY.usersError}
          onRetry={onRetry}
          retryLabel={COPY.retry}
        />
      ) : summary.total === 0 ? (
        <EmptyState className="mt-3" message={COPY.usersEmpty} />
      ) : (
        <>
          <StackedBar
            className="mt-3"
            size="sm"
            ariaLabel={roles.map((role) => `${role.label}: ${role.value}`).join(', ')}
            segments={roles}
          />
          <dl className="mt-3 space-y-1.5 text-sm">
            {roles.map((role) => (
              <Row key={role.key} label={role.label} value={role.value} />
            ))}
            <Row label={COPY.usersWithoutMfa} value={summary.withoutMfa} />
            <Row label={COPY.usersWithoutAccess} value={summary.withoutAccess30d} />
          </dl>
          <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-xs text-gray-600 dark:text-gray-300">
            <span>{COPY.usersTotal(summary.total)}</span>
            <Link
              href="/platform-users"
              className={cn(
                'inline-flex min-h-11 items-center text-sm font-medium text-iwana-primary dark:text-white',
                interactiveFocusClassName,
              )}
            >
              {COPY.usersFooter}
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="min-w-0 flex-1 text-gray-700 dark:text-gray-200">{label}</dt>
      <dd className="font-mono font-semibold tabular-nums text-gray-900 dark:text-white">
        {value}
      </dd>
    </div>
  );
}
