'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import {
  ApiError,
  platformUsersApi,
  type PlatformUserProfile,
  type UpdatePlatformUserPayload,
} from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';

export const profileSchema = z.object({
  firstName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().max(100).optional().or(z.literal('')),
  phone: z
    .string()
    .max(20)
    .regex(/^\+?[1-9]\d{1,14}$/, 'Formato E.164 inválido')
    .optional()
    .or(z.literal('')),
  timezone: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const TIMEZONES = ['America/Bogota', 'America/Lima', 'America/Mexico_City', 'UTC'];

export function ProfileForm() {
  const { refreshProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      timezone: 'America/Bogota',
      language: 'es-CO',
    },
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setIsLoading(true);
        const profile = await platformUsersApi.me();
        reset(mapProfileToForm(profile));
      } catch {
        setServerError('No fue posible cargar tu perfil.');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [reset]);

  const onSubmit = async (values: ProfileFormValues) => {
    setServerError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const payload: UpdatePlatformUserPayload = {};
      if (values.firstName !== undefined) payload.firstName = values.firstName;
      if (values.lastName !== undefined) payload.lastName = values.lastName;
      if (values.phone !== undefined) payload.phone = values.phone;
      if (values.timezone !== undefined) payload.timezone = values.timezone;
      if (values.language !== undefined) payload.language = values.language;
      const updated = await platformUsersApi.updateMe(payload);
      reset(mapProfileToForm(updated));
      await refreshProfile();
      setSuccessMessage('Perfil actualizado correctamente.');
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.message);
      } else {
        setServerError('No fue posible actualizar el perfil.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-300">Cargando perfil...</p>;
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-dark-border dark:bg-dark-surface-2">
      <h2 className="mb-6 text-lg font-semibold text-iwana-primary dark:text-white">
        Datos de perfil
      </h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {serverError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
        )}
        {successMessage && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {successMessage}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="profile-first-name"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Nombres
            </label>
            <input
              id="profile-first-name"
              type="text"
              maxLength={100}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
              {...register('firstName')}
            />
            {errors.firstName && (
              <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="profile-last-name"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Apellidos
            </label>
            <input
              id="profile-last-name"
              type="text"
              maxLength={100}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
              {...register('lastName')}
            />
            {errors.lastName && (
              <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="profile-phone"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Teléfono
          </label>
          <input
            id="profile-phone"
            type="text"
            placeholder="+573001112233"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
            {...register('phone')}
          />
          {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="profile-timezone"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Zona horaria
            </label>
            <select
              id="profile-timezone"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
              {...register('timezone')}
            >
              {TIMEZONES.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="profile-language"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Idioma
            </label>
            <select
              id="profile-language"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
              {...register('language')}
            >
              <option value="es-CO">es-CO</option>
              <option value="en-US">en-US</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end border-t border-gray-200 pt-6 dark:border-dark-border">
          <Button type="submit" loading={isSaving}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </div>
  );
}

function mapProfileToForm(profile: PlatformUserProfile): ProfileFormValues {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    phone: profile.phone ?? '',
    timezone: profile.timezone,
    language: profile.language,
  };
}
