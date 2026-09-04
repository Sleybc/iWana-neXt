'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, UserRound } from 'lucide-react';
import { Button, Card, CardContent, FormStatus, Input, SectionHeader, Select } from '@iwana/ui';
import { DocumentType, E164_PHONE_PATTERN, getCountryPhonePrefix } from '@iwana/shared';
import {
  userApi,
  type ChangeLoginEmailDto,
  type UpdateProfileDto,
  type UserProfile,
} from '@/lib/api-client';
import { getPortalDocumentTypeLabel } from '@/lib/user-labels';

const schema = z.object({
  firstName: z.string().max(100, 'Máximo 100 caracteres.').optional().or(z.literal('')),
  lastName: z.string().max(100, 'Máximo 100 caracteres.').optional().or(z.literal('')),
  phone: z
    .string()
    .regex(
      E164_PHONE_PATTERN,
      'El teléfono debe usar formato internacional, por ejemplo +573001234567.',
    )
    .max(20, 'Máximo 20 caracteres.')
    .optional()
    .or(z.literal('')),
  jobTitle: z.string().max(150, 'Máximo 150 caracteres.').optional().or(z.literal('')),
  documentType: z.nativeEnum(DocumentType).optional().or(z.literal('')),
  documentNumber: z.string().max(30, 'Máximo 30 caracteres.').optional().or(z.literal('')),
});

const emailSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  // Solo campo requerido: la contraseña actual se verifica contra el hash y
  // una credencial legada corta debe poder confirmar el cambio (P-14, Ola 2).
  currentPassword: z.string().min(1, 'Debes confirmar con tu contraseña actual').max(128),
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

  // Prefijo solo como ayuda de formato: si el usuario no tiene teléfono,
  // el campo arranca vacío (P-03).
  const phonePrefix = getCountryPhonePrefix(tenantCountry);

  const {
    register,
    control,
    handleSubmit,
    reset: resetPersonalForm,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      phone: profile.phone ?? '',
      jobTitle: profile.jobTitle ?? '',
      documentType: profile.documentType ?? '',
      documentNumber: profile.documentNumber ?? '',
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
      // Semántica de borrado (informe §3.3, P-06): undefined = no tocar,
      // null = borrar, '' nunca se envía. Se emite null cuando el campo
      // quedó vacío y antes tenía valor; se omite la clave cuando no cambió.
      const dto: UpdateProfileDto = {};
      const trackText = (
        key: 'firstName' | 'lastName' | 'phone' | 'jobTitle' | 'documentNumber',
        value: string,
        previous: string | null | undefined,
      ) => {
        if (value === '') {
          if (previous) {
            dto[key] = null;
          }
          return;
        }
        if (value !== previous) {
          dto[key] = value;
        }
      };
      trackText('firstName', values.firstName ?? '', profile.firstName);
      trackText('lastName', values.lastName ?? '', profile.lastName);
      trackText('phone', values.phone ?? '', profile.phone);
      trackText('jobTitle', values.jobTitle ?? '', profile.jobTitle);
      trackText('documentNumber', values.documentNumber ?? '', profile.documentNumber);
      if (values.documentType === '' || values.documentType === undefined) {
        if (profile.documentType) {
          dto.documentType = null;
        }
      } else if (values.documentType !== profile.documentType) {
        dto.documentType = values.documentType;
      }

      const updated = await userApi.updateMe(dto);
      onUpdated(updated);
      // Re-basa los valores con el objeto que devuelve el servidor (P-15).
      resetPersonalForm({
        firstName: updated.firstName ?? '',
        lastName: updated.lastName ?? '',
        phone: updated.phone ?? '',
        jobTitle: updated.jobTitle ?? '',
        documentType: updated.documentType ?? '',
        documentNumber: updated.documentNumber ?? '',
      });
      setSuccess(true);
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
      };

      const updated = await userApi.changeLoginEmail(userId, dto);
      onUpdated(updated);
      resetEmailForm({ email: updated.email, currentPassword: '' });
      setEmailSuccess(true);
    } catch {
      setEmailError('No fue posible actualizar el email de acceso. Verifica la contraseña actual.');
    }
  };

  const documentTypeOptions = Object.values(DocumentType).map((value) => ({
    value,
    label: getPortalDocumentTypeLabel(value),
  }));

  return (
    <Card>
      <CardContent className="p-6 md:p-7">
        <SectionHeader
          icon={UserRound}
          eyebrow="Identidad del usuario"
          title="Datos personales"
          headingLevel={2}
          description="Mantén actualizado el perfil que usa tu equipo para operar, contactar y auditar la cuenta."
          className="mb-6"
        />

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
              // Restricción nativa espejo del Zod: con noValidate no bloquea
              // el envío ni impone burbujas; solo expone validez sincrónica.
              pattern={E164_PHONE_PATTERN.source}
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
            <Controller
              name="documentType"
              control={control}
              render={({ field }) => (
                <Select
                  id="documentType"
                  label="Tipo de documento"
                  placeholder="Selecciona el tipo de documento"
                  options={documentTypeOptions}
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  name={field.name}
                  error={errors.documentType?.message ?? ''}
                />
              )}
            />
            <Input
              id="documentNumber"
              label="Número de documento"
              autoComplete="off"
              maxLength={30}
              error={errors.documentNumber?.message}
              {...register('documentNumber')}
            />
          </div>

          <FormStatus
            status={serverError ? 'error' : success ? 'success' : 'idle'}
            message={serverError ?? (success ? 'Perfil actualizado correctamente.' : undefined)}
            autoDismissMs={success ? 3000 : false}
            onDismiss={() => setSuccess(false)}
            id="personal-info-status"
          />

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !isDirty}>
              Guardar cambios
            </Button>
          </div>
        </form>

        <div className="mt-8 border-t border-gray-200 pt-6 dark:border-dark-border">
          <SectionHeader
            icon={Mail}
            title="Email de acceso"
            headingLevel={3}
            size="sm"
            tone="secondary"
            description="Este correo se usa para iniciar sesión. Si este usuario sigue siendo el administrador principal, el correo de contacto de la empresa también se sincroniza."
            className="mb-4"
          />

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

            <FormStatus
              status={emailError ? 'error' : emailSuccess ? 'success' : 'idle'}
              message={
                emailError ??
                (emailSuccess ? 'Email de acceso actualizado correctamente.' : undefined)
              }
              autoDismissMs={emailSuccess ? 3000 : false}
              onDismiss={() => setEmailSuccess(false)}
              id="login-email-status"
            />

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                loading={isSubmittingEmail}
                disabled={isSubmittingEmail || !isEmailDirty}
              >
                Actualizar email de acceso
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
