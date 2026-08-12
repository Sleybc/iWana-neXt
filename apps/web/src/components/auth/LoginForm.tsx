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
import { useEffect, useState } from 'react';
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

const passwordRequirements = [
  'Min. 10 caracteres',
  'Mayúscula',
  'Minúscula',
  'Número',
  'Especial',
] as const;

const authClassNames = {
  label: 'text-sm font-bold text-iwana-primary dark:text-white',
  fieldBase:
    'h-14 w-full rounded-2xl border bg-iwana-surface-soft pl-12 text-base text-slate-900 placeholder:text-slate-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 dark:border-iwana-neutral-600 dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-400',
  fieldDefault:
    'border-slate-200 focus:ring-iwana-secondary/35 dark:border-iwana-neutral-600 dark:focus:ring-iwana-secondary-400/25',
  fieldError: 'border-red-500 focus:ring-red-500/30',
  fieldLeadingIcon:
    'absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 dark:text-gray-400',
  fieldTrailingButton:
    'absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-300',
  infoCard:
    'rounded-2xl border border-iwana-primary-100 bg-[linear-gradient(135deg,var(--color-iwana-surface-soft),rgba(255,255,255,0.96))] p-4 shadow-[var(--shadow-iwana-soft)] dark:border-dark-border dark:bg-dark-surface-3 dark:shadow-none',
  helperCard:
    'mt-6 rounded-2xl border border-gray-100 bg-gray-50/80 p-4 dark:border-dark-border dark:bg-dark-surface-3/70',
  helperChip:
    'flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs text-gray-500 dark:bg-dark-surface-2 dark:text-gray-400',
  primaryButton:
    'mt-4 flex !h-14 w-full items-center justify-center gap-2 rounded-2xl !bg-iwana-secondary px-5 text-lg font-bold !text-iwana-primary shadow-[var(--shadow-iwana-soft)] transition-colors hover:!bg-iwana-secondary-600 disabled:cursor-not-allowed disabled:opacity-70',
  secureFooter:
    'mt-8 flex flex-col items-center gap-2 border-t border-iwana-primary-100 pt-6 text-center dark:border-dark-border',
} as const;

function getInputClassName(hasError: boolean, trailingAction = false) {
  return cn(
    authClassNames.fieldBase,
    trailingAction ? 'pr-12' : 'pr-4',
    hasError ? authClassNames.fieldError : authClassNames.fieldDefault,
  );
}

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

  const handleBackToEmail = () => {
    setStep('bootstrap_email');
    setServerError(null);
    passwordForm.reset();
  };

  if (step === 'loading') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center py-6">
          <LoaderCircle className="h-8 w-8 animate-spin text-iwana-secondary-700 dark:text-iwana-secondary-400" />
        </div>
        <div className="space-y-3 animate-pulse">
          <div className="h-5 w-40 rounded-full bg-gray-100 dark:bg-dark-surface-3" />
          <div className="h-14 rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
          <div className="h-14 rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
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
          <span className={authClassNames.label}>Correo del administrador</span>
          <div className="relative">
            <Mail className={authClassNames.fieldLeadingIcon} aria-hidden="true" />
            <input
              type="email"
              autoComplete="email"
              className={getInputClassName(Boolean(emailForm.formState.errors.email))}
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
          className={authClassNames.primaryButton}
          loading={emailForm.formState.isSubmitting}
        >
          {emailForm.formState.isSubmitting ? (
            'Validando correo'
          ) : (
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
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {bootstrapEmail}
          </p>
        </div>

        <label className="flex flex-col gap-2">
          <span className={authClassNames.label}>Nueva contraseña</span>
          <div className="relative">
            <LockKeyhole className={authClassNames.fieldLeadingIcon} aria-hidden="true" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••"
              autoComplete="new-password"
              className={getInputClassName(Boolean(passwordForm.formState.errors.password), true)}
              {...passwordForm.register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className={authClassNames.fieldTrailingButton}
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
            <span className={FORM_ERROR_CLASS}>
              {passwordForm.formState.errors.password.message}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-2">
          <span className={authClassNames.label}>Confirmar contraseña</span>
          <div className="relative">
            <LockKeyhole className={authClassNames.fieldLeadingIcon} aria-hidden="true" />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="••••••••••"
              autoComplete="new-password"
              className={getInputClassName(
                Boolean(passwordForm.formState.errors.confirmPassword),
                true,
              )}
              {...passwordForm.register('confirmPassword')}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((p) => !p)}
              className={authClassNames.fieldTrailingButton}
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
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={handleBackToEmail}
            className="flex-1"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Atrás
          </Button>
          <Button
            type="submit"
            size="lg"
            className="flex-[2] rounded-2xl"
            loading={passwordForm.formState.isSubmitting}
          >
            {passwordForm.formState.isSubmitting ? 'Creando cuenta' : 'Crear cuenta'}
          </Button>
        </div>

        <div className={authClassNames.helperCard}>
          <p className="portal-eyebrow text-iwana-secondary-700 dark:text-iwana-secondary-400">
            Requisitos mínimos
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {passwordRequirements.map((requirement) => (
              <li key={requirement} className={authClassNames.helperChip}>
                <CheckCircle2
                  className="h-3.5 w-3.5 text-iwana-secondary-700 dark:text-iwana-secondary-400"
                  aria-hidden="true"
                />
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
      <div className={authClassNames.infoCard}>
        <p className="portal-eyebrow text-iwana-secondary-700 dark:text-iwana-secondary-400">
          Acceso administrativo
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-gray-400">
          Usa tu cuenta de plataforma para revisar empresas, usuarios internos y actividad operativa
          con trazabilidad centralizada.
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className={authClassNames.label}>Correo electrónico</span>
        <div className="relative">
          <UserRound className={authClassNames.fieldLeadingIcon} aria-hidden="true" />
          <input
            type="email"
            placeholder="usuario@iwananetwork.com"
            autoComplete="email"
            className={getInputClassName(Boolean(loginForm.formState.errors.email))}
            {...loginForm.register('email')}
          />
        </div>
        {loginForm.formState.errors.email && (
          <span className={FORM_ERROR_CLASS}>{loginForm.formState.errors.email.message}</span>
        )}
      </label>

      <label className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className={authClassNames.label}>Contraseña</span>
          <a
            className="text-sm font-medium text-slate-500 transition-colors hover:text-iwana-secondary-700 dark:text-gray-400 dark:hover:text-iwana-secondary-400"
            href="/auth/forgot-password"
          >
            ¿Necesitas ayuda con tu acceso?
          </a>
        </div>
        <div className="relative">
          <LockKeyhole className={authClassNames.fieldLeadingIcon} aria-hidden="true" />
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            className={getInputClassName(Boolean(loginForm.formState.errors.password), true)}
            {...loginForm.register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className={authClassNames.fieldTrailingButton}
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
        className={authClassNames.primaryButton}
        loading={loginForm.formState.isSubmitting}
      >
        {loginForm.formState.isSubmitting ? (
          'Ingresando'
        ) : (
          <>
            <span>Ingresar</span>
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </>
        )}
      </Button>

      <div className={authClassNames.secureFooter}>
        <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-gray-400">
          <ShieldCheck
            className="h-4 w-4 text-iwana-secondary-700 dark:text-iwana-secondary-400"
            aria-hidden="true"
          />
          <span>Sesión protegida</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-gray-400">
          El acceso se valida con controles de seguridad, verificación adicional cuando aplica y
          registro centralizado de actividad.
        </p>
      </div>
    </form>
  );
}
