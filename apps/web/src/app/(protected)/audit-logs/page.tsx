'use client';

// Página de registros de auditoría — resumen operativo + tabla con modo Básico/Técnico
import { ApiError } from '@/lib/api-client';
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
  type AuditLogEntry,
  type TenantListItem,
} from '@/lib/api-client';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const PAGE_LIMIT = 50;
const SUMMARY_LIMIT = 200;

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
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [tenantSlug, setTenantSlug] = useState('');

  // Modo de vista compartido entre ambas tablas
  const [viewMode, setViewMode] = useState<'basic' | 'technical'>('basic');

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

  // Carga lista de tenants activos
  useEffect(() => {
    const loadTenants = async () => {
      try {
        const list = await tenantApi.list({ limit: 100, offset: 0 });
        const active = list.filter((item) => item.status === 'ACTIVE');
        setTenants(active);
        if (active[0]) setTenantSlug(active[0].slug);
      } catch {
        // Si no hay tenants accesibles, queda vacío
      }
    };
    void loadTenants();
  }, []);

  // Carga datos para la tabla de plataforma (paginada)
  useEffect(() => {
    const fetchPlatform = () => {
      const params: { limit: number; cursor?: string } = { limit: PAGE_LIMIT };
      if (platformTable.cursor) params.cursor = platformTable.cursor;
      return platformAuditApi.list(params).then((r) => ({
        data: r.data as BaseAuditEntry[],
        nextCursor: r.nextCursor,
      }));
    };
    void platformTable.loadEntries(fetchPlatform);
  }, [platformTable.cursor]);

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

  // Carga datos para la tabla de tenant (paginada)
  useEffect(() => {
    if (!tenantSlug) return;
    const fetchTenant = () => {
      const params: { limit: number; cursor?: string } = { limit: PAGE_LIMIT };
      if (tenantTable.cursor) params.cursor = tenantTable.cursor;
      return auditApi.list(params, tenantSlug).then((r) => ({
        data: r.data as BaseAuditEntry[],
        nextCursor: r.nextCursor,
      }));
    };
    void tenantTable.loadEntries(fetchTenant);
  }, [tenantSlug, tenantTable.cursor]);

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

  const handleTenantChange = (slug: string) => {
    setTenantSlug(slug);
    tenantTable.reset();
    tenantTable.setEntries([]);
    tenantTable.setNextCursor(undefined);
    setTenantSummaryEntries([]);
    setTenantFilters(undefined);
    setTenantPageIndex(1);
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

  return (
    <div className="space-y-10">
      <PageHeader title={PLATFORM_UI_COPY.audit.title} subtitle={PLATFORM_UI_COPY.audit.subtitle} />

      {/* --- Sección: Auditoría de Plataforma --- */}
      <section aria-labelledby="platform-audit-heading">
        <h2
          id="platform-audit-heading"
          className="text-lg font-bold text-[#181818] dark:text-white mb-1"
        >
          {PLATFORM_UI_COPY.audit.platformSectionTitle}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
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
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500">Filtro activo desde el resumen.</span>
            <button
              type="button"
              onClick={() => setPlatformFilters(undefined)}
              className="text-xs font-medium text-iwana-primary hover:underline"
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
        />
      </section>

      {/* --- Sección: Auditoría por Empresa --- */}
      <section aria-labelledby="tenant-audit-heading">
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h2
            id="tenant-audit-heading"
            className="text-lg font-bold text-[#181818] dark:text-white"
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
        <p className="text-sm text-slate-500 mb-4">
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
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500">Filtro activo desde el resumen.</span>
            <button
              type="button"
              onClick={() => setTenantFilters(undefined)}
              className="text-xs font-medium text-iwana-primary hover:underline"
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
        />
      </section>
    </div>
  );
}
