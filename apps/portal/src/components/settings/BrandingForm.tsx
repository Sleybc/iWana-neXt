// apps/portal/src/components/settings/BrandingForm.tsx
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@iwana/ui';
import { tenantSelfApi, type TenantSelf } from '@/lib/api-client';
import { TenantSeal } from '@/components/layout/TenantSeal';

// Validación: string HTTPS de hasta 500 caracteres, o vacío para borrar
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
  showTenantName: z.boolean(),
});

type BrandingFormValues = z.infer<typeof brandingSchema>;

interface BrandingFormProps {
  profile: TenantSelf;
  canEdit: boolean;
  onUpdated: (updated: TenantSelf) => void;
}

/** Convierte string vacío a null para el backend; string no vacío lo devuelve tal cual */
function nullable(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** Preview inline de una imagen con fallback de error — se oculta si la URL está vacía */
function ImagePreview({ url, label }: { url: string; label: string }) {
  const [error, setError] = useState(false);

  // Resetear error al cambiar la URL
  useEffect(() => setError(false), [url]);

  if (!url.trim()) return null;

  return (
    <div className="mt-2 flex items-center gap-3">
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">
          No se pudo cargar — verifica la URL y que sea HTTPS.
        </p>
      ) : (
        <>
          {/* Fondo claro */}
          <div className="h-10 w-10 shrink-0 rounded-md border border-gray-200 bg-white p-1 dark:border-dark-border dark:bg-dark-surface-3">
            <img
              src={url}
              alt={label}
              onError={() => setError(true)}
              className="h-full w-full object-contain"
            />
          </div>
          {/* Fondo oscuro */}
          <div className="h-10 w-10 shrink-0 rounded-md border border-gray-700 bg-gray-900 p-1">
            <img
              src={url}
              alt={`${label} dark`}
              onError={() => setError(true)}
              className="h-full w-full object-contain"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Vista previa claro / oscuro</p>
        </>
      )}
    </div>
  );
}

/**
 * Formulario para configurar el branding del tenant: logo horizontal y sello compacto.
 *
 * - Valida que las URLs sean HTTPS y máximo 500 caracteres (mismo criterio que el backend).
 * - Muestra un preview de cada imagen en fondo claro y oscuro.
 * - Incluye un panel de preview del sidebar para ver cómo queda el sello con el nombre.
 * - Campo vacío = borrar la URL existente (se envía null al backend).
 * - HLD-MOD03-CONFIGURACION-EMPRESA-v1.0
 */
export function BrandingForm({ profile, canEdit, onUpdated }: BrandingFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<BrandingFormValues>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      logoLightUrl: profile.logoLightUrl ?? '',
      logoDarkUrl: profile.logoDarkUrl ?? '',
      sealLightUrl: profile.sealLightUrl ?? '',
      sealDarkUrl: profile.sealDarkUrl ?? '',
      showTenantName: profile.showTenantName,
    },
  });

  // Sincronizar formulario cuando el perfil cambia desde el exterior (e.g. recarga)
  useEffect(() => {
    reset({
      logoLightUrl: profile.logoLightUrl ?? '',
      logoDarkUrl: profile.logoDarkUrl ?? '',
      sealLightUrl: profile.sealLightUrl ?? '',
      sealDarkUrl: profile.sealDarkUrl ?? '',
      showTenantName: profile.showTenantName,
    });
  }, [profile, reset]);

  // Valores observados para los previews en tiempo real
  const watchedSealLight = watch('sealLightUrl') ?? '';
  const watchedSealDark = watch('sealDarkUrl') ?? '';
  const watchedLogoLight = watch('logoLightUrl') ?? '';
  const watchedLogoDark = watch('logoDarkUrl') ?? '';
  const watchedShowName = watch('showTenantName');

  const onSubmit = async (values: BrandingFormValues) => {
    setServerError(null);
    setSuccess(null);

    try {
      const updated = await tenantSelfApi.updateBranding({
        logoLightUrl: nullable(values.logoLightUrl),
        logoDarkUrl: nullable(values.logoDarkUrl),
        sealLightUrl: nullable(values.sealLightUrl),
        sealDarkUrl: nullable(values.sealDarkUrl),
        showTenantName: values.showTenantName,
      });

      onUpdated(updated);
      setSuccess('Logo y sello actualizados correctamente.');
    } catch {
      setServerError('No fue posible guardar el branding. Intenta de nuevo.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo y Sello</CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configura la identidad visual del tenant. Las imágenes deben estar publicadas en HTTPS.
          Formatos recomendados: SVG o PNG con fondo transparente.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
          {/* ── Sello compacto ─────────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Sello (ícono compacto)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Proporción 1:1. Se usa en el menú lateral y próximamente como favicon y en
                documentos.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <Input
                  id="sealLightUrl"
                  label="URL variante clara"
                  placeholder="https://cdn.tuempresa.co/seal-light.svg"
                  disabled={!canEdit}
                  error={errors.sealLightUrl?.message}
                  {...register('sealLightUrl')}
                />
                <ImagePreview url={watchedSealLight} label="Sello claro" />
              </div>
              <div>
                <Input
                  id="sealDarkUrl"
                  label="URL variante oscura"
                  placeholder="https://cdn.tuempresa.co/seal-dark.svg"
                  disabled={!canEdit}
                  error={errors.sealDarkUrl?.message}
                  {...register('sealDarkUrl')}
                />
                <ImagePreview url={watchedSealDark} label="Sello oscuro" />
              </div>
            </div>

            {/* Preview del sidebar en tiempo real */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
              <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                Así quedaría en el menú lateral:
              </p>
              <div className="flex items-center gap-3 rounded-lg bg-iwana-primary px-3 py-2 w-fit">
                <TenantSeal
                  sealLightUrl={watchedSealLight || null}
                  sealDarkUrl={watchedSealDark || null}
                  name={profile.name}
                  size="sm"
                />
                {watchedShowName && (
                  <span className="text-sm font-bold text-white truncate max-w-[140px]">
                    {profile.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Logo horizontal ─────────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Logo horizontal
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Proporción 3:1 a 5:1. Se usará próximamente en documentos y en la página de acceso
                del portal.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <Input
                  id="logoLightUrl"
                  label="URL variante clara"
                  placeholder="https://cdn.tuempresa.co/logo-light.svg"
                  disabled={!canEdit}
                  error={errors.logoLightUrl?.message}
                  {...register('logoLightUrl')}
                />
                <ImagePreview url={watchedLogoLight} label="Logo claro" />
              </div>
              <div>
                <Input
                  id="logoDarkUrl"
                  label="URL variante oscura"
                  placeholder="https://cdn.tuempresa.co/logo-dark.svg"
                  disabled={!canEdit}
                  error={errors.logoDarkUrl?.message}
                  {...register('logoDarkUrl')}
                />
                <ImagePreview url={watchedLogoDark} label="Logo oscuro" />
              </div>
            </div>
          </div>

          {/* ── Opciones de visualización ───────────────────────────────────────────── */}
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-surface-3">
            <label className="flex items-start gap-3 cursor-pointer">
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
                  Si se desactiva, el menú solo muestra el sello (o las iniciales) sin texto.
                </p>
              </div>
            </label>
          </div>

          {/* Mensajes de feedback */}
          {serverError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {serverError}
            </p>
          )}
          {success && !serverError && (
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
              {success}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {canEdit
                ? 'Solo se guardan URLs HTTPS válidas. Deja el campo vacío para eliminar una imagen.'
                : 'Tu rol puede consultar la configuración de branding, pero no modificarla.'}
            </p>
            {canEdit && (
              <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !isDirty}>
                Guardar logo y sello
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
