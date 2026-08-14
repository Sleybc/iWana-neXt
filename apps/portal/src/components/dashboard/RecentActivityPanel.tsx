'use client';

import { Clock } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@iwana/ui';
import type { AuditLogEntry } from '@/lib/api-client';
import { auditFeedSummary } from '@/lib/audit-vocabulary';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';

/**
 * Historial de cambios del inicio (ADMIN / AUDITOR).
 * Vocabulario amigable para `action` y `entityType` — system-vocabulary-review.
 * C-7: consume datos del padre (fuente `audit`); no dispara fetch propio.
 * C-13 / SEC: solo acción, tipo entidad, actor (`displayName`) y tiempo —
 * nunca oldValue/newValue, ipAddress, userAgent ni requestId; sin «ver todo» ni export.
 */

type ActivityLoadStatus = 'idle' | 'loading' | 'updating' | 'success' | 'error';

export interface RecentActivityPanelProps {
  entries?: AuditLogEntry[] | null;
  status?: ActivityLoadStatus;
  error?: string | null;
  onRetry?: () => void;
  /**
   * Vista minimizada (AUDITOR): sin CTA a configuración ni «ver todo».
   * Mismo panel/shell; solo cambia el vacío y la ausencia de destinos amplios.
   */
  minimized?: boolean;
}

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

function renderRelativeTime(isoDate: string) {
  const date = new Date(isoDate);
  const label = formatRelativeTime(isoDate);
  if (Number.isNaN(date.getTime())) {
    return label;
  }
  return (
    <time dateTime={isoDate} className="font-mono tabular-nums">
      {label}
    </time>
  );
}

export { auditActionLabel, auditEntityTypeLabel } from '@/lib/audit-vocabulary';

/**
 * Deep link solo a rutas de detalle existentes en el portal (C-12 / D-QW-07).
 * Sin ruta segura → null (fila no enlazada).
 */
export function resolveAuditEntityHref(
  entityType: string,
  entityId: string | null | undefined,
): string | null {
  if (!entityId || entityId.trim().length === 0) return null;
  const normalized = entityType.trim();
  const builders: Record<string, (id: string) => string> = {
    Expediente: (id) => `/dashboard/crm/expedientes/${encodeURIComponent(id)}`,
    expediente: (id) => `/dashboard/crm/expedientes/${encodeURIComponent(id)}`,
    ExpedienteRecord: (id) => `/dashboard/crm/expedientes/${encodeURIComponent(id)}`,
    expedienterecord: (id) => `/dashboard/crm/expedientes/${encodeURIComponent(id)}`,
    Subscriber: (id) => `/dashboard/crm/subscribers/${encodeURIComponent(id)}`,
    subscriber: (id) => `/dashboard/crm/subscribers/${encodeURIComponent(id)}`,
  };
  const build = builders[normalized];
  return build ? build(entityId) : null;
}

function buildActivitySummary(entry: AuditLogEntry): string {
  return auditFeedSummary(entry.action, entry.entityType);
}

function actorDisplayName(entry: AuditLogEntry): string | null {
  const name = entry.actor?.displayName?.trim();
  return name && name.length > 0 ? name : null;
}

export function RecentActivityPanel({
  entries = null,
  status = 'idle',
  error = null,
  onRetry,
  minimized = false,
}: RecentActivityPanelProps) {
  const isLoading = (status === 'loading' || status === 'idle') && !entries;
  const isUpdating = status === 'updating';
  const showError = status === 'error';
  const list = entries ?? [];

  return (
    <PortalPanel compact title="Historial de cambios" busy={isLoading}>
      {isLoading ? (
        <div className="space-y-1.5" role="status" aria-label="Cargando historial">
          {Array.from({ length: 4 }).map((_, i) => (
            <PortalSkeletonBlock key={i} className="h-10 rounded-xl" />
          ))}
        </div>
      ) : null}

      {isUpdating ? (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
          Actualizando
        </p>
      ) : null}

      {showError ? (
        <PortalAlert
          variant="error"
          title="No pudimos cargar el historial"
          description={
            error ?? 'No pudimos cargar el historial de cambios. Reintenta en unos minutos.'
          }
          live="polite"
          action={
            onRetry ? (
              <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
                Reintentar
              </Button>
            ) : null
          }
        />
      ) : null}

      {!isLoading && !showError && list.length === 0 ? (
        <PortalEmptyState
          embedded
          title="Sin cambios recientes"
          description={
            minimized
              ? 'Cuando tu equipo cree o actualice registros, verás los movimientos recientes aquí.'
              : 'Cuando tu equipo cree o actualice registros, verás el historial aquí.'
          }
        />
      ) : null}

      {!isLoading && !showError && list.length > 0 ? (
        <ul className="space-y-1.5" aria-label="Cambios recientes">
          {list.map((entry) => {
            const href = resolveAuditEntityHref(entry.entityType, entry.entityId);
            const summary = buildActivitySummary(entry);
            const actor = actorDisplayName(entry);
            return (
              <li key={entry.id} className="flex items-start gap-3 text-sm">
                <div
                  className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gray-400 dark:bg-gray-500"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  {href ? (
                    <Link
                      href={href}
                      className={`font-medium text-gray-800 underline-offset-4 hover:underline dark:text-white ${interactiveFocusClassName}`}
                    >
                      {summary}
                    </Link>
                  ) : (
                    <p className="font-medium text-gray-800 dark:text-white">{summary}</p>
                  )}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-gray-600 dark:text-gray-300">
                    {actor ? <span>{actor}</span> : null}
                    {actor ? <span aria-hidden="true">·</span> : null}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {renderRelativeTime(entry.createdAt)}
                    </span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </PortalPanel>
  );
}
