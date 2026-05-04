'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@iwana/ui';
import { tenantSelfApi, type TenantSelfSettings } from '@/lib/api-client';
import { PortalAlert, PortalSectionHeader } from '@/components/shared/portal-ui';

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

// Opciones con etiquetas legibles para el usuario
const TIMEZONE_OPTIONS = [
  { value: 'America/Bogota', label: 'America/Bogota (Colombia)' },
  { value: 'America/Guayaquil', label: 'America/Guayaquil (Ecuador)' },
  { value: 'America/Lima', label: 'America/Lima (Perú)' },
  { value: 'America/Mexico_City', label: 'America/Mexico_City (México)' },
  { value: 'America/New_York', label: 'America/New_York (EE.UU.)' },
];

const CURRENCY_OPTIONS = [
  { value: 'COP', label: 'COP — Peso colombiano' },
  { value: 'USD', label: 'USD — Dólar estadounidense' },
  { value: 'MXN', label: 'MXN — Peso mexicano' },
  { value: 'PEN', label: 'PEN — Sol peruano' },
  { value: 'EUR', label: 'EUR — Euro' },
];

const LANGUAGE_OPTIONS = [
  { value: 'es-CO', label: 'Español — Colombia' },
  { value: 'es-MX', label: 'Español — México' },
  { value: 'es-PE', label: 'Español — Perú' },
  { value: 'en-US', label: 'English (en-US)' },
];

const COUNTRY_OPTIONS = [
  { value: 'CO', label: 'Colombia' },
  { value: 'EC', label: 'Ecuador' },
  { value: 'MX', label: 'México' },
  { value: 'PE', label: 'Perú' },
  { value: 'US', label: 'Estados Unidos' },
];

// Clases consistentes con el patrón de formularios del admin (TenantCreateForm)
const INPUT_CLASS =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-iwana-primary/30 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white';
const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';
const ERROR_CLASS = 'mt-1 text-xs text-red-600 dark:text-red-400';
const SUBSECTION_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400';

// Resuelve la etiqueta legible dado un valor; si no hay match, devuelve el valor crudo
function labelFor(options: { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

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
    <Card className="rounded-2xl border border-gray-200 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
      <CardHeader>
        <PortalSectionHeader
          className="gap-0"
          title="Configuración operativa"
          description="Región, idioma y moneda base del portal."
        />
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Vista consulta: info-pills en lugar de selects deshabilitados */}
        {!canEdit ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
              {/* Grupo Ubicación */}
              <p className={`mb-4 ${SUBSECTION_LABEL}`}>Ubicación</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                    Zona horaria
                  </span>
                  <span className="mt-0.5 block text-sm font-medium text-gray-900 dark:text-white">
                    {labelFor(TIMEZONE_OPTIONS, settings.timezone)}
                  </span>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                    País operativo
                  </span>
                  <span className="mt-0.5 block text-sm font-medium text-gray-900 dark:text-white">
                    {labelFor(COUNTRY_OPTIONS, settings.country)}
                  </span>
                </div>
              </div>

              <hr className="my-4 border-gray-100 dark:border-dark-border" />

              {/* Grupo Preferencias */}
              <p className={`mb-4 ${SUBSECTION_LABEL}`}>Preferencias</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                    Idioma
                  </span>
                  <span className="mt-0.5 block text-sm font-medium text-gray-900 dark:text-white">
                    {labelFor(LANGUAGE_OPTIONS, settings.language)}
                  </span>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                    Moneda
                  </span>
                  <span className="mt-0.5 block text-sm font-medium text-gray-900 dark:text-white">
                    {labelFor(CURRENCY_OPTIONS, settings.currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Nota de plataforma */}
            <div className="rounded-2xl border border-gray-200 bg-[#f8faf5] px-4 py-3 text-sm text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
              El límite de suscriptores y otros parámetros comerciales permanecen administrados por
              plataforma y no forman parte de este flujo self-service.
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500">
              Tu rol puede consultar la configuración operativa, pero no modificarla.
            </p>
          </div>
        ) : (
          /* Vista edición: formulario con inner panel y grupos visuales */
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
              {/* Grupo: Ubicación */}
              <p className={`mb-4 ${SUBSECTION_LABEL}`}>Ubicación</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="timezone" className={LABEL_CLASS}>
                    Zona horaria
                  </label>
                  <select id="timezone" className={INPUT_CLASS} {...register('timezone')}>
                    {TIMEZONE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {errors.timezone?.message && (
                    <p className={ERROR_CLASS}>{errors.timezone.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="country" className={LABEL_CLASS}>
                    País operativo
                  </label>
                  <select id="country" className={INPUT_CLASS} {...register('country')}>
                    {COUNTRY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {errors.country?.message && (
                    <p className={ERROR_CLASS}>{errors.country.message}</p>
                  )}
                </div>
              </div>

              <hr className="my-4 border-gray-100 dark:border-dark-border" />

              {/* Grupo: Preferencias */}
              <p className={`mb-4 ${SUBSECTION_LABEL}`}>Preferencias</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="language" className={LABEL_CLASS}>
                    Idioma
                  </label>
                  <select id="language" className={INPUT_CLASS} {...register('language')}>
                    {LANGUAGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {errors.language?.message && (
                    <p className={ERROR_CLASS}>{errors.language.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="currency" className={LABEL_CLASS}>
                    Moneda
                  </label>
                  <select id="currency" className={INPUT_CLASS} {...register('currency')}>
                    {CURRENCY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {errors.currency?.message && (
                    <p className={ERROR_CLASS}>{errors.currency.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Nota de plataforma */}
            <div className="rounded-2xl border border-gray-200 bg-[#f8faf5] px-4 py-3 text-sm text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
              El límite de suscriptores y otros parámetros comerciales permanecen administrados por
              plataforma y no forman parte de este flujo self-service.
            </div>

            {/* Feedback de servidor */}
            {serverError && (
              <PortalAlert
                variant="error"
                title="No fue posible guardar la configuración"
                description={serverError}
                icon={CircleAlert}
              />
            )}
            {success && !serverError && (
              <PortalAlert
                variant="success"
                title="Configuración actualizada"
                description={success}
                icon={CheckCircle2}
              />
            )}

            {/* Footer y CTA */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Los cambios se aplicarán de inmediato al portal.
              </p>
              <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !isDirty}>
                Guardar configuración operativa
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
