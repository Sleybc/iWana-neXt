'use client';

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Lock,
  Mail,
  Shield,
} from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Avatar, Button, Input, Select } from '@iwana/ui';
import {
  ApiError,
  type ChangePlatformUserLoginEmailPayload,
  platformUsersApi,
  type PlatformUserProfile,
  type UpdatePlatformUserPayload,
} from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';
import { PlatformProfileMfa } from './PlatformProfileMfa';
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

const profilePanelClass =
  'min-w-0 rounded-2xl border border-gray-200 bg-white shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2 dark:shadow-none';

export function ProfileForm() {
  const { user, refreshProfile, logout } = useAuth();
  const nameId = useId();
  const displayName = user?.displayName ?? 'Usuario';
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
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
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
        setMfaEnabled(profile.mfaEnabled);
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
      resetPasswordForm();
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

  useEffect(() => {
    if (!isLoading && window.location.hash === '#profile-security-heading') {
      document.getElementById('profile-security-heading')?.focus();
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className={FORM_SECTION_CARD_CLASS}>
        <p className="text-sm text-gray-500 dark:text-gray-300">Cargando perfil...</p>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section aria-labelledby="profile-details-heading" className={profilePanelClass}>
        <header className="border-b border-gray-200 p-4 sm:px-6 dark:border-dark-border">
          <h2
            id="profile-details-heading"
            className="text-lg font-semibold text-iwana-primary dark:text-white"
          >
            Datos de perfil
          </h2>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-4 sm:p-6">
          <div className="flex items-center gap-3 rounded-xl bg-iwana-surface-soft p-3 dark:bg-dark-surface-3">
            <div className="shrink-0">
              <Avatar size="md" name={displayName} labelledById={nameId} />
            </div>
            <div className="min-w-0">
              <p id={nameId} className="font-semibold break-words text-gray-900 dark:text-white">
                {displayName}
              </p>
              {user?.subtitle && <p className={FORM_HELP_CLASS}>{user.subtitle}</p>}
            </div>
          </div>
          {serverError && (
            <div role="alert" className={FORM_ALERT_ERROR_CLASS}>
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>{serverError}</p>
            </div>
          )}
          {successMessage && (
            <div role="status" className={FORM_ALERT_SUCCESS_CLASS}>
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>{successMessage}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
              type="tel"
              label="Teléfono"
              autoComplete="tel"
              error={errors.phone?.message}
              {...register('phone')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
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

          <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-dark-border">
            <Button type="submit" loading={isSaving} className="min-h-11 w-full sm:w-auto">
              Guardar cambios
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="profile-security-heading" className={profilePanelClass}>
        <header className="flex items-center gap-2 border-b border-gray-200 p-4 text-iwana-primary sm:px-6 dark:border-dark-border dark:text-white">
          <Shield aria-hidden="true" className="size-5 shrink-0" />
          <h2
            id="profile-security-heading"
            tabIndex={-1}
            className="scroll-mt-24 text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Seguridad de la cuenta
          </h2>
        </header>

        <div className="divide-y divide-gray-200 px-4 sm:px-6 dark:divide-dark-border">
          {mfaEnabled !== null && (
            <div className="py-4">
              <PlatformProfileMfa enabled={mfaEnabled} onEnabled={() => setMfaEnabled(true)} />
            </div>
          )}
          <div className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                  <Mail className="h-4 w-4 shrink-0" aria-hidden="true" /> Correo de acceso
                </h3>
                <p className={`mt-1 break-all ${FORM_HELP_CLASS}`}>{currentEmail}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                aria-expanded={isEmailSectionExpanded}
                aria-controls={isEmailSectionExpanded ? 'profile-email-form' : undefined}
                onClick={() => {
                  setIsEmailSectionExpanded(!isEmailSectionExpanded);
                  setIsPasswordSectionExpanded(false);
                  setEmailError(null);
                  setEmailSuccessMessage(null);
                  resetEmailForm({ email: currentEmail, currentPassword: '' });
                }}
              >
                {isEmailSectionExpanded ? 'Cerrar' : 'Cambiar correo'}
              </Button>
            </div>

            <div role="status">
              {emailSuccessMessage && (
                <div className={`mt-4 ${FORM_ALERT_SUCCESS_CLASS}`}>
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <p>{emailSuccessMessage}</p>
                </div>
              )}
            </div>

            {isEmailSectionExpanded && (
              <form
                id="profile-email-form"
                onSubmit={handleSubmitEmail(onSubmitLoginEmail)}
                className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-dark-border"
              >
                <div className="max-w-2xl space-y-4">
                  <Input
                    id="profile-login-email"
                    type="email"
                    label="Nuevo correo de acceso"
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
                </div>

                <div className="flex flex-wrap justify-end gap-2">
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
                  <Button
                    type="submit"
                    loading={isSavingEmail}
                    className="h-auto min-h-11 max-w-full whitespace-normal"
                  >
                    Actualizar correo de acceso
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                  <Lock className="h-4 w-4 shrink-0" aria-hidden="true" /> Contraseña
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Confirma el cambio con tu contraseña actual.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                aria-expanded={isPasswordSectionExpanded}
                aria-controls={isPasswordSectionExpanded ? 'profile-password-form' : undefined}
                onClick={() => {
                  setIsPasswordSectionExpanded(!isPasswordSectionExpanded);
                  setIsEmailSectionExpanded(false);
                  setPasswordError(null);
                  setPasswordSuccessMessage(null);
                  resetPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                }}
              >
                {isPasswordSectionExpanded ? 'Cerrar' : 'Cambiar contraseña'}
              </Button>
            </div>

            <div role="status">
              {passwordSuccessMessage && (
                <div className={`mt-4 ${FORM_ALERT_SUCCESS_CLASS}`}>
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <p>{passwordSuccessMessage}</p>
                </div>
              )}
            </div>

            {isPasswordSectionExpanded && (
              <form
                id="profile-password-form"
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
                    Al cambiar tu contraseña, tendrás que iniciar sesión de nuevo.
                  </p>

                  {passwordError && (
                    <div role="alert" className={FORM_ALERT_ERROR_CLASS}>
                      <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                      <p>{passwordError}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap justify-end gap-2">
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
                  <Button type="submit" loading={isSavingPassword} className="min-h-11">
                    Cambiar contraseña
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>
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
