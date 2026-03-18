'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, cn } from '@iwana/ui';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { ApiError, authApi } from '@/lib/api-client';

const forgotPasswordSchema = z.object({
  tenantSlug: z.string().trim().min(1, 'Ingresa el slug del tenant.'),
  email: z.string().trim().email('Ingresa un correo válido.'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

/**
 * Pantalla pública de recuperación de contraseña para usuarios tenant.
 * Requiere slug para que el backend resuelva el TenantContext correctamente.
 */
export default function ForgotPasswordPage() {
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      tenantSlug: process.env.NEXT_PUBLIC_TENANT_SLUG ?? '',
      email: '',
    },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setServerError(null);
    setServerMessage(null);

    try {
      await authApi.forgotPassword(values.email, values.tenantSlug);
    } catch {
      // Ignoramos errores intencionalmente para evitar user-enumeration
    } finally {
      // El mensaje se muestra siempre, simulando exito
      setServerMessage('Si la cuenta existe, recibirás un enlace de recuperación pronto.');
    }
  };

  return (
    <main className="relative min-h-screen w-full flex flex-col lg:flex-row overflow-hidden bg-[#181818]">
      <LoginBrandPanel
        title="Recupera tu acceso"
        subtitle="Solicita un enlace temporal para restablecer la contraseña del portal del tenant."
      />

      <div className="w-full lg:w-1/2 bg-[#181818] flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#A5C330_1px,transparent_1px)] bg-[length:32px_32px]" />

        <div className="w-full max-w-[520px] bg-white rounded-2xl p-8 lg:p-12 shadow-2xl relative z-10">
          <div className="mb-8 space-y-2">
            <h1 className="text-3xl font-bold text-[#181818]">Recuperar contraseña</h1>
            <p className="text-slate-500">
              Ingresa tu correo y el slug del tenant. Si la cuenta existe, recibirás el enlace de
              recuperación.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold text-[#181818]">Tenant</span>
              <input
                type="text"
                placeholder="isp-demo"
                autoComplete="organization"
                className={cn(
                  'w-full h-14 px-4 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                  errors.tenantSlug
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-200 focus:ring-[#A5C330]',
                )}
                {...register('tenantSlug')}
              />
              {errors.tenantSlug && (
                <span className="text-sm text-red-500">{errors.tenantSlug.message}</span>
              )}
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold text-[#181818]">Correo electrónico</span>
              <input
                type="email"
                placeholder="usuario@tenant.co"
                autoComplete="email"
                className={cn(
                  'w-full h-14 px-4 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                  errors.email
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-200 focus:ring-[#A5C330]',
                )}
                {...register('email')}
              />
              {errors.email && <span className="text-sm text-red-500">{errors.email.message}</span>}
            </label>

            {serverMessage && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {serverMessage}
              </div>
            )}

            {serverError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {serverError}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
              {isSubmitting ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-6 text-sm">
            <Link className="text-slate-500 hover:text-[#A5C330]" href="/auth/login">
              Volver al login
            </Link>
            <Link className="text-slate-500 hover:text-[#A5C330]" href="/auth/verify-email">
              Verificar correo
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
