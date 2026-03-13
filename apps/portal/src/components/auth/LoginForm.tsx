// apps/portal/src/components/auth/LoginForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { loginSchema, type LoginFormValues } from '@iwana/shared';
import { authApi, ApiError } from '@/lib/api-client';
import { cn } from '@iwana/ui';

const errorMessages: Record<number, string> = {
  400: 'Falta o es invalido el slug del tenant.',
  401: 'Correo o contraseña incorrectos.',
  404: 'Tenant no encontrado o cuenta inexistente.',
  429: 'Demasiados intentos. Espera 1 minuto.',
};

export function LoginForm() {
  const router = useRouter();
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
      await authApi.tenantLogin(data.email, data.password, tenantSlug);
      router.push('/dashboard');
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
        <span className="text-sm font-bold text-[#181818]">Tenant (slug)</span>
        <div className="relative group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18"></path>
              <path d="M5 21V7l8-4v18"></path>
              <path d="M19 21V11l-6-4"></path>
            </svg>
          </span>
          <input
            type="text"
            placeholder="ejemplo: isp-demo"
            autoComplete="organization"
            value={tenantSlug}
            onChange={(event) => setTenantSlug(event.target.value)}
            className="w-full h-14 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#A5C330] focus:border-transparent transition-all"
            required
          />
        </div>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold text-[#181818]">Correo Electrónico / Identidad</span>
        <div className="relative group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </span>
          <input
            type="email"
            placeholder="usuario@iwananetwork.com"
            autoComplete="email"
            className={cn(
              "w-full h-14 pl-12 pr-4 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all",
              errors.email ? "border-red-500 focus:ring-red-500" : "border-slate-200 focus:ring-[#A5C330]"
            )}
            {...register('email')}
          />
        </div>
        {errors.email && (
          <span className="text-sm text-red-500">{errors.email.message}</span>
        )}
      </label>

      <label className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-[#181818]">Contraseña</span>
          <a className="text-sm font-medium text-slate-500 hover:text-[#A5C330] transition-colors" href="/auth/forgot-password">
            ¿Olvidaste tu contraseña?
          </a>
        </div>
        <div className="relative group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </span>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            className={cn(
              "w-full h-14 pl-12 pr-12 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all",
              errors.password ? "border-red-500 focus:ring-red-500" : "border-slate-200 focus:ring-[#A5C330]"
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
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                 <line x1="1" y1="1" x2="23" y2="23"></line>
               </svg>
             ) : (
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                 <circle cx="12" cy="12" r="3"></circle>
               </svg>
             )}
          </button>
        </div>
        {errors.password && (
          <span className="text-sm text-red-500">{errors.password.message}</span>
        )}
      </label>

      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{serverError}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-14 mt-4 bg-[#A5C330] hover:bg-[#94b126] text-[#181818] text-lg font-bold rounded-xl transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-[#A5C330]/20 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        <span>{isSubmitting ? 'Ingresando...' : 'Ingresar'}</span>
        {!isSubmitting && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        )}
      </button>

      <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <svg className="w-4 h-4 text-[#A5C330]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Sesión segura vía JWT</span>
        </div>
        <p className="text-xs text-slate-400">Auditoría de IP activada • v2.1.0</p>
      </div>
    </form>
  );
}
