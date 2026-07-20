'use client';

// Página de registros de auditoría — resumen operativo + tabla con modo Básico/Técnico
import { ApiError } from '@/lib/api-client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PlatformTenantPicker } from '@/components/shared/PlatformTenantPicker';
import { AuditLogsTable } from '@/components/audit/AuditLogsTable';
import type { TableFilters } from '@/components/audit/AuditLogsTable';
import { AuditSummary } from '@/components/audit/AuditSummary';
import type { SummaryEntry, AppliedFilter, TenantInfo } from '@/components/audit/AuditSummary';
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
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const PAGE_LIMIT = 50;
const SUMMARY_LIMIT = 200;

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
        const message =
          err instanceof ApiError ? err.message : 'Error al cargar los registros de auditoría.';
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

  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [tenantSlug, setTenantSlug] = useState(() => searchParams.get('tenant')?.trim() ?? '');

  // Modo de vista compartido entre ambas tablas
  const [viewMode, setViewMode] = useState<ViewMode>(() => parseViewMode(searchParams.get('view')));

  // Filtros de barra (compartidos; persistidos en URL)
  const [actionFilter, setActionFilter] = useState(() => searchParams.get('action')?.trim() ?? '');
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('from')?.trim() ?? '');
  const [dateTo, setDateTo] = useState(() => searchParams.get('to')?.trim() ?? '');

  // Ventana temporal para resúmenes
  const [summaryWindow, setSummaryWindow] = useState<'24h' | '7d'>('24h');

  // Datos del resumen (carga separada con limit=200)
  const [platformSummaryEntries, setPlatformSummaryEntries] = useState<SummaryEntry[]>([]);
  const [tenantSummaryEntries, setTenantSummaryEntries] = useState<SummaryEntry[]>([]);
  const [platformSummaryLoading, setPlatformSummaryLoading] = useState(false);
  const [tenantSummaryLoading, setTenantSummaryLoading] = useState(false);

  // Filtros externos para cada tabla (desde los resúmenes)
  const [platformFilters, setPlatformFilters] = useState<TableFilters | undefined>(undefined);
  const [tenantFilters, setTenantFilters] = useState<TableFilters | undefined>(undefined);

  // Índice de página para mostrar en paginación
  const [platformPageIndex, setPlatformPageIndex] = useState(1);
  const [tenantPageIndex, setTenantPageIndex] = useState(1);

  const platformTable = useAuditTable();
  const tenantTable = useAuditTable();

  // Persistencia URL: tenant, view, action, from, to
  useEffect(() => {
    const query = mergeUrlSearchParams(searchParams, {
      tenant: tenantSlug || null,
      view: viewMode === 'technical' ? 'technical' : null,
      action: actionFilter || null,
      from: dateFrom || null,
      to: dateTo || null,
    });
    const current = searchParams.toString();
    if (query === current) {
      return;
    }
    router.replace(withSearchParams(pathname, query), { scroll: false });
  }, [actionFilter, dateFrom, dateTo, pathname, router, searchParams, tenantSlug, viewMode]);

  // Carga lista de tenants activos
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
      const params: AuditLogQueryParams = { limit: PAGE_LIMIT };
      if (cursor) params.cursor = cursor;
      if (actionFilter) params.action = actionFilter;
      const fromDate = localDateToIsoStart(dateFrom);
      const toDate = localDateToIsoEnd(dateTo);
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      return params;
    },
    [actionFilter, dateFrom, dateTo],
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

  // Carga datos para la tabla de plataforma (paginada, filtros server-side)
  useEffect(() => {
    const fetchPlatform = () => {
      return platformAuditApi.list(buildServerListParams(platformTable.cursor)).then((r) => ({
        data: r.data as BaseAuditEntry[],
        nextCursor: r.nextCursor,
      }));
    };
    void platformTable.loadEntries(fetchPlatform);
  }, [platformTable.cursor, buildServerListParams]);

  // Carga datos para el resumen de plataforma (limit=200, sin cursor)
  useEffect(() => {
    const loadPlatformSummary = async () => {
      setPlatformSummaryLoading(true);
      try {
        const r = await platformAuditApi.list({ limit: SUMMARY_LIMIT });
        setPlatformSummaryEntries(r.data as SummaryEntry[]);
      } catch {
        setPlatformSummaryEntries([]);
      } finally {
        setPlatformSummaryLoading(false);
      }
    };
    void loadPlatformSummary();
  }, []);

  // Carga datos para la tabla de tenant (paginada, filtros server-side)
  useEffect(() => {
    if (!tenantSlug) return;
    const fetchTenant = () => {
      return auditApi.list(buildServerListParams(tenantTable.cursor), tenantSlug).then((r) => ({
        data: r.data as BaseAuditEntry[],
        nextCursor: r.nextCursor,
      }));
    };
    void tenantTable.loadEntries(fetchTenant);
  }, [tenantSlug, tenantTable.cursor, buildServerListParams]);

  // Carga datos para el resumen de tenant (limit=200, sin cursor)
  useEffect(() => {
    if (!tenantSlug) return;
    const loadTenantSummary = async () => {
      setTenantSummaryLoading(true);
      setTenantSummaryEntries([]);
      try {
        const r = await auditApi.list({ limit: SUMMARY_LIMIT }, tenantSlug);
        setTenantSummaryEntries(r.data as SummaryEntry[]);
      } catch {
        setTenantSummaryEntries([]);
      } finally {
        setTenantSummaryLoading(false);
      }
    };
    void loadTenantSummary();
  }, [tenantSlug]);

  const resetTablePagination = () => {
    platformTable.reset();
    tenantTable.reset();
    setPlatformPageIndex(1);
    setTenantPageIndex(1);
  };

  const handleActionFilterChange = (value: string) => {
    setActionFilter(value);
    resetTablePagination();
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    resetTablePagination();
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    resetTablePagination();
  };

  const handleTenantChange = (slug: string) => {
    setTenantSlug(slug);
    tenantTable.reset();
    tenantTable.setEntries([]);
    tenantTable.setNextCursor(undefined);
    setTenantSummaryEntries([]);
    setTenantFilters(undefined);
    setTenantPageIndex(1);
  };

  const handlePlatformExportCsv = async () => {
    const result = await platformAuditApi.exportCsv(buildExportParams());
    downloadBlob(
      result.blob,
      result.filename ?? `platform-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    return { truncated: result.truncated };
  };

  const handleTenantExportCsv = async () => {
    if (!tenantSlug) {
      throw new Error('Selecciona una empresa para exportar.');
    }
    const result = await auditApi.exportCsv(buildExportParams(), tenantSlug);
    downloadBlob(
      result.blob,
      result.filename ?? `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    return { truncated: result.truncated };
  };

  const handlePlatformNext = () => {
    platformTable.handleNext();
    setPlatformPageIndex((p) => p + 1);
  };
  const handlePlatformPrev = () => {
    platformTable.handlePrev();
    setPlatformPageIndex((p) => Math.max(1, p - 1));
  };
  const handleTenantNext = () => {
    tenantTable.handleNext();
    setTenantPageIndex((p) => p + 1);
  };
  const handleTenantPrev = () => {
    tenantTable.handlePrev();
    setTenantPageIndex((p) => Math.max(1, p - 1));
  };

  // Convierte el AppliedFilter del resumen a TableFilters para la tabla
  const applyPlatformFilter = (filter: AppliedFilter) => {
    const f: TableFilters = {};
    if (filter.severity !== undefined) f.severity = filter.severity;
    if (filter.actionSet !== undefined) f.actionSet = filter.actionSet;
    setPlatformFilters(f);
  };
  const applyTenantFilter = (filter: AppliedFilter) => {
    const f: TableFilters = {};
    if (filter.severity !== undefined) f.severity = filter.severity;
    if (filter.actionSet !== undefined) f.actionSet = filter.actionSet;
    setTenantFilters(f);
  };

  // Mapa de tenants para el resumen de plataforma
  const tenantInfoList: TenantInfo[] = tenants.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
  }));

  const selectedTenantName = tenants.find((t) => t.slug === tenantSlug)?.name;

  const sharedFilterProps = {
    actionFilter,
    dateFrom,
    dateTo,
    onActionFilterChange: handleActionFilterChange,
    onDateFromChange: handleDateFromChange,
    onDateToChange: handleDateToChange,
  };

  return (
    <div className="space-y-10">
      <PageHeader title={PLATFORM_UI_COPY.audit.title} subtitle={PLATFORM_UI_COPY.audit.subtitle} />

      {/* --- Sección: Auditoría de Plataforma --- */}
      <section aria-labelledby="platform-audit-heading">
        <h2
          id="platform-audit-heading"
          className="mb-1 text-lg font-bold text-iwana-primary dark:text-white"
        >
          {PLATFORM_UI_COPY.audit.platformSectionTitle}
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          {PLATFORM_UI_COPY.audit.platformSectionSubtitle}
        </p>

        {/* Resumen de plataforma */}
        <AuditSummary
          entries={platformSummaryEntries}
          isLoading={platformSummaryLoading}
          mode="platform"
          tenants={tenantInfoList}
          window={summaryWindow}
          onWindowChange={setSummaryWindow}
          onFilterApply={applyPlatformFilter}
        />

        {/* Indicador de filtro activo + limpieza */}
        {platformFilters && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Filtro activo desde el resumen.
            </span>
            <button
              type="button"
              onClick={() => setPlatformFilters(undefined)}
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-iwana-primary hover:underline"
            >
              Limpiar filtro
            </button>
          </div>
        )}

        {platformTable.loadError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <strong>Error al cargar registros:</strong> {platformTable.loadError}
          </div>
        )}

        <AuditLogsTable
          entries={platformTable.entries}
          isLoading={platformTable.isLoading}
          hasNextPage={Boolean(platformTable.nextCursor)}
          hasPrevPage={platformTable.cursorHistory.length > 0}
          onNext={handlePlatformNext}
          onPrev={handlePlatformPrev}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          externalFilters={platformFilters}
          pageIndex={platformPageIndex}
          onExportCsv={handlePlatformExportCsv}
          {...sharedFilterProps}
        />
      </section>

      {/* --- Sección: Auditoría por Empresa --- */}
      <section aria-labelledby="tenant-audit-heading">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <h2
            id="tenant-audit-heading"
            className="text-lg font-bold text-iwana-primary dark:text-white"
          >
            {PLATFORM_UI_COPY.audit.tenantSectionTitle}
          </h2>
          <PlatformTenantPicker
            tenants={tenants}
            value={tenantSlug}
            onChange={handleTenantChange}
            ariaLabel={PLATFORM_UI_COPY.shared.selectTenant}
          />
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {PLATFORM_UI_COPY.audit.tenantSectionSubtitle}
        </p>

        {/* Resumen de tenant */}
        {tenantSlug && (
          <AuditSummary
            entries={tenantSummaryEntries}
            isLoading={tenantSummaryLoading}
            mode="tenant"
            tenantName={selectedTenantName}
            window={summaryWindow}
            onWindowChange={setSummaryWindow}
            onFilterApply={applyTenantFilter}
          />
        )}

        {tenantFilters && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Filtro activo desde el resumen.
            </span>
            <button
              type="button"
              onClick={() => setTenantFilters(undefined)}
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-iwana-primary hover:underline"
            >
              Limpiar filtro
            </button>
          </div>
        )}

        {tenantTable.loadError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <strong>Error al cargar registros:</strong> {tenantTable.loadError}
          </div>
        )}

        <AuditLogsTable
          entries={tenantTable.entries}
          isLoading={tenantTable.isLoading}
          hasNextPage={Boolean(tenantTable.nextCursor)}
          hasPrevPage={tenantTable.cursorHistory.length > 0}
          onNext={handleTenantNext}
          onPrev={handleTenantPrev}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          externalFilters={tenantFilters}
          companyName={selectedTenantName}
          pageIndex={tenantPageIndex}
          onExportCsv={handleTenantExportCsv}
          {...sharedFilterProps}
        />
      </section>
    </div>
  );
}
