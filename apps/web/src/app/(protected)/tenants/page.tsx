'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, cn, interactiveFocusClassName } from '@iwana/ui';
import { X } from 'lucide-react';
import { SignalChips, type SignalChipModel } from '@/components/dashboard/SignalChips';
import {
  TenantsTable,
  type SortDir,
  type SortField,
  type StatusFilterValue,
} from '@/components/dashboard/TenantsTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { tenantApi, type TenantListItem } from '@/lib/api-client';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';
import { PICKER_SOFT_CAP } from '@/lib/picker-soft-cap';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

type TenantConfirmAction = {
  type: 'suspend' | 'activate';
  id: string;
};

/** ADR-064 analogía web: page size / soft-cap previo → load-more por offset. */
const TENANTS_PAGE_SIZE = PICKER_SOFT_CAP;

const VALID_STATUS_FILTERS = new Set<StatusFilterValue>([
  'TODAS',
  'ACTIVE',
  'PROVISIONING',
  'PROVISIONING_FAILED',
  'SUSPENDED',
  'INACTIVE',
  'MARKED_FOR_DELETION',
]);

const VALID_SORT_FIELDS = new Set<SortField>(['name', 'status', 'updatedAt', 'createdAt']);
const VALID_SORT_DIRS = new Set<SortDir>(['asc', 'desc']);

function parseStatusFilter(value: string | null): StatusFilterValue {
  if (!value) return 'TODAS';
  return VALID_STATUS_FILTERS.has(value as StatusFilterValue)
    ? (value as StatusFilterValue)
    : 'TODAS';
}

function parseSortField(value: string | null): SortField {
  return VALID_SORT_FIELDS.has(value as SortField) ? (value as SortField) : 'createdAt';
}

function parseSortDir(value: string | null): SortDir {
  return VALID_SORT_DIRS.has(value as SortDir) ? (value as SortDir) : 'desc';
}

function tenantsStatusHref(status: 'ACTIVE' | 'PROVISIONING', current: URLSearchParams): string {
  return withSearchParams('/tenants', mergeUrlSearchParams(current, { status }));
}

export default function TenantsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const directoryTitleRef = useRef<HTMLParagraphElement>(null);
  const tenantsRef = useRef<TenantListItem[]>([]);

  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [parkTenants, setParkTenants] = useState<TenantListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isParkLoading, setIsParkLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search')?.trim() ?? '');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(() =>
    parseStatusFilter(searchParams.get('status')),
  );
  const [sortField, setSortField] = useState<SortField>(() =>
    parseSortField(searchParams.get('sort')),
  );
  const [sortDir, setSortDir] = useState<SortDir>(() => parseSortDir(searchParams.get('dir')));
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<TenantConfirmAction | null>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const successDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  tenantsRef.current = tenants;

  useEffect(() => {
    const nextStatus = parseStatusFilter(searchParams.get('status'));
    const nextSearch = searchParams.get('search')?.trim() ?? '';
    const nextSort = parseSortField(searchParams.get('sort'));
    const nextDir = parseSortDir(searchParams.get('dir'));
    setStatusFilter((current) => (current === nextStatus ? current : nextStatus));
    setSearchQuery((current) => (current === nextSearch ? current : nextSearch));
    setSortField((current) => (current === nextSort ? current : nextSort));
    setSortDir((current) => (current === nextDir ? current : nextDir));
  }, [searchParams]);

  useEffect(() => {
    const query = mergeUrlSearchParams(searchParams, {
      search: searchQuery.trim() || null,
      status: statusFilter === 'TODAS' ? null : statusFilter,
      sort: sortField === 'createdAt' ? null : sortField,
      dir: sortField === 'createdAt' && sortDir === 'desc' ? null : sortDir,
    });
    const current = searchParams.toString();
    if (query === current) {
      return;
    }
    router.replace(withSearchParams(pathname, query), { scroll: false });
  }, [pathname, router, searchParams, searchQuery, statusFilter, sortField, sortDir]);

  const clearSuccessDismissTimer = useCallback(() => {
    if (successDismissTimerRef.current) {
      clearTimeout(successDismissTimerRef.current);
      successDismissTimerRef.current = null;
    }
  }, []);

  const showNotification = useCallback(
    (type: 'success' | 'error', message: string) => {
      clearSuccessDismissTimer();
      setNotification({ type, message });
      if (type === 'success') {
        successDismissTimerRef.current = setTimeout(() => {
          setNotification(null);
          successDismissTimerRef.current = null;
        }, 3000);
      }
    },
    [clearSuccessDismissTimer],
  );

  useEffect(() => {
    return () => {
      clearSuccessDismissTimer();
    };
  }, [clearSuccessDismissTimer]);

  const upsertTenantInState = useCallback((tenant: TenantListItem) => {
    const merge = (current: TenantListItem[]) =>
      current.map((item) => (item.id === tenant.id ? { ...item, ...tenant } : item));
    setTenants(merge);
    setParkTenants(merge);
  }, []);

  const loadParkSummary = useCallback(async () => {
    try {
      setIsParkLoading(true);
      const response = await tenantApi.list({ limit: TENANTS_PAGE_SIZE, offset: 0 });
      setParkTenants(response);
    } catch {
      setParkTenants([]);
    } finally {
      setIsParkLoading(false);
    }
  }, []);

  const loadTenants = useCallback(
    async (options?: { append?: boolean }) => {
      const append = options?.append === true;
      try {
        if (append) {
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
        }
        setError(null);
        const offset = append ? tenantsRef.current.length : 0;
        const search = searchQuery.trim();
        const response = await tenantApi.list({
          limit: TENANTS_PAGE_SIZE,
          offset,
          ...(statusFilter !== 'TODAS' ? { status: statusFilter } : {}),
          ...(search ? { search } : {}),
        });
        setTenants((current) => (append ? [...current, ...response] : response));
        setHasMore(response.length === TENANTS_PAGE_SIZE);
      } catch {
        setError(PLATFORM_UI_COPY.dashboard.directoryError);
        if (!append) {
          setTenants([]);
          setHasMore(false);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [searchQuery, statusFilter],
  );

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    void loadParkSummary();
  }, [loadParkSummary]);

  const executeSuspend = useCallback(
    async (id: string) => {
      try {
        await tenantApi.suspend(id);
        await Promise.all([loadTenants(), loadParkSummary()]);
        showNotification('success', PLATFORM_UI_COPY.tenants.suspendSuccess);
      } catch (err) {
        console.error('Error suspending tenant:', err);
        showNotification('error', PLATFORM_UI_COPY.tenants.actionError);
      }
    },
    [loadParkSummary, loadTenants, showNotification],
  );

  const executeActivate = useCallback(
    async (id: string) => {
      try {
        await tenantApi.activate(id);
        await Promise.all([loadTenants(), loadParkSummary()]);
        showNotification('success', PLATFORM_UI_COPY.tenants.activateSuccess);
      } catch (err) {
        console.error('Error activating tenant:', err);
        showNotification('error', PLATFORM_UI_COPY.tenants.actionError);
      }
    },
    [loadParkSummary, loadTenants, showNotification],
  );

  const handleSuspend = useCallback((id: string) => {
    setPendingConfirm({ type: 'suspend', id });
  }, []);

  const handleActivate = useCallback((id: string) => {
    setPendingConfirm({ type: 'activate', id });
  }, []);

  const handleConfirmPending = useCallback(async () => {
    if (!pendingConfirm) {
      return;
    }

    setIsConfirmingAction(true);
    try {
      if (pendingConfirm.type === 'suspend') {
        await executeSuspend(pendingConfirm.id);
      } else {
        await executeActivate(pendingConfirm.id);
      }
    } finally {
      setIsConfirmingAction(false);
      setPendingConfirm(null);
    }
  }, [executeActivate, executeSuspend, pendingConfirm]);

  const handleRetryProvisioning = useCallback(
    async (id: string) => {
      try {
        setTenants((current) =>
          current.map((tenant) =>
            tenant.id === id
              ? {
                  ...tenant,
                  status: 'PROVISIONING',
                  updatedAt: new Date().toISOString(),
                }
              : tenant,
          ),
        );

        const retriedTenant = await tenantApi.retryProvisioning(id);
        upsertTenantInState(retriedTenant);

        const resolvedTenant = await tenantApi.waitForProvisioning(id, {
          maxAttempts: 10,
          onTick: upsertTenantInState,
        });

        upsertTenantInState(resolvedTenant);

        if (resolvedTenant.status === 'PROVISIONING_FAILED') {
          showNotification('error', PLATFORM_UI_COPY.tenants.actionError);
          return;
        }

        showNotification('success', PLATFORM_UI_COPY.tenants.retrySuccess);
      } catch (err) {
        console.error('Error retrying provisioning:', err);
        await Promise.all([loadTenants(), loadParkSummary()]);
        showNotification('error', PLATFORM_UI_COPY.tenants.actionError);
      }
    },
    [loadParkSummary, loadTenants, showNotification, upsertTenantInState],
  );

  const focusDirectory = useCallback(() => {
    const heading = directoryTitleRef.current;
    if (!heading) {
      return;
    }

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.focus({ preventScroll: reduceMotion });
    if (!reduceMotion && typeof heading.scrollIntoView === 'function') {
      heading.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  const kpiCounts = useMemo(() => {
    const active = parkTenants.filter((tenant) => tenant.status === 'ACTIVE').length;
    const provisioning = parkTenants.filter((tenant) => tenant.status === 'PROVISIONING').length;
    const attention = parkTenants.filter((tenant) =>
      ['PROVISIONING_FAILED', 'SUSPENDED', 'INACTIVE', 'MARKED_FOR_DELETION'].includes(
        tenant.status,
      ),
    ).length;

    return { active, provisioning, attention };
  }, [parkTenants]);

  const signalChips = useMemo<SignalChipModel[]>(() => {
    const current = new URLSearchParams(searchParams.toString());

    return [
      {
        id: 'active',
        label: PLATFORM_UI_COPY.dashboard.chipActive,
        count: kpiCounts.active,
        accent: 'primary',
        href: tenantsStatusHref('ACTIVE', current),
        ariaLabel: PLATFORM_UI_COPY.dashboard.viewActiveCompanies,
      },
      {
        id: 'provisioning',
        label: PLATFORM_UI_COPY.dashboard.chipProvisioning,
        count: kpiCounts.provisioning,
        accent: 'warning',
        href: tenantsStatusHref('PROVISIONING', current),
        ariaLabel: PLATFORM_UI_COPY.dashboard.viewProvisioningCompanies,
      },
      {
        id: 'attention',
        label: PLATFORM_UI_COPY.dashboard.chipAttention,
        count: kpiCounts.attention,
        accent: 'danger',
        ariaLabel: PLATFORM_UI_COPY.tenants.focusDirectory,
        onActivate: focusDirectory,
      },
    ];
  }, [focusDirectory, kpiCounts.active, kpiCounts.attention, kpiCounts.provisioning, searchParams]);

  const tableRows = useMemo(
    () =>
      tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        contactEmail: tenant.contactEmail,
        updatedAt: tenant.updatedAt,
        createdAt: tenant.createdAt,
      })),
    [tenants],
  );

  const pendingTenantName =
    pendingConfirm != null
      ? (tenants.find((tenant) => tenant.id === pendingConfirm.id)?.name ?? 'esta empresa')
      : '';

  return (
    <div className="space-y-6">
      {notification ? (
        <Alert
          variant={notification.type === 'error' ? 'error' : 'success'}
          className="flex items-start justify-between gap-3"
        >
          <AlertDescription className="mt-0">{notification.message}</AlertDescription>
          <button
            type="button"
            onClick={() => {
              clearSuccessDismissTimer();
              setNotification(null);
            }}
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
              interactiveFocusClassName,
            )}
            aria-label="Cerrar notificación"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </Alert>
      ) : null}

      <ConfirmDialog
        open={pendingConfirm?.type === 'suspend'}
        title="Suspender empresa"
        description={
          <>
            Se suspenderá <strong>{pendingTenantName}</strong>. Los usuarios de esa empresa no
            podrán acceder hasta que se reactive.
          </>
        }
        confirmLabel="Sí, suspender"
        isConfirming={isConfirmingAction}
        onConfirm={() => {
          void handleConfirmPending();
        }}
        onCancel={() => setPendingConfirm(null)}
      />

      <ConfirmDialog
        open={pendingConfirm?.type === 'activate'}
        title="Reactivar empresa"
        description={
          <>
            Se reactivará <strong>{pendingTenantName}</strong> y sus usuarios recuperarán el acceso
            según su estado individual.
          </>
        }
        confirmLabel="Sí, reactivar"
        isConfirming={isConfirmingAction}
        onConfirm={() => {
          void handleConfirmPending();
        }}
        onCancel={() => setPendingConfirm(null)}
      />

      <PageHeader
        title={PLATFORM_UI_COPY.navigation.tenants}
        subtitle={PLATFORM_UI_COPY.tenants.subtitle}
      />

      {isLoading ? <span className="sr-only">{PLATFORM_UI_COPY.tenants.loading}</span> : null}

      <SignalChips
        chips={signalChips}
        isLoading={isParkLoading}
        eyebrow={PLATFORM_UI_COPY.tenants.eyebrow}
        ariaLabel={PLATFORM_UI_COPY.tenants.eyebrow}
        skeletonCount={3}
      />

      <TenantsTable
        tenants={tableRows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void loadTenants()}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onSuspend={handleSuspend}
        onActivate={handleActivate}
        onRetryProvisioning={handleRetryProvisioning}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => void loadTenants({ append: true })}
        sortField={sortField}
        sortDir={sortDir}
        onSortChange={(field, dir) => {
          setSortField(field);
          setSortDir(dir);
        }}
        titleRef={directoryTitleRef}
      />
    </div>
  );
}
