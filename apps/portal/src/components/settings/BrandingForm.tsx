'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  ImageUp,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  SectionAccordion,
} from '@iwana/ui';
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
import { BRANDING_SETTINGS_COPY } from './mod00-settings-labels';

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
    description: BRANDING_SETTINGS_COPY.logoDescription,
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
    description: BRANDING_SETTINGS_COPY.loginBackgroundDescription,
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

function resolveUsageLabel(usage: BrandingUsage): string {
  return BRANDING_GROUPS.find((group) => group.usage === usage)?.title.toLowerCase() ?? 'activo';
}

function resolveThemeLabel(themeVariant: BrandingThemeVariant): string {
  return themeVariant === 'light' ? 'variante clara' : 'variante oscura';
}

export function BrandingForm({ profile, canEdit, onUpdated }: BrandingFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [clearingSlot, setClearingSlot] = useState<string | null>(null);
  const [isResettingBase, setIsResettingBase] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [identityAccordionOpenIds, setIdentityAccordionOpenIds] = useState<Set<string>>(
    () => new Set(),
  );

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
    setLiveMessage(successMessage);
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
      setLiveMessage('No hay cambios pendientes por guardar.');
      return;
    }

    try {
      const updated = await tenantSelfApi.updateBranding(payload);
      applyUpdatedProfile(updated, 'La marca se actualizó correctamente.');
    } catch {
      const errorMessage = 'No fue posible guardar la marca. Intenta de nuevo.';
      setServerError(errorMessage);
      setLiveMessage(errorMessage);
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
    setLiveMessage(`Subiendo ${resolveUsageLabel(usage)} en ${resolveThemeLabel(themeVariant)}.`);

    const validationError = await validateBrandingFileForUpload(file, usage);
    if (validationError) {
      setServerError(validationError);
      setLiveMessage(validationError);
      return;
    }

    setUploadingSlot(slotKey);

    try {
      await tenantSelfApi.uploadBrandingAsset({ usage, themeVariant, file });
      const updated = await tenantSelfApi.getProfile();
      applyUpdatedProfile(updated, 'El activo se subió y asignó correctamente.');
    } catch {
      const errorMessage =
        'No fue posible subir el activo. Revisa los requisitos del archivo y vuelve a intentar.';
      setServerError(errorMessage);
      setLiveMessage(errorMessage);
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
      applyUpdatedProfile(updated, `Se eliminó la imagen de ${variant.label.toLowerCase()}.`);
    } catch {
      const errorMessage = 'No fue posible limpiar este activo de marca.';
      setServerError(errorMessage);
      setLiveMessage(errorMessage);
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
      applyUpdatedProfile(updated, 'La marca base se restauró correctamente.');
      setRestoreDialogOpen(false);
    } catch {
      const errorMessage = 'No fue posible restaurar la marca base.';
      setServerError(errorMessage);
      setLiveMessage(errorMessage);
    } finally {
      setIsResettingBase(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

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
          description={BRANDING_SETTINGS_COPY.formDescription}
          toolbar={
            canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="softDestructive"
                  size="sm"
                  onClick={() => setRestoreDialogOpen(true)}
                  disabled={!canEdit || isSubmitting || isResettingBase}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Restaurar base
                </Button>
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  loading={isSubmitting}
                  disabled={isSubmitting || !isDirty}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Guardar marca
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
                  Organiza cada activo por tipo y define su variante clara u oscura desde una sola
                  vista.
                </p>
              </div>

              <div
                data-testid="branding-assets-grid"
                className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
              >
                {BRANDING_GROUPS.map((group) => (
                  <section
                    key={group.usage}
                    className="flex h-full flex-col gap-4 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3"
                  >
                    <div className="space-y-2">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {group.title}
                        </h4>
                        <p
                          id={`${group.usage}-description`}
                          className="mt-1 text-sm text-gray-600 dark:text-gray-300"
                        >
                          {group.description}
                        </p>
                      </div>

                      <div
                        id={`${group.usage}-guidance`}
                        className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300"
                      >
                        <span className="font-medium text-gray-900 dark:text-white">
                          Requisitos recomendados:
                        </span>{' '}
                        {group.guidance}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {group.variants.map((variant) => {
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
                        const slotSourceId = `${slotKey}-source`;
                        const slotStatusId = `${slotKey}-status`;
                        const slotGuidanceId = `${group.usage}-guidance`;
                        const slotDescriptionId = `${group.usage}-description`;

                        return (
                          <div
                            key={slotKey}
                            aria-busy={isSlotUploading}
                            className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
                          >
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {variant.label}
                              </p>
                              <p
                                id={slotSourceId}
                                className="mt-1 text-xs text-gray-600 dark:text-gray-300"
                              >
                                Fuente actual: {resolveSourceLabel(profile, variant)}
                              </p>
                              <p id={slotStatusId} className="sr-only">
                                {isSlotUploading
                                  ? `Subiendo ${group.title.toLowerCase()} en ${variant.label.toLowerCase()}.`
                                  : `Estado actual: ${resolveSourceLabel(profile, variant)}.`}
                              </p>
                            </div>

                            <label
                              htmlFor={`${slotKey}-file`}
                              className="group relative block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-white transition-colors hover:border-iwana-primary/40 dark:border-dark-border dark:bg-dark-surface-3"
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
                              disabled={
                                !canEdit || isSubmitting || isSlotUploading || isSlotClearing
                              }
                              className="sr-only"
                              aria-label={`Subir archivo para ${group.title}, ${variant.label.toLowerCase()}`}
                              aria-describedby={`${slotDescriptionId} ${slotGuidanceId} ${slotSourceId} ${slotStatusId}`}
                              onChange={(event) => {
                                const selectedFile = event.target.files?.[0];
                                void handleUpload(group.usage, variant.themeVariant, selectedFile);
                                event.currentTarget.value = '';
                              }}
                            />

                            <p className="text-sm text-gray-600 dark:text-gray-300">
                              Sube un archivo o usa una URL HTTPS para esta variante.
                            </p>

                            {previewUrl ? (
                              <a
                                href={assetDirectory}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Abrir directorio del recurso para ${group.title}, ${variant.label.toLowerCase()}`}
                                className="flex items-center gap-1.5 overflow-hidden rounded-md border border-gray-100 bg-white px-3 py-2 text-xs text-gray-500 transition-colors hover:text-iwana-primary dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-400 dark:hover:text-iwana-primary"
                                title={`Abrir directorio: ${assetDirectory}`}
                              >
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="min-w-0 truncate font-mono">{assetDirectory}</span>
                              </a>
                            ) : null}

                            <Input
                              id={variant.urlField}
                              label={`URL HTTPS para ${group.title.toLowerCase()} · ${variant.label.toLowerCase()}`}
                              placeholder={variant.placeholder}
                              disabled={!canEdit || isSubmitting || isSlotUploading}
                              error={
                                typeof fieldError?.message === 'string'
                                  ? fieldError.message
                                  : undefined
                              }
                              helperText="Déjalo vacío para conservar la fuente actual. Guarda la marca para aplicar URLs externas."
                              aria-describedby={`${variant.urlField}-helper ${slotDescriptionId} ${slotGuidanceId}`}
                              {...register(variant.urlField)}
                            />

                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="softDestructive"
                                size="sm"
                                onClick={() => void handleClearSlot(variant)}
                                disabled={
                                  !canEdit || !hasConfiguredValue || isSlotClearing || isSubmitting
                                }
                                loading={isSlotClearing}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                Limpiar variante
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Vista previa de navegación y pestaña
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  Revisa cómo se verá la marca en el menú lateral y en la pestaña del navegador.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-dark-border dark:bg-dark-surface-2">
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Vista previa de navegación
                  </p>
                  <div className="flex min-h-[88px] flex-1 items-center rounded-2xl border border-gray-200 bg-iwana-surface-soft px-3 py-3 dark:border-dark-border dark:bg-dark-surface-3">
                    <div className="flex min-h-12 w-fit items-center gap-3 rounded-2xl bg-iwana-primary px-3 py-2">
                      <TenantSeal
                        sealLightUrl={watchedValues.sealLightUrl?.trim() || profile.sealLightUrl}
                        sealDarkUrl={watchedValues.sealDarkUrl?.trim() || profile.sealDarkUrl}
                        name={identityPreview.productName}
                        size="sm"
                      />
                      {watchedShowTenantName && (
                        <span className="max-w-[180px] truncate text-sm font-bold text-white">
                          {identityPreview.productName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-dark-border dark:bg-dark-surface-2">
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Vista previa de pestaña
                  </p>
                  <div className="flex min-h-[88px] flex-1 items-center rounded-2xl border border-gray-200 bg-iwana-surface-soft px-3 py-3 dark:border-dark-border dark:bg-dark-surface-3">
                    <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 dark:border-dark-border dark:bg-dark-surface-2">
                      <div className="h-8 w-8 overflow-hidden rounded-md bg-white dark:bg-dark-surface-2">
                        {watchedValues.faviconLightUrl?.trim() || profile.faviconLightUrl ? (
                          <img
                            src={
                              watchedValues.faviconLightUrl?.trim() || profile.faviconLightUrl || ''
                            }
                            alt={BRANDING_SETTINGS_COPY.faviconAlt}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <TenantSeal
                            sealLightUrl={
                              watchedValues.sealLightUrl?.trim() || profile.sealLightUrl
                            }
                            sealDarkUrl={watchedValues.sealDarkUrl?.trim() || profile.sealDarkUrl}
                            name={identityPreview.productName}
                            size="sm"
                          />
                        )}
                      </div>
                      <span
                        className="max-w-[180px] truncate text-sm font-medium text-gray-700 dark:text-gray-200"
                        title={identityPreview.metadataTitle}
                      >
                        {identityPreview.metadataTitle}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
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
                    {BRANDING_SETTINGS_COPY.showCompanyNameDescription}
                  </p>
                </div>
              </label>
            </section>

            <SectionAccordion
              variant="card"
              openIds={identityAccordionOpenIds}
              onOpenIdsChange={(ids) => setIdentityAccordionOpenIds(new Set(ids))}
              items={[
                {
                  id: 'identity-metadata',
                  label: 'Nombres e identidad',
                  description: BRANDING_SETTINGS_COPY.identitySectionDescription,
                  children: (
                    <div className="space-y-4">
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
                          helperText={BRANDING_SETTINGS_COPY.productHelperText}
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

                      <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm dark:border-dark-border dark:bg-dark-surface-2 md:grid-cols-2">
                        <div>
                          <dt className="text-xs uppercase tracking-[0.12em] text-gray-400">
                            Producto
                          </dt>
                          <dd className="mt-1 font-semibold text-gray-900 dark:text-white">
                            {identityPreview.productName}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-[0.12em] text-gray-400">
                            Superficie
                          </dt>
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
                          <dt className="text-xs uppercase tracking-[0.12em] text-gray-400">
                            Descripción
                          </dt>
                          <dd className="mt-1 text-gray-600 dark:text-gray-300">
                            {identityPreview.metadataDescription}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </SettingsSectionPanel>
      </form>

      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="sm:max-w-lg" aria-labelledby="branding-restore-title">
          <DialogHeader>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle id="branding-restore-title">Restaurar marca base</DialogTitle>
            <DialogDescription>
              Esta acción eliminará logos, sellos, favicons, fondos y metadata pública para volver a
              la identidad base del portal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100">
              Confirma solo si deseas limpiar toda la configuración de marca de esta empresa.
            </div>

            {serverError && isResettingBase === false ? (
              <PortalAlert
                variant="error"
                title="No fue posible restaurar la marca"
                description={serverError}
                icon={CircleAlert}
              />
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={isResettingBase}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="softDestructive"
                loading={isResettingBase}
                disabled={isResettingBase}
                onClick={() => void handleRestoreBaseBranding()}
              >
                Restaurar base
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
