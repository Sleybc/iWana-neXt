'use client';

// Página Historial de cambios — alineada a UX/DS congelados (CA-AUD / CA-FR).
import { ApiError } from '@/lib/api-client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  interactiveFocusClassName,
} from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { PlatformTenantPicker } from '@/components/shared/PlatformTenantPicker';
import { AuditLogsTable } from '@/components/audit/AuditLogsTable';
import { AuditSummary } from '@/components/audit/AuditSummary';
import type { TenantInfo } from '@/components/audit/AuditSummary';
import {
  filterEntriesInSummaryWindow,
  formatSummaryFilterChip,
  matchesSummaryPreset,
  type SummaryPreset,
} from '@/components/audit/summary-presets';
import {
  auditApi,
  platformAuditApi,
  tenantApi,
  type AuditCsvExportParams,
  type AuditLogEntry,
  type AuditLogQueryParams,
  type TenantListItem,
} from '@/lib/api-client';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';
import {
  AUDIT_LIST_MAX_LIMIT,
  PLATFORM_DEFAULT_PAGE_SIZE,
  parsePlatformPageSize,
} from '@/lib/platform-page-size';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const SUMMARY_LIMIT = AUDIT_LIST_MAX_LIMIT;

/** YYYY-MM-DD → ISO UTC inicio/fin de día calendario (alineado a ejemplos OpenAPI). */
function localDateToIsoStart(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return `${value}T00:00:00.000Z`;
}

function localDateToIsoEnd(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return `${value}T23:59:59.999Z`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

type ViewMode = 'basic' | 'technical';
type AuditScope = 'platform' | 'tenant';

type BaseAuditEntry = Pick<
  AuditLogEntry,
  | 'id'
  | 'action'
  | 'entityType'
  | 'entityId'
  | 'userId'
  | 'actor'
  | 'ipAddress'
  | 'userAgent'
  | 'requestId'
  | 'oldValue'
  | 'newValue'
  | 'createdAt'
>;

function parseViewMode(value: string | null): ViewMode {
  return value === 'technical' ? 'technical' : 'basic';
}

function parseAuditScope(value: string | null): AuditScope {
  return value === 'empresa' || value === 'tenant' ? 'tenant' : 'platform';
}

function useAuditTable(initialEntries: BaseAuditEntry[] = []) {
  const [entries, setEntries] = useState<BaseAuditEntry[]>(initialEntries);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadEntries = useCallback(
    async (
      fetchFn: () => Promise<{ data: BaseAuditEntry[]; nextCursor: string | null | undefined }>,
    ) => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await fetchFn();
        setEntries(result.data);
        setNextCursor(result.nextCursor ?? undefined);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : PLATFORM_UI_COPY.audit.loadError;
        setLoadError(message);
        setEntries([]);
        setNextCursor(undefined);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setCursor(undefined);
    setCursorHistory([]);
    setNextCursor(undefined);
  }, []);

  const handleNext = () => {
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev, cursor ?? '']);
    setCursor(nextCursor);
  };

  const handlePrev = () => {
    const previousCursor = cursorHistory[cursorHistory.length - 1];
    const restoredCursor = previousCursor === '' ? undefined : previousCursor;
    setCursorHistory((prev) => prev.slice(0, -1));
    setCursor(restoredCursor);
  };

  return {
    entries,
    cursor,
    cursorHistory,
    nextCursor,
    isLoading,
    loadError,
    loadEntries,
    reset,
    handleNext,
    handlePrev,
    setEntries,
    setNextCursor,
  };
}

export default function AuditLogsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tableTitleRef = useRef<HTMLHeadingElement>(null);

  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [tenantSlug, setTenantSlug] = useState(() => searchParams.get('tenant')?.trim() ?? '');

  const [viewMode, setViewMode] = useState<ViewMode>(() => parseViewMode(searchParams.get('view')));

  const [actionFilter, setActionFilter] = useState(() => searchParams.get('action')?.trim() ?? '');
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('from')?.trim() ?? '');
  const [dateTo, setDateTo] = useState(() => searchParams.get('to')?.trim() ?? '');
  const [pageSize, setPageSize] = useState(() => parsePlatformPageSize(searchParams.get('size')));
  const [scope, setScope] = useState<AuditScope>(() => parseAuditScope(searchParams.get('scope')));

  const [summaryWindow, setSummaryWindow] = useState<'24h' | '7d'>('24h');
  const [summaryPreset, setSummaryPreset] = useState<SummaryPreset | null>(null);

  const [platformSummaryEntries, setPlatformSummaryEntries] = useState<BaseAuditEntry[]>([]);
  const [tenantSummaryEntries, setTenantSummaryEntries] = useState<BaseAuditEntry[]>([]);
  const [platformSummaryLoading, setPlatformSummaryLoading] = useState(false);
  const [tenantSummaryLoading, setTenantSummaryLoading] = useState(false);

  const [platformPageIndex, setPlatformPageIndex] = useState(1);
  const [tenantPageIndex, setTenantPageIndex] = useState(1);

  const platformTable = useAuditTable();
  const tenantTable = useAuditTable();

  const focusTable = useCallback(() => {
    const heading = tableTitleRef.current;
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

  const clearSummaryPreset = useCallback(() => {
    setSummaryPreset(null);
  }, []);

  const handlePresetChange = useCallback(
    (preset: SummaryPreset | null) => {
      setSummaryPreset(preset);
      if (preset !== null) {
        focusTable();
      }
    },
    [focusTable],
  );

  const handleSummaryWindowChange = useCallback((w: '24h' | '7d') => {
    setSummaryPreset(null);
    setSummaryWindow(w);
  }, []);

  useEffect(() => {
    const query = mergeUrlSearchParams(searchParams, {
      tenant: tenantSlug || null,
      view: viewMode === 'technical' ? 'technical' : null,
      action: actionFilter || null,
      from: dateFrom || null,
      to: dateTo || null,
      size: pageSize === PLATFORM_DEFAULT_PAGE_SIZE ? null : String(pageSize),
      scope: scope === 'tenant' ? 'empresa' : null,
    });
    const current = searchParams.toString();
    if (query === current) {
      return;
    }
    router.replace(withSearchParams(pathname, query), { scroll: false });
  }, [
    actionFilter,
    dateFrom,
    dateTo,
    pageSize,
    scope,
    pathname,
    router,
    searchParams,
    tenantSlug,
    viewMode,
  ]);

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const list = await tenantApi.list({ limit: 100, offset: 0 });
        const active = list.filter((item) => item.status === 'ACTIVE');
        setTenants(active);
        const requestedSlug = searchParams.get('tenant')?.trim() ?? '';
        const fromUrl = active.find((item) => item.slug === requestedSlug);
        setTenantSlug((current) => {
          if (current && active.some((item) => item.slug === current)) {
            return current;
          }
          return fromUrl?.slug ?? active[0]?.slug ?? '';
        });
      } catch {
        // Si no hay tenants accesibles, queda vacío
      }
    };
    void loadTenants();
    // Solo al montar / hidratación inicial desde URL
  }, []);

  const buildServerListParams = useCallback(
    (cursor?: string): AuditLogQueryParams => {
      const params: AuditLogQueryParams = { limit: pageSize };
      if (cursor) params.cursor = cursor;
      if (actionFilter) params.action = actionFilter;
      const fromDate = localDateToIsoStart(dateFrom);
      const toDate = localDateToIsoEnd(dateTo);
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      return params;
    },
    [actionFilter, dateFrom, dateTo, pageSize],
  );

  const buildExportParams = useCallback((): AuditCsvExportParams => {
    const params: AuditCsvExportParams = {};
    if (actionFilter) params.action = actionFilter;
    const fromDate = localDateToIsoStart(dateFrom);
    const toDate = localDateToIsoEnd(dateTo);
    if (fromDate) params.fromDate = fromDate;
    if (toDate) params.toDate = toDate;
    return params;
  }, [actionFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (scope !== 'platform') return;
    const fetchPlatform = () => {
      return platformAuditApi.list(buildServerListParams(platformTable.cursor)).then((r) => ({
        data: r.data as BaseAuditEntry[],
        nextCursor: r.nextCursor,
      }));
    };
    void platformTable.loadEntries(fetchPlatform);
  }, [scope, platformTable.cursor, buildServerListParams]);

  useEffect(() => {
    if (scope !== 'platform') return;
    const loadPlatformSummary = async () => {
      setPlatformSummaryLoading(true);
      try {
        const r = await platformAuditApi.list({ limit: SUMMARY_LIMIT });
        setPlatformSummaryEntries(r.data as BaseAuditEntry[]);
      } catch {
        setPlatformSummaryEntries([]);
      } finally {
        setPlatformSummaryLoading(false);
      }
    };
    void loadPlatformSummary();
  }, [scope]);

  useEffect(() => {
    if (scope !== 'tenant' || !tenantSlug) return;
    const fetchTenant = () => {
      return auditApi.list(buildServerListParams(tenantTable.cursor), tenantSlug).then((r) => ({
        data: r.data as BaseAuditEntry[],
        nextCursor: r.nextCursor,
      }));
    };
    void tenantTable.loadEntries(fetchTenant);
  }, [scope, tenantSlug, tenantTable.cursor, buildServerListParams]);

  useEffect(() => {
    if (scope !== 'tenant' || !tenantSlug) return;
    const loadTenantSummary = async () => {
      setTenantSummaryLoading(true);
      setTenantSummaryEntries([]);
      try {
        const r = await auditApi.list({ limit: SUMMARY_LIMIT }, tenantSlug);
        setTenantSummaryEntries(r.data as BaseAuditEntry[]);
      } catch {
        setTenantSummaryEntries([]);
      } finally {
        setTenantSummaryLoading(false);
      }
    };
    void loadTenantSummary();
  }, [scope, tenantSlug]);

  const resetTablePagination = () => {
    platformTable.reset();
    tenantTable.reset();
    setPlatformPageIndex(1);
    setTenantPageIndex(1);
  };

  const handleActionFilterChange = (value: string) => {
    clearSummaryPreset();
    setActionFilter(value);
    resetTablePagination();
  };

  const handleDateFromChange = (value: string) => {
    clearSummaryPreset();
    setDateFrom(value);
    resetTablePagination();
  };

  const handleDateToChange = (value: string) => {
    clearSummaryPreset();
    setDateTo(value);
    resetTablePagination();
  };

  const handlePageSizeChange = (value: number) => {
    clearSummaryPreset();
    setPageSize(parsePlatformPageSize(String(value)));
    resetTablePagination();
  };

  const handleScopeChange = (value: string) => {
    clearSummaryPreset();
    setScope(parseAuditScope(value === 'tenant' ? 'empresa' : value));
  };

  const handleTenantChange = (slug: string) => {
    clearSummaryPreset();
    setTenantSlug(slug);
    tenantTable.reset();
    tenantTable.setEntries([]);
    tenantTable.setNextCursor(undefined);
    setTenantSummaryEntries([]);
    setTenantPageIndex(1);
  };

  const handlePlatformExportCsv = async () => {
    const result = await platformAuditApi.exportCsv(buildExportParams());
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(result.blob, result.filename ?? `historial-plataforma-${stamp}.csv`);
    return { truncated: result.truncated };
  };

  const handleTenantExportCsv = async () => {
    if (!tenantSlug) {
      throw new Error('Selecciona una empresa para exportar.');
    }
    const result = await auditApi.exportCsv(buildExportParams(), tenantSlug);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(result.blob, result.filename ?? `historial-empresa-${stamp}.csv`);
    return { truncated: result.truncated };
  };

  const handlePlatformNext = () => {
    clearSummaryPreset();
    platformTable.handleNext();
    setPlatformPageIndex((p) => p + 1);
  };
  const handlePlatformPrev = () => {
    clearSummaryPreset();
    platformTable.handlePrev();
    setPlatformPageIndex((p) => Math.max(1, p - 1));
  };
  const handleTenantNext = () => {
    clearSummaryPreset();
    tenantTable.handleNext();
    setTenantPageIndex((p) => p + 1);
  };
  const handleTenantPrev = () => {
    clearSummaryPreset();
    tenantTable.handlePrev();
    setTenantPageIndex((p) => Math.max(1, p - 1));
  };

  const tenantInfoList: TenantInfo[] = tenants.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
  }));

  const selectedTenantName = tenants.find((t) => t.slug === tenantSlug)?.name;

  const platformDisplayedEntries = useMemo(() => {
    if (!summaryPreset) return platformTable.entries;
    return filterEntriesInSummaryWindow(platformSummaryEntries, summaryWindow).filter((e) =>
      matchesSummaryPreset(e, summaryPreset),
    );
  }, [platformTable.entries, platformSummaryEntries, summaryPreset, summaryWindow]);

  const tenantDisplayedEntries = useMemo(() => {
    if (!summaryPreset) return tenantTable.entries;
    return filterEntriesInSummaryWindow(tenantSummaryEntries, summaryWindow).filter((e) =>
      matchesSummaryPreset(e, summaryPreset),
    );
  }, [tenantTable.entries, tenantSummaryEntries, summaryPreset, summaryWindow]);

  // Empty C: lote del resumen evaluado + predicado sin filas (no table.entries).
  const platformEmptySummaryPreset = Boolean(
    summaryPreset && !platformSummaryLoading && platformDisplayedEntries.length === 0,
  );

  const tenantEmptySummaryPreset = Boolean(
    summaryPreset && !tenantSummaryLoading && tenantDisplayedEntries.length === 0,
  );

  const sharedFilterProps = {
    actionFilter,
    dateFrom,
    dateTo,
    onActionFilterChange: handleActionFilterChange,
    onDateFromChange: handleDateFromChange,
    onDateToChange: handleDateToChange,
  };

  const summaryFilterChip =
    summaryPreset !== null ? (
      <Alert variant="neutral" className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AlertDescription>{formatSummaryFilterChip(summaryPreset)}</AlertDescription>
          <button
            type="button"
            onClick={clearSummaryPreset}
            className={cn(
              'min-h-11 shrink-0 font-medium text-iwana-primary-700 hover:underline dark:text-iwana-primary-400',
              interactiveFocusClassName,
            )}
          >
            {PLATFORM_UI_COPY.audit.summaryFilterClear}
          </button>
        </div>
      </Alert>
    ) : null;

  return (
    <div className="space-y-6">
      <PageHeader title={PLATFORM_UI_COPY.audit.title} subtitle={PLATFORM_UI_COPY.audit.subtitle} />

      <Tabs value={scope} onValueChange={handleScopeChange}>
        <div className="overflow-x-auto">
          <TabsList
            aria-label={PLATFORM_UI_COPY.audit.scopeLabel}
            className="inline-flex min-w-full sm:min-w-0"
          >
            <TabsTrigger value="platform" className="min-h-11 flex-1 sm:flex-none">
              {PLATFORM_UI_COPY.audit.platformSectionTitle}
            </TabsTrigger>
            <TabsTrigger value="tenant" className="min-h-11 flex-1 sm:flex-none">
              {PLATFORM_UI_COPY.audit.tenantSectionTitle}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="platform">
          <section aria-labelledby="platform-audit-heading">
            <h2 id="platform-audit-heading" className="sr-only">
              {PLATFORM_UI_COPY.audit.platformSectionTitle}
            </h2>

            <AuditSummary
              entries={platformSummaryEntries}
              isLoading={platformSummaryLoading}
              mode="platform"
              tenants={tenantInfoList}
              window={summaryWindow}
              onWindowChange={handleSummaryWindowChange}
              activePreset={summaryPreset}
              onPresetChange={handlePresetChange}
            />

            {summaryFilterChip}

            {platformTable.loadError ? (
              <div className="mb-4">
                <Alert variant="error">
                  <AlertDescription>{platformTable.loadError}</AlertDescription>
                </Alert>
              </div>
            ) : null}

            <AuditLogsTable
              entries={platformDisplayedEntries}
              isLoading={platformTable.isLoading}
              hasNextPage={Boolean(platformTable.nextCursor)}
              hasPrevPage={platformTable.cursorHistory.length > 0}
              onNext={handlePlatformNext}
              onPrev={handlePlatformPrev}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              pageIndex={platformPageIndex}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
              onExportCsv={handlePlatformExportCsv}
              titleRef={tableTitleRef}
              titleId="platform-audit-table-title"
              emptySummaryPreset={platformEmptySummaryPreset}
              summaryPresetActive={summaryPreset !== null}
              {...sharedFilterProps}
            />
          </section>
        </TabsContent>

        <TabsContent value="tenant">
          <section aria-labelledby="tenant-audit-heading">
            <h2 id="tenant-audit-heading" className="sr-only">
              {PLATFORM_UI_COPY.audit.tenantSectionTitle}
            </h2>
            <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
              <PlatformTenantPicker
                tenants={tenants}
                value={tenantSlug}
                onChange={handleTenantChange}
                ariaLabel={PLATFORM_UI_COPY.shared.selectTenant}
              />
            </div>

            {tenantSlug ? (
              <AuditSummary
                entries={tenantSummaryEntries}
                isLoading={tenantSummaryLoading}
                mode="tenant"
                tenantName={selectedTenantName}
                window={summaryWindow}
                onWindowChange={handleSummaryWindowChange}
                activePreset={summaryPreset}
                onPresetChange={handlePresetChange}
              />
            ) : null}

            {summaryFilterChip}

            {tenantTable.loadError ? (
              <div className="mb-4">
                <Alert variant="error">
                  <AlertDescription>{tenantTable.loadError}</AlertDescription>
                </Alert>
              </div>
            ) : null}

            <AuditLogsTable
              entries={tenantDisplayedEntries}
              isLoading={tenantTable.isLoading}
              hasNextPage={Boolean(tenantTable.nextCursor)}
              hasPrevPage={tenantTable.cursorHistory.length > 0}
              onNext={handleTenantNext}
              onPrev={handleTenantPrev}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              companyName={selectedTenantName}
              pageIndex={tenantPageIndex}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
              onExportCsv={handleTenantExportCsv}
              titleRef={tableTitleRef}
              titleId="tenant-audit-table-title"
              emptySummaryPreset={tenantEmptySummaryPreset}
              summaryPresetActive={summaryPreset !== null}
              {...sharedFilterProps}
            />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
