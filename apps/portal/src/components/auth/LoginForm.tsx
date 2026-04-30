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
import { useAuth } from './AuthProvider';
import { cn } from '@iwana/ui';

const errorMessages: Record<number, string> = {
  400: 'Falta o es inválido el identificador de la empresa.',
  401: 'Correo o contraseña incorrectos.',
  404: 'Empresa no encontrada o cuenta inexistente.',
  429: 'Demasiados intentos. Espera 1 minuto.',
  500: 'El servicio de autenticación no está disponible en este momento.',
  503: 'El servicio de autenticación no está disponible en este momento.',
};

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [tenantSlug, setTenantSlug] = useState(process.env.NEXT_PUBLIC_TENANT_SLUG ?? '');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setServerError(null);
    try {
      const result = await login(data.email, data.password, tenantSlug);

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
      <div className="rounded-[24px] border border-[#E8E7F0] bg-[linear-gradient(135deg,rgba(248,250,245,0.96),rgba(255,255,255,0.92))] p-4 shadow-iwana-soft">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700">
          Acceso empresarial
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Conecta tu operación con acceso seguro, trazabilidad y políticas activas por empresa.
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold text-[#181818]">Empresa</span>
        <div className="relative group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <input
            type="text"
            placeholder="ejemplo: isp-demo"
            autoComplete="organization"
            value={tenantSlug}
            onChange={(event) => setTenantSlug(event.target.value)}
            className="h-14 w-full rounded-2xl border border-slate-200 bg-[#f8faf5] pl-12 pr-4 text-base text-slate-900 placeholder:text-slate-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#A5C330]"
            required
          />
        </div>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold text-[#181818]">Correo Electrónico / Identidad</span>
        <div className="relative group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <Mail className="h-5 w-5" aria-hidden="true" />
          </span>
          <input
            type="email"
            placeholder="usuario@iwananetwork.com"
            autoComplete="email"
            className={cn(
              'h-14 w-full rounded-2xl border bg-[#f8faf5] pl-12 pr-4 text-base text-slate-900 placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 focus:border-transparent',
              errors.email
                ? 'border-red-500 focus:ring-red-500'
                : 'border-slate-200 focus:ring-[#A5C330]',
            )}
            {...register('email')}
          />
        </div>
        {errors.email && <span className="text-sm text-red-500">{errors.email.message}</span>}
      </label>

      <label className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-[#181818]">Contraseña</span>
          <a
            className="text-sm font-medium text-slate-500 hover:text-[#A5C330] transition-colors"
            href="/auth/forgot-password"
          >
            ¿Olvidaste tu contraseña?
          </a>
        </div>
        <div className="relative group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </span>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            className={cn(
              'h-14 w-full rounded-2xl border bg-[#f8faf5] pl-12 pr-12 text-base text-slate-900 placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 focus:border-transparent',
              errors.password
                ? 'border-red-500 focus:ring-red-500'
                : 'border-slate-200 focus:ring-[#A5C330]',
            )}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Eye className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
        {errors.password && <span className="text-sm text-red-500">{errors.password.message}</span>}
      </label>

      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-[24px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] px-4 py-3 text-sm text-red-700 shadow-iwana-soft"
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#A5C330] text-lg font-bold text-[#181818] shadow-lg shadow-[#A5C330]/20 transition-all active:scale-[0.99] hover:bg-[#94b126] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span>{isSubmitting ? 'Ingresando...' : 'Ingresar'}</span>
        {!isSubmitting && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
      </button>

      <div className="mt-8 flex flex-col items-center gap-2 border-t border-slate-100 pt-6 text-center">
        <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-600">
          <ShieldCheck className="h-4 w-4 text-[#A5C330]" aria-hidden="true" />
          <span>Sesión segura vía JWT</span>
        </div>
        <p className="text-xs text-slate-600">
          Auditoría de acceso y validaciones activas por empresa
        </p>
      </div>
    </form>
  );
}
