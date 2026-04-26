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
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { Button, cn } from '@iwana/ui';
import {
  FORM_ALERT_ERROR_CLASS,
  FORM_ALERT_WARNING_CLASS,
  FORM_ERROR_CLASS,
  FORM_ICON_LEADING_CLASS,
  FORM_ICON_TRAILING_BUTTON_CLASS,
  FORM_INPUT_WITH_BOTH_ICONS_CLASS,
  FORM_LABEL_CLASS,
  FORM_PANEL_CLASS,
  FORM_SECTION_CARD_CLASS,
} from '@/lib/form-styles';

/**
 * Esquema Zod para cambio de contrasena obligatorio.
 * Politica NIST SP 800-63B: min 10 chars, mayuscula, minuscula, numero, especial.
 */
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'La contrasena actual es requerida'),
    newPassword: z
      .string()
      .min(10, 'Minimo 10 caracteres')
      .regex(/[A-Z]/, 'Debe contener al menos una mayuscula')
      .regex(/[a-z]/, 'Debe contener al menos una minuscula')
      .regex(/[0-9]/, 'Debe contener al menos un numero')
      .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un caracter especial'),
    confirmPassword: z.string().min(1, 'Confirma tu nueva contrasena'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contrasenas no coinciden',
    path: ['confirmPassword'],
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

const helperListItemClass =
  'flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs text-gray-500 dark:bg-dark-surface-2 dark:text-gray-400';

/**
 * Pagina de cambio obligatorio de contrasena.
 *
 * Se muestra cuando el usuario inicia sesion por primera vez con credenciales
 * temporales (passwordResetRequired=true en el JWT).
 *
 * Flujo: login → AuthProvider detecta passwordResetRequired → redirige aqui
 * → usuario cambia contrasena → redirige a /dashboard.
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
      // Contrasena cambiada con exito — redirigir al dashboard
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setServerError('La contrasena actual es incorrecta.');
        } else {
          setServerError('Ocurrio un error al cambiar la contrasena. Intenta de nuevo.');
        }
      } else {
        setServerError('Error de conexion. Verifica tu red e intenta de nuevo.');
      }
    }
  };

  return (
    <main
      className="relative min-h-screen w-full flex flex-col lg:flex-row overflow-hidden bg-[#181818]"
      aria-label="Cambio de contrasena obligatorio"
    >
      <LoginBrandPanel
        title="Seguridad"
        subtitle="Debes establecer una nueva contrasena antes de continuar. Elige una contrasena segura que no hayas usado antes."
      />

      {/* Panel derecho — formulario */}
      <div className="w-full lg:w-1/2 bg-[#181818] flex items-center justify-center p-6 lg:p-12 relative">
        {/* Patron de puntos decorativo */}
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#A5C330_1px,transparent_1px)] bg-[length:32px_32px]" />

        <div className={`${FORM_PANEL_CLASS} relative z-10 w-full max-w-[480px] lg:p-10`}>
          <div className="mb-10">
            {/* Logo visible solo en movil */}
            <div className="flex lg:hidden items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-[#A5C330] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#181818" />
                  <path
                    d="M2 17l10 5 10-5"
                    stroke="#181818"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="font-bold text-[#181818]">iWana neXt</span>
            </div>

            {/* Icono de advertencia */}
            <div className={`${FORM_ALERT_WARNING_CLASS} mb-4`}>
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="font-medium">Accion requerida: cambia tu contrasena temporal</p>
            </div>

            <h2 className="mb-2 text-3xl font-bold text-iwana-primary dark:text-white">
              Nueva contrasena
            </h2>
            <p className="text-base text-gray-500 dark:text-gray-400">
              Establece una contrasena segura para tu cuenta
            </p>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-6"
            noValidate
            aria-label="Formulario de cambio de contrasena"
          >
            {/* Contrasena actual (temporal) */}
            <label className="flex flex-col gap-2">
              <span className={FORM_LABEL_CLASS}>Contrasena temporal actual</span>
              <div className="relative">
                <KeyRound className={FORM_ICON_LEADING_CLASS} aria-hidden="true" />
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Contrasena temporal"
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
                  aria-label={showCurrentPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
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

            {/* Nueva contrasena */}
            <label className="flex flex-col gap-2">
              <span className={FORM_LABEL_CLASS}>Nueva contrasena</span>
              <div className="relative">
                <KeyRound className={FORM_ICON_LEADING_CLASS} aria-hidden="true" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Nueva contrasena (min. 10 caracteres)"
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
                  aria-label={showNewPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
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
              {/* Indicadores de politica de contrasena */}
              <ul className="mt-1 flex flex-wrap gap-2">
                {[
                  'Min. 10 caracteres',
                  'Mayuscula',
                  'Minuscula',
                  'Numero',
                  'Caracter especial',
                ].map((req) => (
                  <li key={req} className={helperListItemClass}>
                    <ShieldCheck
                      className="h-3.5 w-3.5 text-iwana-secondary-700 dark:text-iwana-secondary-400"
                      aria-hidden="true"
                    />
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </label>

            {/* Confirmar nueva contrasena */}
            <label className="flex flex-col gap-2">
              <span className={FORM_LABEL_CLASS}>Confirmar nueva contrasena</span>
              <div className="relative">
                <KeyRound className={FORM_ICON_LEADING_CLASS} aria-hidden="true" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repite la nueva contrasena"
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
                  aria-label={showConfirmPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
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
                  <span>Establecer nueva contrasena</span>
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
                <span>Politica NIST SP 800-63B</span>
              </div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Cifrado en tránsito, sesión segura y control obligatorio de cambio de credencial en
                el primer ingreso.
              </p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
