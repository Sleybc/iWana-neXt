'use client';

import { History } from 'lucide-react';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import { type AuditLogEntry } from '@/lib/api-client';

interface ProfileChangeEvidenceProps {
  entries: AuditLogEntry[];
  isLoading: boolean;
  error: string | null;
}

function formatAction(action: string): string {
  const labels: Record<string, string> = {
    CREATE: 'Creación',
    UPDATE: 'Actualización',
    DELETE: 'Eliminación',
  };

  return labels[action] ?? action;
}

function summarizeChanges(entry: AuditLogEntry): string {
  const nextValue = entry.newValue ?? {};
  const previousValue = entry.oldValue ?? {};
  const permissionImpact =
    typeof nextValue['permissionImpact'] === 'object' && nextValue['permissionImpact'] !== null
      ? (nextValue['permissionImpact'] as { added?: unknown; removed?: unknown })
      : null;
  const assignmentImpact =
    typeof nextValue['assignmentImpact'] === 'object' && nextValue['assignmentImpact'] !== null
      ? (nextValue['assignmentImpact'] as { added?: unknown; removed?: unknown })
      : null;

  const nextPermissions = Array.isArray(nextValue['permissions']) ? nextValue['permissions'] : [];
  const previousPermissions = Array.isArray(previousValue['permissions'])
    ? previousValue['permissions']
    : [];
  const nextProfileIds = Array.isArray(nextValue['profileIds']) ? nextValue['profileIds'] : [];
  const previousProfileIds = Array.isArray(previousValue['profileIds'])
    ? previousValue['profileIds']
    : [];

  if (permissionImpact) {
    const added = Array.isArray(permissionImpact.added) ? permissionImpact.added.length : 0;
    const removed = Array.isArray(permissionImpact.removed) ? permissionImpact.removed.length : 0;
    return `Permisos agregados: ${added} · removidos: ${removed}`;
  }

  if (assignmentImpact) {
    const added = Array.isArray(assignmentImpact.added) ? assignmentImpact.added.length : 0;
    const removed = Array.isArray(assignmentImpact.removed) ? assignmentImpact.removed.length : 0;
    return `Perfiles agregados: ${added} · removidos: ${removed}`;
  }

  if (nextPermissions.length > 0 || previousPermissions.length > 0) {
    return `Permisos antes: ${previousPermissions.length} · después: ${nextPermissions.length}`;
  }

  if (nextProfileIds.length > 0 || previousProfileIds.length > 0) {
    return `Perfiles antes: ${previousProfileIds.length} · después: ${nextProfileIds.length}`;
  }

  return 'Cambio sensible auditado sin secretos ni credenciales.';
}

export function ProfileChangeEvidence({ entries, isLoading, error }: ProfileChangeEvidenceProps) {
  return (
    <PortalPanel
      title="Cambios sensibles recientes"
      description="Evidencia tomada del audit log existente para perfiles, permisos y asignaciones de usuario."
    >
      {isLoading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
      ) : null}

      {!isLoading && error ? (
        <PortalEmptyState title="Sin evidencia disponible" description={error} icon={History} />
      ) : null}

      {!isLoading && !error && entries.length === 0 ? (
        <PortalEmptyState
          title="Sin cambios recientes"
          description="Cuando haya cambios sensibles de perfiles o permisos aparecerán aquí."
          icon={History}
        />
      ) : null}

      {!isLoading && !error && entries.length > 0 ? (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-dark-border dark:bg-dark-surface-2"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {formatAction(entry.action)} · {entry.entityType}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {summarizeChanges(entry)}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                {new Date(entry.createdAt).toLocaleString('es-CO')}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </PortalPanel>
  );
}
