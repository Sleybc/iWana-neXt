'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, cn } from '@iwana/ui';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { ApiError, authApi } from '@/lib/api-client';

const passwordSchema = z
  .string()
  .min(10, 'Mínimo 10 caracteres.')
  .regex(/[A-Z]/, 'Debe contener al menos una mayúscula.')
  .regex(/[a-z]/, 'Debe contener al menos una minúscula.')
  .regex(/[0-9]/, 'Debe contener al menos un número.')
  .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial.');

const resetPasswordSchema = z
  .object({
    tenantSlug: z.string().trim().min(1, 'Ingresa el identificador de la empresa.'),
    token: z.string().trim().min(1, 'Ingresa el token de recuperación.'),
    email: z.string().trim().email('Ingresa un correo válido.').optional().or(z.literal('')),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirma la nueva contraseña.'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

/**
 * Contenido interno del formulario de restablecimiento.
 * Separado del export default para poder envolver con <Suspense> y satisfacer
 * el requisito de Next.js 15+: useSearchParams() solo se puede usar dentro de
 * un árbol con límite Suspense (evita bloqueo de prerenderizado estático).
 */
function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      tenantSlug: searchParams.get('tenant') ?? process.env.NEXT_PUBLIC_TENANT_SLUG ?? '',
      token: searchParams.get('token') ?? '',
      email: searchParams.get('email') ?? '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setServerError(null);
    setServerMessage(null);

    try {
      const result = await authApi.resetPassword(
        values.token,
        values.newPassword,
        values.email || undefined,
        values.tenantSlug,
      );
      setServerMessage(result.message);
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.message
          : 'No fue posible restablecer la contraseña. Intenta nuevamente.',
      );
    }
  };

  return (
    <main className="relative min-h-screen w-full flex flex-col lg:flex-row overflow-hidden bg-[#181818]">
      <LoginBrandPanel
        title="Restablece tu contraseña"
        subtitle="Completa el token de recuperación y define una nueva clave alineada con la política de seguridad empresarial."
      />

      <div className="w-full lg:w-1/2 bg-[#181818] flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#A5C330_1px,transparent_1px)] bg-[length:32px_32px]" />

        <div className="w-full max-w-[560px] bg-white rounded-2xl p-8 lg:p-12 shadow-2xl relative z-10">
          <div className="mb-8 space-y-2">
            <h1 className="text-3xl font-bold text-[#181818]">Nueva contraseña</h1>
            <p className="text-slate-500">
              Este formulario consume el token emitido por el backend de la empresa y deja la sesión
              lista para volver a autenticarse.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-[#181818]">Empresa</span>
                <input
                  type="text"
                  placeholder="isp-demo"
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
                <span className="text-sm font-bold text-[#181818]">Correo opcional</span>
                <input
                  type="email"
                  placeholder="usuario@empresa.co"
                  className={cn(
                    'w-full h-14 px-4 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                    errors.email
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-200 focus:ring-[#A5C330]',
                  )}
                  {...register('email')}
                />
                {errors.email && (
                  <span className="text-sm text-red-500">{errors.email.message}</span>
                )}
              </label>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-bold text-[#181818]">Token</span>
              <textarea
                rows={3}
                placeholder="Pega aquí el token recibido"
                className={cn(
                  'w-full rounded-xl px-4 py-3 bg-slate-50 border text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all resize-none',
                  errors.token
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-200 focus:ring-[#A5C330]',
                )}
                {...register('token')}
              />
              {errors.token && <span className="text-sm text-red-500">{errors.token.message}</span>}
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-[#181818]">Nueva contraseña</span>
                <input
                  type="password"
                  placeholder="Nueva contraseña"
                  autoComplete="new-password"
                  className={cn(
                    'w-full h-14 px-4 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                    errors.newPassword
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-200 focus:ring-[#A5C330]',
                  )}
                  {...register('newPassword')}
                />
                {errors.newPassword && (
                  <span className="text-sm text-red-500">{errors.newPassword.message}</span>
                )}
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-[#181818]">Confirmar contraseña</span>
                <input
                  type="password"
                  placeholder="Confirma la contraseña"
                  autoComplete="new-password"
                  className={cn(
                    'w-full h-14 px-4 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                    errors.confirmPassword
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-200 focus:ring-[#A5C330]',
                  )}
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <span className="text-sm text-red-500">{errors.confirmPassword.message}</span>
                )}
              </label>
            </div>

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
              {isSubmitting ? 'Actualizando...' : 'Restablecer contraseña'}
            </Button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-6 text-sm">
            <Link className="text-slate-500 hover:text-[#A5C330]" href="/auth/login">
              Volver al login
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * Página pública de restablecimiento de contraseña tenant-aware.
 * Envuelve el contenido en <Suspense> para permitir el uso de useSearchParams()
 * sin bloquear el prerenderizado estático de Next.js.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
