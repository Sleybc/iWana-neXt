// apps/web/src/components/auth/LoginForm.tsx
'use client';

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
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
import { Button, cn } from '@iwana/ui';
import { ApiError, persistAccessToken, platformUsersApi } from '@/lib/api-client';
import {
  FORM_ALERT_ERROR_CLASS,
  FORM_ALERT_INFO_CLASS,
  FORM_ICON_LEADING_CLASS,
  FORM_ICON_TRAILING_BUTTON_CLASS,
  FORM_INPUT_WITH_BOTH_ICONS_CLASS,
  FORM_INPUT_WITH_LEADING_ICON_CLASS,
  FORM_LABEL_CLASS,
  FORM_MICROCOPY_CLASS,
  FORM_SECTION_CARD_CLASS,
  FORM_ERROR_CLASS,
} from '@/lib/form-styles';
import { useAuth } from './AuthProvider';

type BootstrapStep = 'loading' | 'bootstrap_email' | 'bootstrap_password' | 'login';

const loginErrorMessages: Record<number, string> = {
  401: 'Correo o contraseña incorrectos.',
  403: 'No tienes permisos para acceder a la plataforma.',
  429: 'Demasiados intentos fallidos. Espera 1 minuto e intenta de nuevo.',
};

const defaultBootstrapEmail = 'admin@iwana.co';

const footerCardClass =
  'mt-6 rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-dark-border dark:bg-dark-surface-3/70';

const helperListItemClass =
  'flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs text-gray-500 dark:bg-dark-surface-2 dark:text-gray-400';

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
      <div className="space-y-4">
        <div className="flex items-center justify-center py-6">
          <LoaderCircle className="h-8 w-8 animate-spin text-iwana-secondary-700 dark:text-iwana-secondary-400" />
        </div>
        <div className="space-y-3 animate-pulse">
          <div className="h-5 w-40 rounded-full bg-gray-100 dark:bg-dark-surface-3" />
          <div className="h-14 rounded-xl bg-gray-100 dark:bg-dark-surface-3" />
          <div className="h-14 rounded-xl bg-gray-100 dark:bg-dark-surface-3" />
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
        <div className={FORM_ALERT_INFO_CLASS}>
          <Mail className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Configuración inicial</p>
            <p>
              Aún no existe ningún usuario en la plataforma. Ingresa el correo del administrador
              inicial para crear tu cuenta.
            </p>
          </div>
        </div>

        <label className="flex flex-col gap-2">
          <span className={FORM_LABEL_CLASS}>Correo del administrador</span>
          <div className="relative">
            <Mail className={FORM_ICON_LEADING_CLASS} aria-hidden="true" />
            <input
              type="email"
              autoComplete="email"
              className={cn(
                FORM_INPUT_WITH_LEADING_ICON_CLASS,
                emailForm.formState.errors.email
                  ? 'border-red-400 focus:ring-red-500/20'
                  : '',
              )}
              placeholder="admin@iwana.co"
              {...emailForm.register('email')}
            />
          </div>
          {emailForm.formState.errors.email && (
            <span className={FORM_ERROR_CLASS}>{emailForm.formState.errors.email.message}</span>
          )}
        </label>

        {serverError && (
          <div role="alert" className={FORM_ALERT_ERROR_CLASS}>
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          className="mt-2 w-full"
          loading={emailForm.formState.isSubmitting}
        >
          {emailForm.formState.isSubmitting ? 'Validando correo' : (
            <>
              <span>Continuar</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </Button>
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
        <div className={FORM_ALERT_INFO_CLASS}>
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Crear contraseña de administrador</p>
            <p>
              La contraseña debe tener al menos 10 caracteres e incluir mayúsculas, minúsculas,
              números y caracteres especiales.
            </p>
          </div>
        </div>

        <div className={FORM_SECTION_CARD_CLASS}>
          <p className={FORM_MICROCOPY_CLASS}>Usuario principal de plataforma</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{bootstrapEmail}</p>
        </div>

        <label className="flex flex-col gap-2">
          <span className={FORM_LABEL_CLASS}>Nueva contraseña</span>
          <div className="relative">
            <LockKeyhole className={FORM_ICON_LEADING_CLASS} aria-hidden="true" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••"
              autoComplete="new-password"
              className={cn(
                FORM_INPUT_WITH_BOTH_ICONS_CLASS,
                passwordForm.formState.errors.password
                  ? 'border-red-400 focus:ring-red-500/20'
                  : '',
              )}
              {...passwordForm.register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className={FORM_ICON_TRAILING_BUTTON_CLASS}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Eye className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
          {passwordForm.formState.errors.password && (
            <span className={FORM_ERROR_CLASS}>{passwordForm.formState.errors.password.message}</span>
          )}
        </label>

        <label className="flex flex-col gap-2">
          <span className={FORM_LABEL_CLASS}>Confirmar contraseña</span>
          <div className="relative">
            <LockKeyhole className={FORM_ICON_LEADING_CLASS} aria-hidden="true" />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="••••••••••"
              autoComplete="new-password"
              className={cn(
                FORM_INPUT_WITH_BOTH_ICONS_CLASS,
                passwordForm.formState.errors.confirmPassword
                  ? 'border-red-400 focus:ring-red-500/20'
                  : '',
              )}
              {...passwordForm.register('confirmPassword')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((p) => !p)}
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
          {passwordForm.formState.errors.confirmPassword && (
            <span className={FORM_ERROR_CLASS}>
              {passwordForm.formState.errors.confirmPassword.message}
            </span>
          )}
        </label>

        {serverError && (
          <div role="alert" className={FORM_ALERT_ERROR_CLASS}>
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        )}

        <div className="mt-2 flex gap-3">
          <Button type="button" variant="secondary" size="lg" onClick={handleBackToEmail} className="flex-1">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Atrás
          </Button>
          <Button
            type="submit"
            size="lg"
            className="flex-[2]"
            loading={passwordForm.formState.isSubmitting}
          >
            {passwordForm.formState.isSubmitting ? 'Creando cuenta' : 'Crear cuenta'}
          </Button>
        </div>

        <div className={footerCardClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
            Requisitos mínimos
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {['Min. 10 caracteres', 'Mayúscula', 'Minúscula', 'Número', 'Especial'].map((requirement) => (
              <li key={requirement} className={helperListItemClass}>
                <CheckCircle2 className="h-3.5 w-3.5 text-iwana-secondary-700 dark:text-iwana-secondary-400" aria-hidden="true" />
                <span>{requirement}</span>
              </li>
            ))}
          </ul>
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
        <span className={FORM_LABEL_CLASS}>Correo electrónico o identidad</span>
        <div className="relative">
          <UserRound className={FORM_ICON_LEADING_CLASS} aria-hidden="true" />
          <input
            type="email"
            placeholder="usuario@iwananetwork.com"
            autoComplete="email"
            className={cn(
              FORM_INPUT_WITH_LEADING_ICON_CLASS,
              loginForm.formState.errors.email
                ? 'border-red-400 focus:ring-red-500/20'
                : '',
            )}
            {...loginForm.register('email')}
          />
        </div>
        {loginForm.formState.errors.email && (
          <span className={FORM_ERROR_CLASS}>{loginForm.formState.errors.email.message}</span>
        )}
      </label>

      <label className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className={FORM_LABEL_CLASS}>Contraseña</span>
          <a
            className="text-sm font-medium text-gray-500 transition-colors hover:text-iwana-secondary-700 dark:text-gray-400 dark:hover:text-iwana-secondary-400"
            href="/auth/forgot-password"
          >
            ¿Necesitas recuperar tu acceso?
          </a>
        </div>
        <div className="relative">
          <LockKeyhole className={FORM_ICON_LEADING_CLASS} aria-hidden="true" />
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            className={cn(
              FORM_INPUT_WITH_BOTH_ICONS_CLASS,
              loginForm.formState.errors.password
                ? 'border-red-400 focus:ring-red-500/20'
                : '',
            )}
            {...loginForm.register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className={FORM_ICON_TRAILING_BUTTON_CLASS}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Eye className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
        {loginForm.formState.errors.password && (
          <span className={FORM_ERROR_CLASS}>{loginForm.formState.errors.password.message}</span>
        )}
      </label>

      {serverError && (
        <div role="alert" className={FORM_ALERT_ERROR_CLASS}>
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="mt-2 w-full"
        loading={loginForm.formState.isSubmitting}
      >
        {loginForm.formState.isSubmitting ? 'Ingresando' : (
          <>
            <span>Ingresar</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </Button>

      <div className={footerCardClass}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-600 dark:text-gray-400">
          <ShieldCheck className="h-4 w-4 text-iwana-secondary-700 dark:text-iwana-secondary-400" aria-hidden="true" />
          <span>Sesión segura vía JWT</span>
        </div>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Auditoría de IP activa, MFA condicional y recuperación controlada desde el flujo de plataforma.
        </p>
      </div>
    </form>
  );
}
