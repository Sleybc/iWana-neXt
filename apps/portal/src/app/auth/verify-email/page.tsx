'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, cn, FormStatus } from '@iwana/ui';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';
import { ApiError, authApi } from '@/lib/api-client';

const verifyEmailSchema = z.object({
  tenantSlug: z.string().trim().min(1, 'Ingresa el identificador de la empresa.'),
  token: z.string().trim().min(1, 'Ingresa el token de verificación.'),
});

const resendSchema = z.object({
  tenantSlug: z.string().trim().min(1, 'Ingresa el identificador de la empresa.'),
  email: z.string().trim().email('Ingresa un correo válido.'),
});

type VerifyEmailFormValues = z.infer<typeof verifyEmailSchema>;
type ResendVerificationFormValues = z.infer<typeof resendSchema>;

/**
 * Contenido interno del formulario de verificación de email.
 * Separado del export default para poder envolver con <Suspense> y satisfacer
 * el requisito de Next.js 15+: useSearchParams() solo se puede usar dentro de
 * un árbol con límite Suspense (evita bloqueo de prerenderizado estático).
 */
function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  const verifyForm = useForm<VerifyEmailFormValues>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: {
      tenantSlug: searchParams.get('tenant') ?? process.env.NEXT_PUBLIC_TENANT_SLUG ?? '',
      token: searchParams.get('token') ?? '',
    },
  });

  const resendForm = useForm<ResendVerificationFormValues>({
    resolver: zodResolver(resendSchema),
    defaultValues: {
      tenantSlug: searchParams.get('tenant') ?? process.env.NEXT_PUBLIC_TENANT_SLUG ?? '',
      email: searchParams.get('email') ?? '',
    },
  });

  const onVerify = async (values: VerifyEmailFormValues) => {
    setVerifyError(null);
    setVerifyMessage(null);

    try {
      const result = await authApi.verifyEmail(values.token, values.tenantSlug);
      setVerifyMessage(result.message);
    } catch (error) {
      setVerifyError(
        error instanceof ApiError
          ? error.message
          : 'No fue posible verificar el correo. Intenta nuevamente.',
      );
    }
  };

  const onResend = async (values: ResendVerificationFormValues) => {
    setResendError(null);
    setResendMessage(null);

    try {
      const result = await authApi.resendVerification(values.email, values.tenantSlug);
      setResendMessage(result.message);
    } catch (error) {
      setResendError(
        error instanceof ApiError
          ? error.message
          : 'No fue posible reenviar el correo de verificación.',
      );
    }
  };

  return (
    <main className="relative min-h-screen w-full flex flex-col lg:flex-row overflow-hidden bg-[#181818]">
      <LoginBrandPanel
        title="Verifica tu correo"
        subtitle="Confirma la identidad del usuario antes del primer acceso operativo al portal empresarial."
      />

      <div className="w-full lg:w-1/2 bg-[#181818] flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#A5C330_1px,transparent_1px)] bg-[length:32px_32px]" />

        <div className="w-full max-w-[560px] bg-white rounded-2xl p-8 lg:p-12 shadow-2xl relative z-10 space-y-8">
          <section className="space-y-5">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-[#181818]">Confirmar correo</h1>
              <p className="text-slate-500">
                Usa el token recibido en el mensaje de alta para activar la cuenta de la empresa.
              </p>
            </div>

            <form onSubmit={verifyForm.handleSubmit(onVerify)} className="space-y-4" noValidate>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-[#181818]">Empresa</span>
                <input
                  type="text"
                  placeholder="isp-demo"
                  className={cn(
                    'w-full h-14 px-4 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                    verifyForm.formState.errors.tenantSlug
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-200 focus:ring-[#A5C330]',
                  )}
                  {...verifyForm.register('tenantSlug')}
                />
                {verifyForm.formState.errors.tenantSlug && (
                  <span className="text-sm text-red-500">
                    {verifyForm.formState.errors.tenantSlug.message}
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-[#181818]">Token de verificación</span>
                <textarea
                  rows={3}
                  placeholder="Pega aquí el token"
                  className={cn(
                    'w-full rounded-xl px-4 py-3 bg-slate-50 border text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all resize-none',
                    verifyForm.formState.errors.token
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-200 focus:ring-[#A5C330]',
                  )}
                  {...verifyForm.register('token')}
                />
                {verifyForm.formState.errors.token && (
                  <span className="text-sm text-red-500">
                    {verifyForm.formState.errors.token.message}
                  </span>
                )}
              </label>

              <FormStatus
                status={verifyError ? 'error' : verifyMessage ? 'success' : 'idle'}
                message={verifyError ?? verifyMessage ?? undefined}
              />

              <Button
                type="submit"
                className="w-full"
                size="lg"
                loading={verifyForm.formState.isSubmitting}
              >
                {verifyForm.formState.isSubmitting ? 'Verificando...' : 'Verificar correo'}
              </Button>
            </form>
          </section>

          <section className="space-y-4 border-t border-slate-100 pt-8">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-[#181818]">Reenviar correo</h2>
              <p className="text-slate-500">
                Si el token expiró, solicita una nueva notificación sin revelar si el correo existe.
              </p>
            </div>

            <form onSubmit={resendForm.handleSubmit(onResend)} className="space-y-4" noValidate>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-bold text-[#181818]">Empresa</span>
                  <input
                    type="text"
                    placeholder="isp-demo"
                    className={cn(
                      'w-full h-14 px-4 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                      resendForm.formState.errors.tenantSlug
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-slate-200 focus:ring-[#A5C330]',
                    )}
                    {...resendForm.register('tenantSlug')}
                  />
                  {resendForm.formState.errors.tenantSlug && (
                    <span className="text-sm text-red-500">
                      {resendForm.formState.errors.tenantSlug.message}
                    </span>
                  )}
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-bold text-[#181818]">Correo electrónico</span>
                  <input
                    type="email"
                    placeholder="usuario@empresa.co"
                    className={cn(
                      'w-full h-14 px-4 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
                      resendForm.formState.errors.email
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-slate-200 focus:ring-[#A5C330]',
                    )}
                    {...resendForm.register('email')}
                  />
                  {resendForm.formState.errors.email && (
                    <span className="text-sm text-red-500">
                      {resendForm.formState.errors.email.message}
                    </span>
                  )}
                </label>
              </div>

              <FormStatus
                status={resendError ? 'error' : resendMessage ? 'success' : 'idle'}
                message={resendError ?? resendMessage ?? undefined}
              />

              <Button
                type="submit"
                variant="secondary"
                className="w-full"
                size="lg"
                loading={resendForm.formState.isSubmitting}
              >
                {resendForm.formState.isSubmitting ? 'Enviando...' : 'Reenviar verificación'}
              </Button>
            </form>
          </section>

          <div className="border-t border-slate-100 pt-6 text-sm">
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
 * Página pública para verificar email y reenviar verificación cuando el token vence.
 * Envuelve el contenido en <Suspense> para permitir el uso de useSearchParams()
 * sin bloquear el prerenderizado estático de Next.js.
 */
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
