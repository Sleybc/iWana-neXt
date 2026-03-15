'use client';

// Página de registros de auditoría — lista paginada de operaciones CUD del sistema
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { AuditLogsTable } from '@/components/audit/AuditLogsTable';
import { auditApi, type AuditLogEntry } from '@/lib/api-client';

// Número de registros por página
const PAGE_LIMIT = 50;

export default function AuditLogsPage() {
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

  // Carga la página de audit logs correspondiente al cursor dado
  const loadEntries = useCallback(
    async (cur?: string) => {
      setIsLoading(true);
      try {
        const params = cur ? { limit: PAGE_LIMIT, cursor: cur } : { limit: PAGE_LIMIT };
        const result = await auditApi.list(params, tenantSlug || undefined);
        setEntries(result);
        // El nextCursor es el id del último elemento de la página actual
        const lastId = result[result.length - 1]?.id;
        setNextCursor(result.length === PAGE_LIMIT ? lastId : undefined);
      } catch {
        // En caso de error, limpiar los datos para evitar mostrar información obsoleta
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

      {/* Filtro por tenant — campo de texto para ingresar el slug */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          aria-label="Slug del tenant"
          placeholder="Slug del tenant (vacío = todos)"
          value={tenantSlug}
          onChange={(event) => {
            setTenantSlug(event.target.value);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-64"
        />
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          disabled={isLoading}
          onClick={() => {
            setCursor(undefined);
            setCursorHistory([]);
            setNextCursor(undefined);
            void loadEntries(undefined);
          }}
        >
          Buscar
        </button>
      </div>

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
