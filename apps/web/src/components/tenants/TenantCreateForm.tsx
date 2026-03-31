'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@iwana/ui';
import { ApiError, tenantApi, type AdminCredentials, type TenantListItem } from '@/lib/api-client';
import { CredentialsModal } from './CredentialsModal';

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
  companyType: z.enum(['SAS', 'LTDA', 'SA', 'PERSONA_NATURAL', 'COOPERATIVA', 'OTRO']).optional(),
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
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-iwana-primary/30 dark:border-dark-border dark:bg-dark-surface-3';
const LABEL_CLASS = 'mb-1 block text-sm font-medium';
const ERROR_CLASS = 'mt-1 text-xs text-red-600';
const SECTION_CLASS = 'space-y-3 rounded-xl border border-gray-200 p-4 dark:border-dark-border';
const SECTION_TITLE_CLASS = 'text-sm font-semibold text-gray-700 dark:text-gray-300';

export function TenantCreateForm() {
  const router = useRouter();
  const [createdTenant, setCreatedTenant] = useState<TenantListItem | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [credentials, setCredentials] = useState<AdminCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<
    'basico' | 'legal' | 'direccion' | 'contacto' | 'regional'
  >('basico');
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
    basico: ['name', 'slug', 'contactEmail', 'maxSubscribers', 'mfaRequiredAll'] as const,
    regional: ['timezone', 'currency', 'language', 'country'] as const,
    legal: ['legalName', 'nit', 'nitDv', 'companyType'] as const,
    direccion: [
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
    const sectionOrder: (typeof activeSection)[] = [
      'basico',
      'regional',
      'legal',
      'direccion',
      'contacto',
    ];
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
    const sectionOrder: (typeof activeSection)[] = [
      'basico',
      'regional',
      'legal',
      'direccion',
      'contacto',
    ];
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

  // Pestañas de sección
  const tabs: { key: typeof activeSection; label: string }[] = [
    { key: 'basico', label: 'Básico' },
    { key: 'regional', label: 'Regional' },
    { key: 'legal', label: 'Datos legales' },
    { key: 'direccion', label: 'Dirección' },
    { key: 'contacto', label: 'Contacto' },
  ];

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {successMessage && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{successMessage}</p>
      )}

      {/* Resumen de errores */}
      {sectionsWithFormStateErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
          <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
              {sectionsWithFormStateErrors.length}
            </span>
            {sectionsWithFormStateErrors.length === 1
              ? 'Se encontró un error en la pestaña '
              : `Se encontraron ${sectionsWithFormStateErrors.length} errores en las pestañas `}
            {sectionsWithFormStateErrors
              .map((s) => `"${tabs.find((t) => t.key === s)?.label}"`)
              .join(', ')}
          </p>
        </div>
      )}

      {/* Navegación por tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-dark-surface-3">
        {tabs.map((tab) => {
          const hasError = hasErrorsInSection(tab.key, errors as Record<string, unknown>);
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSection(tab.key)}
              className={`relative whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeSection === tab.key
                  ? 'bg-white shadow-sm dark:bg-dark-surface-2'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400'
              }`}
            >
              {tab.label}
              {hasError && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                  !
                </span>
              )}
            </button>
          );
        })}
      </div>

      <form className="space-y-4" onSubmit={handleFormSubmit}>
        {/* ── Sección: Datos básicos ────────────────────────────────── */}
        {activeSection === 'basico' && (
          <div className={SECTION_CLASS}>
            <p className={SECTION_TITLE_CLASS}>Datos básicos</p>

            <div>
              <label htmlFor="tenant-name" className={LABEL_CLASS}>
                Nombre comercial <span className="text-red-500">*</span>
              </label>
              <input
                id="tenant-name"
                className={INPUT_CLASS}
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
              <input id="tenant-slug" className={INPUT_CLASS} {...register('slug')} />
              <p className="mt-1 text-xs text-gray-500">
                Solo letras minúsculas, números y guiones. No se puede cambiar después.
              </p>
              {errors.slug && <p className={ERROR_CLASS}>{errors.slug.message}</p>}
            </div>

            <div>
              <label htmlFor="tenant-contact-email" className={LABEL_CLASS}>
                Email de contacto <span className="text-red-500">*</span>
              </label>
              <input
                id="tenant-contact-email"
                type="email"
                className={INPUT_CLASS}
                {...register('contactEmail')}
              />
              <p className="mt-1 text-xs text-gray-500">
                Este correo se usa como contacto empresarial. El acceso inicial del tenant se crea
                con el usuario genérico admin@iwana.co y luego puede cambiarse desde Perfil.
              </p>
              {errors.contactEmail && <p className={ERROR_CLASS}>{errors.contactEmail.message}</p>}
            </div>

            <div>
              <label htmlFor="tenant-max-subscribers" className={LABEL_CLASS}>
                Máximo suscriptores
              </label>
              <input
                id="tenant-max-subscribers"
                type="number"
                className={INPUT_CLASS}
                {...register('maxSubscribers', { valueAsNumber: true })}
              />
              <p className="mt-1 text-xs text-gray-500">0 = sin límite definido.</p>
            </div>

            <div className="rounded-lg border border-gray-200 p-3 dark:border-dark-border">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Seguridad
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded" {...register('mfaRequiredAll')} />
                Requerir verificación en dos pasos (MFA) a todos los usuarios
              </label>
              <p className="mt-1 text-xs text-gray-400">
                Si se activa, cada usuario será redirigido al setup de MFA en su primer ingreso.
              </p>
            </div>
          </div>
        )}

        {/* ── Sección: Regional ─────────────────────────────────────── */}
        {activeSection === 'regional' && (
          <div className={SECTION_CLASS}>
            <p className={SECTION_TITLE_CLASS}>Configuración regional</p>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              Define la zona horaria, moneda, idioma y país operativo de la empresa.
            </p>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label htmlFor="tenant-timezone" className={LABEL_CLASS}>
                  Zona horaria
                </label>
                <select id="tenant-timezone" className={INPUT_CLASS} {...register('timezone')}>
                  <option value="America/Bogota">America/Bogota (Colombia)</option>
                  <option value="America/Guayaquil">America/Guayaquil (Ecuador)</option>
                  <option value="America/Lima">America/Lima (Perú)</option>
                  <option value="America/Mexico_City">America/Mexico_City (México)</option>
                  <option value="America/New_York">America/New_York (EE.UU.)</option>
                  <option value="America/Santiago">America/Santiago (Chile)</option>
                  <option value="America/Buenos_Aires">America/Buenos_Aires (Argentina)</option>
                  <option value="Europe/Madrid">Europe/Madrid (España)</option>
                  <option value="UTC">UTC</option>
                </select>
                {errors.timezone && <p className={ERROR_CLASS}>{errors.timezone.message}</p>}
              </div>

              <div>
                <label htmlFor="tenant-currency" className={LABEL_CLASS}>
                  Moneda
                </label>
                <select id="tenant-currency" className={INPUT_CLASS} {...register('currency')}>
                  <option value="COP">COP — Peso colombiano</option>
                  <option value="USD">USD — Dólar estadounidense</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="MXN">MXN — Peso mexicano</option>
                  <option value="PEN">PEN — Sol peruano</option>
                  <option value="CLP">CLP — Peso chileno</option>
                  <option value="ARS">ARS — Peso argentino</option>
                </select>
                {errors.currency && <p className={ERROR_CLASS}>{errors.currency.message}</p>}
              </div>

              <div>
                <label htmlFor="tenant-language" className={LABEL_CLASS}>
                  Idioma
                </label>
                <select id="tenant-language" className={INPUT_CLASS} {...register('language')}>
                  <option value="es-CO">Español de Colombia (es-CO)</option>
                  <option value="es-MX">Español de México (es-MX)</option>
                  <option value="es-PE">Español de Perú (es-PE)</option>
                  <option value="es-ES">Español de España (es-ES)</option>
                  <option value="en-US">English (en-US)</option>
                </select>
                {errors.language && <p className={ERROR_CLASS}>{errors.language.message}</p>}
              </div>

              <div>
                <label htmlFor="tenant-country" className={LABEL_CLASS}>
                  País operativo
                </label>
                <select id="tenant-country" className={INPUT_CLASS} {...register('country')}>
                  <option value="CO">Colombia (CO)</option>
                  <option value="EC">Ecuador (EC)</option>
                  <option value="MX">México (MX)</option>
                  <option value="PE">Perú (PE)</option>
                  <option value="US">Estados Unidos (US)</option>
                  <option value="CL">Chile (CL)</option>
                  <option value="AR">Argentina (AR)</option>
                  <option value="ES">España (ES)</option>
                </select>
                {errors.country && <p className={ERROR_CLASS}>{errors.country.message}</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── Sección: Datos legales ────────────────────────────────── */}
        {activeSection === 'legal' && (
          <div className={SECTION_CLASS}>
            <p className={SECTION_TITLE_CLASS}>Datos legales</p>

            <div>
              <label htmlFor="tenant-legal-name" className={LABEL_CLASS}>
                Razón social (Cámara de Comercio)
              </label>
              <input id="tenant-legal-name" className={INPUT_CLASS} {...register('legalName')} />
              {errors.legalName && <p className={ERROR_CLASS}>{errors.legalName.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                  Dígito verificador
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
              <select id="tenant-company-type" className={INPUT_CLASS} {...register('companyType')}>
                <option value="">-- Seleccionar --</option>
                <option value="SAS">Sociedad por Acciones Simplificada (SAS)</option>
                <option value="LTDA">Sociedad de Responsabilidad Limitada (LTDA)</option>
                <option value="SA">Sociedad Anónima (SA)</option>
                <option value="PERSONA_NATURAL">Persona Natural</option>
                <option value="COOPERATIVA">Cooperativa</option>
                <option value="OTRO">Otro</option>
              </select>
              {errors.companyType && <p className={ERROR_CLASS}>{errors.companyType.message}</p>}
            </div>
          </div>
        )}

        {/* ── Sección: Dirección ───────────────────────────────────── */}
        {activeSection === 'direccion' && (
          <div className={SECTION_CLASS}>
            <p className={SECTION_TITLE_CLASS}>Dirección física</p>

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

            <div className="grid grid-cols-2 gap-3">
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
                {errors.department && <p className={ERROR_CLASS}>{errors.department.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                {errors.countryCode && <p className={ERROR_CLASS}>{errors.countryCode.message}</p>}
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
                {errors.postalCode && <p className={ERROR_CLASS}>{errors.postalCode.message}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="tenant-coordinates" className={LABEL_CLASS}>
                Coordenadas GPS <span className="text-xs font-normal text-gray-400">(lat,lng)</span>
              </label>
              <input
                id="tenant-coordinates"
                className={INPUT_CLASS}
                placeholder="4.6097,-74.0817"
                {...register('coordinates')}
              />
              {errors.coordinates && <p className={ERROR_CLASS}>{errors.coordinates.message}</p>}
            </div>
          </div>
        )}

        {/* ── Sección: Contacto adicional ──────────────────────────── */}
        {activeSection === 'contacto' && (
          <div className={SECTION_CLASS}>
            <p className={SECTION_TITLE_CLASS}>Contacto adicional</p>

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

            <div>
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
        )}

        <Button type="submit" loading={isSubmitting || isPolling}>
          Crear empresa
        </Button>
      </form>

      {createdTenant && (
        <div className="rounded-lg border border-gray-200 p-3 text-sm">
          <p>
            Estado de <strong>{createdTenant.name}</strong>: {statusLabel}
          </p>

          {createdTenant.status === 'ACTIVE' && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={getBootstrapCredentials}>
                Ver acceso inicial fijo
              </Button>
              <Button type="button" variant="secondary" onClick={getCredentials}>
                Regenerar credenciales temporales
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
            <p className="mt-2 text-red-600">El provisioning falló. Revisa logs del worker.</p>
          )}
        </div>
      )}

      <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  );
}
