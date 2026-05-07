'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Camera,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  ImageUp,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { Button, Input } from '@iwana/ui';
import {
  tenantSelfApi,
  type BrandingThemeVariant,
  type BrandingUsage,
  type TenantSelf,
  type UpdateTenantSelfBrandingDto,
} from '@/lib/api-client';
import { BRANDING_SLOT_RULES, validateBrandingFileForUpload } from '@/lib/branding-validation';
import { TenantSeal } from '@/components/layout/TenantSeal';
import { PortalAlert } from '@/components/shared/portal-ui';
import { SettingsSectionPanel } from './SettingsSectionPanel';

const BRANDING_EVENT_NAME = 'tenant-branding-updated';

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
  brandingProductName: z.string().trim().min(2).max(120).optional().or(z.literal('')),
  brandingSurfaceName: z.string().trim().min(2).max(120).optional().or(z.literal('')),
  brandingMetadataTitle: z.string().trim().min(4).max(180).optional().or(z.literal('')),
  brandingMetadataDescription: z.string().trim().min(12).max(300).optional().or(z.literal('')),
});

type BrandingFormValues = z.infer<typeof brandingSchema>;
type BrandingUrlField =
  | 'logoLightUrl'
  | 'logoDarkUrl'
  | 'sealLightUrl'
  | 'sealDarkUrl'
  | 'faviconLightUrl'
  | 'faviconDarkUrl'
  | 'loginBackgroundLightUrl'
  | 'loginBackgroundDarkUrl';
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

interface BrandingFormProps {
  profile: TenantSelf;
  canEdit: boolean;
  onUpdated: (updated: TenantSelf) => void;
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

type BrandingEventDetail = Pick<
  TenantSelf,
  | 'name'
  | 'showTenantName'
  | 'logoLightUrl'
  | 'logoDarkUrl'
  | 'sealLightUrl'
  | 'sealDarkUrl'
  | 'faviconLightUrl'
  | 'faviconDarkUrl'
  | 'loginBackgroundLightUrl'
  | 'loginBackgroundDarkUrl'
  | 'brandingProductName'
  | 'brandingSurfaceName'
  | 'brandingMetadataTitle'
  | 'brandingMetadataDescription'
>;

const BRANDING_GROUPS: BrandingGroupConfig[] = [
  {
    usage: 'seal',
    title: 'Sello compacto',
    description:
      'Se usa en el menú lateral, superficies compactas del portal y como respaldo visual cuando no se muestra el nombre.',
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
    description:
      'Se usa en la autenticación pública y en superficies de identificación extendida del tenant.',
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
    description:
      'Se usa en la pestaña del navegador y se resuelve por tema claro u oscuro en tiempo real.',
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
    description:
      'Se usa como acento visual del acceso público del portal para reforzar la identidad del tenant.',
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

function buildDefaultValues(profile: TenantSelf): BrandingFormValues {
  return {
    logoLightUrl: profile.logoLightAssetId ? '' : (profile.logoLightUrl ?? ''),
    logoDarkUrl: profile.logoDarkAssetId ? '' : (profile.logoDarkUrl ?? ''),
    sealLightUrl: profile.sealLightAssetId ? '' : (profile.sealLightUrl ?? ''),
    sealDarkUrl: profile.sealDarkAssetId ? '' : (profile.sealDarkUrl ?? ''),
    faviconLightUrl: profile.faviconLightAssetId ? '' : (profile.faviconLightUrl ?? ''),
    faviconDarkUrl: profile.faviconDarkAssetId ? '' : (profile.faviconDarkUrl ?? ''),
    loginBackgroundLightUrl: profile.loginBackgroundLightAssetId
      ? ''
      : (profile.loginBackgroundLightUrl ?? ''),
    loginBackgroundDarkUrl: profile.loginBackgroundDarkAssetId
      ? ''
      : (profile.loginBackgroundDarkUrl ?? ''),
    showTenantName: profile.showTenantName,
    brandingProductName: profile.brandingProductName ?? '',
    brandingSurfaceName: profile.brandingSurfaceName ?? '',
    brandingMetadataTitle: profile.brandingMetadataTitle ?? '',
    brandingMetadataDescription: profile.brandingMetadataDescription ?? '',
  };
}

function emitBrandingUpdated(updated: TenantSelf): void {
  window.dispatchEvent(
    new CustomEvent<BrandingEventDetail>(BRANDING_EVENT_NAME, {
      detail: {
        name: updated.name,
        showTenantName: updated.showTenantName,
        logoLightUrl: updated.logoLightUrl,
        logoDarkUrl: updated.logoDarkUrl,
        sealLightUrl: updated.sealLightUrl,
        sealDarkUrl: updated.sealDarkUrl,
        faviconLightUrl: updated.faviconLightUrl,
        faviconDarkUrl: updated.faviconDarkUrl,
        loginBackgroundLightUrl: updated.loginBackgroundLightUrl,
        loginBackgroundDarkUrl: updated.loginBackgroundDarkUrl,
        brandingProductName: updated.brandingProductName,
        brandingSurfaceName: updated.brandingSurfaceName,
        brandingMetadataTitle: updated.brandingMetadataTitle,
        brandingMetadataDescription: updated.brandingMetadataDescription,
      },
    }),
  );
}

function normalizeOptionalText(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value.trim();
}

function resolveSourceLabel(profile: TenantSelf, variant: BrandingVariantConfig): string {
  if (profile[variant.assetField]) {
    return 'Activo subido';
  }

  if (profile[variant.resolvedUrlField]) {
    return 'URL externa';
  }

  return 'Sin configurar';
}

export function BrandingForm({ profile, canEdit, onUpdated }: BrandingFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [clearingSlot, setClearingSlot] = useState<string | null>(null);
  const [isResettingBase, setIsResettingBase] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { dirtyFields, errors, isDirty, isSubmitting },
  } = useForm<BrandingFormValues>({
    resolver: zodResolver(brandingSchema),
    defaultValues: buildDefaultValues(profile),
  });

  useEffect(() => {
    reset(buildDefaultValues(profile));
  }, [profile, reset]);

  const watchedValues = watch();
  const watchedShowTenantName = watchedValues.showTenantName;
  const tenantDisplayName = profile.legalName?.trim() || profile.name;
  const watchedProductName = normalizeOptionalText(watchedValues.brandingProductName);
  const watchedSurfaceName = normalizeOptionalText(watchedValues.brandingSurfaceName);
  const watchedMetadataTitle = normalizeOptionalText(watchedValues.brandingMetadataTitle);
  const watchedMetadataDescription = normalizeOptionalText(
    watchedValues.brandingMetadataDescription,
  );
  const profileProductName = normalizeOptionalText(profile.brandingProductName);
  const profileSurfaceName = normalizeOptionalText(profile.brandingSurfaceName);
  const profileMetadataTitle = normalizeOptionalText(profile.brandingMetadataTitle);
  const profileMetadataDescription = normalizeOptionalText(profile.brandingMetadataDescription);
  const effectiveProductName = watchedProductName || profileProductName || tenantDisplayName;
  const effectiveSurfaceName = watchedSurfaceName || profileSurfaceName || 'Portal empresarial';
  const effectiveMetadataTitle =
    watchedMetadataTitle || profileMetadataTitle || `${effectiveProductName} — Portal empresarial`;
  const effectiveMetadataDescription =
    watchedMetadataDescription ||
    profileMetadataDescription ||
    `Portal empresarial para la operación de ${effectiveProductName} en iWana neXt.`;

  const identityPreview = {
    productName: effectiveProductName,
    surfaceName: effectiveSurfaceName,
    metadataTitle: effectiveMetadataTitle,
    metadataDescription: effectiveMetadataDescription,
  };

  const applyUpdatedProfile = (updated: TenantSelf, successMessage: string) => {
    reset(buildDefaultValues(updated));
    onUpdated(updated);
    emitBrandingUpdated(updated);
    setServerError(null);
    setSuccess(successMessage);
  };

  const onSubmit = async (values: BrandingFormValues) => {
    setServerError(null);
    setSuccess(null);

    const payload: UpdateTenantSelfBrandingDto = {};

    if (dirtyFields.showTenantName) {
      payload.showTenantName = values.showTenantName;
    }

    const metadataFields: Array<
      | 'brandingProductName'
      | 'brandingSurfaceName'
      | 'brandingMetadataTitle'
      | 'brandingMetadataDescription'
    > = [
      'brandingProductName',
      'brandingSurfaceName',
      'brandingMetadataTitle',
      'brandingMetadataDescription',
    ];

    for (const field of metadataFields) {
      if (!dirtyFields[field]) {
        continue;
      }

      const nextValue = values[field]?.trim() ?? '';
      payload[field] = nextValue === '' ? null : nextValue;
    }

    for (const group of BRANDING_GROUPS) {
      for (const variant of group.variants) {
        const isFieldDirty = Boolean(dirtyFields[variant.urlField]);
        if (!isFieldDirty) {
          continue;
        }

        const nextValue = values[variant.urlField]?.trim() ?? '';
        const hasCurrentAsset = Boolean(profile[variant.assetField]);
        const hasCurrentResolvedUrl = Boolean(profile[variant.resolvedUrlField]);

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
      const updated = await tenantSelfApi.updateBranding(payload);
      applyUpdatedProfile(updated, 'Branding empresarial actualizado correctamente.');
    } catch {
      setServerError('No fue posible guardar el branding. Intenta de nuevo.');
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
      await tenantSelfApi.uploadBrandingAsset({ usage, themeVariant, file });
      const updated = await tenantSelfApi.getProfile();
      applyUpdatedProfile(updated, 'Activo subido y asignado correctamente.');
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
      const updated = await tenantSelfApi.updateBranding({
        [variant.urlField]: null,
        [variant.assetField]: null,
      } as UpdateTenantSelfBrandingDto);
      applyUpdatedProfile(updated, `${variant.label} eliminada del branding.`);
    } catch {
      setServerError('No fue posible limpiar este slot de branding.');
    } finally {
      setClearingSlot(null);
    }
  };

  const handleRestoreBaseBranding = async () => {
    setServerError(null);
    setSuccess(null);
    setIsResettingBase(true);

    const basePayload: UpdateTenantSelfBrandingDto = {
      logoLightUrl: null,
      logoLightAssetId: null,
      logoDarkUrl: null,
      logoDarkAssetId: null,
      sealLightUrl: null,
      sealLightAssetId: null,
      sealDarkUrl: null,
      sealDarkAssetId: null,
      faviconLightUrl: null,
      faviconLightAssetId: null,
      faviconDarkUrl: null,
      faviconDarkAssetId: null,
      loginBackgroundLightUrl: null,
      loginBackgroundLightAssetId: null,
      loginBackgroundDarkUrl: null,
      loginBackgroundDarkAssetId: null,
      brandingProductName: null,
      brandingSurfaceName: null,
      brandingMetadataTitle: null,
      brandingMetadataDescription: null,
    };

    try {
      const updated = await tenantSelfApi.updateBranding(basePayload);
      applyUpdatedProfile(updated, 'Branding base restaurado correctamente.');
    } catch {
      setServerError('No fue posible restaurar el branding base.');
    } finally {
      setIsResettingBase(false);
    }
  };

  return (
    <div className="space-y-6">
      {serverError && (
        <PortalAlert
          variant="error"
          title="No fue posible actualizar la marca"
          description={serverError}
          icon={CircleAlert}
        />
      )}

      {success && !serverError && (
        <PortalAlert
          variant="success"
          title="Marca actualizada"
          description={success}
          icon={CheckCircle2}
        />
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-8">
        <SettingsSectionPanel
          title="Identidad visual"
          description="Administra los activos de marca y la metadata pública del portal empresarial."
          toolbar={
            canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRestoreBaseBranding()}
                  loading={isResettingBase}
                  disabled={!canEdit || isSubmitting || isResettingBase}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Restaurar base
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  loading={isSubmitting}
                  disabled={isSubmitting || !isDirty}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Guardar identidad visual
                </Button>
              </div>
            ) : null
          }
        >
          <div className="space-y-6">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Activos visuales
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Sube un activo o pega una URL HTTPS por slot cuando lo necesites.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {BRANDING_GROUPS.flatMap((group) =>
                  group.variants.map((variant) => {
                    const slotKey = `${group.usage}-${variant.themeVariant}`;
                    const fieldError = errors[variant.urlField];
                    const previewUrl =
                      watchedValues[variant.urlField]?.trim() ||
                      profile[variant.resolvedUrlField] ||
                      '';
                    const isSlotUploading = uploadingSlot === slotKey;
                    const isSlotClearing = clearingSlot === `${variant.urlField}-clear`;
                    const hasConfiguredValue = Boolean(
                      previewUrl ||
                      profile[variant.assetField] ||
                      profile[variant.resolvedUrlField],
                    );
                    const assetDirectory =
                      previewUrl.substring(0, previewUrl.lastIndexOf('/') + 1) || '/';

                    return (
                      <div
                        key={slotKey}
                        className="space-y-3 rounded-lg border border-gray-100 bg-gray-50/80 p-4 dark:border-dark-border dark:bg-dark-surface-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {group.title} - {variant.label}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Fuente actual: {resolveSourceLabel(profile, variant)}
                          </p>
                        </div>

                        <label
                          htmlFor={`${slotKey}-file`}
                          className="group relative block cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-gray-200 bg-white transition-colors hover:border-iwana-primary/40 dark:border-dark-border dark:bg-dark-surface-2"
                        >
                          {previewUrl ? (
                            <div className={group.widePreview ? 'h-32 p-2' : 'h-32 p-4'}>
                              <img
                                src={previewUrl}
                                alt={`${group.title} ${variant.label}`}
                                className="h-full w-full object-contain"
                              />
                            </div>
                          ) : (
                            <div className="flex h-32 flex-col items-center justify-center gap-2 text-gray-400">
                              <ImageUp className="h-8 w-8" aria-hidden="true" />
                              <span className="text-xs">Subir imagen</span>
                            </div>
                          )}

                          {canEdit && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                              <Camera className="h-5 w-5 text-white" aria-hidden="true" />
                              <span className="text-xs font-medium text-white">
                                {previewUrl ? 'Cambiar imagen' : 'Seleccionar archivo'}
                              </span>
                            </div>
                          )}

                          {isSlotUploading && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80 text-sm text-gray-500 dark:bg-dark-surface-2/80 dark:text-gray-300">
                              Subiendo...
                            </div>
                          )}
                        </label>

                        <input
                          id={`${slotKey}-file`}
                          type="file"
                          accept={BRANDING_SLOT_RULES[group.usage].allowedMimes.join(',')}
                          disabled={!canEdit || isSubmitting || isSlotUploading || isSlotClearing}
                          className="sr-only"
                          onChange={(event) => {
                            const selectedFile = event.target.files?.[0];
                            void handleUpload(group.usage, variant.themeVariant, selectedFile);
                            event.currentTarget.value = '';
                          }}
                        />

                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {group.description}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Reglas: {BRANDING_SLOT_RULES[group.usage].helpText}
                        </p>

                        {previewUrl ? (
                          <a
                            href={assetDirectory}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 overflow-hidden rounded-md border border-gray-100 bg-white px-3 py-2 text-xs text-gray-500 transition-colors hover:text-iwana-primary dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-400 dark:hover:text-iwana-primary"
                            title={`Abrir directorio: ${assetDirectory}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 truncate font-mono">{assetDirectory}</span>
                          </a>
                        ) : null}

                        <details className="text-sm">
                          <summary className="cursor-pointer select-none text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                            o pega una URL HTTPS directamente
                          </summary>
                          <div className="mt-2">
                            <Input
                              id={variant.urlField}
                              label="URL HTTPS externa"
                              placeholder={variant.placeholder}
                              disabled={!canEdit || isSubmitting || isSlotUploading}
                              error={
                                typeof fieldError?.message === 'string'
                                  ? fieldError.message
                                  : undefined
                              }
                              helperText="Déjalo vacío para mantener el asset actual. Guarda cambios para aplicar URLs externas."
                              {...register(variant.urlField)}
                            />
                          </div>
                        </details>

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleClearSlot(variant)}
                            disabled={
                              !canEdit || !hasConfiguredValue || isSlotClearing || isSubmitting
                            }
                            loading={isSlotClearing}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Eliminar imagen
                          </Button>
                        </div>
                      </div>
                    );
                  }),
                )}
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-gray-100 bg-gray-50/80 p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Preview del menú lateral y favicon
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  El portal refleja sello y favicon en caliente cuando guardas o subes un activo.
                </p>
              </div>

              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex w-fit items-center gap-3 rounded-lg bg-iwana-primary px-3 py-2">
                    <TenantSeal
                      sealLightUrl={watchedValues.sealLightUrl?.trim() || profile.sealLightUrl}
                      sealDarkUrl={watchedValues.sealDarkUrl?.trim() || profile.sealDarkUrl}
                      name={profile.name}
                      size="sm"
                    />
                    {watchedShowTenantName && (
                      <span className="max-w-[180px] truncate text-sm font-bold text-white">
                        {profile.name}
                      </span>
                    )}
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Vista previa de pestaña
                    </p>
                    <div className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 dark:bg-dark-surface-4">
                      <div className="h-5 w-5 overflow-hidden rounded-sm bg-white dark:bg-dark-surface-3">
                        {watchedValues.faviconLightUrl?.trim() || profile.faviconLightUrl ? (
                          <img
                            src={
                              watchedValues.faviconLightUrl?.trim() || profile.faviconLightUrl || ''
                            }
                            alt="Favicon del tenant"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <TenantSeal
                            sealLightUrl={
                              watchedValues.sealLightUrl?.trim() || profile.sealLightUrl
                            }
                            sealDarkUrl={watchedValues.sealDarkUrl?.trim() || profile.sealDarkUrl}
                            name={profile.name}
                            size="sm"
                          />
                        )}
                      </div>
                      <span className="max-w-[180px] truncate text-xs font-medium text-gray-700 dark:text-gray-200">
                        Portal de {profile.name}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-iwana-primary accent-iwana-primary disabled:cursor-not-allowed"
                  {...register('showTenantName')}
                />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Mostrar nombre comercial junto al sello en el menú lateral
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Si se desactiva, el menú mostrará solo el sello sin texto. El login público
                    seguirá la política configurada por showTenantName.
                  </p>
                </div>
              </label>
            </section>

            <section className="space-y-4 rounded-lg border border-gray-100 bg-gray-50/80 p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Nombres e identidad
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Definen cómo aparece tu empresa en el navegador y en la comunicación pública del
                  portal.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Producto"
                  placeholder="Ej: ISP Demo"
                  disabled={!canEdit || isSubmitting}
                  error={
                    typeof errors.brandingProductName?.message === 'string'
                      ? errors.brandingProductName.message
                      : undefined
                  }
                  helperText="Nombre visible del tenant en el login público."
                  {...register('brandingProductName')}
                />
                <Input
                  label="Superficie"
                  placeholder="Ej: Portal empresarial"
                  disabled={!canEdit || isSubmitting}
                  error={
                    typeof errors.brandingSurfaceName?.message === 'string'
                      ? errors.brandingSurfaceName.message
                      : undefined
                  }
                  helperText="Nombre de la superficie pública del acceso."
                  {...register('brandingSurfaceName')}
                />
                <Input
                  label="Título público"
                  placeholder="Ej: ISP Demo — Portal empresarial"
                  disabled={!canEdit || isSubmitting}
                  error={
                    typeof errors.brandingMetadataTitle?.message === 'string'
                      ? errors.brandingMetadataTitle.message
                      : undefined
                  }
                  helperText="Se usa como título en login y pestaña del navegador."
                  {...register('brandingMetadataTitle')}
                />
                <Input
                  label="Descripción pública"
                  placeholder="Ej: Portal empresarial para la operación de ISP Demo en iWana neXt."
                  disabled={!canEdit || isSubmitting}
                  error={
                    typeof errors.brandingMetadataDescription?.message === 'string'
                      ? errors.brandingMetadataDescription.message
                      : undefined
                  }
                  helperText="Narrativa pública usada en el login del portal."
                  {...register('brandingMetadataDescription')}
                />
              </div>

              <dl className="grid grid-cols-1 gap-3 rounded-lg border border-gray-100 bg-white p-4 text-sm dark:border-dark-border dark:bg-dark-surface-2 md:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-gray-400">Producto</dt>
                  <dd className="mt-1 font-semibold text-gray-900 dark:text-white">
                    {identityPreview.productName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-gray-400">Superficie</dt>
                  <dd className="mt-1 font-semibold text-gray-900 dark:text-white">
                    {identityPreview.surfaceName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-gray-400">
                    Título en navegador
                  </dt>
                  <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                    {identityPreview.metadataTitle}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-gray-400">Descripción</dt>
                  <dd className="mt-1 text-gray-600 dark:text-gray-300">
                    {identityPreview.metadataDescription}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </SettingsSectionPanel>
      </form>
    </div>
  );
}
