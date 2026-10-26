'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, FormStatus, Select } from '@iwana/ui';
import {
  ConsentChannel,
  CreateSubscriberSchema,
  isRutResponsibilitiesRequired,
  NitFormatError,
  parseExpedienteNit,
  type CreateSubscriberPayload,
  PersonType,
  type RutResponsibility,
  type UpdateSubscriberPayload,
  UpdateSubscriberSchema,
  type VatResponsibility,
} from '@iwana/shared';
import type { SubscriberRecord } from '@/lib/api-client';
import { privacyApi } from '@/lib/api-client';
import type { DataPurpose, LegalText } from '@iwana/shared';
import Link from 'next/link';
import { JuridicaPersonFields } from './JuridicaPersonFields';
import { NaturalPersonFields } from './NaturalPersonFields';
import { PERSON_TYPE_OPTIONS } from './subscriber-ui';
import { SharedPersonFields } from './SharedPersonFields';
import { SubscriberFiscalFields } from './SubscriberFiscalFields';
import { validateNitVerificationDigit } from './subscriber-fiscal';
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
  legalRepresentativeFullName: string;
  legalRepresentativeDocumentType: string;
  legalRepresentativeDocumentNumber: string;
  vatResponsibility: VatResponsibility | '';
  rutResponsibilities: RutResponsibility[];
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
    // El documento del representante no viaja en la respuesta: se captura solo para cambiarlo.
    legalRepresentativeFullName: '',
    legalRepresentativeDocumentType: '',
    legalRepresentativeDocumentNumber: '',
    vatResponsibility: initialData?.vatResponsibility ?? '',
    rutResponsibilities: initialData?.rutResponsibilities ?? [],
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

// Mensajes visibles para los campos cuyo error de Zod no es apto para el usuario final.
const RUT_RESPONSIBILITIES_REQUIRED_MESSAGE = 'Selecciona al menos una responsabilidad del RUT.';

const FIELD_MESSAGES: Partial<Record<keyof SubscriberFormValues, string>> = {
  vatResponsibility: 'Selecciona la responsabilidad de IVA.',
  rutResponsibilities: RUT_RESPONSIBILITIES_REQUIRED_MESSAGE,
  legalRepresentativeFullName: 'Ingresa el nombre completo del representante legal.',
  legalRepresentativeDocumentType: 'Selecciona el tipo de documento del representante legal.',
  legalRepresentativeDocumentNumber: 'Ingresa el número de documento del representante legal.',
};

const LEGAL_REPRESENTATIVE_FIELDS: Record<string, keyof SubscriberFormValues> = {
  fullName: 'legalRepresentativeFullName',
  documentType: 'legalRepresentativeDocumentType',
  documentNumber: 'legalRepresentativeDocumentNumber',
};

function resolveIssueField(path: readonly PropertyKey[]): keyof SubscriberFormValues | null {
  const [root, child] = path;
  if (root === 'legalRepresentative') {
    return typeof child === 'string'
      ? (LEGAL_REPRESENTATIVE_FIELDS[child] ?? 'legalRepresentativeFullName')
      : 'legalRepresentativeFullName';
  }
  return typeof root === 'string' ? (root as keyof SubscriberFormValues) : null;
}

function flattenZodIssues(error: z.ZodError): z.ZodIssue[] {
  return error.issues.flatMap((issue) =>
    issue.code === z.ZodIssueCode.invalid_union
      ? issue.unionErrors.flatMap(flattenZodIssues)
      : [issue],
  );
}

function buildLegalRepresentative(values: SubscriberFormValues, required: boolean) {
  const fullName = values.legalRepresentativeFullName.trim();
  const documentType = values.legalRepresentativeDocumentType;
  const documentNumber = values.legalRepresentativeDocumentNumber.trim();
  if (!required && !fullName && !documentType && !documentNumber) return undefined;
  return { fullName, documentType, documentNumber };
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
    setValue,
    reset,
    setError,
    clearErrors,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SubscriberFormValues>({
    defaultValues: buildDefaults(initialData),
  });

  const personType = watch('personType');
  const emailValue = watch('email');
  const phoneValue = watch('phone');

  function handleNitChange(rawValue: string) {
    if (rawValue.includes('-')) {
      try {
        const parsed = parseExpedienteNit(rawValue);
        if (parsed?.verificationDigit) {
          setValue('nit', parsed.nit, { shouldDirty: true });
          setValue('nitVerificationDigit', parsed.verificationDigit, { shouldDirty: true });
          clearErrors(['nit', 'nitVerificationDigit']);
          return;
        }
      } catch (error) {
        if (!(error instanceof NitFormatError)) throw error;
      }
    }

    setValue('nit', rawValue, { shouldDirty: true });
    clearErrors('nit');
  }

  useEffect(() => {
    if (!emailValue?.trim() && !phoneValue?.trim()) return;
    if (errors.email?.type === 'contact-required') clearErrors('email');
    if (errors.phone?.type === 'contact-required') clearErrors('phone');
  }, [clearErrors, emailValue, errors.email?.type, errors.phone?.type, phoneValue]);

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

    let nit = values.nit.trim();
    let nitVerificationDigit = values.nitVerificationDigit.trim();
    if (values.personType === PersonType.JURIDICA && nit.includes('-')) {
      try {
        const parsed = parseExpedienteNit(nit);
        if (!parsed?.verificationDigit) {
          setError('nit', {
            type: 'manual',
            message: 'Revisa el NIT y su dígito de verificación.',
          });
          return;
        }
        nit = parsed.nit;
        nitVerificationDigit = parsed.verificationDigit;
      } catch (error) {
        if (!(error instanceof NitFormatError)) throw error;
        setError('nit', {
          type: 'manual',
          message: 'Revisa el NIT y su dígito de verificación.',
        });
        return;
      }
    }

    const common = {
      personType: values.personType,
      customerSegment: values.customerSegment,
      vatResponsibility: values.vatResponsibility || undefined,
      rutResponsibilities:
        editing && values.rutResponsibilities.length === 0 ? undefined : values.rutResponsibilities,
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
            nit,
            nitVerificationDigit: nitVerificationDigit || undefined,
            businessName: values.businessName.trim(),
            commercialName: values.commercialName.trim() || undefined,
            legalRepresentative: buildLegalRepresentative(values, !editing),
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

    const digitShouldBeChecked =
      values.personType === PersonType.JURIDICA && (!editing || Boolean(nitVerificationDigit));
    const digitError = digitShouldBeChecked
      ? validateNitVerificationDigit(nit, nitVerificationDigit)
      : null;

    if (!result.success || digitError) {
      if (digitError) setError('nitVerificationDigit', { type: 'manual', message: digitError });
      if (result.success) return;

      const contactMissing = !editing && !common.email?.trim() && !common.phone?.trim();

      if (contactMissing) {
        const message = 'Registra al menos un teléfono o un correo.';
        setError('email', { type: 'contact-required', message });
        setError('phone', { type: 'contact-required', message });
      }

      const issues = flattenZodIssues(result.error);
      issues.forEach((issue) => {
        const field = resolveIssueField(issue.path);
        if (!field || (field === 'nitVerificationDigit' && digitError)) return;
        setError(field, { type: 'manual', message: FIELD_MESSAGES[field] ?? issue.message });
      });

      const firstFormIssue = issues.find((issue) => issue.path.length === 0 && !contactMissing);
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
            <JuridicaPersonFields
              register={register}
              errors={errors}
              nitValue={watch('nit')}
              digitValue={watch('nitVerificationDigit')}
              onNitChange={handleNitChange}
            />
          ) : (
            <NaturalPersonFields control={control} register={register} errors={errors} />
          )}

          <SharedPersonFields register={register} errors={errors} />

          <section aria-labelledby="subscriber-fiscal-data-title" className="space-y-3">
            <h3
              id="subscriber-fiscal-data-title"
              className="text-base font-semibold text-gray-900 dark:text-white"
            >
              Datos fiscales
            </h3>
            <Controller
              name="vatResponsibility"
              control={control}
              render={({ field: vatField }) => (
                <Controller
                  name="rutResponsibilities"
                  control={control}
                  render={({ field: rutField }) => (
                    <SubscriberFiscalFields
                      rutResponsibilitiesRequired={isRutResponsibilitiesRequired({
                        personType,
                        vatResponsibility: vatField.value || undefined,
                      })}
                      vatResponsibility={vatField.value}
                      rutResponsibilities={rutField.value}
                      onVatResponsibilityChange={(value) => {
                        vatField.onChange(value);
                        clearErrors('vatResponsibility');
                        if (
                          isRutResponsibilitiesRequired({
                            personType,
                            vatResponsibility: value,
                          }) &&
                          rutField.value.length === 0
                        ) {
                          setError('rutResponsibilities', {
                            type: 'conditional-required',
                            message: RUT_RESPONSIBILITIES_REQUIRED_MESSAGE,
                          });
                        } else {
                          clearErrors('rutResponsibilities');
                        }
                      }}
                      onRutResponsibilitiesChange={(value) => {
                        rutField.onChange(value);
                        clearErrors('rutResponsibilities');
                      }}
                      vatError={errors.vatResponsibility?.message}
                      rutError={errors.rutResponsibilities?.message}
                    />
                  )}
                />
              )}
            />
          </section>

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
              personType={initialData.personType}
              vatResponsibility={initialData.vatResponsibility}
              rutResponsibilities={initialData.rutResponsibilities ?? []}
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
