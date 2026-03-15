// apps/web/src/app/auth/change-password/page.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { authApi, ApiError } from '@/lib/api-client';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { cn } from '@iwana/ui';

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

        <div className="w-full max-w-[480px] bg-white rounded-2xl p-8 lg:p-12 shadow-2xl relative z-10">
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
            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <svg
                className="w-5 h-5 text-amber-600 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-sm text-amber-700 font-medium">
                Accion requerida: cambia tu contrasena temporal
              </p>
            </div>

            <h2 className="text-3xl font-bold text-[#181818] mb-2">Nueva Contrasena</h2>
            <p className="text-slate-500 text-base">
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
              <span className="text-sm font-bold text-[#181818]">Contrasena Temporal Actual</span>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </span>
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Contrasena temporal"
                  autoComplete="current-password"
                  className={cn(
                    'w-full h-14 pl-12 pr-12 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                    errors.currentPassword
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-200 focus:ring-[#A5C330]',
                  )}
                  {...register('currentPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  aria-label={showCurrentPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  {showCurrentPassword ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
              {errors.currentPassword && (
                <span className="text-sm text-red-500">{errors.currentPassword.message}</span>
              )}
            </label>

            {/* Nueva contrasena */}
            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold text-[#181818]">Nueva Contrasena</span>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </span>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Nueva contrasena (min. 10 caracteres)"
                  autoComplete="new-password"
                  className={cn(
                    'w-full h-14 pl-12 pr-12 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                    errors.newPassword
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-200 focus:ring-[#A5C330]',
                  )}
                  {...register('newPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  aria-label={showNewPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  {showNewPassword ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
              {errors.newPassword && (
                <span className="text-sm text-red-500">{errors.newPassword.message}</span>
              )}
              {/* Indicadores de politica de contrasena */}
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {[
                  'Min. 10 caracteres',
                  'Mayuscula',
                  'Minuscula',
                  'Numero',
                  'Caracter especial',
                ].map((req) => (
                  <li key={req} className="flex items-center gap-1 text-xs text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                    {req}
                  </li>
                ))}
              </ul>
            </label>

            {/* Confirmar nueva contrasena */}
            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold text-[#181818]">Confirmar Nueva Contrasena</span>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </span>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repite la nueva contrasena"
                  autoComplete="new-password"
                  className={cn(
                    'w-full h-14 pl-12 pr-12 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                    errors.confirmPassword
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-200 focus:ring-[#A5C330]',
                  )}
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  aria-label={showConfirmPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  {showConfirmPassword ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <span className="text-sm text-red-500">{errors.confirmPassword.message}</span>
              )}
            </label>

            {/* Error del servidor */}
            {serverError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
              >
                <svg
                  className="h-5 w-5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{serverError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-14 mt-4 bg-[#A5C330] hover:bg-[#94b126] text-[#181818] text-lg font-bold rounded-xl transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-[#A5C330]/20 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? 'Guardando...' : 'Establecer Nueva Contrasena'}</span>
              {!isSubmitting && (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              )}
            </button>

            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <svg
                  className="w-4 h-4 text-[#A5C330]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <span>Politica NIST SP 800-63B</span>
              </div>
              <p className="text-xs text-slate-600">Cifrado en transito • Sesion segura</p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
