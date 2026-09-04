'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent, FormStatus, Input, SectionHeader } from '@iwana/ui';
import { ApiError, authApi } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
    newPassword: z
      .string()
      .min(10, 'La nueva contraseña debe tener al menos 10 caracteres')
      .max(128, 'Máximo 128 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma la nueva contraseña'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

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
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
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
      // Un 400 de política muestra el mensaje del servidor (P-14).
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
