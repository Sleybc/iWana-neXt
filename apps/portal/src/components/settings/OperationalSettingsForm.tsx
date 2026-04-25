'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, CircleAlert, Globe2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Select } from '@iwana/ui';
import { tenantSelfApi, type TenantSelfSettings } from '@/lib/api-client';

const operationalSettingsSchema = z.object({
  timezone: z.string().min(1, 'Selecciona una zona horaria.'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Usa una moneda ISO 4217.'),
  language: z.string().min(2, 'Selecciona un idioma.'),
  country: z.string().regex(/^[A-Z]{2}$/, 'Usa un país ISO alpha-2.'),
});

type OperationalSettingsFormValues = z.infer<typeof operationalSettingsSchema>;

interface OperationalSettingsFormProps {
  settings: TenantSelfSettings;
  canEdit: boolean;
  onUpdated: (updated: TenantSelfSettings) => void;
}

const TIMEZONE_OPTIONS = [
  'America/Bogota',
  'America/Guayaquil',
  'America/Lima',
  'America/Mexico_City',
  'America/New_York',
];

const CURRENCY_OPTIONS = ['COP', 'USD', 'MXN', 'PEN', 'EUR'];
const LANGUAGE_OPTIONS = ['es-CO', 'es-MX', 'es-PE', 'en-US'];
const COUNTRY_OPTIONS = ['CO', 'EC', 'MX', 'PE', 'US'];

export function OperationalSettingsForm({
  settings,
  canEdit,
  onUpdated,
}: OperationalSettingsFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<OperationalSettingsFormValues>({
    resolver: zodResolver(operationalSettingsSchema),
    defaultValues: {
      timezone: settings.timezone,
      currency: settings.currency,
      language: settings.language,
      country: settings.country,
    },
  });

  useEffect(() => {
    reset({
      timezone: settings.timezone,
      currency: settings.currency,
      language: settings.language,
      country: settings.country,
    });
  }, [reset, settings]);

  const onSubmit = async (values: OperationalSettingsFormValues) => {
    setServerError(null);
    setSuccess(null);

    try {
      const updated = await tenantSelfApi.updateSettings(values);
      onUpdated(updated);
      setSuccess('Configuración operativa actualizada correctamente.');
    } catch {
      setServerError('No fue posible guardar la configuración operativa. Intenta de nuevo.');
    }
  };

  return (
    <Card className="rounded-[28px] border border-white/70 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
            <Globe2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Región base
            </p>
            <CardTitle className="mt-1">Configuración operativa</CardTitle>
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Define la región operativa base que usa el portal del tenant autenticado.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <Select
                id="timezone"
                label="Zona horaria"
                disabled={!canEdit}
                className="h-11"
                {...register('timezone')}
              >
                {TIMEZONE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              {errors.timezone?.message && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.timezone.message}</p>
              )}
            </div>

            <div>
              <Select
                id="currency"
                label="Moneda"
                disabled={!canEdit}
                className="h-11"
                {...register('currency')}
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              {errors.currency?.message && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.currency.message}</p>
              )}
            </div>

            <div>
              <Select
                id="language"
                label="Idioma"
                disabled={!canEdit}
                className="h-11"
                {...register('language')}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              {errors.language?.message && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.language.message}</p>
              )}
            </div>

            <div>
              <Select
                id="country"
                label="País operativo"
                disabled={!canEdit}
                className="h-11"
                {...register('country')}
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              {errors.country?.message && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.country.message}</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-gray-100 bg-[#f8faf5] px-4 py-4 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
            El límite de suscriptores y otros parámetros comerciales permanecen administrados por
            plataforma y no forman parte de este flujo self-service.
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
                ? 'La actualización es parcial e idempotente sobre el payload enviado.'
                : 'Tu rol puede consultar la configuración operativa, pero no modificarla.'}
            </p>
            {canEdit && (
              <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !isDirty}>
                Guardar configuración operativa
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
