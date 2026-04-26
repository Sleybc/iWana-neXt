'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Select } from '@iwana/ui';
import { ApiError, tenantApi, type AdminCredentials, type TenantListItem } from '@/lib/api-client';
import { CredentialsModal } from './CredentialsModal';
import { TenantCreateSummary } from './TenantCreateSummary';

// Validaciones opcionales compartidas entre secciones
const optionalPhone = z.string().max(50, 'Máximo 50 caracteres').optional().or(z.literal(''));

const optionalUrl = z.string().url('URL inválida (incluye https://)').optional().or(z.literal(''));

export const tenantCreateSchema = z.object({
  // Datos básicos — obligatorios
  name: z.string().min(1, 'Nombre requerido').max(255),
  slug: z
    .string()
    .min(1)
    .max(55)
    .regex(/^[a-z][a-z0-9-]{0,54}$/, 'Solo letras minúsculas, números y guiones'),
  contactEmail: z.string().email('Email inválido').max(255),
  maxSubscribers: z.number().int().min(0).optional(),
  // Datos legales — opcionales
  legalName: z.string().max(300).optional().or(z.literal('')),
  nit: z
    .string()
    .regex(/^\d{1,10}$/, 'NIT debe contener solo dígitos (máx. 10)')
    .optional()
    .or(z.literal('')),
  nitDv: z
    .string()
    .regex(/^\d$/, 'Dígito verificador debe ser un único dígito')
    .optional()
    .or(z.literal('')),
  companyType: z
    .enum(['SAS', 'LTDA', 'SA', 'PERSONA_NATURAL', 'COOPERATIVA', 'OTRO'])
    .optional()
    .or(z.literal('')),
  // Dirección — opcionales
  address: z.string().max(500).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  department: z.string().max(100).optional().or(z.literal('')),
  countryCode: z
    .string()
    .length(2, 'Debe ser un código de 2 letras (ISO 3166-1 alpha-2)')
    .regex(/^[A-Z]{2}$/, 'Solo letras mayúsculas (ej: CO)')
    .optional()
    .or(z.literal('')),
  postalCode: z.string().max(10).optional().or(z.literal('')),
  coordinates: z.string().max(50).optional().or(z.literal('')),
  // Contacto adicional — opcionales
  phone: optionalPhone,
  website: optionalUrl,
  economicSector: z.string().max(10).optional().or(z.literal('')),
  // Seguridad
  mfaRequiredAll: z.boolean().default(false),
  // Configuración regional
  timezone: z.string().default('America/Bogota'),
  currency: z.string().default('COP'),
  language: z.string().default('es-CO'),
  country: z.string().default('CO'),
});

type TenantCreateFormValues = z.infer<typeof tenantCreateSchema>;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 55);
}

const INPUT_CLASS =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-iwana-primary/30 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white';
const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';
const ERROR_CLASS = 'mt-1 text-xs text-red-600 dark:text-red-400';
const SUBSECTION_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400';

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
  { value: 'PERSONA_NATURAL', label: 'Persona natural' },
  { value: 'COOPERATIVA', label: 'Cooperativa' },
  { value: 'OTRO', label: 'Otro' },
];

export function TenantCreateForm() {
  const router = useRouter();
  const [createdTenant, setCreatedTenant] = useState<TenantListItem | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [credentials, setCredentials] = useState<AdminCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'esencial' | 'empresa' | 'contacto'>(
    'esencial',
  );
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (Object.keys(validationErrors).length > 0) {
      setTimeout(() => {
        const firstErrorSection = getFirstErrorSectionFromFormState();
        if (firstErrorSection) {
          setActiveSection(firstErrorSection);
        }
      }, 0);
    }
  }, [validationErrors]);

  const {
    register,
    control,
    setValue,
    watch,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<TenantCreateFormValues>({
    resolver: zodResolver(tenantCreateSchema) as never,
    defaultValues: {
      maxSubscribers: 0,
      countryCode: 'CO',
      mfaRequiredAll: false,
      timezone: 'America/Bogota',
      currency: 'COP',
      language: 'es-CO',
      country: 'CO',
    },
  });

  const FIELDS_BY_SECTION = {
    esencial: [
      'name',
      'slug',
      'contactEmail',
      'maxSubscribers',
      'mfaRequiredAll',
      'timezone',
      'currency',
      'language',
      'country',
    ] as const,
    empresa: [
      'legalName',
      'nit',
      'nitDv',
      'companyType',
      'address',
      'city',
      'department',
      'countryCode',
      'postalCode',
      'coordinates',
    ] as const,
    contacto: ['phone', 'website', 'economicSector'] as const,
  } as const;

  const hasErrorsInSection = (
    section: keyof typeof FIELDS_BY_SECTION,
    errs: Record<string, unknown>,
  ): boolean => {
    return FIELDS_BY_SECTION[section].some((field) => errs[field]);
  };

  const getFirstErrorSectionFromFormState = (): typeof activeSection | null => {
    const sectionOrder: (typeof activeSection)[] = ['esencial', 'empresa', 'contacto'];
    for (const section of sectionOrder) {
      if (hasErrorsInSection(section, errors as Record<string, unknown>)) {
        return section;
      }
    }
    return null;
  };

  const sectionsWithFormStateErrors = Object.keys(FIELDS_BY_SECTION).filter((section) =>
    hasErrorsInSection(
      section as keyof typeof FIELDS_BY_SECTION,
      errors as Record<string, unknown>,
    ),
  ) as (keyof typeof FIELDS_BY_SECTION)[];

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await trigger();
    const fieldNames = [
      'name',
      'slug',
      'contactEmail',
      'maxSubscribers',
      'mfaRequiredAll',
      'timezone',
      'currency',
      'language',
      'country',
      'legalName',
      'nit',
      'nitDv',
      'companyType',
      'address',
      'city',
      'department',
      'countryCode',
      'postalCode',
      'coordinates',
      'phone',
      'website',
      'economicSector',
    ] as const;
    const newValidationErrors: Record<string, boolean> = {};
    for (const field of fieldNames) {
      if (errors[field as keyof typeof errors]) {
        newValidationErrors[field] = true;
      }
    }
    setValidationErrors(newValidationErrors);
    if (Object.keys(newValidationErrors).length > 0) {
      return;
    }
    await handleSubmit(onSubmit)(e);
  };

  const getFirstErrorSectionFromErrors = (
    errs: Record<string, boolean>,
  ): typeof activeSection | null => {
    const sectionOrder: (typeof activeSection)[] = ['esencial', 'empresa', 'contacto'];
    for (const section of sectionOrder) {
      if (FIELDS_BY_SECTION[section].some((field) => errs[field])) {
        return section;
      }
    }
    return null;
  };

  const statusLabel = useMemo(() => {
    if (!createdTenant) return null;
    if (createdTenant.status === 'ACTIVE') return 'Provisioning completado.';
    if (createdTenant.status === 'PROVISIONING_FAILED') return 'El provisioning falló.';
    return 'Provisionando tenant...';
  }, [createdTenant]);

  const allValues = watch();

  const sectionCompleteness = useMemo(() => {
    const isFilled = (val: unknown): boolean => {
      if (typeof val === 'string') return val.trim().length > 0;
      return val != null && val !== false;
    };
    const esencialRequired = ['name', 'slug', 'contactEmail'] as const;
    const empresaTracked = ['legalName', 'nit', 'companyType', 'address', 'city', 'department'] as const;
    const contactoTracked = ['phone', 'website', 'economicSector'] as const;
    return [
      {
        label: 'Esencial',
        completed: esencialRequired.filter((f) => isFilled(allValues[f])).length,
        total: esencialRequired.length,
        required: true,
      },
      {
        label: 'Empresa',
        completed: empresaTracked.filter((f) => isFilled(allValues[f])).length,
        total: empresaTracked.length,
        required: false,
      },
      {
        label: 'Contacto',
        completed: contactoTracked.filter((f) => isFilled(allValues[f])).length,
        total: contactoTracked.length,
        required: false,
      },
    ];
  }, [allValues]);

  const provisioningStatus = useMemo(
    (): 'idle' | 'PROVISIONING' | 'ACTIVE' | 'PROVISIONING_FAILED' => {
      if (!createdTenant) return 'idle';
      if (createdTenant.status === 'ACTIVE') return 'ACTIVE';
      if (createdTenant.status === 'PROVISIONING_FAILED') return 'PROVISIONING_FAILED';
      return 'PROVISIONING';
    },
    [createdTenant],
  );

  const onSubmit = async (values: TenantCreateFormValues) => {
    setError(null);
    setSuccessMessage(null);
    setCreatedTenant(null);

    try {
      const payload = {
        name: values.name,
        slug: values.slug,
        contactEmail: values.contactEmail,
        ...(values.maxSubscribers != null ? { maxSubscribers: values.maxSubscribers } : {}),
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
        settings: {
          timezone: values.timezone,
          currency: values.currency,
          language: values.language,
          country: values.country,
          features: {
            mfa_required_all: values.mfaRequiredAll ?? false,
          },
        },
      } as Parameters<typeof tenantApi.create>[0];

      const created = await tenantApi.create(payload);
      setCreatedTenant(created);
      // Feedback inmediato de creación exitosa — igual que ProfileForm
      setSuccessMessage(`Empresa "${created.name}" creada correctamente. Provisionando schema...`);

      if (created.status === 'PROVISIONING') {
        setIsPolling(true);
        await pollProvisioning(created.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible crear la empresa.');
    } finally {
      setIsPolling(false);
    }
  };

  const pollProvisioning = async (tenantId: string) => {
    let attempts = 0;
    while (attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const current = await tenantApi.getOne(tenantId);
      setCreatedTenant(current);
      if (current.status === 'ACTIVE') {
        setSuccessMessage(`Empresa "${current.name}" activa y lista para usar.`);
        return;
      }
      if (current.status === 'PROVISIONING_FAILED') {
        setSuccessMessage(null);
        setError(`El provisioning de "${current.name}" falló. Revisa los logs del worker.`);
        return;
      }
      attempts += 1;
    }
    setIsPolling(false);
    setSuccessMessage(`Empresa creada. El provisioning está tomando más tiempo del esperado.`);
  };

  const getCredentials = async () => {
    if (!createdTenant) return;

    try {
      const creds = await tenantApi.regenerateCredentials(createdTenant.id, crypto.randomUUID());
      setCredentials(creds);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible regenerar credenciales.');
    }
  };

  const getBootstrapCredentials = async () => {
    if (!createdTenant) return;

    try {
      const creds = await tenantApi.getBootstrapCredentials(createdTenant.id);
      setCredentials(creds);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No fue posible consultar el acceso inicial fijo del tenant.',
      );
    }
  };

  const tabs: { key: typeof activeSection; label: string }[] = [
    { key: 'esencial', label: 'Esencial' },
    { key: 'empresa', label: 'Empresa' },
    { key: 'contacto', label: 'Contacto' },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      {/* ── Panel izquierdo: formulario ────────────────────────────── */}
      <div className="space-y-4">
        {/* Alertas */}
        {error && (
          <div className="rounded-[20px] border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="rounded-[20px] border border-emerald-200/80 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-400">
            {successMessage}
          </div>
        )}

        {/* Resumen de errores por sección */}
        {sectionsWithFormStateErrors.length > 0 && (
          <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-900/20">
            <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {sectionsWithFormStateErrors.length}
              </span>
              {sectionsWithFormStateErrors.length === 1 ? 'Error en ' : 'Errores en '}
              {sectionsWithFormStateErrors
                .map((s) => `"${tabs.find((t) => t.key === s)?.label}"`)
                .join(', ')}
            </p>
          </div>
        )}

        {/* Navegación por tabs */}
        <div className="flex gap-1 rounded-xl bg-gray-100/80 p-1 dark:bg-dark-surface-3">
          {tabs.map((tab) => {
            const hasError = hasErrorsInSection(tab.key, errors as Record<string, unknown>);
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSection(tab.key)}
                className={`relative flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  activeSection === tab.key
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-surface-2 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
                {hasError && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    !
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <form className="space-y-4" onSubmit={handleFormSubmit}>
          {/* ── ESENCIAL: Datos básicos + Regional ──────────────────── */}
          {activeSection === 'esencial' && (
            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:border-dark-border dark:bg-dark-surface-2">
              <p className={`mb-4 ${SUBSECTION_LABEL}`}>Datos de la empresa</p>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="tenant-name" className={LABEL_CLASS}>
                      Nombre comercial <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="tenant-name"
                      className={INPUT_CLASS}
                      placeholder="ISP Colombia S.A.S"
                      {...register('name')}
                      onChange={(event) => {
                        const value = event.target.value;
                        setValue('name', value);
                        if (!watch('slug')) {
                          setValue('slug', slugify(value));
                        }
                      }}
                    />
                    {errors.name && <p className={ERROR_CLASS}>{errors.name.message}</p>}
                  </div>

                  <div>
                    <label htmlFor="tenant-slug" className={LABEL_CLASS}>
                      Identificador (slug) <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="tenant-slug"
                      className={INPUT_CLASS}
                      placeholder="isp-colombia"
                      {...register('slug')}
                    />
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      Solo minúsculas, números y guiones. Permanente.
                    </p>
                    {errors.slug && <p className={ERROR_CLASS}>{errors.slug.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="tenant-contact-email" className={LABEL_CLASS}>
                      Email de contacto <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="tenant-contact-email"
                      type="email"
                      className={INPUT_CLASS}
                      placeholder="admin@empresa.co"
                      {...register('contactEmail')}
                    />
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      Contacto empresarial principal.
                    </p>
                    {errors.contactEmail && (
                      <p className={ERROR_CLASS}>{errors.contactEmail.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="tenant-max-subscribers" className={LABEL_CLASS}>
                      Máximo suscriptores
                    </label>
                    <input
                      id="tenant-max-subscribers"
                      type="number"
                      min={0}
                      className={INPUT_CLASS}
                      {...register('maxSubscribers', { valueAsNumber: true })}
                    />
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">0 = sin límite.</p>
                  </div>
                </div>

                <hr className="border-gray-100 dark:border-dark-border" />
                <p className={SUBSECTION_LABEL}>Configuración regional</p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="tenant-timezone" className={LABEL_CLASS}>
                      Zona horaria
                    </label>
                    <Controller
                      control={control}
                      name="timezone"
                      render={({ field, fieldState }) => (
                        <Select
                          id="tenant-timezone"
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
                    <label htmlFor="tenant-currency" className={LABEL_CLASS}>
                      Moneda
                    </label>
                    <Controller
                      control={control}
                      name="currency"
                      render={({ field, fieldState }) => (
                        <Select
                          id="tenant-currency"
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
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="tenant-language" className={LABEL_CLASS}>
                      Idioma
                    </label>
                    <Controller
                      control={control}
                      name="language"
                      render={({ field, fieldState }) => (
                        <Select
                          id="tenant-language"
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
                    <label htmlFor="tenant-country" className={LABEL_CLASS}>
                      País operativo
                    </label>
                    <Controller
                      control={control}
                      name="country"
                      render={({ field, fieldState }) => (
                        <Select
                          id="tenant-country"
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

                <hr className="border-gray-100 dark:border-dark-border" />
                <p className={SUBSECTION_LABEL}>Seguridad</p>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 dark:border-dark-border dark:bg-dark-surface-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-iwana-primary"
                    {...register('mfaRequiredAll')}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      Requerir verificación en dos pasos (MFA) a todos los usuarios
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      Cada usuario será redirigido al setup MFA en su primer ingreso.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* ── EMPRESA: Datos legales + Dirección ──────────────────── */}
          {activeSection === 'empresa' && (
            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:border-dark-border dark:bg-dark-surface-2">
              <p className={`mb-4 ${SUBSECTION_LABEL}`}>Datos legales</p>

              <div className="space-y-4">
                <div>
                  <label htmlFor="tenant-legal-name" className={LABEL_CLASS}>
                    Razón social (Cámara de Comercio)
                  </label>
                  <input
                    id="tenant-legal-name"
                    className={INPUT_CLASS}
                    placeholder="ISP Colombia S.A.S"
                    {...register('legalName')}
                  />
                  {errors.legalName && <p className={ERROR_CLASS}>{errors.legalName.message}</p>}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
                  <div>
                    <label htmlFor="tenant-nit" className={LABEL_CLASS}>
                      NIT
                    </label>
                    <input
                      id="tenant-nit"
                      className={INPUT_CLASS}
                      placeholder="900123456"
                      {...register('nit')}
                    />
                    {errors.nit && <p className={ERROR_CLASS}>{errors.nit.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="tenant-nit-dv" className={LABEL_CLASS}>
                      DV
                    </label>
                    <input
                      id="tenant-nit-dv"
                      className={INPUT_CLASS}
                      maxLength={1}
                      placeholder="0"
                      {...register('nitDv')}
                    />
                    {errors.nitDv && <p className={ERROR_CLASS}>{errors.nitDv.message}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="tenant-company-type" className={LABEL_CLASS}>
                    Tipo de empresa
                  </label>
                  <Controller
                    control={control}
                    name="companyType"
                    render={({ field, fieldState }) => (
                      <Select
                        id="tenant-company-type"
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

                <hr className="border-gray-100 dark:border-dark-border" />
                <p className={SUBSECTION_LABEL}>Dirección física</p>

                <div>
                  <label htmlFor="tenant-address" className={LABEL_CLASS}>
                    Dirección completa
                  </label>
                  <input
                    id="tenant-address"
                    className={INPUT_CLASS}
                    placeholder="Calle 100 # 50-20"
                    {...register('address')}
                  />
                  {errors.address && <p className={ERROR_CLASS}>{errors.address.message}</p>}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="tenant-city" className={LABEL_CLASS}>
                      Ciudad
                    </label>
                    <input
                      id="tenant-city"
                      className={INPUT_CLASS}
                      placeholder="Bogotá"
                      {...register('city')}
                    />
                    {errors.city && <p className={ERROR_CLASS}>{errors.city.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="tenant-department" className={LABEL_CLASS}>
                      Departamento
                    </label>
                    <input
                      id="tenant-department"
                      className={INPUT_CLASS}
                      placeholder="Cundinamarca"
                      {...register('department')}
                    />
                    {errors.department && (
                      <p className={ERROR_CLASS}>{errors.department.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
                  <div>
                    <label htmlFor="tenant-country-code" className={LABEL_CLASS}>
                      País (ISO)
                    </label>
                    <input
                      id="tenant-country-code"
                      className={INPUT_CLASS}
                      maxLength={2}
                      placeholder="CO"
                      {...register('countryCode')}
                    />
                    {errors.countryCode && (
                      <p className={ERROR_CLASS}>{errors.countryCode.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="tenant-postal-code" className={LABEL_CLASS}>
                      Código postal
                    </label>
                    <input
                      id="tenant-postal-code"
                      className={INPUT_CLASS}
                      placeholder="110111"
                      {...register('postalCode')}
                    />
                    {errors.postalCode && (
                      <p className={ERROR_CLASS}>{errors.postalCode.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="tenant-coordinates" className={LABEL_CLASS}>
                    Coordenadas GPS{' '}
                    <span className="text-xs font-normal text-gray-400">(lat,lng)</span>
                  </label>
                  <input
                    id="tenant-coordinates"
                    className={INPUT_CLASS}
                    placeholder="4.6097,-74.0817"
                    {...register('coordinates')}
                  />
                  {errors.coordinates && (
                    <p className={ERROR_CLASS}>{errors.coordinates.message}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── CONTACTO ────────────────────────────────────────────── */}
          {activeSection === 'contacto' && (
            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:border-dark-border dark:bg-dark-surface-2">
              <p className={`mb-4 ${SUBSECTION_LABEL}`}>Contacto adicional</p>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="tenant-phone" className={LABEL_CLASS}>
                      Teléfono principal
                    </label>
                    <input
                      id="tenant-phone"
                      type="tel"
                      className={INPUT_CLASS}
                      placeholder="3001234567"
                      {...register('phone')}
                    />
                    {errors.phone && <p className={ERROR_CLASS}>{errors.phone.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="tenant-website" className={LABEL_CLASS}>
                      Sitio web
                    </label>
                    <input
                      id="tenant-website"
                      type="url"
                      className={INPUT_CLASS}
                      placeholder="https://mi-isp.com"
                      {...register('website')}
                    />
                    {errors.website && <p className={ERROR_CLASS}>{errors.website.message}</p>}
                  </div>
                </div>

                <div className="sm:w-1/2">
                  <label htmlFor="tenant-economic-sector" className={LABEL_CLASS}>
                    Código CIIU{' '}
                    <span className="text-xs font-normal text-gray-400">(sector económico)</span>
                  </label>
                  <input
                    id="tenant-economic-sector"
                    className={INPUT_CLASS}
                    placeholder="6110"
                    {...register('economicSector')}
                  />
                  {errors.economicSector && (
                    <p className={ERROR_CLASS}>{errors.economicSector.message}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" loading={isSubmitting || isPolling}>
            Crear empresa
          </Button>
        </form>

        {/* Acciones post-creación */}
        {createdTenant && (
          <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:border-dark-border dark:bg-dark-surface-2">
            <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
              <strong className="text-gray-900 dark:text-white">{createdTenant.name}</strong>
              {' — '}
              {statusLabel}
            </p>

            {createdTenant.status === 'ACTIVE' && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={getBootstrapCredentials}>
                  Ver acceso inicial
                </Button>
                <Button type="button" variant="secondary" onClick={getCredentials}>
                  Regenerar credenciales
                </Button>
                <Button
                  type="button"
                  onClick={() => router.push(`/tenants/${createdTenant.id}/settings`)}
                >
                  Configurar empresa
                </Button>
              </div>
            )}

            {createdTenant.status === 'PROVISIONING_FAILED' && (
              <p className="text-sm text-red-600 dark:text-red-400">
                El provisioning falló. Revisa logs del worker.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Panel derecho: resumen en tiempo real ───────────────────── */}
      <TenantCreateSummary
        name={allValues.name ?? ''}
        slug={allValues.slug ?? ''}
        contactEmail={allValues.contactEmail ?? ''}
        sections={sectionCompleteness}
        provisioningStatus={provisioningStatus}
      />

      <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  );
}


