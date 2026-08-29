// apps/portal/src/components/access-control/EffectivePermissionsPanel.tsx
'use client';

import { ChevronDown, ShieldCheck } from 'lucide-react';
import { Button, cn } from '@iwana/ui';
import type {
  AccessPermissionsCatalog,
  EffectivePermissionsSummary,
  AccessProfileView,
} from '@/lib/api-client';
import { getAccessProfileDisplayName, getSystemBaseRoleLabel } from '@/lib/system-vocabulary';
import { PortalEmptyState } from '@/components/shared/portal-ui';

/**
 * Panel «Accesos efectivos» del side peek de edición de usuarios
 * (spec MOD00 §4). Refleja el estado GUARDADO (GET
 * /access-control/users/{userId}/effective-permissions, contrato existente);
 * la proyección de la edición en curso sigue en la línea «Accesos finales»
 * del formulario. Colapsado por defecto (progressive disclosure).
 */

const PANEL_COPY = {
  title: 'Accesos efectivos',
  note: 'Refleja los accesos guardados. Los cambios de esta edición se aplican al guardar.',
  assignedTitle: 'Accesos asignados',
  sourcesTitle: 'Cómo obtuvo estos accesos',
  recoveryTitle: 'Accesos incluidos en la categoría base',
  emptySummaryTitle: 'Sin resumen disponible',
  emptySourcesText: 'Sin accesos adicionales.',
  perSourceEmptyText: 'Sin accesos adicionales.',
  errorText: 'No pudimos cargar los accesos efectivos. Intenta nuevamente.',
  retryAction: 'Reintentar',
  sourceLabelSuggested: 'Perfil sugerido',
  sourceLabelCustom: 'Perfil personalizado',
  sourceLabelFallback: 'Perfil de acceso',
  permissionFallback: 'Acceso no descrito',
} as const;

interface EffectivePermissionsPanelProps {
  summary: EffectivePermissionsSummary | null;
  catalog: AccessPermissionsCatalog | null;
  /** Perfiles disponibles para el cross-reference de `isSystem` (spec §4.2). */
  availableProfiles: AccessProfileView[];
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
}

function resolvePermissionLabel(
  permissionKey: string,
  catalog: AccessPermissionsCatalog | null,
): string {
  return (
    catalog?.permissions.find((permission) => permission.permissionKey === permissionKey)
      ?.description ?? PANEL_COPY.permissionFallback
  );
}

interface ProfileSourcePresentation {
  label: string;
  name: string;
}

/**
 * Cross-reference del origen por `profileId` contra `availableProfiles`
 * (spec §4.2). Si la fuente desapareció (perfil eliminado, inactivo o
 * filtrado) o aún no cargó, cae a la etiqueta genérica con el nombre del
 * summary; nunca se muestra el id interno ni un hueco vacío.
 */
export function resolveProfileSourcePresentation(
  profileId: string,
  profileName: string,
  availableProfiles: AccessProfileView[],
): ProfileSourcePresentation {
  const profile = availableProfiles.find((entry) => entry.id === profileId);

  if (!profile) {
    return { label: PANEL_COPY.sourceLabelFallback, name: profileName };
  }

  return {
    label: profile.isSystem ? PANEL_COPY.sourceLabelSuggested : PANEL_COPY.sourceLabelCustom,
    name: getAccessProfileDisplayName(profile),
  };
}

export function EffectivePermissionsPanel({
  summary,
  catalog,
  availableProfiles,
  isLoading,
  hasError,
  onRetry,
}: EffectivePermissionsPanelProps) {
  const hasSourcesSection = Boolean(
    summary && (summary.recoveryPermissions.length > 0 || summary.profileSources.length > 0),
  );

  return (
    <details className="group border-t border-gray-100 pt-5 dark:border-dark-border">
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary',
        )}
      >
        <div className="min-w-0">
          <p className="portal-eyebrow">{PANEL_COPY.title}</p>
          <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">
            {PANEL_COPY.note}
          </p>
        </div>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-iwana-primary transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2].map((index) => (
                <span
                  key={`pill-skeleton-${index}`}
                  aria-hidden="true"
                  className="h-6 w-24 animate-pulse rounded-full bg-gray-100 dark:bg-dark-surface-3"
                />
              ))}
            </div>
          </div>
        ) : null}

        {!isLoading && hasError ? (
          <PortalEmptyState
            embedded={true}
            title={PANEL_COPY.emptySummaryTitle}
            description={PANEL_COPY.errorText}
            icon={ShieldCheck}
            action={
              <Button type="button" variant="link" size="lg" className="min-h-11" onClick={onRetry}>
                {PANEL_COPY.retryAction}
              </Button>
            }
          />
        ) : null}

        {!isLoading && !hasError && !summary ? (
          <PortalEmptyState
            embedded={true}
            title={PANEL_COPY.emptySummaryTitle}
            description={PANEL_COPY.emptySourcesText}
            icon={ShieldCheck}
          />
        ) : null}

        {!isLoading && !hasError && summary ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
              <p className="portal-eyebrow">Categoría base</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                {getSystemBaseRoleLabel(summary.role)}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {PANEL_COPY.assignedTitle}
              </p>
              {summary.effectivePermissions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {summary.effectivePermissions.map((permissionKey) => (
                    <span
                      key={permissionKey}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200"
                    >
                      {resolvePermissionLabel(permissionKey, catalog)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {PANEL_COPY.emptySourcesText}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {PANEL_COPY.sourcesTitle}
              </p>
              {hasSourcesSection ? (
                <>
                  {summary.recoveryPermissions.length > 0 ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
                      <p className="font-medium">{PANEL_COPY.recoveryTitle}</p>
                      <p className="mt-1 text-sm">
                        {summary.recoveryPermissions
                          .map((permissionKey) => resolvePermissionLabel(permissionKey, catalog))
                          .join(' · ')}
                      </p>
                    </div>
                  ) : null}

                  {summary.profileSources.map((source) => {
                    const presentation = resolveProfileSourcePresentation(
                      source.profileId,
                      source.profileName,
                      availableProfiles,
                    );

                    return (
                      <div
                        key={source.profileId}
                        className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-dark-border dark:bg-dark-surface-2"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {presentation.name}
                        </p>
                        <p className="mt-0.5 text-xs font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400">
                          {presentation.label}
                        </p>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {source.permissions.length > 0
                            ? source.permissions
                                .map((permissionKey) =>
                                  resolvePermissionLabel(permissionKey, catalog),
                                )
                                .join(' · ')
                            : PANEL_COPY.perSourceEmptyText}
                        </p>
                      </div>
                    );
                  })}
                </>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {PANEL_COPY.emptySourcesText}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
