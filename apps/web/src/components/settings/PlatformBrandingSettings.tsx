'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, CircleAlert, ImageUp, RotateCcw, Save, Trash2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  SkeletonBlock,
  cn,
  interactiveFocusClassName,
} from '@iwana/ui';
import { usePlatformBrandingAssets } from '@/components/branding/PlatformBrandingProvider';
import {
  ApiError,
  platformBrandingApi,
  type PlatformBranding,
  type PlatformBrandingThemeVariant,
  type PlatformBrandingUsage,
  type UpdatePlatformBrandingPayload,
} from '@/lib/api-client';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { settingsSectionPanelClassName, settingsWellClassName } from './settings-shell';

const copy = PLATFORM_UI_COPY.settings.identity;

const urlSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || value.startsWith('https://') || value.startsWith('/'), {
    message: copy.validationUrl,
  });

const platformBrandingSchema = z.object({
  productName: z.string().trim().min(2, copy.validationProduct),
  surfaceName: z.string().trim().min(2, copy.validationSurface),
  metadataTitle: z.string().trim().min(4, copy.validationTitle),
  metadataDescription: z.string().trim().min(12, copy.validationDescription),
  logoUrl: urlSchema,
  faviconUrl: urlSchema,
  loginBackgroundLightUrl: urlSchema,
  loginBackgroundDarkUrl: urlSchema,
});

type PlatformBrandingFormValues = z.infer<typeof platformBrandingSchema>;
type FeedbackState = { type: 'success' | 'error'; message: string } | null;

type BrandingSlotRule = {
  allowedMimes: string[];
  maxBytes: number;
  minWidth: number;
  minHeight: number;
  aspectRatioMin?: number;
  aspectRatioMax?: number;
  square?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  helpText: string;
  formatHint: string;
};

const SLOT_RULES: Record<'logo' | 'favicon' | 'login_background', BrandingSlotRule> = {
  logo: {
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 1 * 1024 * 1024,
    minWidth: 240,
    minHeight: 60,
    aspectRatioMin: 1.6,
    aspectRatioMax: 5,
    helpText: copy.mimeHelpLogo,
    formatHint: 'PNG, JPG o WEBP',
  },
  favicon: {
    allowedMimes: ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'],
    maxBytes: 256 * 1024,
    minWidth: 32,
    minHeight: 32,
    square: true,
    maxWidth: 512,
    maxHeight: 512,
    helpText: copy.mimeHelpFavicon,
    formatHint: 'PNG o ICO',
  },
  login_background: {
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
    minWidth: 1280,
    minHeight: 720,
    aspectRatioMin: 1.6,
    aspectRatioMax: 1.9,
    helpText: copy.mimeHelpLoginBg,
    formatHint: 'PNG, JPG o WEBP',
  },
};

function toFormValues(branding: PlatformBranding): PlatformBrandingFormValues {
  return {
    productName: branding.productName,
    surfaceName: branding.surfaceName,
    metadataTitle: branding.metadataTitle,
    metadataDescription: branding.metadataDescription,
    logoUrl: branding.logoUrl ?? '',
    faviconUrl: branding.faviconUrl ?? '',
    loginBackgroundLightUrl: branding.loginBackgroundLightUrl ?? '',
    loginBackgroundDarkUrl: branding.loginBackgroundDarkUrl ?? '',
  };
}

function normalizeUrl(value: string): string | null {
  return value.trim() || null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function formatMaxSize(maxBytes: number): string {
  if (maxBytes >= 1024 * 1024) {
    return `${Math.round(maxBytes / (1024 * 1024))} MB`;
  }
  return `${Math.round(maxBytes / 1024)} KB`;
}

function resolveFileMimeType(file: File): string {
  if (file.type) {
    return file.type;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'ico') {
    return 'image/x-icon';
  }

  return '';
}

function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudieron leer las dimensiones de la imagen.'));
    };

    img.src = objectUrl;
  });
}

async function validateFileAgainstRule(
  file: File,
  usage: 'logo' | 'favicon' | 'login_background',
): Promise<string | null> {
  const rule = SLOT_RULES[usage];
  const mimeType = resolveFileMimeType(file);

  if (!rule.allowedMimes.includes(mimeType)) {
    return `Formato no permitido. Usa ${rule.formatHint}.`;
  }

  if (file.size > rule.maxBytes) {
    return `El archivo supera el máximo permitido de ${formatMaxSize(rule.maxBytes)}.`;
  }

  // Algunos navegadores no decodifican ICO en <img>; en ese caso delegamos dimensiones al backend.
  if (usage === 'favicon' && mimeType.includes('icon')) {
    return null;
  }

  let dimensions: { width: number; height: number };
  try {
    dimensions = await loadImageDimensions(file);
  } catch {
    return 'No se pudieron validar las dimensiones de la imagen.';
  }

  if (dimensions.width < rule.minWidth || dimensions.height < rule.minHeight) {
    return `La imagen debe ser al menos de ${rule.minWidth}×${rule.minHeight} px.`;
  }

  if (
    typeof rule.maxWidth === 'number' &&
    typeof rule.maxHeight === 'number' &&
    (dimensions.width > rule.maxWidth || dimensions.height > rule.maxHeight)
  ) {
    return `La imagen no puede superar ${rule.maxWidth}×${rule.maxHeight} px.`;
  }

  if (rule.square) {
    const tolerance = Math.max(1, Math.round(dimensions.width * 0.02));
    if (Math.abs(dimensions.width - dimensions.height) > tolerance) {
      return 'La imagen debe ser cuadrada (1:1).';
    }
  }

  if (typeof rule.aspectRatioMin === 'number' && typeof rule.aspectRatioMax === 'number') {
    const aspectRatio = dimensions.width / dimensions.height;
    if (aspectRatio < rule.aspectRatioMin || aspectRatio > rule.aspectRatioMax) {
      return `La proporción debe estar entre ${rule.aspectRatioMin.toFixed(2)} y ${rule.aspectRatioMax.toFixed(2)}.`;
    }
  }

  return null;
}

interface BrandingSlotCardProps {
  label: string;
  description: string;
  urlFieldLabel: string;
  imgAlt: string;
  value: string;
  accept: string;
  isUploading: boolean;
  isRemoving?: boolean;
  onUpload: (file: File) => Promise<void>;
  onRemove?: () => Promise<void>;
  rulesHint: string;
  registration: UseFormRegisterReturn;
  error?: string | undefined;
  disabled?: boolean;
}

function BrandingSlotCard({
  label,
  description,
  urlFieldLabel,
  imgAlt,
  value,
  accept,
  isUploading,
  isRemoving,
  onUpload,
  onRemove,
  rulesHint,
  registration,
  error,
  disabled,
}: BrandingSlotCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={settingsWellClassName}>
      <div className="text-sm font-semibold text-gray-900 dark:text-white">{label}</div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading || disabled}
        className={cn(
          'group relative flex min-h-11 h-32 w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white transition-colors hover:border-iwana-primary/40 disabled:cursor-not-allowed dark:border-dark-border dark:bg-dark-surface-2',
          interactiveFocusClassName,
        )}
        aria-label={`Cambiar ${label.toLowerCase()}`}
      >
        {value ? (
          <>
            <img src={value} alt={imgAlt} className="h-20 max-w-full object-contain" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera className="h-5 w-5 text-white" aria-hidden="true" />
              <span className="text-xs font-medium text-white">{copy.changeImage}</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <ImageUp className="h-8 w-8" aria-hidden="true" />
            <span className="text-xs">{copy.uploadImage}</span>
          </div>
        )}
        {isUploading ? (
          <div
            role="status"
            aria-label={copy.uploading}
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/80 dark:bg-dark-surface-2/80"
          >
            <span className="text-sm text-gray-500 dark:text-gray-400" aria-hidden="true">
              {copy.uploading}
            </span>
          </div>
        ) : null}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        disabled={isUploading || disabled}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void onUpload(file);
        }}
      />

      <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{rulesHint}</p>

      <details className="text-sm">
        <summary
          className={cn(
            'cursor-pointer select-none text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
            interactiveFocusClassName,
          )}
        >
          {copy.advancedOptions}
        </summary>
        <div className="mt-2 space-y-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">{copy.advancedHelp}</p>
          <Input label={urlFieldLabel} error={error} disabled={disabled} {...registration} />
        </div>
      </details>

      {value && onRemove ? (
        <div className="flex justify-end">
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading || Boolean(isRemoving) || disabled}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {copy.removeCta}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {copy.removeDialogTitle.replace('{label}', label.toLowerCase())}
                </DialogTitle>
                <DialogDescription>{copy.removeDialogBody}</DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex justify-end gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {copy.cancel}
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    loading={Boolean(isRemoving)}
                    onClick={() => {
                      void onRemove();
                    }}
                  >
                    {copy.removeConfirm}
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
}

function IdentityLoadingSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label={copy.loading} className="space-y-6">
      <span className="sr-only">{copy.loading}</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SkeletonBlock className="h-56 w-full rounded-2xl" />
        <SkeletonBlock className="h-56 w-full rounded-2xl" />
        <SkeletonBlock className="h-56 w-full rounded-2xl" />
        <SkeletonBlock className="h-56 w-full rounded-2xl" />
      </div>
      <SkeletonBlock className="h-48 w-full rounded-2xl" />
    </div>
  );
}

export function PlatformBrandingSettings() {
  const { refresh: refreshPublicBranding } = usePlatformBrandingAssets();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [removingSlot, setRemovingSlot] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PlatformBrandingFormValues>({
    resolver: zodResolver(platformBrandingSchema),
    defaultValues: {
      productName: '',
      surfaceName: '',
      metadataTitle: '',
      metadataDescription: '',
      logoUrl: '',
      faviconUrl: '',
      loginBackgroundLightUrl: '',
      loginBackgroundDarkUrl: '',
    },
  });

  useEffect(() => {
    let mounted = true;

    const loadBranding = async () => {
      try {
        const branding = await platformBrandingApi.get();
        if (mounted) {
          reset(toFormValues(branding));
          setFeedback(null);
          setLoadError(null);
        }
      } catch (error) {
        if (mounted) {
          setLoadError(getErrorMessage(error, copy.errorLoad));
        }
      } finally {
        if (mounted) {
          setIsLoadingData(false);
        }
      }
    };

    void loadBranding();

    return () => {
      mounted = false;
    };
  }, [reset]);

  const formValues = watch();

  const preview = useMemo(
    () => ({
      productName: formValues.productName?.trim() || 'iWana neXt',
      surfaceName: formValues.surfaceName?.trim() || 'Portal administrativo',
      metadataTitle: formValues.metadataTitle?.trim() || 'iWana neXt — Portal Administrativo',
      metadataDescription:
        formValues.metadataDescription?.trim() ||
        'Portal administrativo para operadores ISP iWana neXt',
    }),
    [formValues],
  );

  const onSubmit = async (values: PlatformBrandingFormValues) => {
    try {
      const logoUrl = normalizeUrl(values.logoUrl);
      const faviconUrl = normalizeUrl(values.faviconUrl);
      const loginBackgroundLightUrl = normalizeUrl(values.loginBackgroundLightUrl);
      const loginBackgroundDarkUrl = normalizeUrl(values.loginBackgroundDarkUrl);

      const payload: UpdatePlatformBrandingPayload = {
        productName: values.productName.trim(),
        surfaceName: values.surfaceName.trim(),
        metadataTitle: values.metadataTitle.trim(),
        metadataDescription: values.metadataDescription.trim(),
        logoUrl,
        faviconUrl,
        loginBackgroundLightUrl,
        loginBackgroundDarkUrl,
      };

      if (logoUrl === null) {
        payload.logoAssetId = null;
      }
      if (faviconUrl === null) {
        payload.faviconAssetId = null;
      }
      if (loginBackgroundLightUrl === null) {
        payload.loginBackgroundLightAssetId = null;
      }
      if (loginBackgroundDarkUrl === null) {
        payload.loginBackgroundDarkAssetId = null;
      }

      const updated = await platformBrandingApi.update(payload);
      reset(toFormValues(updated));
      await refreshPublicBranding();
      setFeedback({ type: 'success', message: copy.successSave });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, copy.errorSave),
      });
    }
  };

  const onResetDefaults = async () => {
    setIsResetting(true);
    try {
      const updated = await platformBrandingApi.reset();
      reset(toFormValues(updated));
      await refreshPublicBranding();
      setFeedback({ type: 'success', message: copy.successReset });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, copy.errorReset),
      });
    } finally {
      setIsResetting(false);
    }
  };

  const onUploadAsset = async (
    usage: PlatformBrandingUsage,
    file: File,
    themeVariant?: PlatformBrandingThemeVariant,
  ) => {
    const slotKey = `${usage}:${themeVariant ?? 'default'}`;

    const validationError = await validateFileAgainstRule(
      file,
      usage === 'logo' || usage === 'favicon' ? usage : 'login_background',
    );
    if (validationError) {
      setFeedback({ type: 'error', message: validationError });
      return;
    }

    setUploadingSlot(slotKey);
    try {
      await platformBrandingApi.uploadAsset(
        themeVariant ? { usage, themeVariant, file } : { usage, file },
      );
      const updated = await platformBrandingApi.get();
      reset(toFormValues(updated));
      await refreshPublicBranding();
      setFeedback({ type: 'success', message: copy.successUpload });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, copy.errorUpload),
      });
    } finally {
      setUploadingSlot(null);
    }
  };

  const onRemoveAsset = async (
    usage: PlatformBrandingUsage,
    themeVariant?: PlatformBrandingThemeVariant,
  ) => {
    const slotKey = `${usage}:${themeVariant ?? 'default'}`;
    setRemovingSlot(slotKey);

    let payload: UpdatePlatformBrandingPayload;
    if (usage === 'logo') {
      payload = { logoUrl: null, logoAssetId: null };
    } else if (usage === 'favicon') {
      payload = { faviconUrl: null, faviconAssetId: null };
    } else if (themeVariant === 'light') {
      payload = {
        loginBackgroundLightUrl: null,
        loginBackgroundLightAssetId: null,
      };
    } else {
      payload = {
        loginBackgroundDarkUrl: null,
        loginBackgroundDarkAssetId: null,
      };
    }

    try {
      const updated = await platformBrandingApi.update(payload);
      reset(toFormValues(updated));
      await refreshPublicBranding();
      setFeedback({
        type: 'success',
        message: copy.successRemove,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, copy.errorRemove),
      });
    } finally {
      setRemovingSlot(null);
    }
  };

  const formDisabled = isLoadingData || loadError !== null;

  return (
    <div className="space-y-6">
      {feedback?.type === 'error' ? (
        <Alert variant="error" icon={<CircleAlert className="h-5 w-5" />}>
          <AlertDescription className="mt-0">{feedback.message}</AlertDescription>
        </Alert>
      ) : null}
      {feedback?.type === 'success' ? (
        <Alert variant="success" icon={<CheckCircle2 className="h-5 w-5" />}>
          <AlertDescription className="mt-0">{feedback.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-iwana-primary dark:text-white">{copy.title}</h2>
        <p className="max-w-2xl text-sm text-gray-500 dark:text-gray-400">{copy.help}</p>
      </div>

      {isLoadingData ? <IdentityLoadingSkeleton /> : null}

      {loadError && !isLoadingData ? (
        <Alert variant="error" icon={<CircleAlert className="h-5 w-5" />}>
          <div className="flex flex-1 items-start justify-between gap-3">
            <AlertDescription className="mt-0">{loadError}</AlertDescription>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsLoadingData(true);
                setLoadError(null);
                platformBrandingApi
                  .get()
                  .then((branding) => {
                    reset(toFormValues(branding));
                    setIsLoadingData(false);
                  })
                  .catch((error: unknown) => {
                    setLoadError(getErrorMessage(error, copy.errorLoad));
                    setIsLoadingData(false);
                  });
              }}
            >
              {copy.retry}
            </Button>
          </div>
        </Alert>
      ) : null}

      {!isLoadingData && !loadError ? (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6"
          aria-busy={formDisabled || undefined}
        >
          <section className={`space-y-3 ${settingsSectionPanelClassName}`}>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {copy.assetsSection}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{copy.assetsHelp}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <BrandingSlotCard
                label={copy.logoLabel}
                description={copy.logoDescription}
                urlFieldLabel={copy.logoUrlLabel}
                imgAlt={copy.logoImgAlt}
                value={formValues.logoUrl}
                accept="image/png,image/jpeg,image/webp"
                isUploading={uploadingSlot === 'logo:default'}
                isRemoving={removingSlot === 'logo:default'}
                onUpload={(file) => onUploadAsset('logo', file)}
                onRemove={() => onRemoveAsset('logo')}
                rulesHint={SLOT_RULES.logo.helpText}
                registration={register('logoUrl')}
                error={errors.logoUrl?.message}
              />
              <BrandingSlotCard
                label={copy.faviconLabel}
                description={copy.faviconDescription}
                urlFieldLabel={copy.faviconUrlLabel}
                imgAlt={copy.faviconImgAlt}
                value={formValues.faviconUrl}
                accept="image/png,image/x-icon,image/vnd.microsoft.icon"
                isUploading={uploadingSlot === 'favicon:default'}
                isRemoving={removingSlot === 'favicon:default'}
                onUpload={(file) => onUploadAsset('favicon', file)}
                onRemove={() => onRemoveAsset('favicon')}
                rulesHint={SLOT_RULES.favicon.helpText}
                registration={register('faviconUrl')}
                error={errors.faviconUrl?.message}
              />
              <BrandingSlotCard
                label={copy.loginBgLightLabel}
                description={copy.loginBgLightDescription}
                urlFieldLabel={copy.loginBgLightUrlLabel}
                imgAlt={copy.loginBgLightImgAlt}
                value={formValues.loginBackgroundLightUrl}
                accept="image/png,image/jpeg,image/webp"
                isUploading={uploadingSlot === 'login_background:light'}
                isRemoving={removingSlot === 'login_background:light'}
                onUpload={(file) => onUploadAsset('login_background', file, 'light')}
                onRemove={() => onRemoveAsset('login_background', 'light')}
                rulesHint={SLOT_RULES.login_background.helpText}
                registration={register('loginBackgroundLightUrl')}
                error={errors.loginBackgroundLightUrl?.message}
              />
              <BrandingSlotCard
                label={copy.loginBgDarkLabel}
                description={copy.loginBgDarkDescription}
                urlFieldLabel={copy.loginBgDarkUrlLabel}
                imgAlt={copy.loginBgDarkImgAlt}
                value={formValues.loginBackgroundDarkUrl}
                accept="image/png,image/jpeg,image/webp"
                isUploading={uploadingSlot === 'login_background:dark'}
                isRemoving={removingSlot === 'login_background:dark'}
                onUpload={(file) => onUploadAsset('login_background', file, 'dark')}
                onRemove={() => onRemoveAsset('login_background', 'dark')}
                rulesHint={SLOT_RULES.login_background.helpText}
                registration={register('loginBackgroundDarkUrl')}
                error={errors.loginBackgroundDarkUrl?.message}
              />
            </div>
          </section>

          <section className={`space-y-4 ${settingsSectionPanelClassName}`}>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {copy.namesSection}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{copy.namesHelp}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label={copy.productLabel}
                error={errors.productName?.message}
                {...register('productName')}
              />
              <Input
                label={copy.surfaceLabel}
                error={errors.surfaceName?.message}
                {...register('surfaceName')}
              />
              <Input
                label={copy.titleLabel}
                error={errors.metadataTitle?.message}
                {...register('metadataTitle')}
              />
              <Input
                label={copy.descriptionLabel}
                error={errors.metadataDescription?.message}
                {...register('metadataDescription')}
              />
            </div>

            <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-2">
              <div>
                <dt className="portal-eyebrow-muted">{copy.previewProduct}</dt>
                <dd className="mt-1 font-semibold text-gray-900 dark:text-white">
                  {preview.productName}
                </dd>
              </div>
              <div>
                <dt className="portal-eyebrow-muted">{copy.previewSurface}</dt>
                <dd className="mt-1 font-semibold text-gray-900 dark:text-white">
                  {preview.surfaceName}
                </dd>
              </div>
              <div>
                <dt className="portal-eyebrow-muted">{copy.previewTitle}</dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {preview.metadataTitle}
                </dd>
              </div>
              <div>
                <dt className="portal-eyebrow-muted">{copy.previewDescription}</dt>
                <dd className="mt-1 text-gray-600 dark:text-gray-300">
                  {preview.metadataDescription}
                </dd>
              </div>
            </dl>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onResetDefaults}
                loading={isResetting}
                disabled={formDisabled}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {copy.resetDefaults}
              </Button>
              <Button type="submit" loading={isSubmitting} disabled={formDisabled}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {copy.save}
              </Button>
            </div>
          </section>
        </form>
      ) : null}
    </div>
  );
}
