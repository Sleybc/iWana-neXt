'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AUTH_FORM_INPUT_ERROR_CLASS,
  AUTH_FORM_INPUT_FOCUS_CLASS,
  Button,
  cn,
  FormStatus,
} from '@iwana/ui';
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
    token: z.string().trim().min(1, 'El enlace no es válido o ya venció. Pide uno nuevo.'),
    email: z.string().trim().email('Ingresa un correo válido.').optional().or(z.literal('')),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirma la nueva contraseña.'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

/** Valor de `origen` que el correo de invitación añade al enlace. */
export const RESET_PASSWORD_INVITATION_ORIGIN = 'invitacion';

export const INVALID_LINK_MESSAGE = 'El enlace no es válido o ya venció. Pide uno nuevo.';

const COPY = {
  invitation: {
    panelTitle: 'Activa tu acceso',
    panelSubtitle: 'Define tu contraseña y entra al portal de tu empresa.',
    title: 'Crea tu contraseña',
    description: 'Elige una contraseña para entrar al portal de tu empresa',
    submit: 'Crear contraseña',
    success: 'Tu contraseña quedó lista. Ya puedes entrar.',
  },
  reset: {
    panelTitle: 'Restablece tu contraseña',
    panelSubtitle: 'Define una nueva contraseña que cumpla la política de seguridad de tu empresa.',
    title: 'Nueva contraseña',
    description: 'Elige una contraseña nueva para volver a entrar al portal de tu empresa.',
    submit: 'Restablecer contraseña',
    success: 'Tu contraseña se actualizó. Ya puedes entrar.',
  },
} as const;

/**
 * La pantalla de inicio de sesión no lee la empresa de la URL (la toma de la configuración o
 * de la última empresa usada), así que el enlace de salida no la precarga.
 */
const LOGIN_HREF = '/auth/login';
const FORGOT_PASSWORD_HREF = '/auth/forgot-password';

const LABEL_CLASS = 'text-sm font-bold text-dark-surface';
const FIELD_ERROR_CLASS = 'text-sm text-red-600';
const INPUT_CLASS =
  'w-full h-14 px-4 bg-slate-50 border rounded-xl text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all';

type Outcome = 'form' | 'invalid-link' | 'success';

/**
 * Formulario para crear (invitación) o restablecer la contraseña desde el enlace del correo.
 * Empresa y código del enlace viajan ocultos cuando llegan en la URL; nunca se muestran.
 */
export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const linkTenant = searchParams.get('tenant')?.trim() ?? '';
  const linkToken = searchParams.get('token')?.trim() ?? '';
  const isInvitation = searchParams.get('origen') === RESET_PASSWORD_INVITATION_ORIGIN;
  const copy = isInvitation ? COPY.invitation : COPY.reset;
  const tenantFromLink = linkTenant !== '';

  const [outcome, setOutcome] = useState<Outcome>(linkToken ? 'form' : 'invalid-link');
  const [serverError, setServerError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    titleRef.current?.focus();
  }, [outcome]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      tenantSlug: linkTenant || process.env.NEXT_PUBLIC_TENANT_SLUG || '',
      token: linkToken,
      email: searchParams.get('email') ?? '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setServerError(null);
    try {
      await authApi.resetPassword(
        values.token,
        values.newPassword,
        values.email || undefined,
        values.tenantSlug,
      );
      setOutcome('success');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setOutcome('invalid-link');
        return;
      }
      setServerError('No pudimos guardar la contraseña. Intenta de nuevo en unos minutos.');
    }
  };

  return (
    <main className="relative min-h-screen w-full flex flex-col lg:flex-row overflow-hidden bg-dark-surface">
      <LoginBrandPanel title={copy.panelTitle} subtitle={copy.panelSubtitle} />

      <div className="w-full lg:w-1/2 bg-dark-surface flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#A5C330_1px,transparent_1px)] bg-[length:32px_32px]" />

        <div className="w-full max-w-[560px] bg-white rounded-2xl p-8 lg:p-12 shadow-2xl relative z-10">
          <div className="mb-8 space-y-2">
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="text-3xl font-bold text-dark-surface focus:outline-none"
            >
              {copy.title}
            </h1>
            {outcome === 'form' && <p className="text-slate-600">{copy.description}</p>}
          </div>

          {outcome === 'invalid-link' && (
            <div className="space-y-5">
              <FormStatus status="error" message={INVALID_LINK_MESSAGE} />
              <Button asChild className="w-full" size="lg">
                <Link href={FORGOT_PASSWORD_HREF}>Pedir un enlace nuevo</Link>
              </Button>
            </div>
          )}

          {outcome === 'success' && (
            <div className="space-y-5">
              <FormStatus status="success" message={copy.success} />
              <Button asChild className="w-full" size="lg">
                <Link href={LOGIN_HREF}>Iniciar sesión</Link>
              </Button>
            </div>
          )}

          {outcome === 'form' && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <input type="hidden" {...register('token')} />
              {tenantFromLink ? (
                <input type="hidden" {...register('tenantSlug')} />
              ) : (
                <label className="flex flex-col gap-2">
                  <span className={LABEL_CLASS}>Empresa</span>
                  <input
                    type="text"
                    placeholder="isp-demo"
                    autoComplete="organization"
                    aria-invalid={errors.tenantSlug ? true : undefined}
                    className={cn(
                      INPUT_CLASS,
                      errors.tenantSlug ? AUTH_FORM_INPUT_ERROR_CLASS : AUTH_FORM_INPUT_FOCUS_CLASS,
                    )}
                    {...register('tenantSlug')}
                  />
                  {errors.tenantSlug && (
                    <span className={FIELD_ERROR_CLASS}>{errors.tenantSlug.message}</span>
                  )}
                </label>
              )}

              <label className="flex flex-col gap-2">
                <span className={LABEL_CLASS}>Correo (opcional)</span>
                <input
                  type="email"
                  placeholder="usuario@empresa.co"
                  autoComplete="email"
                  aria-invalid={errors.email ? true : undefined}
                  className={cn(
                    INPUT_CLASS,
                    errors.email ? AUTH_FORM_INPUT_ERROR_CLASS : AUTH_FORM_INPUT_FOCUS_CLASS,
                  )}
                  {...register('email')}
                />
                {errors.email && <span className={FIELD_ERROR_CLASS}>{errors.email.message}</span>}
              </label>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className={LABEL_CLASS}>Nueva contraseña</span>
                  <input
                    type="password"
                    placeholder="Nueva contraseña"
                    autoComplete="new-password"
                    aria-invalid={errors.newPassword ? true : undefined}
                    className={cn(
                      INPUT_CLASS,
                      errors.newPassword
                        ? AUTH_FORM_INPUT_ERROR_CLASS
                        : AUTH_FORM_INPUT_FOCUS_CLASS,
                    )}
                    {...register('newPassword')}
                  />
                  {errors.newPassword && (
                    <span className={FIELD_ERROR_CLASS}>{errors.newPassword.message}</span>
                  )}
                </label>

                <label className="flex flex-col gap-2">
                  <span className={LABEL_CLASS}>Confirmar contraseña</span>
                  <input
                    type="password"
                    placeholder="Confirma la contraseña"
                    autoComplete="new-password"
                    aria-invalid={errors.confirmPassword ? true : undefined}
                    className={cn(
                      INPUT_CLASS,
                      errors.confirmPassword
                        ? AUTH_FORM_INPUT_ERROR_CLASS
                        : AUTH_FORM_INPUT_FOCUS_CLASS,
                    )}
                    {...register('confirmPassword')}
                  />
                  {errors.confirmPassword && (
                    <span className={FIELD_ERROR_CLASS}>{errors.confirmPassword.message}</span>
                  )}
                </label>
              </div>

              <FormStatus
                status={serverError ? 'error' : 'idle'}
                message={serverError ?? undefined}
              />

              <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
                {isSubmitting ? 'Guardando...' : copy.submit}
              </Button>
            </form>
          )}

          <div className="mt-6 border-t border-slate-100 pt-6 text-sm">
            <Link className="text-slate-600 hover:text-iwana-secondary-700" href={LOGIN_HREF}>
              Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
