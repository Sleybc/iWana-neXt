'use client';

import { CheckCircle2, CircleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Select } from '@iwana/ui';
import { ApiError, tenantApi } from '@/lib/api-client';

// ── Esquemas Zod ─────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  timezone: z.string().min(1, 'Requerido'),
  currency: z.string().length(3, 'Código de 3 letras (ej: COP)'),
  language: z.string().min(2, 'Requerido'),
  country: z.string().length(2, 'Código ISO 2 letras (ej: CO)'),
  maxSubscribers: z.number().int().min(0),
  billing: z.boolean().default(false),
  mfa_required_all: z.boolean().default(false),
});

const businessSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(255),
  contactEmail: z.string().email('Email inválido').max(255),
  legalName: z.string().max(300).optional().or(z.literal('')),
  nit: z
    .string()
    .regex(/^\d{1,10}$/, 'Solo dígitos, máx. 10')
    .optional()
    .or(z.literal('')),
  nitDv: z.string().regex(/^\d$/, 'Un solo dígito').optional().or(z.literal('')),
  companyType: z
    .enum(['SAS', 'LTDA', 'SA', 'PERSONA_NATURAL', 'COOPERATIVA', 'OTRO'])
    .optional()
    .or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  department: z.string().max(100).optional().or(z.literal('')),
  countryCode: z
    .string()
    .length(2, 'Código ISO de 2 letras')
    .regex(/^[A-Z]{2}$/, 'Solo letras mayúsculas')
    .optional()
    .or(z.literal('')),
  postalCode: z.string().max(10).optional().or(z.literal('')),
  coordinates: z.string().max(50).optional().or(z.literal('')),
  phone: z.string().max(20, 'Máximo 20 caracteres').optional().or(z.literal('')),
  website: z.string().url('URL inválida (incluye https://)').optional().or(z.literal('')),
  economicSector: z.string().max(10).optional().or(z.literal('')),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;
type BusinessFormValues = z.infer<typeof businessSchema>;

// ── Opciones de selects con etiquetas legibles ────────────────────────────────

const TIMEZONE_OPTIONS = [
  { value: 'America/Bogota', label: 'America/Bogota (Colombia)' },
  { value: 'America/Guayaquil', label: 'America/Guayaquil (Ecuador)' },
  { value: 'America/Lima', label: 'America/Lima (Perú)' },
  { value: 'America/Mexico_City', label: 'America/Mexico_City (México)' },
  { value: 'America/New_York', label: 'America/New_York (EE.UU.)' },
  { value: 'America/Santiago', label: 'America/Santiago (Chile)' },
  { value: 'America/Buenos_Aires', label: 'America/Buenos_Aires (Argentina)' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid (España)' },
  { value: 'UTC', label: 'UTC' },
];

const CURRENCY_OPTIONS = [
  { value: 'COP', label: 'COP — Peso colombiano' },
  { value: 'USD', label: 'USD — Dólar estadounidense' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'MXN', label: 'MXN — Peso mexicano' },
  { value: 'PEN', label: 'PEN — Sol peruano' },
  { value: 'CLP', label: 'CLP — Peso chileno' },
  { value: 'ARS', label: 'ARS — Peso argentino' },
];

const LANGUAGE_OPTIONS = [
  { value: 'es-CO', label: 'Español — Colombia' },
  { value: 'es-MX', label: 'Español — México' },
  { value: 'es-PE', label: 'Español — Perú' },
  { value: 'es-ES', label: 'Español — España' },
  { value: 'en-US', label: 'English (en-US)' },
];

const COUNTRY_OPTIONS = [
  { value: 'CO', label: 'Colombia' },
  { value: 'EC', label: 'Ecuador' },
  { value: 'MX', label: 'México' },
  { value: 'PE', label: 'Perú' },
  { value: 'US', label: 'Estados Unidos' },
  { value: 'CL', label: 'Chile' },
  { value: 'AR', label: 'Argentina' },
  { value: 'ES', label: 'España' },
];

const COMPANY_TYPE_OPTIONS = [
  { value: '', label: 'Sin definir' },
  { value: 'SAS', label: 'Sociedad por Acciones Simplificada (SAS)' },
  { value: 'LTDA', label: 'Sociedad de Responsabilidad Limitada (LTDA)' },
  { value: 'SA', label: 'Sociedad Anónima (SA)' },
  { value: 'PERSONA_NATURAL', label: 'Persona Natural' },
  { value: 'COOPERATIVA', label: 'Cooperativa' },
  { value: 'OTRO', label: 'Otro' },
];

// ── Clases compartidas (alineadas con TenantCreateForm) ───────────────────────

const INPUT =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-iwana-primary/30 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white';
const LABEL = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';
const ERR = 'mt-1 text-xs text-red-600 dark:text-red-400';
const SUBSECTION_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400';
const FIELDSET_CLASS =
  'rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-dark-border dark:bg-dark-surface-3/60';
const FIELDSET_LEGEND = 'sr-only';
const FIELDSET_TITLE = 'mb-3 text-sm font-medium text-gray-700 dark:text-gray-300';
const MINI_LABEL = 'mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400';

// ── Componente ────────────────────────────────────────────────────────────────

export function TenantSettingsForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'config' | 'empresa' | 'peligro'>('config');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [tenantName, setTenantName] = useState<string>('');
  const [tenantStatus, setTenantStatus] = useState<string>('');

  const settingsForm = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema) as never,
    defaultValues: {
      timezone: 'America/Bogota',
      currency: 'COP',
      language: 'es-CO',
      country: 'CO',
      maxSubscribers: 0,
      billing: false,
      mfa_required_all: false,
    },
  });

  const businessForm = useForm<BusinessFormValues>({
    resolver: zodResolver(businessSchema) as never,
    defaultValues: { countryCode: 'CO' },
  });

  useEffect(() => {
    const load = async () => {
      setIsLoadingData(true);
      try {
        const [settings, tenant] = await Promise.all([
          tenantApi.getSettings(tenantId),
          tenantApi.getOne(tenantId),
        ]);

        settingsForm.setValue('timezone', settings.timezone);
        settingsForm.setValue('currency', settings.currency);
        settingsForm.setValue('language', settings.language);
        settingsForm.setValue('country', settings.country);
        settingsForm.setValue('maxSubscribers', settings.maxSubscribers);
        settingsForm.setValue('billing', settings.features.billing);
        settingsForm.setValue('mfa_required_all', settings.features.mfa_required_all);

        businessForm.reset({
          name: tenant.name,
          contactEmail: tenant.contactEmail,
          legalName: tenant.legalName ?? '',
          nit: tenant.nit ?? '',
          nitDv: tenant.nitDv ?? '',
          companyType: (tenant.companyType as BusinessFormValues['companyType']) ?? undefined,
          address: tenant.address ?? '',
          city: tenant.city ?? '',
          department: tenant.department ?? '',
          countryCode: tenant.countryCode ?? 'CO',
          postalCode: tenant.postalCode ?? '',
          coordinates: tenant.coordinates ?? '',
          phone: tenant.phone ?? '',
          website: tenant.website ?? '',
          economicSector: tenant.economicSector ?? '',
        });

        setTenantName(tenant.name);
        setTenantStatus(tenant.status);
      } catch {
        setError('No fue posible cargar los datos del tenant.');
      } finally {
        setIsLoadingData(false);
      }
    };

    void load();
  }, [tenantId, settingsForm, businessForm]);

  const onSaveSettings = async (values: SettingsFormValues) => {
    setError(null);
    setSuccess(null);
    try {
      await tenantApi.updateSettings(tenantId, {
        timezone: values.timezone,
        currency: values.currency,
        language: values.language,
        country: values.country,
        maxSubscribers: values.maxSubscribers,
        features: { billing: values.billing, mfa_required_all: values.mfa_required_all },
      });
      setSuccess('Configuración operativa actualizada.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible guardar la configuración.');
    }
  };

  const onSaveBusiness = async (values: BusinessFormValues) => {
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        name: values.name,
        contactEmail: values.contactEmail,
        ...(values.legalName ? { legalName: values.legalName } : {}),
        ...(values.nit ? { nit: values.nit } : {}),
        ...(values.nitDv ? { nitDv: values.nitDv } : {}),
        ...(values.companyType ? { companyType: values.companyType } : {}),
        ...(values.address ? { address: values.address } : {}),
        ...(values.city ? { city: values.city } : {}),
        ...(values.department ? { department: values.department } : {}),
        ...(values.countryCode ? { countryCode: values.countryCode } : {}),
        ...(values.postalCode ? { postalCode: values.postalCode } : {}),
        ...(values.coordinates ? { coordinates: values.coordinates } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.website ? { website: values.website } : {}),
        ...(values.economicSector ? { economicSector: values.economicSector } : {}),
      };
      await tenantApi.update(tenantId, payload);
      setSuccess('Datos de empresa actualizados.');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No fue posible actualizar los datos de empresa.',
      );
    }
  };

  const handleDelete = async () => {
    const warningMessage = `
⚠️ ADVERTENCIA: Esta acción es IRREVERSIBLE

Al eliminar la empresa "${tenantName}" se eliminarán:
- Todos los datos de la empresa
- Todos los usuarios y sus credenciales
- Todos los registros de facturación
- Todos los histórico de operaciones
- El schema completo de base de datos

Esta acción no se puede deshacer. ¿Está absolutamente seguro?
    `.trim();

    if (!confirm(warningMessage)) return;
    if (!confirm('¿CONFIRMAR ELIMINACIÓN?\n\nEsta acción es permanente y no se puede deshacer.'))
      return;

    setError(null);
    setSuccess(null);

    try {
      await tenantApi.delete(tenantId);
      router.push('/tenants');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible eliminar la empresa.');
    }
  };

  const tabs = [
    { key: 'config' as const, label: 'Configuración operativa' },
    { key: 'empresa' as const, label: 'Datos de empresa' },
    { key: 'peligro' as const, label: 'Zona de peligro', danger: true },
  ];

  if (isLoadingData) {
    return (
      <div className="space-y-4">
        <div className="h-11 w-full max-w-[620px] animate-pulse rounded-xl bg-gray-100 shadow-iwana-soft dark:bg-dark-surface-3" />
        <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2 dark:shadow-none">
          <div className="space-y-4 animate-pulse">
            <div className="h-3 w-36 rounded-full bg-gray-100 dark:bg-dark-surface-3" />
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
              <div className="h-24 rounded-2xl bg-gray-100 dark:bg-dark-surface-3 xl:col-span-8" />
              <div className="h-24 rounded-2xl bg-gray-100 dark:bg-dark-surface-3 xl:col-span-4" />
            </div>
            <div className="h-px bg-gray-100 dark:bg-dark-border" />
            <div className="h-3 w-24 rounded-full bg-gray-100 dark:bg-dark-surface-3" />
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div className="h-24 rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
              <div className="h-24 rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Alertas globales */}
      {error && (
        <div className="flex items-start gap-3 rounded-[24px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] px-4 py-3 text-sm text-red-700 shadow-iwana-soft dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:shadow-none">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 rounded-[24px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(209,250,229,0.82))] px-4 py-3 text-sm text-emerald-700 shadow-iwana-soft dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400 dark:shadow-none">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{success}</p>
        </div>
      )}

      {/* Navegación por tabs */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full gap-1 rounded-xl bg-gray-100/80 p-1 dark:bg-dark-surface-3 md:min-w-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setSuccess(null);
                setError(null);
              }}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all md:min-w-[190px] md:flex-none ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-surface-2 dark:text-white'
                  : tab.danger
                    ? 'text-red-500 hover:text-red-600 dark:text-red-400'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Configuración operativa ─────────────────────────────── */}
      {activeTab === 'config' && (
        <form className="space-y-4" onSubmit={settingsForm.handleSubmit(onSaveSettings)}>
          <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:border-dark-border dark:bg-dark-surface-2">
            {/* Configuración regional */}
            <p className={`mb-3 ${SUBSECTION_LABEL}`}>Configuración regional</p>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
              <div className="xl:col-span-8">
                <fieldset className={FIELDSET_CLASS}>
                  <legend className={FIELDSET_LEGEND}>Parámetros regionales</legend>
                  <p className={FIELDSET_TITLE}>Parámetros regionales</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <label htmlFor="cfg-timezone" className={MINI_LABEL}>
                        Zona horaria
                      </label>
                      <Controller
                        control={settingsForm.control}
                        name="timezone"
                        render={({ field, fieldState }) => (
                          <Select
                            id="cfg-timezone"
                            options={TIMEZONE_OPTIONS}
                            value={field.value}
                            name={field.name}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            {...(fieldState.error ? { error: fieldState.error.message } : {})}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label htmlFor="cfg-currency" className={MINI_LABEL}>
                        Moneda
                      </label>
                      <Controller
                        control={settingsForm.control}
                        name="currency"
                        render={({ field, fieldState }) => (
                          <Select
                            id="cfg-currency"
                            options={CURRENCY_OPTIONS}
                            value={field.value}
                            name={field.name}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            {...(fieldState.error ? { error: fieldState.error.message } : {})}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label htmlFor="cfg-language" className={MINI_LABEL}>
                        Idioma
                      </label>
                      <Controller
                        control={settingsForm.control}
                        name="language"
                        render={({ field, fieldState }) => (
                          <Select
                            id="cfg-language"
                            options={LANGUAGE_OPTIONS}
                            value={field.value}
                            name={field.name}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            {...(fieldState.error ? { error: fieldState.error.message } : {})}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label htmlFor="cfg-country" className={MINI_LABEL}>
                        País operativo
                      </label>
                      <Controller
                        control={settingsForm.control}
                        name="country"
                        render={({ field, fieldState }) => (
                          <Select
                            id="cfg-country"
                            options={COUNTRY_OPTIONS}
                            value={field.value}
                            name={field.name}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            {...(fieldState.error ? { error: fieldState.error.message } : {})}
                          />
                        )}
                      />
                    </div>
                  </div>
                </fieldset>
              </div>
              <div className="xl:col-span-4">
                <fieldset className={FIELDSET_CLASS}>
                  <legend className={FIELDSET_LEGEND}>Límites operativos</legend>
                  <p className={FIELDSET_TITLE}>Límites operativos</p>
                  <label htmlFor="cfg-max-sub" className={MINI_LABEL}>
                    Máximo suscriptores
                  </label>
                  <input
                    id="cfg-max-sub"
                    type="number"
                    min={0}
                    className={INPUT}
                    {...settingsForm.register('maxSubscribers', { valueAsNumber: true })}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Define el tope de suscriptores activos. Usa `0` para dejarlo sin límite.
                  </p>
                </fieldset>
              </div>
            </div>

            <hr className="my-4 border-gray-100 dark:border-dark-border" />

            {/* Seguridad */}
            <p className={`mb-3 ${SUBSECTION_LABEL}`}>Seguridad</p>
            <fieldset className={FIELDSET_CLASS}>
              <legend className={FIELDSET_LEGEND}>Políticas activas</legend>
              <p className={FIELDSET_TITLE}>Políticas activas</p>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 bg-white p-3 dark:border-dark-border dark:bg-dark-surface-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-iwana-primary"
                    {...settingsForm.register('billing')}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Billing habilitado
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Activa el módulo de facturación y cobro dentro del tenant.
                    </p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 bg-white p-3 dark:border-dark-border dark:bg-dark-surface-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-iwana-primary"
                    {...settingsForm.register('mfa_required_all')}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Requerir MFA a todos los usuarios
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Obliga a completar verificación en dos pasos en el primer ingreso.
                    </p>
                  </div>
                </label>
              </div>
            </fieldset>
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={settingsForm.formState.isSubmitting}>
              Guardar configuración
            </Button>
          </div>
        </form>
      )}

      {/* ── Tab: Datos de empresa ─────────────────────────────────────── */}
      {activeTab === 'empresa' && (
        <form className="space-y-4" onSubmit={businessForm.handleSubmit(onSaveBusiness)}>
          {/* Datos básicos */}
          <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:border-dark-border dark:bg-dark-surface-2">
            <p className={`mb-3 ${SUBSECTION_LABEL}`}>Datos básicos</p>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
              <div className="xl:col-span-6">
                <label className={LABEL}>
                  Nombre comercial <span className="text-red-500">*</span>
                </label>
                <input className={INPUT} {...businessForm.register('name')} />
                {businessForm.formState.errors.name && (
                  <p className={ERR}>{businessForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="xl:col-span-6">
                <label className={LABEL}>
                  Email de contacto <span className="text-red-500">*</span>
                </label>
                <input type="email" className={INPUT} {...businessForm.register('contactEmail')} />
                {businessForm.formState.errors.contactEmail && (
                  <p className={ERR}>{businessForm.formState.errors.contactEmail.message}</p>
                )}
              </div>
            </div>

            <hr className="my-4 border-gray-100 dark:border-dark-border" />

            {/* Datos legales */}
            <p className={`mb-3 ${SUBSECTION_LABEL}`}>Datos legales</p>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
              <div className="xl:col-span-5">
                <label className={LABEL}>Razón social (Cámara de Comercio)</label>
                <input
                  className={INPUT}
                  placeholder="Empresa de Telecomunicaciones S.A.S."
                  {...businessForm.register('legalName')}
                />
                {businessForm.formState.errors.legalName && (
                  <p className={ERR}>{businessForm.formState.errors.legalName.message}</p>
                )}
              </div>
              <div className="xl:col-span-4">
                <label className={LABEL}>Tipo de empresa</label>
                <Controller
                  control={businessForm.control}
                  name="companyType"
                  render={({ field, fieldState }) => (
                    <Select
                      id="business-company-type"
                      options={COMPANY_TYPE_OPTIONS}
                      value={field.value ?? ''}
                      name={field.name}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      {...(fieldState.error ? { error: fieldState.error.message } : {})}
                    />
                  )}
                />
              </div>
              <div className="xl:col-span-3">
                <fieldset className={FIELDSET_CLASS}>
                  <legend className={FIELDSET_LEGEND}>NIT y dígito verificador</legend>
                  <p className={FIELDSET_TITLE}>NIT y dígito verificador</p>
                  <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
                    <div>
                      <label className={MINI_LABEL}>NIT</label>
                      <input
                        className={INPUT}
                        placeholder="900123456"
                        {...businessForm.register('nit')}
                      />
                      {businessForm.formState.errors.nit && (
                        <p className={ERR}>{businessForm.formState.errors.nit.message}</p>
                      )}
                    </div>
                    <div>
                      <label className={MINI_LABEL}>DV</label>
                      <input
                        className={INPUT}
                        maxLength={1}
                        placeholder="DV"
                        {...businessForm.register('nitDv')}
                      />
                      {businessForm.formState.errors.nitDv && (
                        <p className={ERR}>{businessForm.formState.errors.nitDv.message}</p>
                      )}
                    </div>
                  </div>
                </fieldset>
              </div>
            </div>

            <hr className="my-4 border-gray-100 dark:border-dark-border" />

            {/* Dirección */}
            <p className={`mb-3 ${SUBSECTION_LABEL}`}>Dirección física</p>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
              <div className="xl:col-span-6">
                <label className={LABEL}>Dirección completa</label>
                <input
                  className={INPUT}
                  placeholder="Calle 100 # 50-20"
                  {...businessForm.register('address')}
                />
              </div>
              <div className="xl:col-span-3">
                <label className={LABEL}>
                  Coordenadas GPS <span className="font-normal text-gray-400">(lat,lng)</span>
                </label>
                <input
                  className={INPUT}
                  placeholder="4.6097,-74.0817"
                  {...businessForm.register('coordinates')}
                />
              </div>
              <div className="xl:col-span-6">
                <fieldset className={FIELDSET_CLASS}>
                  <legend className={FIELDSET_LEGEND}>Ubicación administrativa</legend>
                  <p className={FIELDSET_TITLE}>Ubicación administrativa</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={MINI_LABEL}>Ciudad</label>
                      <input
                        className={INPUT}
                        placeholder="Bogotá"
                        {...businessForm.register('city')}
                      />
                    </div>
                    <div>
                      <label className={MINI_LABEL}>Departamento</label>
                      <input
                        className={INPUT}
                        placeholder="Cundinamarca"
                        {...businessForm.register('department')}
                      />
                    </div>
                  </div>
                </fieldset>
              </div>
              <div className="xl:col-span-3">
                <fieldset className={FIELDSET_CLASS}>
                  <legend className={FIELDSET_LEGEND}>País y código postal</legend>
                  <p className={FIELDSET_TITLE}>País y código postal</p>
                  <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
                    <div>
                      <label className={MINI_LABEL}>ISO</label>
                      <input
                        className={INPUT}
                        maxLength={2}
                        placeholder="CO"
                        {...businessForm.register('countryCode')}
                      />
                      {businessForm.formState.errors.countryCode && (
                        <p className={ERR}>{businessForm.formState.errors.countryCode.message}</p>
                      )}
                    </div>
                    <div>
                      <label className={MINI_LABEL}>Postal</label>
                      <input
                        className={INPUT}
                        placeholder="110111"
                        {...businessForm.register('postalCode')}
                      />
                    </div>
                  </div>
                </fieldset>
              </div>
            </div>

            <hr className="my-4 border-gray-100 dark:border-dark-border" />

            {/* Contacto adicional */}
            <p className={`mb-3 ${SUBSECTION_LABEL}`}>Contacto adicional</p>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
              <div className="xl:col-span-4">
                <label className={LABEL}>Teléfono principal</label>
                <input
                  type="tel"
                  className={INPUT}
                  placeholder="+573001234567"
                  {...businessForm.register('phone')}
                />
                {businessForm.formState.errors.phone && (
                  <p className={ERR}>{businessForm.formState.errors.phone.message}</p>
                )}
              </div>
              <div className="xl:col-span-5">
                <label className={LABEL}>Sitio web</label>
                <input
                  type="url"
                  className={INPUT}
                  placeholder="https://mi-isp.com"
                  {...businessForm.register('website')}
                />
                {businessForm.formState.errors.website && (
                  <p className={ERR}>{businessForm.formState.errors.website.message}</p>
                )}
              </div>
              <div className="xl:col-span-3">
                <label className={LABEL}>
                  Código CIIU <span className="font-normal text-gray-400">(sector económico)</span>
                </label>
                <input
                  className={INPUT}
                  placeholder="6110"
                  {...businessForm.register('economicSector')}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={businessForm.formState.isSubmitting}>
              Guardar datos de empresa
            </Button>
          </div>
        </form>
      )}

      {/* ── Tab: Zona de peligro ─────────────────────────────────────── */}
      {activeTab === 'peligro' && (
        <div className="space-y-4">
          <div className="rounded-[24px] border border-red-200 bg-red-50 p-5 dark:border-red-800 dark:bg-red-900/20">
            <h3 className="text-base font-semibold text-red-700 dark:text-red-400">
              Eliminar empresa
            </h3>
            <p className="mt-2 text-sm text-red-600 dark:text-red-300">
              Esta acción es <strong>irreversible</strong>. Se eliminará la empresa "{tenantName}" y
              todos sus datos asociados, incluyendo:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-red-600 dark:text-red-300">
              <li>Todos los usuarios y sus credenciales</li>
              <li>Todos los registros de facturación</li>
              <li>Todos los histórico de operaciones</li>
              <li>El schema completo de base de datos</li>
            </ul>
            <p className="mt-3 text-xs font-medium text-red-500 dark:text-red-400">
              Estado actual: {tenantStatus}
            </p>
          </div>

          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            className="w-full md:w-auto"
          >
            Eliminar empresa permanentemente
          </Button>
        </div>
      )}
    </div>
  );
}
