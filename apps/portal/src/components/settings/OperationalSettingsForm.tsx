'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, FormStatus, Select } from '@iwana/ui';
import { tenantSelfApi, type TenantSelfSettings } from '@/lib/api-client';
import { PortalSectionHeader } from '@/components/shared/portal-ui';
import { ORGANIZATION_SETTINGS_COPY } from './mod00-settings-labels';

const operationalSettingsSchema = z.object({
  timezone: z.string().min(1, 'Selecciona una zona horaria.'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Usa un código de moneda de 3 letras, por ejemplo COP.'),
  language: z.string().min(2, 'Selecciona un idioma.'),
  country: z.string().regex(/^[A-Z]{2}$/, 'Usa un código de país de 2 letras, por ejemplo CO.'),
});

type OperationalSettingsFormValues = z.infer<typeof operationalSettingsSchema>;

interface OperationalSettingsFormProps {
  settings: TenantSelfSettings;
  canEdit: boolean;
  onUpdated: (updated: TenantSelfSettings) => void;
}

// Opciones con etiquetas legibles para el usuario
const TIMEZONE_OPTIONS = [
  { value: 'America/Bogota', label: 'Colombia (Bogotá)' },
  { value: 'America/Guayaquil', label: 'Ecuador (Guayaquil)' },
  { value: 'America/Lima', label: 'Perú (Lima)' },
  { value: 'America/Mexico_City', label: 'México (Ciudad de México)' },
  { value: 'America/New_York', label: 'Estados Unidos (Nueva York)' },
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
  { value: 'en-US', label: 'Inglés — Estados Unidos' },
];

const COUNTRY_OPTIONS = [
  { value: 'CO', label: 'Colombia' },
  { value: 'EC', label: 'Ecuador' },
  { value: 'MX', label: 'México' },
  { value: 'PE', label: 'Perú' },
  { value: 'US', label: 'Estados Unidos' },
];

const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';
const ERROR_CLASS = 'mt-1 text-xs text-red-600 dark:text-red-400';
const SUBSECTION_LABEL = 'portal-eyebrow';
const READONLY_FIELD_LABEL = 'portal-eyebrow-muted';
const SELECT_MENU_CLASS = 'rounded-2xl p-1.5 [&_[role=option]]:min-h-11 [&_[role=option]]:px-3';

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
    control,
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
      setSuccess(ORGANIZATION_SETTINGS_COPY.operationalSaveSuccess);
    } catch {
      setServerError(ORGANIZATION_SETTINGS_COPY.operationalSaveError);
    }
  };

  return (
    <Card className="rounded-2xl border border-gray-200 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2">
      <CardHeader>
        <PortalSectionHeader
          className="gap-0"
          title={ORGANIZATION_SETTINGS_COPY.operationalTitle}
          description={ORGANIZATION_SETTINGS_COPY.operationalDescription}
        />
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Vista consulta: info-pills en lugar de selects deshabilitados */}
        {!canEdit ? (
          <div className="space-y-5">
            {/* Grupo Ubicación */}
            <p className={`mb-3 ${SUBSECTION_LABEL}`}>
              {ORGANIZATION_SETTINGS_COPY.operationalLocationSection}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
                <span className={`block ${READONLY_FIELD_LABEL}`}>
                  {ORGANIZATION_SETTINGS_COPY.operationalTimezoneLabel}
                </span>
                <span className="mt-0.5 block text-sm font-medium text-gray-900 dark:text-white">
                  {labelFor(TIMEZONE_OPTIONS, settings.timezone)}
                </span>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
                <span className={`block ${READONLY_FIELD_LABEL}`}>
                  {ORGANIZATION_SETTINGS_COPY.operationalCountryLabel}
                </span>
                <span className="mt-0.5 block text-sm font-medium text-gray-900 dark:text-white">
                  {labelFor(COUNTRY_OPTIONS, settings.country)}
                </span>
              </div>
            </div>

            <hr className="my-4 border-gray-100 dark:border-dark-border" />

            {/* Grupo Preferencias */}
            <p className={`mb-3 ${SUBSECTION_LABEL}`}>
              {ORGANIZATION_SETTINGS_COPY.operationalPreferencesSection}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
                <span className={`block ${READONLY_FIELD_LABEL}`}>
                  {ORGANIZATION_SETTINGS_COPY.operationalLanguageLabel}
                </span>
                <span className="mt-0.5 block text-sm font-medium text-gray-900 dark:text-white">
                  {labelFor(LANGUAGE_OPTIONS, settings.language)}
                </span>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
                <span className={`block ${READONLY_FIELD_LABEL}`}>
                  {ORGANIZATION_SETTINGS_COPY.operationalCurrencyLabel}
                </span>
                <span className="mt-0.5 block text-sm font-medium text-gray-900 dark:text-white">
                  {labelFor(CURRENCY_OPTIONS, settings.currency)}
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              {ORGANIZATION_SETTINGS_COPY.operationalReadOnlyHint}
            </p>
          </div>
        ) : (
          /* Vista edición: formulario sin panel anidado */
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {/* Grupo: Ubicación */}
            <p className={`mb-3 ${SUBSECTION_LABEL}`}>
              {ORGANIZATION_SETTINGS_COPY.operationalLocationSection}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="timezone" className={LABEL_CLASS}>
                  {ORGANIZATION_SETTINGS_COPY.operationalTimezoneLabel}
                </label>
                <Controller
                  name="timezone"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="timezone"
                      options={TIMEZONE_OPTIONS}
                      menuClassName={SELECT_MENU_CLASS}
                      className="min-h-11"
                      name={field.name}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  )}
                />
                {errors.timezone?.message && (
                  <p className={ERROR_CLASS}>{errors.timezone.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="country" className={LABEL_CLASS}>
                  {ORGANIZATION_SETTINGS_COPY.operationalCountryLabel}
                </label>
                <Controller
                  name="country"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="country"
                      options={COUNTRY_OPTIONS}
                      menuClassName={SELECT_MENU_CLASS}
                      className="min-h-11"
                      name={field.name}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  )}
                />
                {errors.country?.message && <p className={ERROR_CLASS}>{errors.country.message}</p>}
              </div>
            </div>

            <hr className="my-4 border-gray-100 dark:border-dark-border" />

            {/* Grupo: Preferencias */}
            <p className={`mb-3 ${SUBSECTION_LABEL}`}>
              {ORGANIZATION_SETTINGS_COPY.operationalPreferencesSection}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="language" className={LABEL_CLASS}>
                  {ORGANIZATION_SETTINGS_COPY.operationalLanguageLabel}
                </label>
                <Controller
                  name="language"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="language"
                      options={LANGUAGE_OPTIONS}
                      menuClassName={SELECT_MENU_CLASS}
                      className="min-h-11"
                      name={field.name}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  )}
                />
                {errors.language?.message && (
                  <p className={ERROR_CLASS}>{errors.language.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="currency" className={LABEL_CLASS}>
                  {ORGANIZATION_SETTINGS_COPY.operationalCurrencyLabel}
                </label>
                <Controller
                  name="currency"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="currency"
                      options={CURRENCY_OPTIONS}
                      menuClassName={SELECT_MENU_CLASS}
                      className="min-h-11"
                      name={field.name}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  )}
                />
                {errors.currency?.message && (
                  <p className={ERROR_CLASS}>{errors.currency.message}</p>
                )}
              </div>
            </div>

            {/* Feedback de servidor */}
            <FormStatus
              status={serverError ? 'error' : success ? 'success' : 'idle'}
              message={
                serverError ? (
                  <>
                    <span>{ORGANIZATION_SETTINGS_COPY.operationalErrorTitle}.</span>{' '}
                    <span>{serverError}</span>
                  </>
                ) : success ? (
                  <>
                    <span>{ORGANIZATION_SETTINGS_COPY.operationalSuccessTitle}.</span>{' '}
                    <span>{success}</span>
                  </>
                ) : undefined
              }
            />

            {/* Footer y CTA */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {ORGANIZATION_SETTINGS_COPY.operationalEditableHint}
              </p>
              <Button
                type="submit"
                size="lg"
                loading={isSubmitting}
                disabled={isSubmitting || !isDirty}
              >
                {ORGANIZATION_SETTINGS_COPY.operationalSaveAction}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
