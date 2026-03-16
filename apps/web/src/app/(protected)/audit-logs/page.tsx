'use client';

// Página de registros de auditoría — lista paginada de operaciones CUD del sistema
import { ApiError } from '@/lib/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { AuditLogsTable } from '@/components/audit/AuditLogsTable';
import { auditApi, tenantApi, type AuditLogEntry, type TenantListItem } from '@/lib/api-client';

// Número de registros por página
const PAGE_LIMIT = 50;

/**
 * Selector de tenant personalizado con dropdown estilizado.
 * Idéntico al de la página de usuarios para consistencia visual.
 */
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

  /** Calcula si hay espacio debajo antes de abrir */
  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setOpenUpward(window.innerHeight - rect.bottom < 200);
    }
    setOpen((prev) => !prev);
  };

  /** Cierra al hacer clic fuera */
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

  /** Cierra al presionar Escape */
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
      {/* Botón disparador */}
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

      {/* Lista de opciones */}
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

export default function AuditLogsPage() {
  // Lista de tenants activos para el selector
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  // Lista de entradas de la página actual
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  // Cursor de la página actual (undefined = primera página)
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  // Historial de cursores para navegar hacia atrás
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  // Cursor para la siguiente página (último id de la página actual)
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  // Indicador de carga de datos
  const [isLoading, setIsLoading] = useState(false);
  // Slug del tenant seleccionado para filtrar los registros
  const [tenantSlug, setTenantSlug] = useState('');
  // Error visible al cargar — muestra el mensaje real del API
  const [loadError, setLoadError] = useState<string | null>(null);

  // Cargar lista de tenants activos al montar el componente
  useEffect(() => {
    const loadTenants = async () => {
      try {
        const list = await tenantApi.list({ limit: 100, offset: 0 });
        const active = list.filter((item) => item.status === 'ACTIVE');
        setTenants(active);
        // Seleccionar automáticamente el primer tenant activo
        if (active[0]) {
          setTenantSlug(active[0].slug);
        }
      } catch {
        // Si no hay tenants disponibles, el selector quedará vacío
      }
    };

    void loadTenants();
  }, []);

  // Carga la página de audit logs correspondiente al cursor dado
  const loadEntries = useCallback(
    async (cur?: string) => {
      if (!tenantSlug) {
        setEntries([]);
        setNextCursor(undefined);
        return;
      }

      setIsLoading(true);
      setLoadError(null);
      try {
        const params = cur ? { limit: PAGE_LIMIT, cursor: cur } : { limit: PAGE_LIMIT };
        const result = await auditApi.list(params, tenantSlug);
        setEntries(result);
        // El nextCursor es el id del último elemento de la página actual
        const lastId = result[result.length - 1]?.id;
        setNextCursor(result.length === PAGE_LIMIT ? lastId : undefined);
      } catch (err) {
        // Mostrar el error real al usuario en lugar de silenciarlo
        const message =
          err instanceof ApiError ? err.message : 'Error al cargar los registros de auditoría.';
        setLoadError(message);
        setEntries([]);
        setNextCursor(undefined);
      } finally {
        setIsLoading(false);
      }
    },
    [tenantSlug],
  );

  // Cargar primera página al montar y cuando cambia el tenant
  useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
    setNextCursor(undefined);
    void loadEntries(undefined);
  }, [loadEntries]);

  // Navegar a la siguiente página guardando el cursor actual en el historial
  const handleNext = () => {
    if (!nextCursor) {
      return;
    }
    setCursorHistory((prev) => [...prev, cursor ?? '']);
    const newCursor = nextCursor;
    setCursor(newCursor);
    void loadEntries(newCursor);
  };

  // Navegar a la página anterior recuperando el cursor del historial
  const handlePrev = () => {
    const previousCursor = cursorHistory[cursorHistory.length - 1];
    const restoredCursor = previousCursor === '' ? undefined : previousCursor;
    setCursorHistory((prev) => prev.slice(0, -1));
    setCursor(restoredCursor);
    void loadEntries(restoredCursor);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registros de Auditoría"
        subtitle="Historial de operaciones CUD del sistema"
      />

      {/* Selector de empresa */}
      <div className="flex flex-wrap items-center gap-2">
        <TenantSelect
          tenants={tenants}
          value={tenantSlug}
          onChange={(slug) => {
            setTenantSlug(slug);
            setCursor(undefined);
            setCursorHistory([]);
            setNextCursor(undefined);
          }}
        />
      </div>

      {/* Banner de error — visible cuando la carga falla */}
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <strong>Error al cargar registros:</strong> {loadError}
        </div>
      )}

      <AuditLogsTable
        entries={entries}
        isLoading={isLoading}
        hasNextPage={Boolean(nextCursor)}
        hasPrevPage={cursorHistory.length > 0}
        onNext={handleNext}
        onPrev={handlePrev}
      />
    </div>
  );
}
