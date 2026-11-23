'use client';

import { useId, useRef } from 'react';
import { Check, ChevronRight, Circle, Pencil, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Badge, Button, Card, cn, interactiveFocusClassName } from '@iwana/ui';
import { formatFullName, UserStatus, type PlatformUserDirectoryEntry } from '@iwana/shared';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { getWebUserRoleLabel, getWebUserStatusLabel } from '@/lib/user-labels';

const COPY = PLATFORM_UI_COPY.platformUserDirectory;
const ACCESS_DATE = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeZone: 'America/Bogota',
});

function accountName(account: PlatformUserDirectoryEntry) {
  return formatFullName(account.firstName, account.lastName).trim() || COPY.noName;
}

function Avatar({ account }: { account: PlatformUserDirectoryEntry }) {
  const initials = [account.firstName, account.lastName]
    .map((part) => Array.from(part?.trim() ?? '')[0] ?? '')
    .join('')
    .toLocaleUpperCase('es-CO');
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-iwana-surface-soft text-xs font-semibold text-iwana-primary dark:bg-dark-surface-3 dark:text-white"
    >
      {initials || '–'}
    </span>
  );
}

function ActivationStep({ label, done }: { label: string; done: boolean }) {
  const Icon = done ? Check : Circle;
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full',
          done
            ? 'bg-iwana-secondary-100 text-iwana-secondary-900 dark:bg-iwana-secondary-900 dark:text-iwana-secondary-100'
            : 'bg-iwana-surface-soft text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300',
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span>{label}</span>
      <span className="sr-only"> · {done ? COPY.completedStep : COPY.pendingStep}</span>
    </li>
  );
}

export function PlatformUserActivationPanel({
  accounts,
  total,
  selected,
  onSelect,
  onEdit,
  pagination,
}: {
  accounts: PlatformUserDirectoryEntry[];
  total: number;
  selected: PlatformUserDirectoryEntry;
  onSelect: (id: string) => void;
  onEdit?: () => void;
  pagination?: React.ReactNode;
}) {
  const detailId = useId();
  const headingId = useId();
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const pending = selected.status === UserStatus.PENDING_VERIFICATION;
  const status = pending ? COPY.pendingActivation : getWebUserStatusLabel(selected.status);
  const MfaIcon = selected.mfaEnabled ? ShieldCheck : ShieldAlert;
  const groups = [
    {
      label: COPY.pendingGroup,
      entries: accounts.filter((account) => account.status === UserStatus.PENDING_VERIFICATION),
    },
    {
      label: COPY.activeGroup,
      entries: accounts.filter((account) => account.status === UserStatus.ACTIVE),
    },
    {
      label: COPY.otherGroup,
      entries: accounts.filter(
        (account) =>
          account.status !== UserStatus.PENDING_VERIFICATION &&
          account.status !== UserStatus.ACTIVE,
      ),
    },
  ];

  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Card variant="outline" className="min-w-0 p-3 sm:p-4">
        <h2 className="px-2 pb-3 text-base font-semibold text-iwana-primary dark:text-white">
          {COPY.total(total)}
        </h2>
        <ul className="space-y-1" aria-label={COPY.title}>
          {groups.flatMap(({ label, entries }) =>
            entries.map((account, index) => {
              const active = selected.id === account.id;
              return (
                <li key={account.id}>
                  {index === 0 && (
                    <h3 className="px-2 pt-2 pb-1 text-sm font-semibold text-gray-600 dark:text-gray-300">
                      {label}
                    </h3>
                  )}
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-controls={detailId}
                    onClick={() => {
                      onSelect(account.id);
                      if (window.matchMedia('(width < 48rem)').matches) {
                        window.requestAnimationFrame(() => detailHeading.current?.focus());
                      }
                    }}
                    className={cn(
                      'relative flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                      active
                        ? 'border-iwana-primary-100 bg-iwana-primary-50 dark:border-dark-border-2 dark:bg-dark-surface-3'
                        : 'border-transparent hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3',
                      interactiveFocusClassName,
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-iwana-secondary"
                      />
                    )}
                    <Avatar account={account} />
                    <span className="min-w-0 flex-1 wrap-break-word">
                      <span className="block font-semibold text-iwana-primary dark:text-white">
                        {accountName(account)}
                      </span>
                      <span className="block text-xs text-gray-600 dark:text-gray-300">
                        {getWebUserRoleLabel(account.role)}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-gray-500 dark:text-gray-300"
                    />
                  </button>
                </li>
              );
            }),
          )}
        </ul>
        {pagination}
      </Card>

      <Card
        variant="outline"
        role="region"
        id={detailId}
        aria-labelledby={headingId}
        className="min-w-0 p-4 sm:p-5 md:sticky md:top-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar account={selected} />
            <div className="min-w-0 wrap-break-word">
              <h2
                id={headingId}
                ref={detailHeading}
                tabIndex={-1}
                className="scroll-mt-4 text-lg font-semibold text-iwana-primary dark:text-white"
              >
                {accountName(selected)}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {getWebUserRoleLabel(selected.role)}
              </p>
            </div>
          </div>
          <Badge
            variant={
              pending ? 'warning' : selected.status === UserStatus.ACTIVE ? 'success' : 'neutral'
            }
          >
            {status}
          </Badge>
        </div>
        <dl className="mt-5 grid gap-4 border-y border-gray-200 py-4 text-sm min-[26rem]:grid-cols-2 dark:border-dark-border-2">
          <div>
            <dt className="mb-1 text-xs text-gray-600 dark:text-gray-300">
              {COPY.twoStepVerification}
            </dt>
            <dd className="flex items-start gap-1.5">
              <MfaIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {selected.mfaEnabled ? COPY.mfaEnabled : COPY.mfaDisabled}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-xs text-gray-600 dark:text-gray-300">{COPY.activity}</dt>
            <dd>
              {selected.lastLoginAt ? (
                <time dateTime={selected.lastLoginAt}>
                  {ACCESS_DATE.format(new Date(selected.lastLoginAt))}
                </time>
              ) : (
                COPY.noAccess
              )}
            </dd>
          </div>
        </dl>
        {pending && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-iwana-primary dark:text-white">
              {COPY.activation}
            </h3>
            <ol className="mt-2 space-y-2">
              <ActivationStep done label={COPY.accountCreated} />
              <ActivationStep
                done={!selected.passwordResetRequired}
                label={selected.passwordResetRequired ? COPY.passwordPending : COPY.passwordChanged}
              />
              <ActivationStep
                done={selected.mfaEnabled}
                label={selected.mfaEnabled ? COPY.mfaEnabled : COPY.verificationPending}
              />
            </ol>
          </div>
        )}
        {onEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 min-h-11"
            onClick={onEdit}
          >
            <Pencil aria-hidden="true" className="size-4" /> {COPY.edit.action}
          </Button>
        )}
      </Card>
    </div>
  );
}
