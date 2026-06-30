'use client';

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Lock,
  Mail,
  UserRound,
} from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Input, Select } from '@iwana/ui';
import {
  ApiError,
  type ChangePlatformUserLoginEmailPayload,
  platformUsersApi,
  type PlatformUserProfile,
  type UpdatePlatformUserPayload,
} from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  FORM_ALERT_ERROR_CLASS,
  FORM_ALERT_SUCCESS_CLASS,
  FORM_HELP_CLASS,
  FORM_MICROCOPY_CLASS,
  FORM_SECTION_CARD_CLASS,
} from '@/lib/form-styles';

export const profileSchema = z.object({
  firstName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().max(100).optional().or(z.literal('')),
  phone: z.string().max(20, 'Máximo 20 caracteres').optional().or(z.literal('')),
  timezone: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
});

export const loginEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Ingresa el nuevo correo de acceso.')
    .email('Ingresa un correo de acceso válido.')
    .max(255, 'El correo de acceso no puede superar los 255 caracteres.'),
  currentPassword: z
    .string()
    .min(1, 'Ingresa tu contraseña actual para confirmar el cambio.')
    .max(128, 'La contraseña actual no puede superar los 128 caracteres.'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Ingresa tu contraseña actual para confirmar el cambio.')
      .max(128, 'La contraseña actual no puede superar los 128 caracteres.'),
    newPassword: z
      .string()
      .min(10, 'La nueva contraseña debe tener al menos 10 caracteres.')
      .max(128, 'La nueva contraseña no puede superar los 128 caracteres.'),
    confirmPassword: z
      .string()
      .min(1, 'Confirma la nueva contraseña.')
      .max(128, 'La confirmación no puede superar los 128 caracteres.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

type ProfileFormValues = z.infer<typeof profileSchema>;
type LoginEmailFormValues = z.infer<typeof loginEmailSchema>;
type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

const TIMEZONES = ['America/Bogota', 'America/Lima', 'America/Mexico_City', 'UTC'];

const TIMEZONE_OPTIONS = TIMEZONES.map((timezone) => ({ value: timezone, label: timezone }));

const LANGUAGE_OPTIONS = [
  { value: 'es-CO', label: 'es-CO' },
  { value: 'en-US', label: 'en-US' },
];

const accountSectionClass =
  'rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-dark-border dark:bg-dark-surface-3/60';

const profilePanelClass =
  'rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2 dark:shadow-none';

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
    control,
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
      setEmailSuccessMessage('Correo de acceso actualizado correctamente.');
      setIsEmailSectionExpanded(false);
    } catch (error) {
      if (error instanceof ApiError) {
        setEmailError(error.message);
      } else {
        setEmailError('No fue posible actualizar el correo de acceso.');
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
      await platformUsersApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
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
    return (
      <div className={FORM_SECTION_CARD_CLASS}>
        <p className="text-sm text-gray-500 dark:text-gray-300">Cargando perfil...</p>
      </div>
    );
  }

  return (
    <div className={profilePanelClass}>
      <div className="mb-6 flex items-start gap-3">
        <div className="rounded-2xl bg-white p-2 text-iwana-primary shadow-sm dark:bg-dark-surface-2 dark:text-white">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-iwana-primary dark:text-white">
            Datos de perfil
          </h2>
          <p className={`mt-1 ${FORM_HELP_CLASS}`}>
            Actualiza tu información operativa y los datos base del usuario de plataforma sin
            cambiar el correo de acceso ni la contraseña desde este primer bloque.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {serverError && (
          <div role="alert" className={FORM_ALERT_ERROR_CLASS}>
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{serverError}</p>
          </div>
        )}
        {successMessage && (
          <div className={FORM_ALERT_SUCCESS_CLASS}>
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{successMessage}</p>
          </div>
        )}

        <div className="max-w-4xl space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              id="profile-first-name"
              label="Nombres"
              maxLength={100}
              error={errors.firstName?.message}
              {...register('firstName')}
            />

            <Input
              id="profile-last-name"
              label="Apellidos"
              maxLength={100}
              error={errors.lastName?.message}
              {...register('lastName')}
            />
          </div>

          <Input
            id="profile-phone"
            type="text"
            label="Teléfono"
            placeholder="+573001112233"
            containerClassName="max-w-xl"
            error={errors.phone?.message}
            {...register('phone')}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <Controller
              control={control}
              name="timezone"
              render={({ field, fieldState }) => (
                <Select
                  id="profile-timezone"
                  label="Zona horaria"
                  options={TIMEZONE_OPTIONS}
                  value={field.value ?? ''}
                  name={field.name}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  {...(fieldState.error ? { error: fieldState.error.message } : {})}
                />
              )}
            />

            <Controller
              control={control}
              name="language"
              render={({ field, fieldState }) => (
                <Select
                  id="profile-language"
                  label="Idioma"
                  options={LANGUAGE_OPTIONS}
                  value={field.value ?? ''}
                  name={field.name}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  {...(fieldState.error ? { error: fieldState.error.message } : {})}
                />
              )}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={isSaving}>
            Guardar cambios
          </Button>
        </div>
      </form>

      <div className="mt-8 border-t border-gray-100 pt-6 dark:border-dark-border">
        <h3 className="mb-2 text-lg font-semibold text-iwana-primary dark:text-white">
          Seguridad de la cuenta
        </h3>
        <p className={`mb-6 ${FORM_HELP_CLASS}`}>
          Separa el mantenimiento del perfil operativo de los cambios sensibles de acceso para
          reducir errores y hacer más clara cada acción administrativa.
        </p>

        <div className="space-y-6">
          <div className={accountSectionClass}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                  <Mail className="h-4 w-4" aria-hidden="true" /> Email de acceso
                </h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{currentEmail}</p>
              </div>
              <Button
                type="button"
                size="lg"
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
                className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-dark-border"
              >
                <div className="max-w-2xl space-y-4">
                  <Input
                    id="profile-login-email"
                    type="email"
                    label="Nuevo email de acceso"
                    error={emailErrors.email?.message}
                    {...registerEmail('email')}
                  />

                  <Input
                    id="profile-login-current-password"
                    type="password"
                    label="Contraseña actual"
                    error={emailErrors.currentPassword?.message}
                    {...registerEmail('currentPassword')}
                  />

                  {emailError && (
                    <div role="alert" className={FORM_ALERT_ERROR_CLASS}>
                      <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                      <p>{emailError}</p>
                    </div>
                  )}
                  {emailSuccessMessage && (
                    <div className={FORM_ALERT_SUCCESS_CLASS}>
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                      <p>{emailSuccessMessage}</p>
                    </div>
                  )}
                </div>

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
                  <Button type="submit" size="lg" loading={isSavingEmail}>
                    Actualizar correo de acceso
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className={accountSectionClass}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                  <Lock className="h-4 w-4" aria-hidden="true" /> Cambiar contraseña
                </h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Requiere contraseña actual para confirmar
                </p>
              </div>
              <Button
                type="button"
                size="lg"
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
                className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-dark-border"
              >
                <div className="max-w-2xl space-y-4">
                  <Input
                    id="profile-password-current"
                    type="password"
                    label="Contraseña actual"
                    error={passwordErrors.currentPassword?.message}
                    {...registerPassword('currentPassword')}
                  />

                  <Input
                    id="profile-password-new"
                    type="password"
                    label="Nueva contraseña"
                    error={passwordErrors.newPassword?.message}
                    {...registerPassword('newPassword')}
                  />

                  <Input
                    id="profile-password-confirm"
                    type="password"
                    label="Confirmar nueva contraseña"
                    error={passwordErrors.confirmPassword?.message}
                    {...registerPassword('confirmPassword')}
                  />

                  <p className={FORM_MICROCOPY_CLASS}>
                    Tras un cambio exitoso de contraseña, la sesión se cerrará automáticamente para
                    forzar reautenticación segura.
                  </p>

                  {passwordError && (
                    <div role="alert" className={FORM_ALERT_ERROR_CLASS}>
                      <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                      <p>{passwordError}</p>
                    </div>
                  )}
                  {passwordSuccessMessage && (
                    <div className={FORM_ALERT_SUCCESS_CLASS}>
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                      <p>{passwordSuccessMessage}</p>
                    </div>
                  )}
                </div>

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
                  <Button type="submit" size="lg" loading={isSavingPassword}>
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
