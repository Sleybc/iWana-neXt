// apps/web/src/app/auth/change-password/page.tsx
'use client';

import {
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { authApi, ApiError } from '@/lib/api-client';
import { PlatformAuthExperience } from '@/components/auth/PlatformAuthExperience';
import { Button, cn } from '@iwana/ui';
import {
  FORM_ALERT_ERROR_CLASS,
  FORM_ALERT_WARNING_CLASS,
  FORM_ERROR_CLASS,
  FORM_ICON_LEADING_CLASS,
  FORM_ICON_TRAILING_BUTTON_CLASS,
  FORM_INPUT_WITH_BOTH_ICONS_CLASS,
  FORM_LABEL_CLASS,
  FORM_SECTION_CARD_CLASS,
} from '@/lib/form-styles';

/**
 * Esquema Zod para cambio de contraseña obligatorio.
 * Política NIST SP 800-63B: mín. 10 chars, mayúscula, minúscula, número, especial.
 */
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
    newPassword: z
      .string()
      .min(10, 'Mínimo 10 caracteres')
      .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
      .regex(/[a-z]/, 'Debe contener al menos una minúscula')
      .regex(/[0-9]/, 'Debe contener al menos un número')
      .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial'),
    confirmPassword: z.string().min(1, 'Confirma tu nueva contraseña'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

const helperListItemClass =
  'flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs text-gray-500 dark:bg-dark-surface-2 dark:text-gray-400';

/**
 * Página de cambio obligatorio de contraseña.
 *
 * Se muestra cuando el usuario inicia sesión por primera vez con credenciales
 * temporales (passwordResetRequired=true en el JWT).
 *
 * Flujo: login → AuthProvider detecta passwordResetRequired → redirige aquí
 * → usuario cambia contraseña → redirige a /dashboard.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = async (data: ChangePasswordFormValues) => {
    setServerError(null);
    try {
      await authApi.changePassword(data.currentPassword, data.newPassword);
      // Contraseña cambiada con éxito — redirigir al dashboard
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setServerError('La contraseña actual es incorrecta.');
        } else {
          setServerError('Ocurrió un error al cambiar la contraseña. Intenta de nuevo.');
        }
      } else {
        setServerError('Error de conexión. Verifica tu red e intenta de nuevo.');
      }
    }
  };

  return (
    <PlatformAuthExperience
      ariaLabel="Cambio de contraseña obligatorio"
      shellTestId="platform-change-password-shell"
      asideAccent="Seguridad de acceso"
      asideDescription="Debes establecer una nueva contraseña antes de continuar. Elige una contraseña segura que no hayas usado antes."
      panelClassName="max-w-[520px]"
      intro={
        <>
          <div className={`${FORM_ALERT_WARNING_CLASS} mb-4`}>
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="font-medium">Acción requerida: cambia tu contraseña temporal</p>
          </div>

          <h2 className="mb-2 text-3xl font-bold text-iwana-primary dark:text-white">
            Nueva contraseña
          </h2>
          <p className="text-base text-gray-500 dark:text-gray-400">
            Establece una contraseña segura para tu cuenta
          </p>
        </>
      }
      form={
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
          noValidate
          aria-label="Formulario de cambio de contraseña"
        >
          {/* Contraseña actual (temporal) */}
          <label className="flex flex-col gap-2">
            <span className={FORM_LABEL_CLASS}>Contraseña temporal actual</span>
            <div className="relative">
              <KeyRound className={FORM_ICON_LEADING_CLASS} aria-hidden="true" />
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                placeholder="Contraseña temporal"
                autoComplete="current-password"
                className={cn(
                  FORM_INPUT_WITH_BOTH_ICONS_CLASS,
                  errors.currentPassword ? 'border-red-400 focus:ring-red-500/20' : '',
                )}
                {...register('currentPassword')}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className={FORM_ICON_TRAILING_BUTTON_CLASS}
                aria-label={showCurrentPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showCurrentPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.currentPassword && (
              <span className={FORM_ERROR_CLASS}>{errors.currentPassword.message}</span>
            )}
          </label>

          {/* Nueva contraseña */}
          <label className="flex flex-col gap-2">
            <span className={FORM_LABEL_CLASS}>Nueva contraseña</span>
            <div className="relative">
              <KeyRound className={FORM_ICON_LEADING_CLASS} aria-hidden="true" />
              <input
                type={showNewPassword ? 'text' : 'password'}
                placeholder="Nueva contraseña (mín. 10 caracteres)"
                autoComplete="new-password"
                className={cn(
                  FORM_INPUT_WITH_BOTH_ICONS_CLASS,
                  errors.newPassword ? 'border-red-400 focus:ring-red-500/20' : '',
                )}
                {...register('newPassword')}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className={FORM_ICON_TRAILING_BUTTON_CLASS}
                aria-label={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showNewPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.newPassword && (
              <span className={FORM_ERROR_CLASS}>{errors.newPassword.message}</span>
            )}
            {/* Indicadores de política de contraseña */}
            <ul className="mt-1 flex flex-wrap gap-2">
              {['Mín. 10 caracteres', 'Mayúscula', 'Minúscula', 'Número', 'Carácter especial'].map(
                (req) => (
                  <li key={req} className={helperListItemClass}>
                    <ShieldCheck
                      className="h-3.5 w-3.5 text-iwana-secondary-700 dark:text-iwana-secondary-400"
                      aria-hidden="true"
                    />
                    <span>{req}</span>
                  </li>
                ),
              )}
            </ul>
          </label>

          {/* Confirmar nueva contraseña */}
          <label className="flex flex-col gap-2">
            <span className={FORM_LABEL_CLASS}>Confirmar nueva contraseña</span>
            <div className="relative">
              <KeyRound className={FORM_ICON_LEADING_CLASS} aria-hidden="true" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Repite la nueva contraseña"
                autoComplete="new-password"
                className={cn(
                  FORM_INPUT_WITH_BOTH_ICONS_CLASS,
                  errors.confirmPassword ? 'border-red-400 focus:ring-red-500/20' : '',
                )}
                {...register('confirmPassword')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className={FORM_ICON_TRAILING_BUTTON_CLASS}
                aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <span className={FORM_ERROR_CLASS}>{errors.confirmPassword.message}</span>
            )}
          </label>

          {/* Error del servidor */}
          {serverError && (
            <div role="alert" className={FORM_ALERT_ERROR_CLASS}>
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{serverError}</span>
            </div>
          )}

          <Button type="submit" size="lg" className="mt-2 w-full" loading={isSubmitting}>
            {isSubmitting ? (
              'Guardando cambios'
            ) : (
              <>
                <span>Establecer nueva contraseña</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>

          <div className={`${FORM_SECTION_CARD_CLASS} mt-2`}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-600 dark:text-gray-400">
              <ShieldCheck
                className="h-4 w-4 text-iwana-secondary-700 dark:text-iwana-secondary-400"
                aria-hidden="true"
              />
              <span>Política NIST SP 800-63B</span>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Cifrado en tránsito, sesión segura y control obligatorio de cambio de credencial en el
              primer ingreso.
            </p>
          </div>
        </form>
      }
    />
  );
}
