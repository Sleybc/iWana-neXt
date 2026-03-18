// apps/web/src/components/auth/LoginForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  createBootstrapPasswordSchema,
  loginSchema,
  type CreateBootstrapPasswordFormValues,
  type LoginFormValues,
} from '@iwana/shared';
import { ApiError, authApi, persistAccessToken, platformUsersApi } from '@/lib/api-client';
import { useAuth } from './AuthProvider';
import { cn } from '@iwana/ui';

type BootstrapStep = 'loading' | 'bootstrap_email' | 'bootstrap_password' | 'login';

const loginErrorMessages: Record<number, string> = {
  401: 'Correo o contraseña incorrectos.',
  403: 'No tienes permisos para acceder a la plataforma.',
  429: 'Demasiados intentos fallidos. Espera 1 minuto e intenta de nuevo.',
};

const defaultBootstrapEmail = 'admin@iwana.co';

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState<BootstrapStep>('loading');
  const [bootstrapEmail, setBootstrapEmail] = useState(defaultBootstrapEmail);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const checkBootstrapStatus = async () => {
      try {
        const status = await platformUsersApi.bootstrapStatus();
        if (status.hasUsers) {
          setStep('login');
        } else {
          setStep('bootstrap_email');
        }
      } catch {
        setStep('login');
      }
    };
    checkBootstrapStatus();
  }, []);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onLoginSubmit = async (data: LoginFormValues) => {
    setServerError(null);
    try {
      const result = await login(data.email, data.password);
      if (result === 'mfa_required') {
        router.push('/auth/mfa/verify');
      } else if (result === 'password_reset_required') {
        router.push('/auth/change-password');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(
          loginErrorMessages[err.status] ?? 'Ocurrió un error inesperado. Intenta de nuevo.',
        );
      } else {
        setServerError('Error de conexión. Verifica tu red e intenta de nuevo.');
      }
    }
  };

  const emailForm = useForm<{ email: string }>({
    defaultValues: { email: defaultBootstrapEmail },
  });

  const onEmailSubmit = emailForm.handleSubmit(({ email }) => {
    setBootstrapEmail(email);
    setStep('bootstrap_password');
  });

  const passwordForm = useForm<CreateBootstrapPasswordFormValues>({
    defaultValues: { email: defaultBootstrapEmail, password: '', confirmPassword: '' },
    resolver: zodResolver(createBootstrapPasswordSchema),
  });

  useEffect(() => {
    if (step === 'bootstrap_password') {
      passwordForm.setValue('email', bootstrapEmail);
    }
  }, [step, bootstrapEmail, passwordForm]);

  const onPasswordSubmit = passwordForm.handleSubmit(async ({ password }) => {
    setServerError(null);
    try {
      const result = await platformUsersApi.createBootstrapUser({
        email: bootstrapEmail,
        password,
        confirmPassword: password,
      });
      if (result.accessToken) {
        persistAccessToken(result.accessToken);
        router.push('/dashboard');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message ?? 'Ocurrió un error al crear el usuario. Intenta de nuevo.');
      } else {
        setServerError('Error de conexión. Verifica tu red e intenta de nuevo.');
      }
    }
  });

  const handleBackToEmail = useCallback(() => {
    setStep('bootstrap_email');
    setServerError(null);
    passwordForm.reset();
  }, [passwordForm]);

  if (step === 'loading') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 border-4 border-[#A5C330] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (step === 'bootstrap_email') {
    return (
      <form
        onSubmit={onEmailSubmit}
        className="flex flex-col gap-6"
        noValidate
        aria-label="Formulario de correo inicial"
      >
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          <p className="font-semibold mb-1">Configuración inicial</p>
          <p>
            Aún no existe ningún usuario en la plataforma. Ingresa el correo del administrador
            inicial para crear tu cuenta.
          </p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold text-[#181818]">Correo del Administrador</span>
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
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </span>
            <input
              type="email"
              autoComplete="email"
              className={cn(
                'w-full h-14 pl-12 pr-4 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                emailForm.formState.errors.email
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-slate-200 focus:ring-[#A5C330]',
              )}
              {...emailForm.register('email')}
            />
          </div>
          {emailForm.formState.errors.email && (
            <span className="text-sm text-red-500">{emailForm.formState.errors.email.message}</span>
          )}
        </label>

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
          disabled={emailForm.formState.isSubmitting}
          className="w-full h-14 mt-4 bg-[#A5C330] hover:bg-[#94b126] text-[#181818] text-lg font-bold rounded-xl transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-[#A5C330]/20 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <span>Continuar</span>
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
        </button>
      </form>
    );
  }

  if (step === 'bootstrap_password') {
    return (
      <form
        onSubmit={onPasswordSubmit}
        className="flex flex-col gap-6"
        noValidate
        aria-label="Formulario de creación de contraseña"
      >
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          <p className="font-semibold mb-1">Crear contraseña de administrador</p>
          <p>
            La contraseña debe tener al menos 10 caracteres e incluir mayúsculas, minúsculas,
            números y caracteres especiales.
          </p>
        </div>

        <div className="text-center">
          <p className="text-sm text-slate-500">Usuario:</p>
          <p className="font-bold text-[#181818]">{bootstrapEmail}</p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold text-[#181818]">Nueva Contraseña</span>
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
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••"
              autoComplete="new-password"
              className={cn(
                'w-full h-14 pl-12 pr-12 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                passwordForm.formState.errors.password
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-slate-200 focus:ring-[#A5C330]',
              )}
              {...passwordForm.register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? (
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
          {passwordForm.formState.errors.password && (
            <span className="text-sm text-red-500">
              {passwordForm.formState.errors.password.message}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold text-[#181818]">Confirmar Contraseña</span>
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
              placeholder="••••••••••"
              autoComplete="new-password"
              className={cn(
                'w-full h-14 pl-12 pr-12 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                passwordForm.formState.errors.confirmPassword
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-slate-200 focus:ring-[#A5C330]',
              )}
              {...passwordForm.register('confirmPassword')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((p) => !p)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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
          {passwordForm.formState.errors.confirmPassword && (
            <span className="text-sm text-red-500">
              {passwordForm.formState.errors.confirmPassword.message}
            </span>
          )}
        </label>

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

        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={handleBackToEmail}
            className="flex-1 h-12 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
          >
            Atrás
          </button>
          <button
            type="submit"
            disabled={passwordForm.formState.isSubmitting}
            className="flex-[2] h-12 bg-[#A5C330] hover:bg-[#94b126] text-[#181818] text-lg font-bold rounded-xl transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-[#A5C330]/20 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <span>{passwordForm.formState.isSubmitting ? 'Creando...' : 'Crear cuenta'}</span>
          </button>
        </div>
      </form>
    );
  }

  // ---- Login form (step === 'login') ----
  return (
    <form
      onSubmit={loginForm.handleSubmit(onLoginSubmit)}
      className="flex flex-col gap-6"
      noValidate
      aria-label="Formulario de inicio de sesión"
    >
      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold text-[#181818]">Correo Electrónico / Identidad</span>
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
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </span>
          <input
            type="email"
            placeholder="usuario@iwananetwork.com"
            autoComplete="email"
            className={cn(
              'w-full h-14 pl-12 pr-4 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
              loginForm.formState.errors.email
                ? 'border-red-500 focus:ring-red-500'
                : 'border-slate-200 focus:ring-[#A5C330]',
            )}
            {...loginForm.register('email')}
          />
        </div>
        {loginForm.formState.errors.email && (
          <span className="text-sm text-red-500">{loginForm.formState.errors.email.message}</span>
        )}
      </label>

      <label className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-[#181818]">Contraseña</span>
          <a
            className="text-sm font-medium text-slate-500 hover:text-[#A5C330] transition-colors"
            href="/auth/forgot-password"
          >
            ¿Necesitas recuperar tu acceso?
          </a>
        </div>
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
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            className={cn(
              'w-full h-14 pl-12 pr-12 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
              loginForm.formState.errors.password
                ? 'border-red-500 focus:ring-red-500'
                : 'border-slate-200 focus:ring-[#A5C330]',
            )}
            {...loginForm.register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? (
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
        {loginForm.formState.errors.password && (
          <span className="text-sm text-red-500">
            {loginForm.formState.errors.password.message}
          </span>
        )}
      </label>

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
        disabled={loginForm.formState.isSubmitting}
        className="w-full h-14 mt-4 bg-[#A5C330] hover:bg-[#94b126] text-[#181818] text-lg font-bold rounded-xl transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-[#A5C330]/20 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        <span>{loginForm.formState.isSubmitting ? 'Ingresando...' : 'Ingresar'}</span>
        {!loginForm.formState.isSubmitting && (
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
          <span>Sesión segura vía JWT</span>
        </div>
        <p className="text-xs text-slate-600">Auditoría de IP activada • v2.1.0</p>
      </div>
    </form>
  );
}
