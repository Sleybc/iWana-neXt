'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  cn,
  interactiveFocusClassName,
  type PulseCellData,
} from '@iwana/ui';
import { X } from 'lucide-react';
import { TenantDirectoryPulse } from '@/components/tenants/TenantDirectoryPulse';
import {
  TenantsTable,
  type SortDir,
  type SortField,
  type StatusFilterValue,
} from '@/components/tenants/TenantsTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { TENANT_ATTENTION_STATUSES, type TenantStatusSummary } from '@iwana/shared';
import { ApiError, tenantApi, type TenantListItem } from '@/lib/api-client';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';
import { useRetryFocus } from '@/lib/use-retry-focus';
import { PICKER_SOFT_CAP } from '@/lib/picker-soft-cap';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

type TenantConfirmAction = {
  type: 'suspend' | 'activate';
  id: string;
};

/** ADR-064 analogía web: page size / soft-cap previo → load-more por offset. */
const TENANTS_PAGE_SIZE = PICKER_SOFT_CAP;
const SEARCH_DEBOUNCE_MS = 300;

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
  const tenantsRef = useRef<TenantListItem[]>([]);

  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [parkSummary, setParkSummary] = useState<TenantStatusSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isParkLoading, setIsParkLoading] = useState(true);
  const [parkError, setParkError] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tableFocus = useRetryFocus<HTMLHeadingElement, HTMLDivElement>(isLoading, Boolean(error));
  const pulseFocus = useRetryFocus<HTMLDivElement, HTMLDivElement>(isParkLoading, parkError);
  const directoryTitleRef = tableFocus.resultsRef;
  const [announcement, setAnnouncement] = useState('');
  const announceNext = useRef(false);
  // La URL es la única fuente de verdad de los filtros. Antes había un espejo
  // en estado sincronizado en las dos direcciones y entraba en ping-pong.
  const statusFilter = parseStatusFilter(searchParams.get('status'));
  const sortField = parseSortField(searchParams.get('sort'));
  const sortDir = parseSortDir(searchParams.get('dir'));
  const urlSearch = searchParams.get('search')?.trim() ?? '';
  // El buscador conserva lo tecleado mientras la URL se actualiza con retardo.
  const [searchInput, setSearchInput] = useState(urlSearch);
  const lastWrittenSearchRef = useRef(urlSearch);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<TenantConfirmAction | null>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const successDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  tenantsRef.current = tenants;

  const updateUrl = useCallback(
    (patch: Partial<Record<'search' | 'status' | 'sort' | 'dir', string | null>>) => {
      const query = mergeUrlSearchParams(new URLSearchParams(window.location.search), patch);
      if (query === new URLSearchParams(window.location.search).toString()) {
        return;
      }
      router.replace(withSearchParams(pathname, query), { scroll: false });
    },
    [pathname, router],
  );

  // Navegación externa (atrás, chips, enlaces): la URL manda sobre el buscador,
  // salvo que el cambio lo hayamos escrito nosotros.
  useEffect(() => {
    if (urlSearch !== lastWrittenSearchRef.current) {
      lastWrittenSearchRef.current = urlSearch;
      setSearchInput(urlSearch);
    }
  }, [urlSearch]);

  useEffect(() => {
    const next = searchInput.trim();
    if (next === lastWrittenSearchRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      lastWrittenSearchRef.current = next;
      updateUrl({ search: next || null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, updateUrl]);

  const handleStatusFilterChange = useCallback(
    (value: StatusFilterValue) => updateUrl({ status: value === 'TODAS' ? null : value }),
    [updateUrl],
  );

  const handleSortChange = useCallback(
    (field: SortField, dir: SortDir) =>
      updateUrl({
        sort: field === 'createdAt' ? null : field,
        dir: field === 'createdAt' && dir === 'desc' ? null : dir,
      }),
    [updateUrl],
  );

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
  }, []);

  const loadParkSummary = useCallback(async () => {
    try {
      setIsParkLoading(true);
      setParkSummary(await tenantApi.summary());
      setParkError(false);
    } catch {
      // F1-D1: sin resumen la franja dice que falló; nunca pinta 0 como dato.
      setParkSummary(null);
      setParkError(true);
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
        const search = urlSearch;
        const response = await tenantApi.list({
          limit: TENANTS_PAGE_SIZE,
          offset,
          ...(statusFilter !== 'TODAS' ? { status: statusFilter } : {}),
          ...(search ? { search } : {}),
        });
        setTenants((current) => (append ? [...current, ...response] : response));
        setHasMore(response.length === TENANTS_PAGE_SIZE);
        if (!append && announceNext.current) {
          announceNext.current = false;
          setAnnouncement(
            PLATFORM_UI_COPY.tenants.found(response.length, response.length === TENANTS_PAGE_SIZE),
          );
        }
      } catch {
        announceNext.current = false;
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
    [urlSearch, statusFilter],
  );

  // Cada búsqueda (ya con retardo) o filtro nuevo anuncia su resultado; la carga inicial no.
  const lastFiltersRef = useRef(`${urlSearch}|${statusFilter}`);
  useEffect(() => {
    const filters = `${urlSearch}|${statusFilter}`;
    if (filters === lastFiltersRef.current) return;
    lastFiltersRef.current = filters;
    announceNext.current = true;
    setAnnouncement('');
  }, [urlSearch, statusFilter]);

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
        console.error('Error retrying provisioning.');
        await Promise.all([loadTenants(), loadParkSummary()]);

        const copy = PLATFORM_UI_COPY.tenants;
        let message: string = copy.actionError;
        if (err instanceof ApiError && err.status === 409) {
          if (err.code === 'TENANT_PROVISIONING_IN_PROGRESS') {
            message = copy.retryInProgress;
          } else if (err.code === 'TENANT_NOT_RETRYABLE') {
            message = copy.retryNotAllowed;
          }
        }
        showNotification('error', message);
      }
    },
    [loadParkSummary, loadTenants, showNotification, upsertTenantInState],
  );

  const focusDirectory = useCallback(() => {
    directoryTitleRef.current?.focus();
  }, [directoryTitleRef]);

  const pulseCells = useMemo<PulseCellData[]>(() => {
    const current = new URLSearchParams(searchParams.toString());
    const byStatus = parkSummary?.byStatus;
    const active = byStatus ? (byStatus.ACTIVE ?? 0) : null;
    const provisioning = byStatus ? (byStatus.PROVISIONING ?? 0) : null;
    const attention = byStatus
      ? TENANT_ATTENTION_STATUSES.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0)
      : null;
    const copy = PLATFORM_UI_COPY.dashboard;
    const { filterDirectory, focusDirectory: focusLabel } = PLATFORM_UI_COPY.tenants;

    return [
      {
        id: 'active',
        label: copy.chipActive,
        value: active,
        state: 'idle',
        href: active ? tenantsStatusHref('ACTIVE', current) : undefined,
        actionLabel: copy.viewActiveCompanies,
        hint: active ? filterDirectory : undefined,
      },
      {
        id: 'provisioning',
        label: copy.chipProvisioning,
        value: provisioning,
        state: 'idle',
        href: provisioning ? tenantsStatusHref('PROVISIONING', current) : undefined,
        actionLabel: copy.viewProvisioningCompanies,
        hint: provisioning ? filterDirectory : undefined,
      },
      {
        id: 'attention',
        label: copy.chipAttention,
        value: attention,
        state: 'idle',
        onClick: attention ? focusDirectory : undefined,
        actionLabel: focusLabel,
        hint: attention ? focusLabel : undefined,
      },
    ];
  }, [focusDirectory, parkSummary, searchParams]);

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
    <div className="space-y-5">
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
      <p role="status" className="sr-only">
        {announcement}
      </p>

      <TenantDirectoryPulse
        cells={pulseCells}
        isLoading={isParkLoading}
        hasError={parkError}
        onRetry={pulseFocus.track(() => void loadParkSummary())}
        focusRef={(node) => {
          pulseFocus.resultsRef.current = node;
          pulseFocus.errorRef.current = node;
        }}
      />

      <TenantsTable
        tenants={tableRows}
        isLoading={isLoading}
        error={error}
        onRetry={tableFocus.track(() => void loadTenants())}
        errorRef={tableFocus.errorRef}
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        onSuspend={handleSuspend}
        onActivate={handleActivate}
        onRetryProvisioning={handleRetryProvisioning}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => void loadTenants({ append: true })}
        sortField={sortField}
        sortDir={sortDir}
        onSortChange={handleSortChange}
        titleRef={directoryTitleRef}
      />
    </div>
  );
}
