'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@iwana/ui';
import { tenantSelfApi, type TenantSelfSettings } from '@/lib/api-client';
import { PortalAlert, PortalSectionHeader } from '@/components/shared/portal-ui';
import { SECURITY_SETTINGS_COPY } from './mod00-settings-labels';

interface SecuritySettingsCardProps {
  settings: TenantSelfSettings;
  canEdit: boolean;
  onUpdated: (updated: TenantSelfSettings) => void;
}

export function SecuritySettingsCard({ settings, canEdit, onUpdated }: SecuritySettingsCardProps) {
  const [mfaRequiredAll, setMfaRequiredAll] = useState(settings.features.mfa_required_all);
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setMfaRequiredAll(settings.features.mfa_required_all);
    setIsDirty(false);
  }, [settings.features.mfa_required_all]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setServerError(null);
    setSuccess(null);

    try {
      const updated = await tenantSelfApi.updateSettings({
        features: { mfa_required_all: mfaRequiredAll },
      });
      onUpdated(updated);
      setSuccess(SECURITY_SETTINGS_COPY.successMessage);
      setIsDirty(false);
    } catch {
      setServerError(SECURITY_SETTINGS_COPY.errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="rounded-2xl border border-gray-200 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
      <CardHeader>
        <PortalSectionHeader
          className="gap-0"
          title="Seguridad"
          description={SECURITY_SETTINGS_COPY.panelDescription}
        />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-[#f8faf5] p-4 dark:border-dark-border dark:bg-dark-surface-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                MFA obligatorio para toda la organización
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Si se activa, los usuarios deberán verificar su identidad antes de entrar al portal.
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={mfaRequiredAll}
                disabled={!canEdit || isSubmitting}
                aria-label={
                  mfaRequiredAll ? 'Desactivar MFA obligatorio' : 'Activar MFA obligatorio'
                }
                onChange={() => {
                  if (!canEdit) return;
                  setMfaRequiredAll((current) => !current);
                  setIsDirty(true);
                  setSuccess(null);
                }}
              />
              <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors duration-200 peer-checked:bg-green-500 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 dark:bg-dark-surface-4 dark:peer-checked:bg-green-600" />
              <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 peer-checked:translate-x-5" />
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Facturación
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              {settings.features.billing
                ? SECURITY_SETTINGS_COPY.billingEnabled
                : SECURITY_SETTINGS_COPY.billingDisabled}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {SECURITY_SETTINGS_COPY.billingDescription}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {SECURITY_SETTINGS_COPY.subscribersLabel}
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              {SECURITY_SETTINGS_COPY.subscribersTitle}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {SECURITY_SETTINGS_COPY.subscribersDescription}
            </p>
          </div>
        </div>

        {serverError && (
          <PortalAlert
            variant="error"
            title="No fue posible guardar la política"
            description={serverError}
            icon={CircleAlert}
          />
        )}
        {success && !serverError && (
          <PortalAlert
            variant="success"
            title="Política actualizada"
            description={success}
            icon={CheckCircle2}
          />
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {canEdit ? SECURITY_SETTINGS_COPY.adminHint : SECURITY_SETTINGS_COPY.readOnlyHint}
          </p>
          {canEdit && (
            <Button
              type="button"
              loading={isSubmitting}
              disabled={!isDirty || isSubmitting}
              onClick={() => void handleSubmit()}
            >
              {SECURITY_SETTINGS_COPY.saveAction}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
