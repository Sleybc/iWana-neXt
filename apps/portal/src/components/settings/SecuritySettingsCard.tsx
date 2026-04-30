'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import { tenantSelfApi, type TenantSelfSettings } from '@/lib/api-client';

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
      setSuccess('Política de seguridad actualizada correctamente.');
      setIsDirty(false);
    } catch {
      setServerError('No fue posible guardar la política de seguridad. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="rounded-[28px] border border-white/70 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Protección organizacional
            </p>
            <CardTitle className="mt-1">Seguridad</CardTitle>
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Define la política organizacional editable de la empresa y separa flags administrados por
          plataforma.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-[24px] border border-gray-100 bg-[#f8faf5] p-4 dark:border-dark-border dark:bg-dark-surface-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                MFA obligatorio para toda la organización
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Si se activa, los usuarios deberán completar MFA para operar en el portal.
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
          <div className="rounded-[24px] border border-gray-100 p-4 dark:border-dark-border">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Facturación
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              {settings.features.billing
                ? 'Habilitada por plataforma'
                : 'Deshabilitada por plataforma'}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Este flag es solo lectura desde el portal empresarial.
            </p>
          </div>

          <div className="rounded-[24px] border border-gray-100 p-4 dark:border-dark-border">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Ownership
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              Parámetros comerciales administrados por plataforma
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              maxSubscribers y enablement comercial permanecen fuera de este flujo self-service.
            </p>
          </div>
        </div>

        {serverError && (
          <div className="flex items-start gap-3 rounded-[24px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] px-4 py-3 text-sm text-red-700 shadow-iwana-soft dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{serverError}</p>
          </div>
        )}
        {success && !serverError && (
          <div className="flex items-start gap-3 rounded-[24px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(209,250,229,0.82))] px-4 py-3 text-sm text-emerald-700 shadow-iwana-soft dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{success}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {canEdit
              ? 'Solo el rol ADMIN puede actualizar la política MFA de la empresa.'
              : 'Tu rol puede consultar esta política, pero no modificarla.'}
          </p>
          {canEdit && (
            <Button
              type="button"
              loading={isSubmitting}
              disabled={!isDirty || isSubmitting}
              onClick={() => void handleSubmit()}
            >
              Guardar seguridad
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
