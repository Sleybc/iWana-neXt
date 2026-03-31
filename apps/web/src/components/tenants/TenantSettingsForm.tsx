'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@iwana/ui';
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
  companyType: z.enum(['SAS', 'LTDA', 'SA', 'PERSONA_NATURAL', 'COOPERATIVA', 'OTRO']).optional(),
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

// ── Clases compartidas ────────────────────────────────────────────────────────

const INPUT =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-iwana-primary/30 dark:border-dark-border dark:bg-dark-surface-3';
const LABEL = 'mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400';
const ERR = 'mt-0.5 text-xs text-red-600';

// ── Componente ────────────────────────────────────────────────────────────────

export function TenantSettingsForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'config' | 'empresa' | 'peligro'>('config');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [tenantName, setTenantName] = useState<string>('');
  const [tenantStatus, setTenantStatus] = useState<string>('');

  // Formulario de configuración operativa
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

  // Formulario de datos de empresa
  const businessForm = useForm<BusinessFormValues>({
    resolver: zodResolver(businessSchema) as never,
    defaultValues: { countryCode: 'CO' },
  });

  // Cargar datos al montar
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
      // Construir payload con solo los campos con valor (la API acepta string | undefined)
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
    return <p className="text-sm text-gray-500">Cargando configuración...</p>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {success && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-dark-surface-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveTab(tab.key);
              setSuccess(null);
              setError(null);
            }}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white shadow-sm dark:bg-dark-surface-2'
                : tab.danger
                  ? 'text-red-600 hover:text-red-700 dark:text-red-400'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Configuración operativa ─────────────────────────────── */}
      {activeTab === 'config' && (
        <form className="space-y-4" onSubmit={settingsForm.handleSubmit(onSaveSettings)}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={LABEL}>Zona horaria</label>
              <input
                className={INPUT}
                placeholder="America/Bogota"
                {...settingsForm.register('timezone')}
              />
              {settingsForm.formState.errors.timezone && (
                <p className={ERR}>{settingsForm.formState.errors.timezone.message}</p>
              )}
            </div>
            <div>
              <label className={LABEL}>Moneda (ISO 4217)</label>
              <input
                className={INPUT}
                placeholder="COP"
                maxLength={3}
                {...settingsForm.register('currency')}
              />
              {settingsForm.formState.errors.currency && (
                <p className={ERR}>{settingsForm.formState.errors.currency.message}</p>
              )}
            </div>
            <div>
              <label className={LABEL}>Idioma (BCP 47)</label>
              <input className={INPUT} placeholder="es-CO" {...settingsForm.register('language')} />
            </div>
            <div>
              <label className={LABEL}>País (ISO 3166-1)</label>
              <input
                className={INPUT}
                placeholder="CO"
                maxLength={2}
                {...settingsForm.register('country')}
              />
            </div>
            <div>
              <label className={LABEL}>
                Máximo suscriptores{' '}
                <span className="font-normal text-gray-400">(0 = sin límite)</span>
              </label>
              <input
                type="number"
                className={INPUT}
                {...settingsForm.register('maxSubscribers', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-dark-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Funcionalidades
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="rounded" {...settingsForm.register('billing')} />
              Billing habilitado
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded"
                {...settingsForm.register('mfa_required_all')}
              />
              Requerir MFA a todos los usuarios
            </label>
          </div>

          <Button type="submit" loading={settingsForm.formState.isSubmitting}>
            Guardar configuración
          </Button>
        </form>
      )}

      {/* ── Tab: Datos de empresa ─────────────────────────────────────── */}
      {activeTab === 'empresa' && (
        <form className="space-y-4" onSubmit={businessForm.handleSubmit(onSaveBusiness)}>
          {/* Básico */}
          <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-dark-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Datos básicos
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={LABEL}>
                  Nombre comercial <span className="text-red-500">*</span>
                </label>
                <input className={INPUT} {...businessForm.register('name')} />
                {businessForm.formState.errors.name && (
                  <p className={ERR}>{businessForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <label className={LABEL}>
                  Email de contacto <span className="text-red-500">*</span>
                </label>
                <input type="email" className={INPUT} {...businessForm.register('contactEmail')} />
                {businessForm.formState.errors.contactEmail && (
                  <p className={ERR}>{businessForm.formState.errors.contactEmail.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Legal */}
          <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-dark-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Datos legales
            </p>
            <div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>NIT</label>
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
                <label className={LABEL}>Dígito verificador</label>
                <input
                  className={INPUT}
                  maxLength={1}
                  placeholder="0"
                  {...businessForm.register('nitDv')}
                />
                {businessForm.formState.errors.nitDv && (
                  <p className={ERR}>{businessForm.formState.errors.nitDv.message}</p>
                )}
              </div>
            </div>
            <div>
              <label className={LABEL}>Tipo de empresa</label>
              <select className={INPUT} {...businessForm.register('companyType')}>
                <option value="">-- Seleccionar --</option>
                <option value="SAS">Sociedad por Acciones Simplificada (SAS)</option>
                <option value="LTDA">Sociedad de Responsabilidad Limitada (LTDA)</option>
                <option value="SA">Sociedad Anónima (SA)</option>
                <option value="PERSONA_NATURAL">Persona Natural</option>
                <option value="COOPERATIVA">Cooperativa</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
          </div>

          {/* Dirección */}
          <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-dark-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Dirección física
            </p>
            <div>
              <label className={LABEL}>Dirección completa</label>
              <input
                className={INPUT}
                placeholder="Calle 100 # 50-20"
                {...businessForm.register('address')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Ciudad</label>
                <input className={INPUT} placeholder="Bogotá" {...businessForm.register('city')} />
              </div>
              <div>
                <label className={LABEL}>Departamento</label>
                <input
                  className={INPUT}
                  placeholder="Cundinamarca"
                  {...businessForm.register('department')}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>País (ISO)</label>
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
                <label className={LABEL}>Código postal</label>
                <input
                  className={INPUT}
                  placeholder="110111"
                  {...businessForm.register('postalCode')}
                />
              </div>
            </div>
            <div>
              <label className={LABEL}>
                Coordenadas GPS <span className="font-normal text-gray-400">(lat,lng)</span>
              </label>
              <input
                className={INPUT}
                placeholder="4.6097,-74.0817"
                {...businessForm.register('coordinates')}
              />
            </div>
          </div>

          {/* Contacto */}
          <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-dark-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Contacto adicional
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
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
              <div>
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
            </div>
            <div>
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

          <Button type="submit" loading={businessForm.formState.isSubmitting}>
            Guardar datos de empresa
          </Button>
        </form>
      )}

      {/* ── Tab: Zona de peligro ─────────────────────────────────────── */}
      {activeTab === 'peligro' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
            <h3 className="text-lg font-semibold text-red-700 dark:text-red-400">
              Eliminar empresa
            </h3>
            <p className="mt-2 text-sm text-red-600 dark:text-red-300">
              Esta acción es <strong>irreversible</strong>. Se eliminará la empresa "{tenantName}" y
              todos sus datos asociados, incluyendo:
            </p>
            <ul className="mt-2 list-inside list-disc text-sm text-red-600 dark:text-red-300">
              <li>Todos los usuarios y sus credenciales</li>
              <li>Todos los registros de facturación</li>
              <li>Todos los histórico de operaciones</li>
              <li>El schema completo de base de datos</li>
            </ul>
            <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-400">
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
