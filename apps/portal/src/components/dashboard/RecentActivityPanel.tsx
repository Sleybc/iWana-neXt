// apps/portal/src/components/dashboard/RecentActivityPanel.tsx
'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import { Activity, Clock } from 'lucide-react';
import { auditApi, ApiError, type AuditLogEntry } from '@/lib/api-client';

/**
 * Panel de actividad reciente del tenant autenticado.
 *
 * Solo visible para ADMIN — el AuditController del backend ya restringe el acceso.
 * Si el usuario no es ADMIN, el componente no se renderiza (decisión del caller).
 * Los datos vienen de GET /audit-logs?limit=8 — contrato ya existente.
 *
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §5.3 (BT-DE-10)
 */

/** Formatea una fecha ISO a texto relativo legible */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'reciente';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'hace un momento';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  return `hace ${Math.floor(diffHours / 24)}d`;
}

/** Mapea la acción del audit a etiqueta legible */
function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    CREATE: 'Creación',
    UPDATE: 'Actualización',
    DELETE: 'Eliminación',
    LOGIN: 'Inicio de sesión',
    LOGOUT: 'Cierre de sesión',
    MFA_SETUP: 'Configuración MFA',
    MFA_VERIFIED: 'Verificación MFA',
    PASSWORD_CHANGED: 'Cambio de contraseña',
    PASSWORD_RESET_REQUESTED: 'Solicitud de restablecimiento',
  };
  return labels[action] ?? action;
}

export function RecentActivityPanel() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    auditApi
      .list({ limit: 8 })
      .then((data) => {
        if (mounted) setEntries(data);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        if (err instanceof ApiError && err.status === 403) {
          // 403 esperado para roles no autorizados — fallback silencioso
          setEntries([]);
        } else {
          setError('No fue posible cargar la actividad reciente.');
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-4 h-4 text-iwana-secondary-700" aria-hidden="true" />
          Actividad reciente
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3" aria-busy="true" aria-label="Cargando actividad">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-gray-100 dark:bg-dark-surface-3 animate-pulse"
              />
            ))}
          </div>
        )}

        {!isLoading && error && <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>}

        {!isLoading && !error && entries.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hay actividad registrada en este tenant.
          </p>
        )}

        {!isLoading && !error && entries.length > 0 && (
          <ul className="space-y-3" aria-label="Eventos recientes">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 text-sm">
                <div
                  className="w-2 h-2 rounded-full bg-iwana-secondary-700 shrink-0 mt-2"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-800 dark:text-white">
                    {actionLabel(entry.action)}{' '}
                    <span className="font-normal text-gray-500 dark:text-gray-400">
                      en {entry.entityType}
                    </span>
                  </p>
                  <p className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                    {formatRelativeTime(entry.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
