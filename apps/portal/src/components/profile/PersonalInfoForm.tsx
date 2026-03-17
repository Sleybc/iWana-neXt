'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, CardContent, Input } from '@iwana/ui';
import { userApi, type UpdateProfileDto, type UserProfile } from '@/lib/api-client';

const schema = z.object({
  firstName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().max(100).optional().or(z.literal('')),
  phone: z
    .string()
    .regex(/^\+\d{7,15}$/, 'Formato E.164 requerido (ej: +573001234567)')
    .optional()
    .or(z.literal('')),
  jobTitle: z.string().max(150).optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

interface PersonalInfoFormProps {
  profile: UserProfile;
  userId: string;
  /** Email del JWT para mostrarlo como campo de solo lectura */
  email: string;
  onUpdated: (updated: UserProfile) => void;
}

/**
 * Edicion de datos personales del usuario autenticado.
 */
export function PersonalInfoForm({ profile, userId, email, onUpdated }: PersonalInfoFormProps) {
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      phone: profile.phone ?? '',
      jobTitle: profile.jobTitle ?? '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setSuccess(false);

    try {
      // Evita enviar strings vacios y preserva semantica de campos opcionales.
      const dto: UpdateProfileDto = {};
      if (values.firstName) dto.firstName = values.firstName;
      if (values.lastName) dto.lastName = values.lastName;
      if (values.phone) dto.phone = values.phone;
      if (values.jobTitle) dto.jobTitle = values.jobTitle;

      const updated = await userApi.updateMe(userId, dto);
      onUpdated(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setServerError('No fue posible guardar los cambios. Intenta de nuevo.');
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="mb-5 text-base font-semibold text-gray-900 dark:text-white">
          Datos personales
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* Email — solo lectura; cambio de email requiere flujo de verificación */}
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Correo electrónico
              <span className="ml-2 text-xs font-normal text-gray-400">(no editable)</span>
            </label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-dark-border-2 dark:bg-dark-surface-4 dark:text-gray-400 select-all">
              {email}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="firstName"
              label="Nombre"
              autoComplete="given-name"
              error={errors.firstName?.message}
              {...register('firstName')}
            />
            <Input
              id="lastName"
              label="Apellido"
              autoComplete="family-name"
              error={errors.lastName?.message}
              {...register('lastName')}
            />
            <Input
              id="phone"
              label="Teléfono (E.164)"
              type="tel"
              autoComplete="tel"
              placeholder="+573001234567"
              error={errors.phone?.message}
              {...register('phone')}
            />
            <Input
              id="jobTitle"
              label="Cargo"
              autoComplete="organization-title"
              error={errors.jobTitle?.message}
              {...register('jobTitle')}
            />
          </div>

          {serverError && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {serverError}
            </p>
          )}

          {success && (
            <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
              Perfil actualizado correctamente.
            </p>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
