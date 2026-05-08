// apps/portal/src/components/auth/LoginForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { loginSchema, type LoginFormValues } from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { resolveTenantSlug } from '@/lib/tenant-resolution';
import { useAuth } from './AuthProvider';
import {
  AUTH_FORM_ALERT_ERROR_CLASS,
  AUTH_FORM_ERROR_CLASS,
  AUTH_FORM_ICON_LEADING_CLASS,
  AUTH_FORM_ICON_TRAILING_BUTTON_CLASS,
  AUTH_FORM_INPUT_ERROR_CLASS,
  AUTH_FORM_INPUT_FOCUS_CLASS,
  AUTH_FORM_INPUT_WITH_BOTH_ICONS_CLASS,
  AUTH_FORM_INPUT_WITH_LEADING_ICON_CLASS,
  AUTH_FORM_LABEL_CLASS,
  AUTH_FORM_PRIMARY_BUTTON_CLASS,
  AUTH_FORM_SECURE_FOOTER_CLASS,
  cn,
} from '@iwana/ui';

const errorMessages: Record<number, string> = {
  400: 'Falta o es inválido el identificador de la empresa.',
  401: 'Correo o contraseña incorrectos.',
  404: 'Empresa no encontrada o cuenta inexistente.',
  429: 'Demasiados intentos. Espera 1 minuto.',
  500: 'El servicio de autenticación no está disponible en este momento.',
  503: 'El servicio de autenticación no está disponible en este momento.',
};

interface LoginFormProps {
  tenantSlug: string;
  tenantLocked: boolean;
  onTenantSlugChange: (value: string) => void;
  onTenantSlugCommit?: (value: string) => void;
}

export function LoginForm({
  tenantSlug,
  tenantLocked,
  onTenantSlugChange,
  onTenantSlugCommit,
}: LoginFormProps) {
  const router = useRouter();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setServerError(null);
    setTenantError(null);

    const tenantResolution = resolveTenantSlug(tenantSlug);
    if (!tenantResolution.slug) {
      setTenantError('Ingresa el identificador de la empresa.');
      return;
    }

    try {
      const result = await login(data.email, data.password, tenantResolution.slug);

      if (result === 'mfa_required') {
        router.push('/auth/mfa/verify');
      } else if (result === 'mfa_setup_required') {
        // Rol critico sin MFA: token limitado ya almacenado — configurar MFA antes de continuar
        router.push('/auth/mfa/setup');
      } else if (result === 'password_reset_required') {
        // El usuario debe cambiar su contrasena temporal antes de continuar
        router.push('/auth/change-password');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(errorMessages[err.status] ?? 'Error inesperado. Intenta de nuevo.');
      } else {
        setServerError('Error de conexión. Verifica tu red.');
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
      noValidate
      aria-label="Formulario de inicio de sesión"
    >
      <label className="flex flex-col gap-2">
        <span className={AUTH_FORM_LABEL_CLASS}>Empresa</span>
        <div className="relative group">
          <Building2 className={AUTH_FORM_ICON_LEADING_CLASS} aria-hidden="true" />
          <input
            type="text"
            placeholder="ejemplo: isp-demo"
            autoComplete="organization"
            value={tenantSlug}
            onChange={(event) => {
              setTenantError(null);
              onTenantSlugChange(event.target.value);
            }}
            onBlur={(event) => onTenantSlugCommit?.(event.target.value)}
            className={cn(
              AUTH_FORM_INPUT_WITH_LEADING_ICON_CLASS,
              tenantError ? AUTH_FORM_INPUT_ERROR_CLASS : AUTH_FORM_INPUT_FOCUS_CLASS,
            )}
            readOnly={tenantLocked}
            disabled={tenantLocked}
            required
          />
        </div>
        {tenantLocked && (
          <p className="text-xs text-slate-500 dark:text-gray-400">
            Empresa bloqueada por configuración de entorno (`NEXT_PUBLIC_TENANT_SLUG`).
          </p>
        )}
        {tenantError && <span className={AUTH_FORM_ERROR_CLASS}>{tenantError}</span>}
      </label>

      <label className="flex flex-col gap-2">
        <span className={AUTH_FORM_LABEL_CLASS}>Correo electrónico</span>
        <div className="relative group">
          <Mail className={AUTH_FORM_ICON_LEADING_CLASS} aria-hidden="true" />
          <input
            type="email"
            placeholder="usuario@iwananetwork.com"
            autoComplete="email"
            className={cn(
              AUTH_FORM_INPUT_WITH_LEADING_ICON_CLASS,
              errors.email ? AUTH_FORM_INPUT_ERROR_CLASS : AUTH_FORM_INPUT_FOCUS_CLASS,
            )}
            {...register('email')}
          />
        </div>
        {errors.email && <span className={AUTH_FORM_ERROR_CLASS}>{errors.email.message}</span>}
      </label>

      <label className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className={AUTH_FORM_LABEL_CLASS}>Contraseña</span>
          <a
            className="text-sm font-medium text-slate-500 hover:text-[#A5C330] transition-colors"
            href="/auth/forgot-password"
          >
            ¿Olvidaste tu contraseña?
          </a>
        </div>
        <div className="relative group">
          <LockKeyhole className={AUTH_FORM_ICON_LEADING_CLASS} aria-hidden="true" />
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            className={cn(
              AUTH_FORM_INPUT_WITH_BOTH_ICONS_CLASS,
              errors.password ? AUTH_FORM_INPUT_ERROR_CLASS : AUTH_FORM_INPUT_FOCUS_CLASS,
            )}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className={AUTH_FORM_ICON_TRAILING_BUTTON_CLASS}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Eye className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
        {errors.password && (
          <span className={AUTH_FORM_ERROR_CLASS}>{errors.password.message}</span>
        )}
      </label>

      {serverError && (
        <div role="alert" className={AUTH_FORM_ALERT_ERROR_CLASS}>
          <AlertTriangle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <button type="submit" disabled={isSubmitting} className={AUTH_FORM_PRIMARY_BUTTON_CLASS}>
        <span>{isSubmitting ? 'Ingresando...' : 'Ingresar'}</span>
        {!isSubmitting && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
      </button>

      <div className={AUTH_FORM_SECURE_FOOTER_CLASS}>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <ShieldCheck className="h-4 w-4 text-[#A5C330]" aria-hidden="true" />
          <span>MFA y políticas activas por empresa.</span>
        </div>
      </div>
    </form>
  );
}
