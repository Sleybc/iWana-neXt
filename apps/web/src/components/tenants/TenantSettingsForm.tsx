'use client';

import { CheckCircle2, CircleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Alert,
  AlertTitle,
  Button,
  CheckboxCard,
  FormFieldset,
  FormPanel,
  FormSectionTitle,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@iwana/ui';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ApiError, tenantApi, type TenantListItem } from '@/lib/api-client';
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
} from '@/lib/tenant-form-validation';
import { TenantBrandingForm } from './TenantBrandingForm';

// ── Esquemas Zod ─────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  timezone: z.string().min(1, 'Requerido'),
  currency: z.string().length(3, 'Código de 3 letras (ej: COP)'),
  language: z.string().min(2, 'Requerido'),
  country: z.string().length(2, 'Código ISO 2 letras (ej: CO)'),
  maxSubscribers: optionalMaxSubscribersSchema,
  billing: z.boolean().default(false),
  mfa_required_all: z.boolean().default(false),
});

const businessSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(255),
  contactEmail: z.string().email('Email inválido').max(255),
  legalName: z.string().max(300).optional().or(z.literal('')),
  nit: optionalNitSchema,
  nitDv: optionalNitDvSchema,
  companyType: optionalCompanyTypeSchema,
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
  phone: optionalPhoneSchema,
  website: optionalUrlSchema,
  economicSector: optionalEconomicSectorSchema,
});

type SettingsFormValues = z.infer<typeof settingsSchema>;
type BusinessFormValues = z.infer<typeof businessSchema>;

// ── Componente ────────────────────────────────────────────────────────────────

export function TenantSettingsForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'config' | 'empresa' | 'marca' | 'peligro'>('config');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [tenantName, setTenantName] = useState<string>('');
  const [tenantStatus, setTenantStatus] = useState<string>('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tenant, setTenant] = useState<TenantListItem | null>(null);

  const settingsForm = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema) as never,
    defaultValues: {
      timezone: 'America/Bogota',
      currency: 'COP',
      language: 'es-CO',
      country: 'CO',
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
        setTenant(tenant);
      } catch {
        setError('No fue posible cargar los datos de la empresa.');
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
        maxSubscribers: values.maxSubscribers ?? null,
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
      const updatedTenant = await tenantApi.update(tenantId, payload);
      setTenant(updatedTenant);
      setTenantName(updatedTenant.name);
      setTenantStatus(updatedTenant.status);
      setSuccess('Datos de empresa actualizados.');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No fue posible actualizar los datos de empresa.',
      );
    }
  };

  const handleDelete = async () => {
    setError(null);
    setSuccess(null);
    setIsDeleting(true);

    try {
      await tenantApi.delete(tenantId);
      setDeleteConfirmOpen(false);
      router.push('/tenants');
    } catch (err) {
      setDeleteConfirmOpen(false);
      setError(err instanceof ApiError ? err.message : 'No fue posible eliminar la empresa.');
    } finally {
      setIsDeleting(false);
    }
  };

  const tabs = [
    { key: 'config' as const, label: 'Configuración operativa' },
    { key: 'empresa' as const, label: 'Datos de empresa' },
    { key: 'marca' as const, label: 'Marca empresarial' },
    { key: 'peligro' as const, label: 'Zona de peligro', danger: true },
  ];

  if (isLoadingData) {
    return (
      <div className="space-y-4">
        <div className="h-11 w-full max-w-[620px] animate-pulse rounded-xl bg-gray-100 shadow-iwana-soft dark:bg-dark-surface-3" />
        <FormPanel>
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
        </FormPanel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Alertas globales */}
      {error && (
        <Alert variant="error" icon={<CircleAlert className="h-5 w-5" />}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" icon={<CheckCircle2 className="h-5 w-5" />}>
          {success}
        </Alert>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as typeof activeTab);
          setSuccess(null);
          setError(null);
        }}
      >
        {/* Navegación por tabs */}
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex min-w-full md:min-w-0">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                variant={tab.danger ? 'danger' : 'default'}
                className="flex-1 md:min-w-[190px] md:flex-none"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── Tab: Configuración operativa ─────────────────────────────── */}
        <TabsContent value="config">
          <form className="space-y-4" onSubmit={settingsForm.handleSubmit(onSaveSettings)}>
            <FormPanel>
              {/* Configuración regional */}
              <FormSectionTitle className="mb-3">Configuración regional</FormSectionTitle>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                <div className="xl:col-span-8">
                  <FormFieldset legend="Parámetros regionales" title="Parámetros regionales">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Controller
                        control={settingsForm.control}
                        name="timezone"
                        render={({ field, fieldState }) => (
                          <Select
                            id="cfg-timezone"
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
                        control={settingsForm.control}
                        name="currency"
                        render={({ field, fieldState }) => (
                          <Select
                            id="cfg-currency"
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
                      <Controller
                        control={settingsForm.control}
                        name="language"
                        render={({ field, fieldState }) => (
                          <Select
                            id="cfg-language"
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
                        control={settingsForm.control}
                        name="country"
                        render={({ field, fieldState }) => (
                          <Select
                            id="cfg-country"
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
                  </FormFieldset>
                </div>
                <div className="xl:col-span-4">
                  <FormFieldset legend="Límites operativos" title="Límites operativos">
                    <Input
                      id="cfg-max-sub"
                      type="number"
                      min={0}
                      label="Máximo suscriptores"
                      helperText="Déjalo en blanco para no aplicar límite. Usa 0 para bloquear nuevos suscriptores."
                      {...settingsForm.register('maxSubscribers', { setValueAs: numberOrNull })}
                    />
                  </FormFieldset>
                </div>
              </div>

              <hr className="my-4 border-gray-100 dark:border-dark-border" />

              {/* Seguridad */}
              <FormSectionTitle className="mb-3">Seguridad</FormSectionTitle>
              <FormFieldset legend="Políticas activas" title="Políticas activas">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <CheckboxCard
                    className="bg-white dark:bg-dark-surface-2"
                    label="Facturación habilitada"
                    description="Activa el módulo de facturación y cobro dentro de la empresa."
                    {...settingsForm.register('billing')}
                  />
                  <CheckboxCard
                    className="bg-white dark:bg-dark-surface-2"
                    label="Requerir MFA a todos los usuarios"
                    description="Obliga a completar verificación en dos pasos en el primer ingreso."
                    {...settingsForm.register('mfa_required_all')}
                  />
                </div>
              </FormFieldset>
            </FormPanel>

            <div className="flex justify-end">
              <Button type="submit" size="lg" loading={settingsForm.formState.isSubmitting}>
                Guardar configuración
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* ── Tab: Datos de empresa ─────────────────────────────────────── */}
        <TabsContent value="empresa">
          <form className="space-y-4" onSubmit={businessForm.handleSubmit(onSaveBusiness)}>
            {/* Datos básicos */}
            <FormPanel>
              <FormSectionTitle className="mb-3">Datos básicos</FormSectionTitle>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                <Input
                  containerClassName="xl:col-span-6"
                  label="Nombre comercial"
                  requiredIndicator
                  {...businessForm.register('name')}
                  {...fieldError(businessForm.formState.errors.name?.message)}
                />
                <Input
                  containerClassName="xl:col-span-6"
                  type="email"
                  label="Email de contacto"
                  requiredIndicator
                  {...businessForm.register('contactEmail')}
                  {...fieldError(businessForm.formState.errors.contactEmail?.message)}
                />
              </div>

              <hr className="my-4 border-gray-100 dark:border-dark-border" />

              {/* Datos legales */}
              <FormSectionTitle className="mb-3">Datos legales</FormSectionTitle>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                <Input
                  containerClassName="xl:col-span-5"
                  label="Razón social (Cámara de Comercio)"
                  placeholder="Empresa de Telecomunicaciones S.A.S."
                  {...businessForm.register('legalName')}
                  {...fieldError(businessForm.formState.errors.legalName?.message)}
                />
                <div className="xl:col-span-4">
                  <Controller
                    control={businessForm.control}
                    name="companyType"
                    render={({ field, fieldState }) => (
                      <Select
                        id="business-company-type"
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
                </div>
                <div className="xl:col-span-3">
                  <FormFieldset legend="NIT y dígito verificador" title="NIT y dígito verificador">
                    <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
                      <Input
                        label="NIT"
                        placeholder="900123456"
                        {...businessForm.register('nit')}
                        {...fieldError(businessForm.formState.errors.nit?.message)}
                      />
                      <Input
                        label="DV"
                        maxLength={1}
                        placeholder="DV"
                        {...businessForm.register('nitDv')}
                        {...fieldError(businessForm.formState.errors.nitDv?.message)}
                      />
                    </div>
                  </FormFieldset>
                </div>
              </div>

              <hr className="my-4 border-gray-100 dark:border-dark-border" />

              {/* Dirección */}
              <FormSectionTitle className="mb-3">Dirección física</FormSectionTitle>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                <Input
                  containerClassName="xl:col-span-6"
                  label="Dirección completa"
                  placeholder="Calle 100 # 50-20"
                  {...businessForm.register('address')}
                />
                <Input
                  containerClassName="xl:col-span-3"
                  label={
                    <>
                      Coordenadas GPS <span className="font-normal text-gray-400">(lat,lng)</span>
                    </>
                  }
                  placeholder="4.6097,-74.0817"
                  {...businessForm.register('coordinates')}
                />
                <div className="xl:col-span-6">
                  <FormFieldset legend="Ubicación administrativa" title="Ubicación administrativa">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        label="Ciudad"
                        placeholder="Bogotá"
                        {...businessForm.register('city')}
                      />
                      <Input
                        label="Departamento"
                        placeholder="Cundinamarca"
                        {...businessForm.register('department')}
                      />
                    </div>
                  </FormFieldset>
                </div>
                <div className="xl:col-span-3">
                  <FormFieldset legend="País y código postal" title="País y código postal">
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
                      <Input
                        label="ISO"
                        maxLength={2}
                        placeholder="CO"
                        {...businessForm.register('countryCode')}
                        {...fieldError(businessForm.formState.errors.countryCode?.message)}
                      />
                      <Input
                        label="Postal"
                        placeholder="110111"
                        {...businessForm.register('postalCode')}
                      />
                    </div>
                  </FormFieldset>
                </div>
              </div>

              <hr className="my-4 border-gray-100 dark:border-dark-border" />

              {/* Contacto adicional */}
              <FormSectionTitle className="mb-3">Contacto adicional</FormSectionTitle>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                <Input
                  containerClassName="xl:col-span-4"
                  type="tel"
                  label="Teléfono principal"
                  placeholder="+573001234567"
                  {...businessForm.register('phone')}
                  {...fieldError(businessForm.formState.errors.phone?.message)}
                />
                <Input
                  containerClassName="xl:col-span-5"
                  type="url"
                  label="Sitio web"
                  placeholder="https://mi-isp.com"
                  {...businessForm.register('website')}
                  {...fieldError(businessForm.formState.errors.website?.message)}
                />
                <Input
                  containerClassName="xl:col-span-3"
                  label={
                    <>
                      Código CIIU{' '}
                      <span className="font-normal text-gray-400">(sector económico)</span>
                    </>
                  }
                  placeholder="6110"
                  {...businessForm.register('economicSector')}
                />
              </div>
            </FormPanel>

            <div className="flex justify-end">
              <Button type="submit" size="lg" loading={businessForm.formState.isSubmitting}>
                Guardar datos de empresa
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* ── Tab: Zona de peligro ─────────────────────────────────────── */}
        <TabsContent value="marca">
          {tenant ? (
            <TenantBrandingForm
              tenantId={tenantId}
              tenant={tenant}
              onUpdated={(updatedTenant) => {
                setTenant(updatedTenant);
                setTenantName(updatedTenant.name);
                setTenantStatus(updatedTenant.status);
              }}
            />
          ) : (
            <FormPanel>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No fue posible cargar el branding actual de la empresa.
              </p>
            </FormPanel>
          )}
        </TabsContent>

        {/* ── Tab: Zona de peligro ─────────────────────────────────────── */}
        <TabsContent value="peligro">
          <div className="space-y-4">
            <Alert variant="error" className="p-5">
              <AlertTitle className="text-base">Eliminar empresa</AlertTitle>
              <p className="mt-2 text-sm">
                Esta acción es <strong>irreversible</strong>. Se eliminará la empresa "{tenantName}"
                y todos sus datos asociados, incluyendo:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                <li>Todos los usuarios y sus credenciales</li>
                <li>Todos los registros de facturación</li>
                <li>Todos los histórico de operaciones</li>
                <li>El schema completo de base de datos</li>
              </ul>
              <p className="mt-3 text-xs font-medium">Estado actual: {tenantStatus}</p>
            </Alert>

            <Button
              type="button"
              variant="destructive"
              size="lg"
              onClick={() => setDeleteConfirmOpen(true)}
              className="w-full md:w-auto"
            >
              Eliminar empresa permanentemente
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Eliminar empresa"
        description={
          <>
            Esta acción es irreversible. Se eliminará la empresa <strong>{tenantName}</strong> y
            todos sus datos asociados: usuarios y credenciales, facturación, histórico operativo y
            el schema completo de base de datos.
          </>
        }
        confirmationText={tenantName}
        confirmationLabel={
          <>
            Para confirmar, escribe el nombre de la empresa: <strong>{tenantName}</strong>
          </>
        }
        confirmLabel="Sí, eliminar empresa"
        isConfirming={isDeleting}
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}
