'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@iwana/ui';
import { Mail, Lock } from 'lucide-react';
import {
  ApiError,
  authApi,
  type ChangePlatformUserLoginEmailPayload,
  platformUsersApi,
  type PlatformUserProfile,
  type UpdatePlatformUserPayload,
} from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';

export const profileSchema = z.object({
  firstName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().max(100).optional().or(z.literal('')),
  phone: z.string().max(20, 'Máximo 20 caracteres').optional().or(z.literal('')),
  timezone: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
});

export const loginEmailSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  currentPassword: z.string().min(10, 'Debes confirmar con tu contraseña actual').max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(10, 'Debe tener al menos 10 caracteres').max(128),
    newPassword: z.string().min(10, 'Debe tener al menos 10 caracteres').max(128),
    confirmPassword: z.string().min(10, 'Debe tener al menos 10 caracteres').max(128),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type ProfileFormValues = z.infer<typeof profileSchema>;
type LoginEmailFormValues = z.infer<typeof loginEmailSchema>;
type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

const TIMEZONES = ['America/Bogota', 'America/Lima', 'America/Mexico_City', 'UTC'];

export function ProfileForm() {
  const { refreshProfile, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccessMessage, setEmailSuccessMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccessMessage, setPasswordSuccessMessage] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string>('');
  const [isEmailSectionExpanded, setIsEmailSectionExpanded] = useState(false);
  const [isPasswordSectionExpanded, setIsPasswordSectionExpanded] = useState(false);

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

  const {
    register: registerEmail,
    handleSubmit: handleSubmitEmail,
    reset: resetEmailForm,
    formState: { errors: emailErrors },
  } = useForm<LoginEmailFormValues>({
    resolver: zodResolver(loginEmailSchema),
    defaultValues: {
      email: '',
      currentPassword: '',
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    reset: resetPasswordForm,
    formState: { errors: passwordErrors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setIsLoading(true);
        const profile = await platformUsersApi.me();
        reset(mapProfileToForm(profile));
        setCurrentEmail(profile.email);
        resetEmailForm({ email: profile.email, currentPassword: '' });
      } catch {
        setServerError('No fue posible cargar tu perfil.');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [reset, resetEmailForm, setCurrentEmail]);

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

  const onSubmitLoginEmail = async (values: LoginEmailFormValues) => {
    setEmailError(null);
    setEmailSuccessMessage(null);
    setIsSavingEmail(true);

    try {
      const payload: ChangePlatformUserLoginEmailPayload = {
        email: values.email,
        currentPassword: values.currentPassword,
      };
      const updated = await platformUsersApi.changeLoginEmail(payload);
      resetEmailForm({ email: updated.email, currentPassword: '' });
      setCurrentEmail(updated.email);
      await refreshProfile();
      setEmailSuccessMessage('Email de acceso actualizado correctamente.');
      setIsEmailSectionExpanded(false);
    } catch (error) {
      if (error instanceof ApiError) {
        setEmailError(error.message);
      } else {
        setEmailError('No fue posible actualizar el email de acceso.');
      }
    } finally {
      setIsSavingEmail(false);
    }
  };

  const onSubmitPassword = async (values: ChangePasswordFormValues) => {
    setPasswordError(null);
    setPasswordSuccessMessage(null);
    setIsSavingPassword(true);

    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      setPasswordSuccessMessage('Contraseña actualizada. Debes iniciar sesión de nuevo.');
      setIsPasswordSectionExpanded(false);
      setTimeout(() => {
        logout();
      }, 2000);
    } catch (error) {
      if (error instanceof ApiError) {
        setPasswordError(error.message);
      } else {
        setPasswordError('No fue posible cambiar la contraseña.');
      }
    } finally {
      setIsSavingPassword(false);
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

      <div className="mt-8 border-t border-gray-200 pt-6 dark:border-dark-border">
        <h3 className="mb-6 text-lg font-semibold text-iwana-primary dark:text-white">
          Seguridad de la cuenta
        </h3>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-surface-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                  <Mail className="h-4 w-4" /> Email de acceso
                </h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{currentEmail}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsEmailSectionExpanded(!isEmailSectionExpanded);
                  setIsPasswordSectionExpanded(false);
                  setEmailError(null);
                  setEmailSuccessMessage(null);
                  resetEmailForm({ email: currentEmail, currentPassword: '' });
                }}
              >
                {isEmailSectionExpanded ? 'Cancelar' : 'Cambiar email'}
              </Button>
            </div>

            {isEmailSectionExpanded && (
              <form
                onSubmit={handleSubmitEmail(onSubmitLoginEmail)}
                className="mt-4 space-y-4 border-t border-gray-200 pt-4 dark:border-dark-border"
              >
                <div>
                  <label
                    htmlFor="profile-login-email"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    Nuevo email de acceso
                  </label>
                  <input
                    id="profile-login-email"
                    type="email"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
                    {...registerEmail('email')}
                  />
                  {emailErrors.email && (
                    <p className="mt-1 text-xs text-red-600">{emailErrors.email.message}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="profile-login-current-password"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    Contraseña actual
                  </label>
                  <input
                    id="profile-login-current-password"
                    type="password"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
                    {...registerEmail('currentPassword')}
                  />
                  {emailErrors.currentPassword && (
                    <p className="mt-1 text-xs text-red-600">
                      {emailErrors.currentPassword.message}
                    </p>
                  )}
                </div>

                {emailError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {emailError}
                  </p>
                )}
                {emailSuccessMessage && (
                  <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                    {emailSuccessMessage}
                  </p>
                )}

                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setIsEmailSectionExpanded(false);
                      setEmailError(null);
                      setEmailSuccessMessage(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" loading={isSavingEmail}>
                    Actualizar email
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-surface-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                  <Lock className="h-4 w-4" /> Cambiar contraseña
                </h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Requiere contraseña actual para confirmar
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsPasswordSectionExpanded(!isPasswordSectionExpanded);
                  setIsEmailSectionExpanded(false);
                  setPasswordError(null);
                  setPasswordSuccessMessage(null);
                  resetPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                }}
              >
                {isPasswordSectionExpanded ? 'Cancelar' : 'Cambiar contraseña'}
              </Button>
            </div>

            {isPasswordSectionExpanded && (
              <form
                onSubmit={handleSubmitPassword(onSubmitPassword)}
                className="mt-4 space-y-4 border-t border-gray-200 pt-4 dark:border-dark-border"
              >
                <div>
                  <label
                    htmlFor="profile-password-current"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    Contraseña actual
                  </label>
                  <input
                    id="profile-password-current"
                    type="password"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
                    {...registerPassword('currentPassword')}
                  />
                  {passwordErrors.currentPassword && (
                    <p className="mt-1 text-xs text-red-600">
                      {passwordErrors.currentPassword.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="profile-password-new"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    Nueva contraseña
                  </label>
                  <input
                    id="profile-password-new"
                    type="password"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
                    {...registerPassword('newPassword')}
                  />
                  {passwordErrors.newPassword && (
                    <p className="mt-1 text-xs text-red-600">
                      {passwordErrors.newPassword.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="profile-password-confirm"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    Confirmar nueva contraseña
                  </label>
                  <input
                    id="profile-password-confirm"
                    type="password"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-dark-border-2 dark:bg-dark-surface-2"
                    {...registerPassword('confirmPassword')}
                  />
                  {passwordErrors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-600">
                      {passwordErrors.confirmPassword.message}
                    </p>
                  )}
                </div>

                {passwordError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {passwordError}
                  </p>
                )}
                {passwordSuccessMessage && (
                  <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                    {passwordSuccessMessage}
                  </p>
                )}

                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setIsPasswordSectionExpanded(false);
                      setPasswordError(null);
                      setPasswordSuccessMessage(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" loading={isSavingPassword}>
                    Cambiar contraseña
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
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
