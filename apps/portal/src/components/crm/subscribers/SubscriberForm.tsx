'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, FormStatus, Select } from '@iwana/ui';
import {
  ConsentChannel,
  CreateSubscriberSchema,
  type CreateSubscriberPayload,
  PersonType,
  type UpdateSubscriberPayload,
  UpdateSubscriberSchema,
} from '@iwana/shared';
import type { SubscriberRecord } from '@/lib/api-client';
import { privacyApi } from '@/lib/api-client';
import type { DataPurpose, LegalText } from '@iwana/shared';
import Link from 'next/link';
import { JuridicaPersonFields } from './JuridicaPersonFields';
import { NaturalPersonFields } from './NaturalPersonFields';
import { PERSON_TYPE_OPTIONS } from './subscriber-ui';
import { SharedPersonFields } from './SharedPersonFields';
import { VatTreatmentBanner } from './VatTreatmentBanner';

const CONSENT_CHANNEL_OPTIONS = [
  { value: ConsentChannel.TELEFONO, label: 'Teléfono' },
  { value: ConsentChannel.PRESENCIAL, label: 'Presencial' },
  { value: ConsentChannel.EMAIL, label: 'Correo electrónico' },
  { value: ConsentChannel.MENSAJE_TEXTO, label: 'Mensaje de texto' },
  { value: ConsentChannel.MENSAJERIA_INSTANTANEA, label: 'Mensajería instantánea' },
];

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
  const [authorizationText, setAuthorizationText] = useState<LegalText | null>(null);
  const [authorizationTextLoading, setAuthorizationTextLoading] = useState(!initialData);
  const [authorizationChannel, setAuthorizationChannel] = useState<ConsentChannel | ''>('');
  const [authorizationChannelError, setAuthorizationChannelError] = useState<string | null>(null);
  const [authorizationChoices, setAuthorizationChoices] = useState<Record<DataPurpose, boolean>>({
    TRATAMIENTO_CONTRACTUAL: false,
    CONTACTO_COMERCIAL: false,
    REPORTE_CENTRALES_RIESGO: false,
    DATOS_BIOMETRICOS: false,
  });
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

  useEffect(() => {
    if (initialData) return;
    let active = true;
    void privacyApi
      .getCurrentLegalText('AUTORIZACION')
      .then((text) => {
        if (active) setAuthorizationText(text);
      })
      .catch(() => {
        if (active) setAuthorizationText(null);
      })
      .finally(() => {
        if (active) setAuthorizationTextLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialData]);

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

    const basePayload =
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

    if (!editing && !authorizationChoices.TRATAMIENTO_CONTRACTUAL) {
      setSubmitError(
        'La autorización para prestar y soportar el servicio es necesaria para crear el suscriptor.',
      );
      return;
    }
    if (!editing && !authorizationText) {
      setSubmitError('Publica un texto de autorización vigente antes de crear un suscriptor.');
      return;
    }
    if (!editing && !authorizationChannel) {
      setAuthorizationChannelError('Selecciona cómo otorgó la persona su autorización.');
      return;
    }
    setAuthorizationChannelError(null);

    const authorizations = (
      ['TRATAMIENTO_CONTRACTUAL', 'CONTACTO_COMERCIAL', 'DATOS_BIOMETRICOS'] as const
    )
      .filter((purpose) => authorizationChoices[purpose])
      .map((purpose) => ({ purpose, granted: true, legalTextId: authorizationText!.id }));
    const payload = editing
      ? basePayload
      : { ...basePayload, authorizationChannel, authorizations };

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

          {!editing ? (
            <fieldset className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
              <legend className="px-1 text-base font-semibold text-gray-900 dark:text-white">
                Autorizaciones para el tratamiento de datos
              </legend>
              {authorizationTextLoading ? (
                <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
                  Cargando el texto vigente…
                </p>
              ) : authorizationText ? (
                <>
                  <div className="rounded-xl bg-iwana-surface-soft p-3 dark:bg-dark-surface-3">
                    <p className="text-sm font-semibold">
                      Texto vigente · versión {authorizationText.version}
                    </p>
                    <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm">
                      {authorizationText.content}
                    </p>
                  </div>
                  <Select
                    id="subscriber-authorization-channel"
                    label="Medio por el que la persona otorgó la autorización"
                    value={authorizationChannel}
                    options={CONSENT_CHANNEL_OPTIONS}
                    placeholder="Selecciona un medio"
                    onChange={(event) => {
                      setAuthorizationChannel(event.target.value as ConsentChannel | '');
                      setAuthorizationChannelError(null);
                    }}
                    {...(authorizationChannelError ? { error: authorizationChannelError } : {})}
                    required
                    aria-required="true"
                  />
                  <label className="flex min-h-11 items-start gap-3 rounded-xl border border-gray-200 p-3 text-sm dark:border-dark-border">
                    <input
                      className="mt-1 h-4 w-4"
                      type="checkbox"
                      checked={authorizationChoices.TRATAMIENTO_CONTRACTUAL}
                      onChange={(event) =>
                        setAuthorizationChoices((current) => ({
                          ...current,
                          TRATAMIENTO_CONTRACTUAL: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      Autorizo el uso de mis datos para prestar, facturar y dar soporte al servicio.
                      Es necesaria para crear el suscriptor.
                    </span>
                  </label>
                  <label className="flex min-h-11 items-start gap-3 rounded-xl border border-gray-200 p-3 text-sm dark:border-dark-border">
                    <input
                      className="mt-1 h-4 w-4"
                      type="checkbox"
                      checked={authorizationChoices.CONTACTO_COMERCIAL}
                      onChange={(event) =>
                        setAuthorizationChoices((current) => ({
                          ...current,
                          CONTACTO_COMERCIAL: event.target.checked,
                        }))
                      }
                    />
                    <span>Autorizo recibir ofertas y novedades (opcional).</span>
                  </label>
                  <label className="flex min-h-11 items-start gap-3 rounded-xl border border-gray-200 p-3 text-sm dark:border-dark-border">
                    <input
                      className="mt-1 h-4 w-4"
                      type="checkbox"
                      checked={authorizationChoices.DATOS_BIOMETRICOS}
                      onChange={(event) =>
                        setAuthorizationChoices((current) => ({
                          ...current,
                          DATOS_BIOMETRICOS: event.target.checked,
                        }))
                      }
                    />
                    <span>Autorizo el uso de datos biométricos (opcional, cuando aplique).</span>
                  </label>
                </>
              ) : (
                <div className="space-y-2 text-sm">
                  <p>
                    No hay un texto de autorización vigente. La captura está bloqueada hasta
                    publicar uno.
                  </p>
                  <Link
                    className="font-medium text-iwana-primary underline"
                    href="/dashboard/privacy?view=legal"
                  >
                    Administrar textos legales
                  </Link>
                </div>
              )}
            </fieldset>
          ) : null}

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
