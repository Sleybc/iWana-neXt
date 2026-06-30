'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, Input } from '@iwana/ui';
import { tenantSelfApi, type TenantSelf } from '@/lib/api-client';
import { PortalAlert, PortalSectionHeader } from '@/components/shared/portal-ui';
import { ORGANIZATION_SETTINGS_COPY } from './mod00-settings-labels';

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

const SECTION_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400';

function nullable(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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
      setSuccess(ORGANIZATION_SETTINGS_COPY.companyProfileSaveSuccess);
    } catch {
      setServerError(ORGANIZATION_SETTINGS_COPY.companyProfileSaveError);
    }
  };

  return (
    <Card className="rounded-2xl border border-gray-200 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
      <CardHeader>
        <PortalSectionHeader
          className="gap-0"
          title={ORGANIZATION_SETTINGS_COPY.companyProfileTitle}
          description={ORGANIZATION_SETTINGS_COPY.companyProfileDescription}
        />
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
          <div className="space-y-6">
            <section className="space-y-4">
              <p className={SECTION_LABEL}>
                {ORGANIZATION_SETTINGS_COPY.companyProfileContactSection}
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
                <div className="xl:col-span-6">
                  <Input
                    id="contactEmail"
                    label="Correo de contacto"
                    autoComplete="email"
                    disabled={!canEdit}
                    error={errors.contactEmail?.message}
                    {...register('contactEmail')}
                  />
                </div>
                <div className="xl:col-span-6">
                  <Input
                    id="legalName"
                    label="Razón social"
                    disabled={!canEdit}
                    error={errors.legalName?.message}
                    {...register('legalName')}
                  />
                </div>
                <div className="xl:col-span-4">
                  <Input
                    id="phone"
                    label="Teléfono"
                    disabled={!canEdit}
                    placeholder="+573001234567"
                    error={errors.phone?.message}
                    {...register('phone')}
                  />
                </div>
                <div className="xl:col-span-8">
                  <Input
                    id="website"
                    label="Sitio web"
                    disabled={!canEdit}
                    placeholder="https://empresa.co"
                    error={errors.website?.message}
                    {...register('website')}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <p className={SECTION_LABEL}>
                {ORGANIZATION_SETTINGS_COPY.companyProfileIdentitySection}
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
                <div className="xl:col-span-4">
                  <Input
                    id="nit"
                    label="NIT"
                    disabled={!canEdit}
                    error={errors.nit?.message}
                    {...register('nit')}
                  />
                </div>
                <div className="xl:col-span-2">
                  <Input
                    id="nitDv"
                    label="DV"
                    disabled={!canEdit}
                    placeholder="7"
                    error={errors.nitDv?.message}
                    {...register('nitDv')}
                  />
                </div>
                <div className="xl:col-span-3">
                  <Input
                    id="countryCode"
                    label="País legal"
                    disabled={!canEdit}
                    placeholder="CO"
                    error={errors.countryCode?.message}
                    {...register('countryCode')}
                  />
                </div>
                <div className="xl:col-span-6">
                  <Input
                    id="city"
                    label="Ciudad"
                    disabled={!canEdit}
                    error={errors.city?.message}
                    {...register('city')}
                  />
                </div>
                <div className="xl:col-span-6">
                  <Input
                    id="department"
                    label="Departamento"
                    disabled={!canEdit}
                    error={errors.department?.message}
                    {...register('department')}
                  />
                </div>
              </div>
            </section>
          </div>

          {serverError && (
            <PortalAlert
              variant="error"
              title={ORGANIZATION_SETTINGS_COPY.companyProfileErrorTitle}
              description={serverError}
              icon={CircleAlert}
            />
          )}
          {success && !serverError && (
            <PortalAlert
              variant="success"
              title={ORGANIZATION_SETTINGS_COPY.companyProfileSuccessTitle}
              description={success}
              icon={CheckCircle2}
            />
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {canEdit
                ? ORGANIZATION_SETTINGS_COPY.companyProfileEditableHint
                : ORGANIZATION_SETTINGS_COPY.companyProfileReadOnlyHint}
            </p>
            {canEdit && (
              <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !isDirty}>
                {ORGANIZATION_SETTINGS_COPY.companyProfileSaveAction}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
