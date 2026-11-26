'use client';

import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, Input, Select, SkeletonBlock } from '@iwana/ui';
import {
  PlatformRole,
  UserStatus,
  type PlatformUserDirectory,
  type PlatformUserDirectoryEntry,
} from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { PlatformUserActivationPanel } from '@/components/platform-users/PlatformUserActivationPanel';
import { PlatformUserCreateDialog } from '@/components/platform-users/PlatformUserCreateDialog';
import { PlatformUserNameDialog } from '@/components/platform-users/PlatformUserNameDialog';
import { platformUsersApi } from '@/lib/api-client';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const COPY = PLATFORM_UI_COPY.platformUserDirectory;
const STATUS_OPTIONS = [
  { value: '' as const, label: COPY.allStatuses },
  { value: UserStatus.PENDING_VERIFICATION, label: COPY.pendingGroup },
  { value: UserStatus.ACTIVE, label: COPY.activeGroup },
  { value: UserStatus.SUSPENDED, label: COPY.suspendedGroup },
  { value: UserStatus.INACTIVE, label: COPY.inactiveGroup },
];

export default function PlatformUsersPage() {
  const { user, refreshProfile } = useAuth();
  const canEdit = user?.type === 'platform' && user.role === PlatformRole.SYSTEM_ADMIN;
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [retry, setRetry] = useState(0);
  const [directory, setDirectory] = useState<PlatformUserDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<PlatformUserDirectoryEntry | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void platformUsersApi
      .directory(page, {
        ...(search && { search }),
        ...(status && { status }),
      })
      .then(
        (result) => {
          if (!active) return;
          const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
          if (page > lastPage) {
            setPage(lastPage);
            return;
          }
          setDirectory(result);
          setLoading(false);
        },
        () => {
          if (!active) return;
          setError(true);
          setLoading(false);
        },
      );
    return () => {
      active = false;
    };
  }, [page, retry, search, status]);

  function resetResults() {
    setPage(1);
    setSelectedId(null);
  }

  const filtered = Boolean(search || status);
  const totalPages = directory ? Math.ceil(directory.total / directory.pageSize) : 0;
  const selected =
    directory?.items.find((account) => account.id === selectedId) ?? directory?.items[0];

  return (
    <div className="space-y-4">
      <PageHeader
        title={PLATFORM_UI_COPY.navigation.users}
        subtitle={COPY.description}
        actions={
          canEdit ? (
            <Button type="button" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" className="size-4" />
              {COPY.create.action}
            </Button>
          ) : undefined
        }
      />
      <Card variant="outline" className="p-4">
        <form
          role="search"
          aria-label={COPY.listLabel}
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const value = searchInput.trim().replace(/\s+/g, ' ');
            if (value !== search) {
              setSearch(value);
              resetResults();
            }
          }}
        >
          <Input
            type="search"
            label={COPY.searchLabel}
            placeholder={COPY.searchPlaceholder}
            startIcon={<Search className="size-4" aria-hidden="true" />}
            value={searchInput}
            maxLength={201}
            onChange={(event) => setSearchInput(event.target.value)}
            containerClassName="w-full min-w-0 sm:max-w-sm sm:flex-1 sm:basis-48"
            className="min-h-11"
          />
          <div className="w-full sm:w-56">
            <Select
              label={COPY.statusFilter}
              options={STATUS_OPTIONS}
              value={status}
              onChange={(event) => {
                const option = STATUS_OPTIONS.find(({ value }) => value === event.target.value);
                if (option) {
                  setStatus(option.value);
                  resetResults();
                }
              }}
              className="min-h-11"
            />
          </div>
          <Button type="submit" variant="secondary" className="min-h-11">
            {COPY.searchAction}
          </Button>
          {(filtered || searchInput) && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setSearchInput('');
                setSearch('');
                setStatus('');
                resetResults();
              }}
            >
              {COPY.clearFilters}
            </Button>
          )}
        </form>
      </Card>
      {nameSaved && (
        <p role="status" className="text-sm">
          {COPY.edit.saved}
        </p>
      )}
      <div aria-busy={loading}>
        {loading && (
          <div role="status" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <span className="sr-only">{COPY.loading}</span>
            <SkeletonBlock className="h-56 w-full rounded-2xl" />
            <SkeletonBlock className="h-56 w-full rounded-2xl" />
          </div>
        )}
        {!loading && error && (
          <Card variant="outline" className="p-4 sm:p-6">
            <ErrorState
              message={COPY.error}
              onRetry={() => setRetry((value) => value + 1)}
              retryLabel={PLATFORM_UI_COPY.dashboard.retry}
            />
          </Card>
        )}
        {!loading && !error && directory && !selected && (
          <Card variant="outline" className="p-4 sm:p-6">
            <EmptyState message={filtered ? COPY.emptyFiltered : COPY.empty} />
          </Card>
        )}
        {!loading && !error && directory && selected && (
          <PlatformUserActivationPanel
            accounts={directory.items}
            total={directory.total}
            selected={selected}
            onSelect={setSelectedId}
            {...(canEdit
              ? {
                  onEdit: () => {
                    setNameSaved(false);
                    setEditing(selected);
                  },
                }
              : {})}
            pagination={
              totalPages > 1 && (
                <nav
                  aria-label={COPY.pagination}
                  className="mt-4 flex flex-wrap items-center justify-between gap-2"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    {COPY.previous}
                  </Button>
                  <span className="text-sm">{COPY.page(page, totalPages)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    {COPY.next}
                  </Button>
                </nav>
              )
            }
          />
        )}
      </div>
      {canEdit && creating && (
        <PlatformUserCreateDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setSearchInput('');
            setSearch('');
            setStatus('');
            setSelectedId(id);
            setPage(1);
            setRetry((value) => value + 1);
          }}
        />
      )}
      {canEdit && editing && (
        <PlatformUserNameDialog
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            if (editing.id === user.id) void refreshProfile();
            setEditing(null);
            setNameSaved(true);
            setRetry((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
