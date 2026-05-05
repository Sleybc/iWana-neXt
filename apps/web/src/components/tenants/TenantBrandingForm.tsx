'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, CircleAlert, ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@iwana/ui';
import {
  tenantApi,
  type BrandingThemeVariant,
  type BrandingUsage,
  type TenantListItem,
  type UpdateTenantBrandingPayload,
} from '@/lib/api-client';
import { BRANDING_SLOT_RULES, validateBrandingFileForUpload } from '@/lib/branding-validation';

const httpsUrl = z
  .string()
  .trim()
  .url('Ingresa una URL válida.')
  .startsWith('https://', 'La URL debe usar HTTPS.')
  .max(500, 'Máximo 500 caracteres.');

const brandingSchema = z.object({
  logoLightUrl: httpsUrl.optional().or(z.literal('')),
  logoDarkUrl: httpsUrl.optional().or(z.literal('')),
  sealLightUrl: httpsUrl.optional().or(z.literal('')),
  sealDarkUrl: httpsUrl.optional().or(z.literal('')),
  faviconLightUrl: httpsUrl.optional().or(z.literal('')),
  faviconDarkUrl: httpsUrl.optional().or(z.literal('')),
  loginBackgroundLightUrl: httpsUrl.optional().or(z.literal('')),
  loginBackgroundDarkUrl: httpsUrl.optional().or(z.literal('')),
  showTenantName: z.boolean(),
});

type BrandingFormValues = z.infer<typeof brandingSchema>;
type BrandingUrlField = Exclude<keyof BrandingFormValues, 'showTenantName'>;
type BrandingAssetField =
  | 'logoLightAssetId'
  | 'logoDarkAssetId'
  | 'sealLightAssetId'
  | 'sealDarkAssetId'
  | 'faviconLightAssetId'
  | 'faviconDarkAssetId'
  | 'loginBackgroundLightAssetId'
  | 'loginBackgroundDarkAssetId';
type BrandingResolvedUrlField =
  | 'logoLightUrl'
  | 'logoDarkUrl'
  | 'sealLightUrl'
  | 'sealDarkUrl'
  | 'faviconLightUrl'
  | 'faviconDarkUrl'
  | 'loginBackgroundLightUrl'
  | 'loginBackgroundDarkUrl';

interface TenantBrandingFormProps {
  tenantId: string;
  tenant: TenantListItem;
  onUpdated: (tenant: TenantListItem) => void;
}

interface BrandingVariantConfig {
  themeVariant: BrandingThemeVariant;
  label: string;
  urlField: BrandingUrlField;
  assetField: BrandingAssetField;
  resolvedUrlField: BrandingResolvedUrlField;
  placeholder: string;
}

interface BrandingGroupConfig {
  usage: BrandingUsage;
  title: string;
  description: string;
  guidance: string;
  widePreview?: boolean;
  variants: [BrandingVariantConfig, BrandingVariantConfig];
}

const BRANDING_GROUPS: BrandingGroupConfig[] = [
  {
    usage: 'seal',
    title: 'Sello compacto',
    description: 'Se usa en superficies compactas del portal y como fallback del branding.',
    guidance: BRANDING_SLOT_RULES.seal.helpText,
    variants: [
      {
        themeVariant: 'light',
        label: 'Variante clara',
        urlField: 'sealLightUrl',
        assetField: 'sealLightAssetId',
        resolvedUrlField: 'sealLightUrl',
        placeholder: 'https://cdn.tuempresa.co/seal-light.svg',
      },
      {
        themeVariant: 'dark',
        label: 'Variante oscura',
        urlField: 'sealDarkUrl',
        assetField: 'sealDarkAssetId',
        resolvedUrlField: 'sealDarkUrl',
        placeholder: 'https://cdn.tuempresa.co/seal-dark.svg',
      },
    ],
  },
  {
    usage: 'logo',
    title: 'Logo horizontal',
    description: 'Se usa en login, documentos y superficies de identificación extendida.',
    guidance: BRANDING_SLOT_RULES.logo.helpText,
    variants: [
      {
        themeVariant: 'light',
        label: 'Variante clara',
        urlField: 'logoLightUrl',
        assetField: 'logoLightAssetId',
        resolvedUrlField: 'logoLightUrl',
        placeholder: 'https://cdn.tuempresa.co/logo-light.svg',
      },
      {
        themeVariant: 'dark',
        label: 'Variante oscura',
        urlField: 'logoDarkUrl',
        assetField: 'logoDarkAssetId',
        resolvedUrlField: 'logoDarkUrl',
        placeholder: 'https://cdn.tuempresa.co/logo-dark.svg',
      },
    ],
  },
  {
    usage: 'favicon',
    title: 'Favicon',
    description: 'Se usa en la pestaña del navegador del portal y respeta tema claro u oscuro.',
    guidance: BRANDING_SLOT_RULES.favicon.helpText,
    variants: [
      {
        themeVariant: 'light',
        label: 'Variante clara',
        urlField: 'faviconLightUrl',
        assetField: 'faviconLightAssetId',
        resolvedUrlField: 'faviconLightUrl',
        placeholder: 'https://cdn.tuempresa.co/favicon-light.svg',
      },
      {
        themeVariant: 'dark',
        label: 'Variante oscura',
        urlField: 'faviconDarkUrl',
        assetField: 'faviconDarkAssetId',
        resolvedUrlField: 'faviconDarkUrl',
        placeholder: 'https://cdn.tuempresa.co/favicon-dark.svg',
      },
    ],
  },
  {
    usage: 'login_background',
    title: 'Fondo del login',
    description: 'Se usa como imagen ambiental del acceso público al portal empresarial.',
    guidance: BRANDING_SLOT_RULES.login_background.helpText,
    widePreview: true,
    variants: [
      {
        themeVariant: 'light',
        label: 'Variante clara',
        urlField: 'loginBackgroundLightUrl',
        assetField: 'loginBackgroundLightAssetId',
        resolvedUrlField: 'loginBackgroundLightUrl',
        placeholder: 'https://cdn.tuempresa.co/login-bg-light.jpg',
      },
      {
        themeVariant: 'dark',
        label: 'Variante oscura',
        urlField: 'loginBackgroundDarkUrl',
        assetField: 'loginBackgroundDarkAssetId',
        resolvedUrlField: 'loginBackgroundDarkUrl',
        placeholder: 'https://cdn.tuempresa.co/login-bg-dark.jpg',
      },
    ],
  },
];

function buildDefaultValues(tenant: TenantListItem): BrandingFormValues {
  return {
    logoLightUrl: tenant.logoLightAssetId ? '' : (tenant.logoLightUrl ?? ''),
    logoDarkUrl: tenant.logoDarkAssetId ? '' : (tenant.logoDarkUrl ?? ''),
    sealLightUrl: tenant.sealLightAssetId ? '' : (tenant.sealLightUrl ?? ''),
    sealDarkUrl: tenant.sealDarkAssetId ? '' : (tenant.sealDarkUrl ?? ''),
    faviconLightUrl: tenant.faviconLightAssetId ? '' : (tenant.faviconLightUrl ?? ''),
    faviconDarkUrl: tenant.faviconDarkAssetId ? '' : (tenant.faviconDarkUrl ?? ''),
    loginBackgroundLightUrl: tenant.loginBackgroundLightAssetId
      ? ''
      : (tenant.loginBackgroundLightUrl ?? ''),
    loginBackgroundDarkUrl: tenant.loginBackgroundDarkAssetId
      ? ''
      : (tenant.loginBackgroundDarkUrl ?? ''),
    showTenantName: tenant.showTenantName ?? true,
  };
}

function ImagePreview({
  url,
  label,
  wide = false,
}: {
  url: string;
  label: string;
  wide?: boolean;
}) {
  const [error, setError] = useState(false);

  useEffect(() => setError(false), [url]);

  if (!url.trim()) {
    return (
      <div className="mt-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-xs text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
        Sin preview configurado todavía.
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div
        className={[
          'overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 dark:border-dark-border dark:bg-dark-surface-3',
          wide ? 'aspect-[16/6]' : 'aspect-square max-w-[140px]',
        ].join(' ')}
      >
        {error ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-red-600 dark:text-red-400">
            No se pudo cargar la imagen.
          </div>
        ) : (
          <img
            src={url}
            alt={label}
            onError={() => setError(true)}
            className="h-full w-full object-contain"
          />
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">Vista previa actual del slot.</p>
    </div>
  );
}

function resolveSourceLabel(tenant: TenantListItem, variant: BrandingVariantConfig): string {
  if (tenant[variant.assetField]) {
    return 'Activo subido';
  }

  if (tenant[variant.resolvedUrlField]) {
    return 'URL externa';
  }

  return 'Sin configurar';
}

export function TenantBrandingForm({ tenantId, tenant, onUpdated }: TenantBrandingFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [clearingSlot, setClearingSlot] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { dirtyFields, errors, isDirty, isSubmitting },
  } = useForm<BrandingFormValues>({
    resolver: zodResolver(brandingSchema),
    defaultValues: buildDefaultValues(tenant),
  });

  useEffect(() => {
    reset(buildDefaultValues(tenant));
  }, [tenant, reset]);

  const watchedValues = watch();

  const applyUpdatedTenant = (updated: TenantListItem, successMessage: string) => {
    reset(buildDefaultValues(updated));
    onUpdated(updated);
    setServerError(null);
    setSuccess(successMessage);
  };

  const onSubmit = async (values: BrandingFormValues) => {
    setServerError(null);
    setSuccess(null);

    const payload: UpdateTenantBrandingPayload = {};

    if (dirtyFields.showTenantName) {
      payload.showTenantName = values.showTenantName;
    }

    for (const group of BRANDING_GROUPS) {
      for (const variant of group.variants) {
        const isFieldDirty = Boolean(dirtyFields[variant.urlField]);
        if (!isFieldDirty) {
          continue;
        }

        const nextValue = values[variant.urlField]?.trim() ?? '';
        const hasCurrentAsset = Boolean(tenant[variant.assetField]);
        const hasCurrentResolvedUrl = Boolean(tenant[variant.resolvedUrlField]);

        if (nextValue) {
          payload[variant.urlField] = nextValue;
          payload[variant.assetField] = null;
          continue;
        }

        if (!hasCurrentAsset && hasCurrentResolvedUrl) {
          payload[variant.urlField] = null;
          payload[variant.assetField] = null;
        }
      }
    }

    if (Object.keys(payload).length === 0) {
      setSuccess('No hay cambios pendientes por guardar.');
      return;
    }

    try {
      const updated = await tenantApi.updateBranding(tenantId, payload);
      applyUpdatedTenant(updated, 'Branding del tenant actualizado correctamente.');
    } catch {
      setServerError('No fue posible guardar el branding del tenant.');
    }
  };

  const handleUpload = async (
    usage: BrandingUsage,
    themeVariant: BrandingThemeVariant,
    file: File | undefined,
  ) => {
    if (!file) {
      return;
    }

    const slotKey = `${usage}-${themeVariant}`;
    setServerError(null);
    setSuccess(null);

    const validationError = await validateBrandingFileForUpload(file, usage);
    if (validationError) {
      setServerError(validationError);
      return;
    }

    setUploadingSlot(slotKey);

    try {
      await tenantApi.uploadBrandingAsset(tenantId, { usage, themeVariant, file });
      const updated = await tenantApi.getOne(tenantId);
      applyUpdatedTenant(updated, 'Activo subido y asignado correctamente.');
    } catch {
      setServerError(
        'No fue posible subir el activo. Verifica las reglas del slot y vuelve a intentar.',
      );
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleClearSlot = async (variant: BrandingVariantConfig) => {
    const slotKey = `${variant.urlField}-clear`;
    setServerError(null);
    setSuccess(null);
    setClearingSlot(slotKey);

    try {
      const updated = await tenantApi.updateBranding(tenantId, {
        [variant.urlField]: null,
        [variant.assetField]: null,
      } as UpdateTenantBrandingPayload);
      applyUpdatedTenant(updated, `${variant.label} eliminada del branding.`);
    } catch {
      setServerError('No fue posible limpiar este slot de branding.');
    } finally {
      setClearingSlot(null);
    }
  };

  return (
    <Card className="rounded-[28px] border border-white/70 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Administración de marca
            </p>
            <CardTitle className="mt-1">Branding empresarial</CardTitle>
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gestiona la identidad pública del tenant desde plataforma. Cada slot admite URL HTTPS o
          asset subido y asignado directamente.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-8">
          {BRANDING_GROUPS.map((group) => (
            <section key={group.usage} className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {group.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{group.description}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{group.guidance}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {group.variants.map((variant) => {
                  const slotKey = `${group.usage}-${variant.themeVariant}`;
                  const fieldError = errors[variant.urlField];
                  const previewUrl =
                    watchedValues[variant.urlField]?.trim() ||
                    tenant[variant.resolvedUrlField] ||
                    '';
                  const hasConfiguredValue = Boolean(
                    tenant[variant.assetField] || tenant[variant.resolvedUrlField],
                  );

                  return (
                    <div
                      key={slotKey}
                      className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {variant.label}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Fuente actual: {resolveSourceLabel(tenant, variant)}
                          </p>
                        </div>
                        {hasConfiguredValue && (
                          <Button
                            type="button"
                            variant="softDestructive"
                            size="sm"
                            onClick={() => void handleClearSlot(variant)}
                            disabled={clearingSlot === `${variant.urlField}-clear` || isSubmitting}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Eliminar imagen
                          </Button>
                        )}
                      </div>

                      <div className="mt-4 space-y-3">
                        <Input
                          id={variant.urlField}
                          label="URL HTTPS externa"
                          placeholder={variant.placeholder}
                          disabled={isSubmitting || uploadingSlot === slotKey}
                          error={
                            typeof fieldError?.message === 'string' ? fieldError.message : undefined
                          }
                          helperText="Déjalo vacío para conservar el asset actual. Guarda cambios para aplicar URLs externas."
                          {...register(variant.urlField)}
                        />

                        <div>
                          <label
                            htmlFor={`${slotKey}-file`}
                            className="mb-1 block text-sm font-medium text-gray-900 dark:text-white"
                          >
                            Subir activo
                          </label>
                          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                            Reglas: {BRANDING_SLOT_RULES[group.usage].helpText}
                          </p>
                          <div className="flex items-center gap-3">
                            <label
                              htmlFor={`${slotKey}-file`}
                              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-dark-border dark:text-gray-200 dark:hover:bg-dark-surface-4"
                            >
                              <UploadCloud className="h-4 w-4" aria-hidden="true" />
                              {uploadingSlot === slotKey ? 'Subiendo...' : 'Seleccionar archivo'}
                            </label>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              La subida asigna el slot inmediatamente.
                            </span>
                          </div>
                          <input
                            id={`${slotKey}-file`}
                            type="file"
                            accept={BRANDING_SLOT_RULES[group.usage].allowedMimes.join(',')}
                            disabled={isSubmitting || uploadingSlot === slotKey}
                            className="sr-only"
                            onChange={(event) => {
                              const selectedFile = event.target.files?.[0];
                              void handleUpload(group.usage, variant.themeVariant, selectedFile);
                              event.currentTarget.value = '';
                            }}
                          />
                        </div>

                        <ImagePreview
                          url={previewUrl}
                          label={`${group.title} ${variant.label}`}
                          {...(group.widePreview ? { wide: true } : {})}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-surface-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-iwana-primary accent-iwana-primary"
                {...register('showTenantName')}
              />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Mostrar nombre comercial junto al sello
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Controla si el portal autenticado y el acceso público deben renderizar el nombre
                  de la empresa junto a la marca compacta.
                </p>
              </div>
            </label>
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
              Los uploads asignan el slot al instante. Las URLs externas se aplican al guardar el
              formulario.
            </p>
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !isDirty}>
              Guardar branding
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
