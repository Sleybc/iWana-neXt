'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
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

const selectClassName =
  'flex h-10 w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] transition-colors duration-200 hover:border-[#9CA3AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17163A] focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50';

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
    <Card>
      <CardHeader>
        <CardTitle>Configuración operativa</CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Define la región operativa base que usa el portal del tenant autenticado.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="timezone" className="text-sm font-medium text-[#374151]">
                Zona horaria
              </label>
              <select id="timezone" className={selectClassName} disabled={!canEdit} {...register('timezone')}>
                {TIMEZONE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.timezone?.message && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.timezone.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="currency" className="text-sm font-medium text-[#374151]">
                Moneda
              </label>
              <select id="currency" className={selectClassName} disabled={!canEdit} {...register('currency')}>
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.currency?.message && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.currency.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="language" className="text-sm font-medium text-[#374151]">
                Idioma
              </label>
              <select id="language" className={selectClassName} disabled={!canEdit} {...register('language')}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.language?.message && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.language.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="country" className="text-sm font-medium text-[#374151]">
                País operativo
              </label>
              <select id="country" className={selectClassName} disabled={!canEdit} {...register('country')}>
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {errors.country?.message && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.country.message}</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
            El límite de suscriptores y otros parámetros comerciales permanecen administrados por
            plataforma y no forman parte de este flujo self-service.
          </div>

          {serverError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {serverError}
            </p>
          )}
          {success && !serverError && (
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
              {success}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {canEdit
                ? 'La actualización es parcial e idempotente sobre el payload enviado.'
                : 'Tu rol puede consultar la configuración operativa, pero no modificarla.'}
            </p>
            {canEdit && (
              <Button
                type="submit"
                loading={isSubmitting}
                disabled={isSubmitting || !isDirty}
              >
                Guardar configuración operativa
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}