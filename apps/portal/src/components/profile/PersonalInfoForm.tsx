'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, CardContent, Input } from '@iwana/ui';
import {
  userApi,
  type ChangeLoginEmailDto,
  type UpdateProfileDto,
  type UserProfile,
} from '@/lib/api-client';

/** Mapa de código ISO 3166-1 alpha-2 → prefijo telefónico E.164 */
const COUNTRY_PHONE_PREFIX: Record<string, string> = {
  CO: '+57',
  US: '+1',
  MX: '+52',
  AR: '+54',
  CL: '+56',
  PE: '+51',
  EC: '+593',
  VE: '+58',
  BR: '+55',
  PA: '+507',
};

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

const emailSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  currentPassword: z.string().min(10, 'Debes confirmar con tu contraseña actual').max(128),
});

type FormValues = z.infer<typeof schema>;
type EmailFormValues = z.infer<typeof emailSchema>;

interface PersonalInfoFormProps {
  profile: UserProfile;
  userId: string;
  /** Código ISO 3166-1 alpha-2 del país del tenant (ej: "CO"). Determina el prefijo telefónico inicial. */
  tenantCountry?: string;
  onUpdated: (updated: UserProfile) => void;
}

/**
 * Edicion de datos personales del usuario autenticado.
 */
export function PersonalInfoForm({
  profile,
  userId,
  tenantCountry,
  onUpdated,
}: PersonalInfoFormProps) {
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Prefijo inicial: valor guardado del usuario → prefijo del país del tenant → '+57' por defecto (Colombia)
  const phonePrefix = COUNTRY_PHONE_PREFIX[tenantCountry ?? 'CO'] ?? '+57';
  const defaultPhone = profile.phone ?? phonePrefix;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      phone: defaultPhone,
      jobTitle: profile.jobTitle ?? '',
    },
  });

  const {
    register: registerEmail,
    handleSubmit: handleSubmitEmail,
    reset: resetEmailForm,
    formState: { errors: emailErrors, isSubmitting: isSubmittingEmail, isDirty: isEmailDirty },
  } = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      email: profile.email,
      currentPassword: '',
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

  const onSubmitEmail = async (values: EmailFormValues) => {
    setEmailError(null);
    setEmailSuccess(false);

    try {
      const dto: ChangeLoginEmailDto = {
        email: values.email,
        currentPassword: values.currentPassword,
        syncCompanyContactEmail: true,
      };

      const updated = await userApi.changeLoginEmail(userId, dto);
      onUpdated(updated);
      resetEmailForm({ email: updated.email, currentPassword: '' });
      setEmailSuccess(true);
      setTimeout(() => setEmailSuccess(false), 3000);
    } catch {
      setEmailError('No fue posible actualizar el email de acceso. Verifica la contraseña actual.');
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="mb-5 text-base font-semibold text-gray-900 dark:text-white">
          Datos personales
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
              placeholder={`${phonePrefix}3001234567`}
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

        <div className="mt-8 border-t border-gray-200 pt-6 dark:border-dark-border">
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
            Email de acceso
          </h3>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-300">
            Este correo se usa para iniciar sesión. Si este usuario sigue siendo el administrador
            principal, el correo de contacto de la empresa también se sincroniza.
          </p>

          <form onSubmit={handleSubmitEmail(onSubmitEmail)} noValidate className="space-y-4">
            <Input id="current-email" label="Email actual" value={profile.email} readOnly />
            <Input
              id="login-email"
              label="Nuevo email de acceso"
              type="email"
              autoComplete="email"
              error={emailErrors.email?.message}
              {...registerEmail('email')}
            />
            <Input
              id="current-password"
              label="Contraseña actual"
              type="password"
              autoComplete="current-password"
              error={emailErrors.currentPassword?.message}
              {...registerEmail('currentPassword')}
            />

            {emailError && (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {emailError}
              </p>
            )}

            {emailSuccess && (
              <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                Email de acceso actualizado correctamente.
              </p>
            )}

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isSubmittingEmail || !isEmailDirty}>
                {isSubmittingEmail ? 'Actualizando...' : 'Actualizar email de acceso'}
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
