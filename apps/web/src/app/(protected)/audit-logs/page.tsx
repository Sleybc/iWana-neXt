'use client';

// Página de registros de auditoría — lista paginada de operaciones CUD del sistema
import { ApiError } from '@/lib/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { AuditLogsTable } from '@/components/audit/AuditLogsTable';
import {
  auditApi,
  platformAuditApi,
  tenantApi,
  type AuditLogEntry,
  type TenantListItem,
  type PlatformAuditLogEntry,
} from '@/lib/api-client';

const PAGE_LIMIT = 50;

function TenantSelect({
  tenants,
  value,
  onChange,
}: {
  tenants: TenantListItem[];
  value: string;
  onChange: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedName = tenants.find((t) => t.slug === value)?.name ?? 'Seleccionar empresa';

  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setOpenUpward(window.innerHeight - rect.bottom < 200);
    }
    setOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-label="Seleccionar tenant"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={handleToggle}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-300 bg-white pl-3 pr-3 text-sm text-gray-700 hover:border-iwana-primary focus:outline-none focus:ring-2 focus:ring-iwana-primary/30 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 transition-colors"
      >
        <span className="max-w-[180px] truncate">{selectedName}</span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && tenants.length > 0 && (
        <ul
          role="listbox"
          aria-label="Seleccionar tenant"
          className={`absolute left-0 z-20 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-dark-surface-2 ${
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {tenants.map((tenant) => (
            <li key={tenant.id} role="option" aria-selected={tenant.slug === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(tenant.slug);
                  setOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left text-sm transition-colors first:rounded-t-xl last:rounded-b-xl ${
                  tenant.slug === value
                    ? 'bg-iwana-primary/10 text-iwana-primary font-medium dark:bg-iwana-primary/20 dark:text-iwana-primary-300'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-dark-surface-3'
                }`}
              >
                {tenant.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type BaseAuditEntry = Pick<
  AuditLogEntry,
  | 'id'
  | 'action'
  | 'entityType'
  | 'entityId'
  | 'userId'
  | 'ipAddress'
  | 'userAgent'
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

  const platformTable = useAuditTable();

  const tenantTable = useAuditTable();

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const list = await tenantApi.list({ limit: 100, offset: 0 });
        const active = list.filter((item) => item.status === 'ACTIVE');
        setTenants(active);
        if (active[0]) {
          setTenantSlug(active[0].slug);
        }
      } catch {
        // Si no hay tenants, queda vacío
      }
    };

    void loadTenants();
  }, []);

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

  useEffect(() => {
    if (!tenantSlug) return;
    const fetchTenant = () => {
      const params: { limit: number; cursor?: string } = { limit: PAGE_LIMIT };
      if (tenantTable.cursor) params.cursor = tenantTable.cursor;
      return auditApi.list(params, tenantSlug).then((r) => ({
        data: r as unknown as BaseAuditEntry[],
        nextCursor: undefined,
      }));
    };
    void tenantTable.loadEntries(fetchTenant);
  }, [tenantSlug, tenantTable.cursor]);

  const handleTenantChange = (slug: string) => {
    setTenantSlug(slug);
    tenantTable.reset();
    tenantTable.setEntries([]);
    tenantTable.setNextCursor(undefined);
  };

  return (
    <div className="space-y-10">
      <PageHeader
        title="Registros de Auditoría"
        subtitle="Historial de operaciones CUD del sistema"
      />

      {/* --- Sección: Auditoría de Plataforma --- */}
      <section aria-labelledby="platform-audit-heading">
        <h2
          id="platform-audit-heading"
          className="text-lg font-bold text-[#181818] dark:text-white mb-3"
        >
          Auditoría de Plataforma
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Operaciones de administradores de plataforma (SYSTEM_ADMIN, IWANA_SUPPORT) sobre tenants y
          usuarios de plataforma.
        </p>

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
          onNext={platformTable.handleNext}
          onPrev={platformTable.handlePrev}
        />
      </section>

      {/* --- Sección: Auditoría por Tenant --- */}
      <section aria-labelledby="tenant-audit-heading">
        <h2
          id="tenant-audit-heading"
          className="text-lg font-bold text-[#181818] dark:text-white mb-3"
        >
          Auditoría por Empresa
        </h2>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <TenantSelect tenants={tenants} value={tenantSlug} onChange={handleTenantChange} />
          {tenantSlug && (
            <span className="text-sm text-slate-500">
              Mostrando registros de{' '}
              <strong>{tenants.find((t) => t.slug === tenantSlug)?.name ?? tenantSlug}</strong>
            </span>
          )}
        </div>

        {tenantTable.loadError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <strong>Error al cargar registros:</strong> {tenantTable.loadError}
          </div>
        )}

        {tenantSlug ? (
          <AuditLogsTable
            entries={tenantTable.entries}
            isLoading={tenantTable.isLoading}
            hasNextPage={Boolean(tenantTable.nextCursor)}
            hasPrevPage={tenantTable.cursorHistory.length > 0}
            onNext={tenantTable.handleNext}
            onPrev={tenantTable.handlePrev}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-gray-700 dark:text-slate-400">
            Selecciona una empresa para ver sus registros de auditoría.
          </div>
        )}
      </section>
    </div>
  );
}
