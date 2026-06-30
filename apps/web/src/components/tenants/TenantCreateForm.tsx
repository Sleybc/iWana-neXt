'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, type FieldErrors, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Alert,
  Button,
  CheckboxCard,
  FormPanel,
  FormSectionTitle,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@iwana/ui';
import { ApiError, tenantApi, type AdminCredentials, type TenantListItem } from '@/lib/api-client';
import {
  COMPANY_TYPE_OPTIONS,
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  LANGUAGE_OPTIONS,
  TIMEZONE_OPTIONS,
} from '@/lib/tenant-form-options';
import {
  fieldError,
  optionalCompanyTypeSchema,
  optionalEconomicSectorSchema,
  optionalMaxSubscribersSchema,
  optionalNitDvSchema,
  optionalNitSchema,
  optionalPhoneSchema,
  optionalUrlSchema,
  numberOrNull,
  slugify,
} from '@/lib/tenant-form-validation';
import {
  getTenantCredentialIdempotencyKey,
  type TenantCredentialIdempotencyState,
} from '@/lib/tenant-idempotency';
import { CredentialsModal } from './CredentialsModal';
import { TenantCreateSummary } from './TenantCreateSummary';

export const tenantCreateSchema = z.object({
  // Datos básicos — obligatorios
  name: z.string().min(1, 'Nombre requerido').max(255),
  slug: z
    .string()
    .min(1)
    .max(55)
    .regex(/^[a-z][a-z0-9-]{0,54}$/, 'Solo letras minúsculas, números y guiones'),
  contactEmail: z.string().email('Email inválido').max(255),
  maxSubscribers: optionalMaxSubscribersSchema,
  // Datos legales — opcionales
  legalName: z.string().max(300).optional().or(z.literal('')),
  nit: optionalNitSchema,
  nitDv: optionalNitDvSchema,
  companyType: optionalCompanyTypeSchema,
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
  phone: optionalPhoneSchema,
  website: optionalUrlSchema,
  economicSector: optionalEconomicSectorSchema,
  // Seguridad
  mfaRequiredAll: z.boolean().default(false),
  // Configuración regional
  timezone: z.string().default('America/Bogota'),
  currency: z.string().default('COP'),
  language: z.string().default('es-CO'),
  country: z.string().default('CO'),
});

type TenantCreateFormValues = z.infer<typeof tenantCreateSchema>;

type TenantCreateSection = 'esencial' | 'empresa' | 'contacto';

export function TenantCreateForm() {
  const router = useRouter();
  const [createdTenant, setCreatedTenant] = useState<TenantListItem | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [credentials, setCredentials] = useState<AdminCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<TenantCreateSection>('esencial');
  const provisioningAbortRef = useRef<AbortController | null>(null);
  const credentialIdempotencyRef = useRef<TenantCredentialIdempotencyState | null>(null);

  useEffect(() => {
    return () => provisioningAbortRef.current?.abort();
  }, []);

  const {
    register,
    control,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TenantCreateFormValues>({
    resolver: zodResolver(tenantCreateSchema) as never,
    defaultValues: {
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

  const getFirstErrorSection = (
    errs: FieldErrors<TenantCreateFormValues>,
  ): TenantCreateSection | null => {
    const sectionOrder: TenantCreateSection[] = ['esencial', 'empresa', 'contacto'];
    for (const section of sectionOrder) {
      if (hasErrorsInSection(section, errs as Record<string, unknown>)) {
        return section;
      }
    }
    return null;
  };

  const onInvalid = (errs: FieldErrors<TenantCreateFormValues>) => {
    const firstErrorSection = getFirstErrorSection(errs);
    if (firstErrorSection) {
      setActiveSection(firstErrorSection);
    }
  };

  const sectionsWithFormStateErrors = Object.keys(FIELDS_BY_SECTION).filter((section) =>
    hasErrorsInSection(
      section as keyof typeof FIELDS_BY_SECTION,
      errors as Record<string, unknown>,
    ),
  ) as (keyof typeof FIELDS_BY_SECTION)[];

  const statusLabel = useMemo(() => {
    if (!createdTenant) return null;
    if (createdTenant.status === 'ACTIVE') return 'Configuración completada.';
    if (createdTenant.status === 'PROVISIONING_FAILED') return 'La configuración no se completó.';
    return 'Configurando empresa...';
  }, [createdTenant]);

  const allValues = watch();

  const sectionCompleteness = useMemo(() => {
    const isFilled = (val: unknown): boolean => {
      if (typeof val === 'string') return val.trim().length > 0;
      return val != null && val !== false;
    };
    const esencialRequired = ['name', 'slug', 'contactEmail'] as const;
    const empresaTracked = [
      'legalName',
      'nit',
      'companyType',
      'address',
      'city',
      'department',
    ] as const;
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

  const provisioningStatus = useMemo(():
    | 'idle'
    | 'PROVISIONING'
    | 'ACTIVE'
    | 'PROVISIONING_FAILED' => {
    if (!createdTenant) return 'idle';
    if (createdTenant.status === 'ACTIVE') return 'ACTIVE';
    if (createdTenant.status === 'PROVISIONING_FAILED') return 'PROVISIONING_FAILED';
    return 'PROVISIONING';
  }, [createdTenant]);

  const onSubmit = async (values: TenantCreateFormValues) => {
    setError(null);
    setSuccessMessage(null);
    setCreatedTenant(null);
    provisioningAbortRef.current?.abort();
    const provisioningAbortController = new AbortController();
    provisioningAbortRef.current = provisioningAbortController;

    try {
      const payload = {
        name: values.name,
        slug: values.slug,
        contactEmail: values.contactEmail,
        maxSubscribers: values.maxSubscribers ?? null,
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
      setSuccessMessage(
        `Empresa "${created.name}" creada correctamente. Iniciando configuración...`,
      );

      if (created.status === 'PROVISIONING') {
        setIsPolling(true);
        const finalTenant = await tenantApi.waitForProvisioning(created.id, {
          signal: provisioningAbortController.signal,
          onTick: setCreatedTenant,
        });

        if (finalTenant.status === 'ACTIVE') {
          setSuccessMessage(`Empresa "${finalTenant.name}" activa y lista para usar.`);
        } else if (finalTenant.status === 'PROVISIONING_FAILED') {
          setSuccessMessage(null);
          setError(
            `No fue posible completar la configuración de "${finalTenant.name}". Reintenta en unos minutos.`,
          );
        } else {
          setSuccessMessage(
            'Empresa creada. La configuración está tomando más tiempo del esperado.',
          );
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof ApiError ? err.message : 'No fue posible crear la empresa.');
    } finally {
      setIsPolling(false);
      if (provisioningAbortRef.current === provisioningAbortController) {
        provisioningAbortRef.current = null;
      }
    }
  };

  const getCredentials = async () => {
    if (!createdTenant) return;

    try {
      credentialIdempotencyRef.current = getTenantCredentialIdempotencyKey(
        credentialIdempotencyRef.current,
        createdTenant.id,
        () => crypto.randomUUID(),
      );
      const creds = await tenantApi.regenerateCredentials(
        createdTenant.id,
        credentialIdempotencyRef.current.key,
      );
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
          : 'No fue posible consultar el acceso inicial fijo de la empresa.',
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
        {error && <Alert variant="error">{error}</Alert>}
        {successMessage && <Alert variant="success">{successMessage}</Alert>}

        <FormPanel>
          <FormSectionTitle className="mb-2">Puesta en marcha inicial</FormSectionTitle>
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
            Completa los datos esenciales para registrar la empresa, dejar su contacto principal y
            preparar la activación inicial. Los campos legales y de contexto pueden ampliarse en
            esta misma alta o después, desde la configuración de la empresa.
          </p>
        </FormPanel>

        {/* Resumen de errores por sección */}
        {sectionsWithFormStateErrors.length > 0 && (
          <Alert variant="error">
            <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {sectionsWithFormStateErrors.length}
              </span>
              {sectionsWithFormStateErrors.length === 1 ? 'Error en ' : 'Errores en '}
              {sectionsWithFormStateErrors
                .map((s) => `"${tabs.find((t) => t.key === s)?.label}"`)
                .join(', ')}
            </p>
          </Alert>
        )}

        {/* Navegación por tabs */}
        <Tabs
          value={activeSection}
          onValueChange={(value) => setActiveSection(value as typeof activeSection)}
        >
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="flex-1"
                hasIndicator={hasErrorsInSection(tab.key, errors as Record<string, unknown>)}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <form className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit, onInvalid)}>
            {/* ── ESENCIAL: Datos básicos + Regional ──────────────────── */}
            <TabsContent value="esencial" className="mt-0">
              <FormPanel>
                <FormSectionTitle className="mb-4">Datos de la empresa</FormSectionTitle>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      id="tenant-name"
                      label="Nombre comercial"
                      requiredIndicator
                      placeholder="ISP Colombia S.A.S"
                      {...register('name')}
                      onChange={(event) => {
                        const value = event.target.value;
                        setValue('name', value);
                        if (!watch('slug')) {
                          setValue('slug', slugify(value));
                        }
                      }}
                      {...fieldError(errors.name?.message)}
                    />

                    <Input
                      id="tenant-slug"
                      label="Identificador (slug)"
                      requiredIndicator
                      placeholder="isp-colombia"
                      helperText="Solo minúsculas, números y guiones. Permanente."
                      {...register('slug')}
                      {...fieldError(errors.slug?.message)}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      id="tenant-contact-email"
                      type="email"
                      label="Email de contacto"
                      requiredIndicator
                      placeholder="admin@empresa.co"
                      helperText="Contacto empresarial principal."
                      {...register('contactEmail')}
                      {...fieldError(errors.contactEmail?.message)}
                    />

                    <Input
                      id="tenant-max-subscribers"
                      type="number"
                      min={0}
                      label="Máximo suscriptores"
                      helperText="Déjalo en blanco para no aplicar límite. Usa 0 para bloquear nuevos suscriptores."
                      {...register('maxSubscribers', { setValueAs: numberOrNull })}
                    />
                  </div>

                  <hr className="border-gray-100 dark:border-dark-border" />
                  <FormSectionTitle>Configuración regional</FormSectionTitle>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Controller
                      control={control}
                      name="timezone"
                      render={({ field, fieldState }) => (
                        <Select
                          id="tenant-timezone"
                          label="Zona horaria"
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

                    <Controller
                      control={control}
                      name="currency"
                      render={({ field, fieldState }) => (
                        <Select
                          id="tenant-currency"
                          label="Moneda"
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

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Controller
                      control={control}
                      name="language"
                      render={({ field, fieldState }) => (
                        <Select
                          id="tenant-language"
                          label="Idioma"
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

                    <Controller
                      control={control}
                      name="country"
                      render={({ field, fieldState }) => (
                        <Select
                          id="tenant-country"
                          label="País operativo"
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

                  <hr className="border-gray-100 dark:border-dark-border" />
                  <FormSectionTitle>Seguridad</FormSectionTitle>

                  <CheckboxCard
                    label="Requerir verificación en dos pasos (MFA) a todos los usuarios"
                    description="Cada usuario será redirigido al setup MFA en su primer ingreso."
                    {...register('mfaRequiredAll')}
                  />
                </div>
              </FormPanel>
            </TabsContent>

            {/* ── EMPRESA: Datos legales + Dirección ──────────────────── */}
            <TabsContent value="empresa" className="mt-0">
              <FormPanel>
                <FormSectionTitle className="mb-4">Datos legales</FormSectionTitle>

                <div className="space-y-4">
                  <Input
                    id="tenant-legal-name"
                    label="Razón social (Cámara de Comercio)"
                    placeholder="ISP Colombia S.A.S"
                    {...register('legalName')}
                    {...fieldError(errors.legalName?.message)}
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
                    <Input
                      id="tenant-nit"
                      label="NIT"
                      placeholder="900123456"
                      {...register('nit')}
                      {...fieldError(errors.nit?.message)}
                    />
                    <Input
                      id="tenant-nit-dv"
                      label="DV"
                      maxLength={1}
                      placeholder="0"
                      {...register('nitDv')}
                      {...fieldError(errors.nitDv?.message)}
                    />
                  </div>

                  <Controller
                    control={control}
                    name="companyType"
                    render={({ field, fieldState }) => (
                      <Select
                        id="tenant-company-type"
                        label="Tipo de empresa"
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

                  <hr className="border-gray-100 dark:border-dark-border" />
                  <FormSectionTitle>Dirección física</FormSectionTitle>

                  <Input
                    id="tenant-address"
                    label="Dirección completa"
                    placeholder="Calle 100 # 50-20"
                    {...register('address')}
                    {...fieldError(errors.address?.message)}
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      id="tenant-city"
                      label="Ciudad"
                      placeholder="Bogotá"
                      {...register('city')}
                      {...fieldError(errors.city?.message)}
                    />
                    <Input
                      id="tenant-department"
                      label="Departamento"
                      placeholder="Cundinamarca"
                      {...register('department')}
                      {...fieldError(errors.department?.message)}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
                    <Input
                      id="tenant-country-code"
                      label="País (ISO)"
                      maxLength={2}
                      placeholder="CO"
                      {...register('countryCode')}
                      {...fieldError(errors.countryCode?.message)}
                    />
                    <Input
                      id="tenant-postal-code"
                      label="Código postal"
                      placeholder="110111"
                      {...register('postalCode')}
                      {...fieldError(errors.postalCode?.message)}
                    />
                  </div>

                  <Input
                    id="tenant-coordinates"
                    label={
                      <>
                        Coordenadas GPS{' '}
                        <span className="text-xs font-normal text-gray-400">(lat,lng)</span>
                      </>
                    }
                    placeholder="4.6097,-74.0817"
                    {...register('coordinates')}
                    {...fieldError(errors.coordinates?.message)}
                  />
                </div>
              </FormPanel>
            </TabsContent>

            {/* ── CONTACTO ────────────────────────────────────────────── */}
            <TabsContent value="contacto" className="mt-0">
              <FormPanel>
                <FormSectionTitle className="mb-4">Contacto adicional</FormSectionTitle>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      id="tenant-phone"
                      type="tel"
                      label="Teléfono principal"
                      placeholder="3001234567"
                      {...register('phone')}
                      {...fieldError(errors.phone?.message)}
                    />
                    <Input
                      id="tenant-website"
                      type="url"
                      label="Sitio web"
                      placeholder="https://mi-isp.com"
                      {...register('website')}
                      {...fieldError(errors.website?.message)}
                    />
                  </div>

                  <Input
                    id="tenant-economic-sector"
                    containerClassName="sm:w-1/2"
                    label={
                      <>
                        Código CIIU{' '}
                        <span className="text-xs font-normal text-gray-400">
                          (sector económico)
                        </span>
                      </>
                    }
                    placeholder="6110"
                    {...register('economicSector')}
                    {...fieldError(errors.economicSector?.message)}
                  />
                </div>
              </FormPanel>
            </TabsContent>

            <Button type="submit" size="lg" className="w-full" loading={isSubmitting || isPolling}>
              Crear empresa
            </Button>
          </form>
        </Tabs>

        {/* Acciones post-creación */}
        {createdTenant && (
          <FormPanel className="p-4">
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
                La configuración no se completó. Reintenta en unos minutos.
              </p>
            )}
          </FormPanel>
        )}
      </div>

      {/* ── Panel derecho: resumen en tiempo real ───────────────────── */}
      <TenantCreateSummary
        name={allValues.name ?? ''}
        slug={allValues.slug ?? ''}
        contactEmail={allValues.contactEmail ?? ''}
        mfaRequiredAll={Boolean(allValues.mfaRequiredAll)}
        timezone={allValues.timezone ?? 'America/Bogota'}
        country={allValues.country ?? 'CO'}
        sections={sectionCompleteness}
        provisioningStatus={provisioningStatus}
      />

      <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  );
}
