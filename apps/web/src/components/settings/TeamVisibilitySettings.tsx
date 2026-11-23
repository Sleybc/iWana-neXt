'use client';

import { useCallback, useEffect, useState } from 'react';
import { PlatformRole, type TenantUsageGrantableRole } from '@iwana/shared';
import { CheckboxCard, ErrorState, SkeletonBlock } from '@iwana/ui';
import { useAuth } from '@/components/auth/AuthProvider';
import { tenantApi } from '@/lib/api-client';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { settingsSectionPanelClassName } from './settings-shell';

const copy = PLATFORM_UI_COPY.settings.team;
const SUPPORT: TenantUsageGrantableRole = PlatformRole.IWANA_SUPPORT;

type LoadState = 'loading' | 'error' | 'ready';

/**
 * Pestaña «Equipo» de `/settings` (ADR-114 v1.3 §9): si Soporte iWana ve «Uso por empresa».
 * El valor y el permiso de escritura los decide el API; aquí solo se deshabilita el control
 * para quien no es administrador, como guía visual.
 */
export function TeamVisibilitySettings() {
  const { user } = useAuth();
  const canEdit = user?.role === PlatformRole.SYSTEM_ADMIN;
  const [state, setState] = useState<LoadState>('loading');
  const [granted, setGranted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    setState('loading');
    tenantApi.usageVisibility().then(
      (value) => {
        setGranted(value.grantedRoles.includes(SUPPORT));
        setState('ready');
      },
      () => setState('error'),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onToggle = async (next: boolean) => {
    const previous = granted;
    setGranted(next);
    setSaving(true);
    setMessage(null);
    try {
      const saved = await tenantApi.updateUsageVisibility({ grantedRoles: next ? [SUPPORT] : [] });
      const on = saved.grantedRoles.includes(SUPPORT);
      setGranted(on);
      setMessage({ tone: 'ok', text: on ? copy.savedOn : copy.savedOff });
    } catch {
      setGranted(previous);
      setMessage({ tone: 'error', text: copy.errorSave });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={settingsSectionPanelClassName} aria-labelledby="equipo-visibilidad">
      <h2
        id="equipo-visibilidad"
        className="text-base font-semibold text-iwana-primary dark:text-white"
      >
        {copy.title}
      </h2>
      {state === 'loading' ? (
        <div role="status" aria-busy="true" aria-label={copy.loading} className="mt-4 space-y-2">
          <SkeletonBlock className="h-4 w-2/3 rounded" />
          <SkeletonBlock className="h-12 w-full rounded-xl" />
        </div>
      ) : state === 'error' ? (
        <ErrorState
          className="mt-4"
          message={copy.errorLoad}
          onRetry={load}
          retryLabel={copy.retry}
        />
      ) : (
        <div className="mt-4 space-y-2">
          <CheckboxCard
            role="switch"
            className="min-h-11"
            checked={granted}
            disabled={!canEdit || saving}
            aria-describedby="equipo-visibilidad-estado"
            onChange={(event) => void onToggle(event.currentTarget.checked)}
            label={copy.usageLabel}
            description={copy.usageHelp}
          />
          <p
            id="equipo-visibilidad-estado"
            aria-live="polite"
            className={
              message?.tone === 'error'
                ? 'text-sm text-red-700 dark:text-red-300'
                : 'text-sm text-gray-600 dark:text-gray-300'
            }
          >
            {saving ? copy.saving : !canEdit ? copy.readOnly : (message?.text ?? '')}
          </p>
        </div>
      )}
    </section>
  );
}
