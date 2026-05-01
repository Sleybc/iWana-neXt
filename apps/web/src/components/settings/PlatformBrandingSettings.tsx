'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';
import { Button, Input } from '@iwana/ui';
import { usePlatformBrandingAssets } from '@/components/branding/PlatformBrandingProvider';
import {
  ApiError,
  platformBrandingApi,
  type PlatformBranding,
  type PlatformBrandingThemeVariant,
  type PlatformBrandingUsage,
  type UpdatePlatformBrandingPayload,
} from '@/lib/api-client';
import {
  FORM_ALERT_ERROR_CLASS,
  FORM_ALERT_SUCCESS_CLASS,
  FORM_HELP_CLASS,
} from '@/lib/form-styles';

const urlSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || value.startsWith('https://') || value.startsWith('/'), {
    message: 'Usa una URL HTTPS o una ruta interna del sistema.',
  });

const platformBrandingSchema = z.object({
  productName: z.string().trim().min(2, 'El producto debe tener al menos 2 caracteres.'),
  surfaceName: z.string().trim().min(2, 'La superficie debe tener al menos 2 caracteres.'),
  metadataTitle: z.string().trim().min(4, 'El título debe tener al menos 4 caracteres.'),
  metadataDescription: z
    .string()
    .trim()
    .min(12, 'La descripción debe tener al menos 12 caracteres.'),
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
};

const SLOT_RULES: Record<'logo' | 'favicon' | 'login_background', BrandingSlotRule> = {
  logo: {
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 1 * 1024 * 1024,
    minWidth: 240,
    minHeight: 60,
    aspectRatioMin: 1.6,
    aspectRatioMax: 5,
    helpText: 'PNG/JPG/WEBP, máximo 1 MB, mínimo 240x60 px, proporción entre 1.60 y 5.00.',
  },
  favicon: {
    allowedMimes: ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'],
    maxBytes: 256 * 1024,
    minWidth: 32,
    minHeight: 32,
    square: true,
    maxWidth: 512,
    maxHeight: 512,
    helpText: 'PNG/ICO, máximo 256 KB, cuadrado, entre 32x32 y 512x512 px.',
  },
  login_background: {
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
    minWidth: 1280,
    minHeight: 720,
    aspectRatioMin: 1.6,
    aspectRatioMax: 1.9,
    helpText: 'PNG/JPG/WEBP, máximo 5 MB, mínimo 1280x720 px, proporción entre 1.60 y 1.90.',
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
    return `Formato no permitido. Usa: ${rule.allowedMimes.join(', ')}.`;
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
    return `La imagen debe ser al menos de ${rule.minWidth}x${rule.minHeight} px.`;
  }

  if (
    typeof rule.maxWidth === 'number' &&
    typeof rule.maxHeight === 'number' &&
    (dimensions.width > rule.maxWidth || dimensions.height > rule.maxHeight)
  ) {
    return `La imagen no puede superar ${rule.maxWidth}x${rule.maxHeight} px.`;
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

// --- BrandingSlotCard: tarjeta clickeable para cambiar un activo visual ---

interface BrandingSlotCardProps {
  label: string;
  description: string;
  /** Label del <Input> de URL — debe coincidir con getByLabelText en tests */
  urlFieldLabel: string;
  /** Alt text de la imagen previualizada */
  imgAlt: string;
  /** URL actual del campo (de watch()) */
  value: string;
  accept: string;
  isUploading: boolean;
  isRemoving?: boolean;
  onUpload: (file: File) => Promise<void>;
  onRemove?: () => Promise<void>;
  rulesHint: string;
  /** Resultado de register('campoUrl') — se pasa directo al <Input> */
  registration: UseFormRegisterReturn;
  error?: string | undefined;
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
}: BrandingSlotCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50/80 p-4 dark:border-dark-border dark:bg-dark-surface-3">
      <div className="text-sm font-semibold text-gray-900 dark:text-white">{label}</div>

      {/* Área clickeable: muestra la imagen actual con overlay al hacer hover */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="group relative flex h-32 w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-white transition-colors hover:border-iwana-primary/40 disabled:cursor-not-allowed dark:border-dark-border dark:bg-dark-surface-2"
        aria-label={`Cambiar ${label.toLowerCase()}`}
      >
        {value ? (
          <>
            <img src={value} alt={imgAlt} className="h-20 max-w-full object-contain" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera className="h-5 w-5 text-white" aria-hidden="true" />
              <span className="text-xs font-medium text-white">Cambiar imagen</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <ImageUp className="h-8 w-8" aria-hidden="true" />
            <span className="text-xs">Subir imagen</span>
          </div>
        )}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80 dark:bg-dark-surface-2/80">
            <span className="text-sm text-gray-500 dark:text-gray-400">Subiendo...</span>
          </div>
        )}
      </button>

      {/* Input de archivo oculto — activado por el botón de arriba */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        disabled={isUploading}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void onUpload(file);
        }}
      />

      <p className={FORM_HELP_CLASS}>{description}</p>
      <p className={FORM_HELP_CLASS}>{`Reglas: ${rulesHint}`}</p>

      {/* Directorio almacenado — abre la carpeta donde vive el activo */}
      {value ? (
        <a
          href={value.substring(0, value.lastIndexOf('/') + 1) || '/'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 overflow-hidden rounded-md border border-gray-100 bg-white px-3 py-2 text-xs text-gray-500 transition-colors hover:text-iwana-primary dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-400 dark:hover:text-iwana-primary"
          title={`Abrir directorio: ${value.substring(0, value.lastIndexOf('/') + 1) || '/'}`}
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate font-mono">
            {value.substring(0, value.lastIndexOf('/') + 1) || '/'}
          </span>
        </a>
      ) : null}

      {/* URL alternativa: colapsable para usuarios avanzados */}
      <details className="text-sm">
        <summary
          className={`cursor-pointer select-none ${FORM_HELP_CLASS} hover:text-gray-700 dark:hover:text-gray-300`}
        >
          o pega una URL directamente
        </summary>
        <div className="mt-2">
          <Input label={urlFieldLabel} error={error} {...registration} />
        </div>
      </details>

      {value && onRemove ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void onRemove();
            }}
            disabled={isUploading || Boolean(isRemoving)}
            loading={Boolean(isRemoving)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Eliminar imagen
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function PlatformBrandingSettings() {
  const { refresh: refreshPublicBranding } = usePlatformBrandingAssets();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
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
      productName: 'iWana neXt',
      surfaceName: 'Portal administrativo',
      metadataTitle: 'iWana neXt — Portal Administrativo',
      metadataDescription: 'Portal administrativo para operadores ISP iWana neXt',
      logoUrl: '/brand/iwiso6.png',
      faviconUrl: '/brand/favicon-gecko.svg',
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
        }
      } catch (error) {
        if (mounted) {
          setFeedback({
            type: 'error',
            message: getErrorMessage(error, 'No fue posible cargar el branding de plataforma.'),
          });
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

  // Vista previa de los campos de texto — se actualiza en tiempo real
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
      setFeedback({ type: 'success', message: 'Branding de plataforma actualizado.' });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, 'No fue posible guardar el branding de plataforma.'),
      });
    }
  };

  const onResetDefaults = async () => {
    setIsResetting(true);
    try {
      const updated = await platformBrandingApi.reset();
      reset(toFormValues(updated));
      await refreshPublicBranding();
      setFeedback({ type: 'success', message: 'Branding base restaurado.' });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, 'No fue posible restaurar el branding base.'),
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
      setFeedback({ type: 'success', message: 'Activo subido y aplicado al branding.' });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, 'No fue posible subir el activo de branding.'),
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
        message: 'Imagen eliminada. Se aplicó el fallback base de la plataforma.',
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getErrorMessage(error, 'No fue posible eliminar la imagen del slot.'),
      });
    } finally {
      setRemovingSlot(null);
    }
  };

  return (
    // Contenedor sin borde propio — el Card de la página settings ya lo provee
    <div className="space-y-6">
      {/* Alertas de éxito y error */}
      {feedback?.type === 'error' && (
        <div role="alert" className={FORM_ALERT_ERROR_CLASS}>
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{feedback.message}</p>
        </div>
      )}
      {feedback?.type === 'success' && (
        <div className={FORM_ALERT_SUCCESS_CLASS}>
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{feedback.message}</p>
        </div>
      )}

      {/* Encabezado */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-iwana-primary dark:text-white">
          Branding de plataforma
        </h2>
        <p className={`max-w-2xl ${FORM_HELP_CLASS}`}>
          Identidad visual pública de la consola administrativa, independiente del branding de cada
          empresa.
        </p>
      </div>

      {isLoadingData ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Cargando branding...</p>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* ── Sección: Activos visuales ─────────────────────────────────── */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Activos visuales
            </h3>
            <p className={`mt-1 ${FORM_HELP_CLASS}`}>
              Haz clic en cada imagen para reemplazarla. Expande el campo si prefieres pegar una URL
              directamente.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BrandingSlotCard
              label="Logo de consola"
              description="Sidebar, header móvil y login administrativo."
              urlFieldLabel="Logo"
              imgAlt="Logo de plataforma"
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
              label="Favicon administrativo"
              description="Favicon, login y metadata del portal administrativo."
              urlFieldLabel="Favicon"
              imgAlt="Favicon de plataforma"
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
              label="Fondo de login — modo claro"
              description="Imagen de fondo en la pantalla de inicio de sesión (tema claro)."
              urlFieldLabel="Fondo login claro"
              imgAlt="Fondo login modo claro"
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
              label="Fondo de login — modo oscuro"
              description="Imagen de fondo en la pantalla de inicio de sesión (tema oscuro)."
              urlFieldLabel="Fondo login oscuro"
              imgAlt="Fondo login modo oscuro"
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

        {/* ── Sección: Nombres e identidad ─────────────────────────────── */}
        <section className="space-y-4 rounded-lg border border-gray-100 bg-gray-50/80 p-4 dark:border-dark-border dark:bg-dark-surface-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Nombres e identidad
            </h3>
            <p className={`mt-1 ${FORM_HELP_CLASS}`}>
              Definen cómo aparece la plataforma en el navegador y en las comunicaciones.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Producto"
              error={errors.productName?.message}
              {...register('productName')}
            />
            <Input
              label="Superficie"
              error={errors.surfaceName?.message}
              {...register('surfaceName')}
            />
            <Input
              label="Título público"
              error={errors.metadataTitle?.message}
              {...register('metadataTitle')}
            />
            <Input
              label="Descripción pública"
              error={errors.metadataDescription?.message}
              {...register('metadataDescription')}
            />
          </div>

          {/* Vista previa en vivo de los valores de identidad */}
          <dl className="grid grid-cols-1 gap-3 rounded-lg border border-gray-100 bg-white p-4 text-sm dark:border-dark-border dark:bg-dark-surface-2 md:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-gray-400">Producto</dt>
              <dd className="mt-1 font-semibold text-gray-900 dark:text-white">
                {preview.productName}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-gray-400">Superficie</dt>
              <dd className="mt-1 font-semibold text-gray-900 dark:text-white">
                {preview.surfaceName}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-gray-400">
                Título en navegador
              </dt>
              <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                {preview.metadataTitle}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-gray-400">Descripción</dt>
              <dd className="mt-1 text-gray-600 dark:text-gray-300">
                {preview.metadataDescription}
              </dd>
            </div>
          </dl>
        </section>

        {/* ── Acciones ─────────────────────────────────────────────────── */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onResetDefaults} loading={isResetting}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Restaurar base
          </Button>
          <Button type="submit" loading={isSubmitting}>
            <Save className="h-4 w-4" aria-hidden="true" />
            Guardar cambios
          </Button>
        </div>
      </form>
    </div>
  );
}
