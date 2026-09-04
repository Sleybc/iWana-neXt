'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent, FormStatus, Input, SectionHeader } from '@iwana/ui';
import { changePasswordSchema, type ChangePasswordFormValues } from '@iwana/shared';
import { ApiError, authApi } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Extrae el detalle de validación de un 400: Nest devuelve `message` como
 * arreglo y el mensaje plano del ApiError cae al genérico en ese caso.
 */
function readValidationDetail(error: ApiError): string | null {
  if (typeof error.details !== 'object' || error.details === null) {
    return null;
  }
  const message = (error.details as Record<string, unknown>)['message'];
  if (Array.isArray(message)) {
    const parts = message.filter((part): part is string => typeof part === 'string');
    return parts.length > 0 ? parts.join(' ') : null;
  }
  return typeof message === 'string' && message.length > 0 ? message : null;
}

/**
 * Cambio de contraseña para la sesion autenticada del portal.
 */
export function ChangePasswordForm() {
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { logout } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = async (values: ChangePasswordFormValues) => {
    setServerError(null);
    setSuccess(false);

    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      setSuccess(true);
      reset();
      // C-3: tras el cambio voluntario la sesión se cierra; el token
      // anterior no sigue vivo aunque el servidor lo revoque.
      await logout();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setServerError('La contraseña actual es incorrecta.');
        return;
      }
      // Un 400 de política muestra el detalle de validación (P-14).
      if (error instanceof ApiError && error.status === 400) {
        setServerError(readValidationDetail(error) ?? error.message);
        return;
      }
      if (error instanceof ApiError && error.status === 409) {
        setServerError('La solicitud entra en conflicto con el estado actual de la cuenta.');
        return;
      }
      if (error instanceof ApiError) {
        setServerError(error.message);
        return;
      }

      setServerError('No fue posible cambiar la contraseña. Intenta de nuevo.');
    }
  };

  return (
    <Card>
      <CardContent className="p-6 md:p-7">
        <SectionHeader
          icon={ShieldCheck}
          eyebrow="Seguridad de acceso"
          title="Cambiar contraseña"
          headingLevel={2}
          description="Refuerza la cuenta con una clave robusta y diferente a la usada en otros servicios."
          className="mb-6"
        />

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Input
            id="currentPassword"
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />

          <Input
            id="newPassword"
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />

          <Input
            id="confirmPassword"
            label="Confirmar nueva contraseña"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <FormStatus
            status={serverError ? 'error' : success ? 'success' : 'idle'}
            message={serverError ?? (success ? 'Contraseña actualizada correctamente.' : undefined)}
            autoDismissMs={success ? 3000 : false}
            onDismiss={() => setSuccess(false)}
            id="change-password-status"
          />

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
              Actualizar contraseña
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
