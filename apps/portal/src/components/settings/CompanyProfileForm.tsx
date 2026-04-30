'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, CheckCircle2, CircleAlert } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@iwana/ui';
import { tenantSelfApi, type TenantSelf } from '@/lib/api-client';

const profileSchema = z.object({
  contactEmail: z.string().trim().email('Ingresa un correo válido.'),
  legalName: z.string().trim().max(300, 'Máximo 300 caracteres.').optional().or(z.literal('')),
  nit: z
    .string()
    .trim()
    .regex(/^[0-9]{6,15}$/, 'El NIT debe tener entre 6 y 15 dígitos.')
    .optional()
    .or(z.literal('')),
  nitDv: z
    .string()
    .trim()
    .regex(/^[0-9]{1}$/, 'El dígito de verificación debe ser un solo número.')
    .optional()
    .or(z.literal('')),
  city: z.string().trim().max(100, 'Máximo 100 caracteres.').optional().or(z.literal('')),
  department: z.string().trim().max(100, 'Máximo 100 caracteres.').optional().or(z.literal('')),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Usa un código ISO alpha-2, por ejemplo CO.')
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(20, 'Máximo 20 caracteres.').optional().or(z.literal('')),
  website: z
    .string()
    .trim()
    .url('Ingresa una URL válida con https://.')
    .optional()
    .or(z.literal('')),
});

type CompanyProfileFormValues = z.infer<typeof profileSchema>;

interface CompanyProfileFormProps {
  profile: TenantSelf;
  canEdit: boolean;
  onUpdated: (updated: TenantSelf) => void;
}

function nullable(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function CompanyProfileForm({ profile, canEdit, onUpdated }: CompanyProfileFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CompanyProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      contactEmail: profile.contactEmail,
      legalName: profile.legalName ?? '',
      nit: profile.nit ?? '',
      nitDv: profile.nitDv ?? '',
      city: profile.city ?? '',
      department: profile.department ?? '',
      countryCode: profile.countryCode ?? '',
      phone: profile.phone ?? '',
      website: profile.website ?? '',
    },
  });

  useEffect(() => {
    reset({
      contactEmail: profile.contactEmail,
      legalName: profile.legalName ?? '',
      nit: profile.nit ?? '',
      nitDv: profile.nitDv ?? '',
      city: profile.city ?? '',
      department: profile.department ?? '',
      countryCode: profile.countryCode ?? '',
      phone: profile.phone ?? '',
      website: profile.website ?? '',
    });
  }, [profile, reset]);

  const onSubmit = async (values: CompanyProfileFormValues) => {
    setServerError(null);
    setSuccess(null);

    try {
      const updated = await tenantSelfApi.updateMeProfile({
        contactEmail: values.contactEmail.trim(),
        legalName: nullable(values.legalName),
        nit: nullable(values.nit),
        nitDv: nullable(values.nitDv),
        city: nullable(values.city),
        department: nullable(values.department),
        countryCode: nullable(values.countryCode)?.toUpperCase() ?? null,
        phone: nullable(values.phone),
        website: nullable(values.website),
      });

      onUpdated(updated);
      setSuccess('Perfil empresarial actualizado correctamente.');
    } catch {
      setServerError('No fue posible guardar el perfil empresarial. Intenta de nuevo.');
    }
  };

  return (
    <Card className="rounded-[28px] border border-white/70 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Identidad legal
            </p>
            <CardTitle className="mt-1">Perfil empresarial</CardTitle>
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gestiona los datos legales y de contacto de la empresa autenticada.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 rounded-[24px] border border-gray-100 bg-[#f8faf5] p-4 dark:border-dark-border dark:bg-dark-surface-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Nombre comercial
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
              {profile.name}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Slug
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
              {profile.slug}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Estado
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
              {profile.status}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Creado
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
              {formatDate(profile.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-[24px] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(254,243,199,0.78))] px-4 py-4 text-sm text-amber-800 shadow-iwana-soft dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            El nombre comercial y el slug permanecen en solo lectura mientras el ownership de naming
            sigue reservado a plataforma.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Input
              id="contactEmail"
              label="Correo de contacto"
              autoComplete="email"
              disabled={!canEdit}
              error={errors.contactEmail?.message}
              {...register('contactEmail')}
            />
            <Input
              id="legalName"
              label="Razón social"
              disabled={!canEdit}
              error={errors.legalName?.message}
              {...register('legalName')}
            />
            <Input
              id="nit"
              label="NIT"
              disabled={!canEdit}
              error={errors.nit?.message}
              {...register('nit')}
            />
            <Input
              id="nitDv"
              label="Dígito de verificación"
              disabled={!canEdit}
              placeholder="7"
              error={errors.nitDv?.message}
              {...register('nitDv')}
            />
            <Input
              id="phone"
              label="Teléfono"
              disabled={!canEdit}
              placeholder="+573001234567"
              error={errors.phone?.message}
              {...register('phone')}
            />
            <Input
              id="city"
              label="Ciudad"
              disabled={!canEdit}
              error={errors.city?.message}
              {...register('city')}
            />
            <Input
              id="department"
              label="Departamento"
              disabled={!canEdit}
              error={errors.department?.message}
              {...register('department')}
            />
            <Input
              id="countryCode"
              label="País legal"
              disabled={!canEdit}
              placeholder="CO"
              error={errors.countryCode?.message}
              {...register('countryCode')}
            />
            <Input
              id="website"
              label="Sitio web"
              disabled={!canEdit}
              placeholder="https://empresa.co"
              error={errors.website?.message}
              {...register('website')}
            />
          </div>

          {serverError && (
            <div className="flex items-start gap-3 rounded-[24px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] px-4 py-3 text-sm text-red-700 shadow-iwana-soft dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>{serverError}</p>
            </div>
          )}
          {success && !serverError && (
            <div className="flex items-start gap-3 rounded-[24px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(209,250,229,0.82))] px-4 py-3 text-sm text-emerald-700 shadow-iwana-soft dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>{success}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {canEdit
                ? 'Solo se guardan campos tenant-managed del perfil empresarial.'
                : 'Tu rol tiene acceso solo lectura sobre esta sección.'}
            </p>
            {canEdit && (
              <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !isDirty}>
                Guardar perfil empresarial
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
