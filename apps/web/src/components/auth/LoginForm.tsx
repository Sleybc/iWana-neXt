// apps/web/src/components/auth/LoginForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { loginSchema, type LoginFormValues } from '@iwana/shared';
import { Button, Input } from '@iwana/ui';
import { authApi, ApiError } from '@/lib/api-client';

/**
 * Formulario de login para el portal administrativo de plataforma.
 * Conecta con POST /api/v1/auth/platform/login
 * Valida con Zod + react-hook-form (ADR-025).
 */

const errorMessages: Record<number, string> = {
  401: 'Correo o contraseña incorrectos.',
  403: 'No tienes permisos para acceder a esta plataforma.',
  429: 'Demasiados intentos fallidos. Espera 1 minuto e intenta de nuevo.',
};

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

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
      await authApi.platformLogin(data.email, data.password);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(
          errorMessages[err.status] ?? 'Ocurrió un error inesperado. Intenta de nuevo.',
        );
      } else {
        setServerError('Error de conexión. Verifica tu red e intenta de nuevo.');
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-5"
      noValidate
      aria-label="Formulario de inicio de sesión"
    >
      <Input
        label="Correo electrónico"
        type="email"
        placeholder="admin@plataforma.com"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />

      <Input
        label="Contraseña"
        type="password"
        placeholder="••••••••"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />

      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          <svg
            className="h-4 w-4 mt-0.5 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <span>{serverError}</span>
        </div>
      )}

      <Button type="submit" size="lg" loading={isSubmitting} className="w-full mt-1">
        {isSubmitting ? 'Ingresando...' : 'Ingresar'}
      </Button>

      <div className="text-center">
        <a
          href="/auth/forgot-password"
          className="text-sm text-[#6A7A1C] hover:underline underline-offset-4 focus:outline-none focus:underline"
        >
          ¿Olvidaste tu contraseña?
        </a>
      </div>
    </form>
  );
}
