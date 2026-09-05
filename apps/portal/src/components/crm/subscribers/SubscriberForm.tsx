'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, FormStatus } from '@iwana/ui';
import {
  CreateSubscriberSchema,
  type CreateSubscriberPayload,
  PersonType,
  type UpdateSubscriberPayload,
  UpdateSubscriberSchema,
} from '@iwana/shared';
import type { SubscriberRecord } from '@/lib/api-client';
import { JuridicaPersonFields } from './JuridicaPersonFields';
import { NaturalPersonFields } from './NaturalPersonFields';
import { PERSON_TYPE_OPTIONS } from './subscriber-ui';
import { SharedPersonFields } from './SharedPersonFields';
import { VatTreatmentBanner } from './VatTreatmentBanner';

export interface SubscriberFormValues {
  personType: PersonType;
  customerSegment: string;
  documentType: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
  stratum: string;
  birthDate: string;
  nit: string;
  nitVerificationDigit: string;
  businessName: string;
  commercialName: string;
  legalRepresentativeId: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  neighborhood: string;
  city: string;
  department: string;
  postalCode: string;
}

interface SubscriberFormProps {
  initialData?: SubscriberRecord | null;
  onSave: (payload: CreateSubscriberPayload | UpdateSubscriberPayload) => Promise<void>;
  onCancel?: () => void;
}

function buildDefaults(initialData?: SubscriberRecord | null): SubscriberFormValues {
  return {
    personType: initialData?.personType ?? PersonType.NATURAL,
    customerSegment: initialData?.customerSegment ?? '',
    documentType: initialData?.documentType ?? '',
    documentNumber: initialData?.documentNumber ?? '',
    firstName: initialData?.firstName ?? '',
    lastName: initialData?.lastName ?? '',
    stratum: initialData?.stratum ? String(initialData.stratum) : '',
    birthDate: initialData?.birthDate ?? '',
    nit: initialData?.nit ?? '',
    nitVerificationDigit: initialData?.nitVerificationDigit ?? '',
    businessName: initialData?.businessName ?? '',
    commercialName: initialData?.commercialName ?? '',
    legalRepresentativeId: initialData?.legalRepresentativeId ?? '',
    email: initialData?.email ?? '',
    phone: initialData?.phone ?? '',
    whatsapp: initialData?.whatsapp ?? '',
    address: initialData?.address ?? '',
    neighborhood: initialData?.neighborhood ?? '',
    city: initialData?.city ?? '',
    department: initialData?.department ?? '',
    postalCode: initialData?.postalCode ?? '',
  };
}

function stripEmptyValues<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, current]) => current !== '' && current !== null && current !== undefined,
    ),
  ) as Partial<T>;
}

export function SubscriberForm({ initialData, onSave, onCancel }: SubscriberFormProps) {
  const editing = Boolean(initialData);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SubscriberFormValues>({
    defaultValues: buildDefaults(initialData),
  });

  const personType = watch('personType');

  useEffect(() => {
    reset(buildDefaults(initialData));
    setSubmitError(null);
  }, [initialData, reset]);

  const onSubmit = async (values: SubscriberFormValues) => {
    clearErrors();
    setSubmitError(null);

    const common = {
      personType: values.personType,
      customerSegment: values.customerSegment,
      email: values.email.trim(),
      phone: values.phone.trim(),
      whatsapp: values.whatsapp.trim() || undefined,
      address: values.address.trim(),
      neighborhood: values.neighborhood.trim() || undefined,
      city: values.city.trim() || undefined,
      department: values.department.trim() || undefined,
      postalCode: values.postalCode.trim() || undefined,
    };

    const payload =
      values.personType === PersonType.JURIDICA
        ? stripEmptyValues({
            ...common,
            personType: PersonType.JURIDICA,
            nit: values.nit.trim(),
            nitVerificationDigit: values.nitVerificationDigit.trim() || undefined,
            businessName: values.businessName.trim(),
            commercialName: values.commercialName.trim() || undefined,
            legalRepresentativeId: values.legalRepresentativeId.trim() || undefined,
          })
        : stripEmptyValues({
            ...common,
            personType: PersonType.NATURAL,
            documentType: values.documentType || undefined,
            documentNumber: values.documentNumber.trim(),
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            stratum: values.stratum ? Number(values.stratum) : undefined,
            birthDate: values.birthDate.trim() || undefined,
          });

    const result = editing
      ? UpdateSubscriberSchema.safeParse(payload)
      : CreateSubscriberSchema.safeParse(payload);

    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const field = issue.path[0];
        if (typeof field === 'string') {
          setError(field as keyof SubscriberFormValues, { type: 'manual', message: issue.message });
        }
      });

      const firstFormIssue = result.error.issues.find((issue) => issue.path.length === 0);
      if (firstFormIssue) {
        setSubmitError(firstFormIssue.message);
      }
      return;
    }

    try {
      await onSave(result.data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        setSubmitError(error.issues[0]?.message ?? 'No fue posible validar el formulario.');
        return;
      }
      setSubmitError('No fue posible guardar el suscriptor.');
    }
  };

  return (
    <Card className="rounded-2xl border border-white/70 bg-white/95 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95">
      <CardHeader>
        <CardTitle>{editing ? 'Editar suscriptor' : 'Crear suscriptor'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <div className="grid gap-3 md:grid-cols-2">
            {PERSON_TYPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-[20px] border px-4 py-3 transition-colors ${
                  personType === option.value
                    ? 'border-iwana-secondary bg-iwana-secondary/10'
                    : 'border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3'
                }`}
              >
                <input
                  type="radio"
                  value={option.value}
                  className="sr-only"
                  {...register('personType')}
                />
                <span className="block text-sm font-semibold text-gray-900 dark:text-white">
                  {option.label}
                </span>
              </label>
            ))}
          </div>

          {personType === PersonType.JURIDICA ? (
            <JuridicaPersonFields register={register} errors={errors} />
          ) : (
            <NaturalPersonFields control={control} register={register} errors={errors} />
          )}

          <SharedPersonFields register={register} errors={errors} />

          <FormStatus status={submitError ? 'error' : 'idle'} message={submitError ?? undefined} />

          {initialData && (
            <VatTreatmentBanner
              vatTreatment={initialData.vatTreatment}
              taxRegime={initialData.taxRegime}
            />
          )}

          <div className="flex flex-wrap justify-end gap-3">
            {onCancel && (
              <Button type="button" variant="secondary" onClick={onCancel}>
                Cancelar
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear suscriptor'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
