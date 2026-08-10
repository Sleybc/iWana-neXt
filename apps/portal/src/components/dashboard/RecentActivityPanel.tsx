'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { Button } from '@iwana/ui';
import { auditApi, ApiError, type AuditLogEntry } from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';

/**
 * Historial de cambios del inicio (ADMIN).
 * Vocabulario amigable para `action` y `entityType` — system-vocabulary-review.
 */

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

/** Mapea la acción del historial a etiqueta legible (sin enums crudos). */
export function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    CREATE: 'Creación',
    UPDATE: 'Actualización',
    DELETE: 'Eliminación',
    LOGIN: 'Inicio de sesión',
    LOGOUT: 'Cierre de sesión',
    LOGIN_FAILED: 'Intento de acceso fallido',
    ACCOUNT_LOCKED: 'Cuenta bloqueada',
    PASSWORD_CHANGED: 'Cambio de contraseña',
    PASSWORD_RESET_REQUESTED: 'Solicitud de restablecimiento',
    PASSWORD_RESET_COMPLETED: 'Contraseña restablecida',
    MFA_ENABLED: 'Verificación en dos pasos activada',
    MFA_DISABLED: 'Verificación en dos pasos desactivada',
    MFA_SETUP_INITIATED: 'Inicio de verificación en dos pasos',
    MFA_SETUP: 'Configuración de verificación en dos pasos',
    MFA_VERIFIED: 'Verificación en dos pasos confirmada',
    TENANT_PROVISIONED: 'Empresa aprovisionada',
    TENANT_SUSPENDED: 'Empresa suspendida',
    TENANT_ACTIVATED: 'Empresa activada',
    REFRESH: 'Renovación de sesión',
    EMAIL_VERIFIED: 'Correo verificado',
    LIST_ACCESS: 'Consulta de listado',
  };
  return labels[action] ?? 'Cambio registrado';
}

/** Mapea el tipo de entidad a vocabulario de producto. */
export function auditEntityTypeLabel(entityType: string): string {
  const normalized = entityType.trim();
  const labels: Record<string, string> = {
    User: 'usuario',
    user: 'usuario',
    Tenant: 'empresa',
    tenant: 'empresa',
    TenantSettings: 'configuración de la empresa',
    tenant_settings: 'configuración de la empresa',
    Settings: 'configuración',
    AccessProfile: 'perfil de acceso',
    access_profile: 'perfil de acceso',
    Role: 'categoría base',
    AuditLog: 'historial',
    Session: 'sesión',
    InventoryItem: 'producto operativo',
    inventory_item: 'producto operativo',
    CommercialPlan: 'plan comercial',
    Plan: 'plan comercial',
    AssuranceTicket: 'caso de mesa de ayuda',
    Ticket: 'caso de mesa de ayuda',
    WorkOrder: 'orden de campo',
    Visit: 'visita',
    Expediente: 'oportunidad',
    Subscriber: 'suscriptor',
  };
  return labels[normalized] ?? 'registro';
}

function buildActivitySummary(entry: AuditLogEntry): string {
  const action = auditActionLabel(entry.action);
  const entity = auditEntityTypeLabel(entry.entityType);
  return `${action} en ${entity}`;
}

export function RecentActivityPanel() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);

    auditApi
      .list({ limit: 8 })
      .then((data) => {
        setEntries(data);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 403) {
          setEntries([]);
          return;
        }
        setError('No pudimos cargar el historial de cambios. Reintenta en unos minutos.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

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
          setEntries([]);
        } else {
          setError('No pudimos cargar el historial de cambios. Reintenta en unos minutos.');
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
    <PortalPanel title="Historial de cambios" busy={isLoading}>
      {isLoading ? (
        <div className="space-y-3" aria-label="Cargando historial">
          {Array.from({ length: 4 }).map((_, i) => (
            <PortalSkeletonBlock key={i} className="h-10 rounded-xl" />
          ))}
        </div>
      ) : null}

      {!isLoading && error ? (
        <PortalAlert
          variant="error"
          title="No pudimos cargar el historial"
          description={error}
          live="polite"
          action={
            <Button type="button" variant="ghost" size="sm" onClick={load}>
              Reintentar
            </Button>
          }
        />
      ) : null}

      {!isLoading && !error && entries.length === 0 ? (
        <PortalEmptyState
          title="Sin cambios recientes"
          description="Cuando tu equipo cree o actualice registros, verás el historial aquí. Mientras tanto, revisa la configuración de la empresa."
          action={
            <Link
              href="/dashboard/settings"
              className="inline-flex min-h-11 items-center text-sm font-medium text-iwana-primary underline-offset-4 hover:underline"
            >
              Ir a configuración
            </Link>
          }
        />
      ) : null}

      {!isLoading && !error && entries.length > 0 ? (
        <ul className="space-y-3" aria-label="Cambios recientes">
          {entries.map((entry) => (
            <li key={entry.id} className="flex min-h-11 items-start gap-3 text-sm">
              <div
                className="mt-2 h-2 w-2 shrink-0 rounded-full bg-iwana-secondary-700"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-800 dark:text-white">
                  {buildActivitySummary(entry)}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                  <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {formatRelativeTime(entry.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </PortalPanel>
  );
}
