'use client';

// Tabla de registros de auditoría con paginación cursor-based
import type { AuditLogEntry } from '@/lib/api-client';

// Props del componente de tabla de audit logs
interface AuditLogsTableProps {
  entries: AuditLogEntry[];
  isLoading: boolean;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNext: () => void;
  onPrev: () => void;
}

// Determina el estilo del badge según la acción registrada
function actionBadgeClass(action: string): string {
  switch (action) {
    case 'CREATE':
      return 'bg-green-100 text-green-700';
    case 'UPDATE':
      return 'bg-yellow-100 text-yellow-700';
    case 'DELETE':
      return 'bg-red-100 text-red-700';
    case 'LOGIN':
    case 'LOGOUT':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

// Trunca un string a un máximo de caracteres y agrega puntos suspensivos si supera el límite
function truncate(value: string | null, maxLength: number): string {
  if (!value) {
    return '—';
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export function AuditLogsTable({
  entries,
  isLoading,
  hasNextPage,
  hasPrevPage,
  onNext,
  onPrev,
}: AuditLogsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-dark-surface-3">
          <tr>
            <th className="px-3 py-2 text-left">Fecha</th>
            <th className="px-3 py-2 text-left">Acción</th>
            <th className="px-3 py-2 text-left">Entidad</th>
            <th className="px-3 py-2 text-left">ID Entidad</th>
            <th className="px-3 py-2 text-left">Usuario</th>
            <th className="px-3 py-2 text-left">IP</th>
          </tr>
        </thead>

        <tbody>
          {isLoading ? (
            // Estado de carga — filas skeleton animadas
            Array.from({ length: 5 }).map((_, index) => (
              <tr key={index} className="border-t border-gray-100 dark:border-dark-border">
                {Array.from({ length: 6 }).map((__, colIndex) => (
                  <td key={colIndex} className="px-3 py-3">
                    <div className="animate-pulse bg-gray-200 rounded h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))
          ) : entries.length === 0 ? (
            // Estado vacío — sin registros para mostrar
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                Sin registros de auditoría
              </td>
            </tr>
          ) : (
            // Filas de datos de audit logs
            entries.map((entry) => (
              <tr key={entry.id} className="border-t border-gray-100 dark:border-dark-border">
                {/* Fecha formateada en locale colombiano */}
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                  {new Date(entry.createdAt).toLocaleString('es-CO')}
                </td>

                {/* Badge de acción con color semántico */}
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${actionBadgeClass(entry.action)}`}
                  >
                    {entry.action}
                  </span>
                </td>

                {/* Tipo de entidad afectada */}
                <td className="px-3 py-2 font-medium">{entry.entityType}</td>

                {/* ID de la entidad truncado a 12 caracteres */}
                <td className="px-3 py-2 font-mono text-xs text-gray-500">
                  {truncate(entry.entityId, 12)}
                </td>

                {/* ID del usuario que ejecutó la acción o "Sistema" si es automático */}
                <td className="px-3 py-2 font-mono text-xs text-gray-500">
                  {entry.userId ? truncate(entry.userId, 12) : 'Sistema'}
                </td>

                {/* Dirección IP del cliente */}
                <td className="px-3 py-2 text-xs text-gray-500">{entry.ipAddress ?? '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Controles de paginación cursor-based */}
      <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-2 dark:border-dark-border">
        <p className="text-xs text-gray-500">
          {isLoading ? 'Cargando...' : `${entries.length} registro(s) en esta página`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onPrev}
            disabled={!hasPrevPage || isLoading}
          >
            Anterior
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onNext}
            disabled={!hasNextPage || isLoading}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
